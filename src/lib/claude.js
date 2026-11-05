import { supabase } from './supabase'
import { CHUNK_SYSTEM_PROMPT, buildFinalSystemPrompt, narrativeWordTarget } from './prompts'
import { friendlyError } from './messages'

// Claude calls go through the serverless proxy (api/summarize.js) so the
// Anthropic API key never reaches the browser. The proxy only accepts requests
// from authenticated Supabase users, and only for models on its allowlist.
const API_URL = '/api/summarize'

// Model per task. Summarization needs Sonnet's depth; document Q&A is well
// within Haiku's reach at a fraction of the cost. The proxy validates these
// against its own allowlist — keep the two lists in sync.
const SUMMARY_MODEL = 'claude-sonnet-4-6'
const CHAT_MODEL = 'claude-haiku-4-5'

const MAX_TOKENS = 2000
// The structured JSON summary needs headroom beyond the per-chunk limit —
// a response cut off at max_tokens is unparseable JSON. The fullSummary
// narrative (up to ~1300 words at Deep) plus the structured fields needs
// real room; the proxy's own ceiling must stay above this.
const FINAL_MAX_TOKENS = 6000
const CHUNK_SIZE = 150000

// Sonnet pricing: $3 / MTok input, $15 / MTok output.
export const INPUT_COST_PER_TOKEN = 0.000003
export const OUTPUT_COST_PER_TOKEN = 0.000015

// Rough blended cost of one API call — used only for history rows saved
// before actual costs were recorded.
export const COST_PER_CALL = 0.015

/**
 * Predict what summarizeDocument will do with this text, without calling
 * the API: chunk count, and estimated cost. Input tokens ≈ chars / 4;
 * output is bounded by MAX_TOKENS per call (one call per chunk plus a
 * consolidation call when there are multiple chunks).
 */
export function estimateAnalysis(text) {
  const chunks = Math.max(Math.ceil(text.length / CHUNK_SIZE), 1)
  const inputTokens = text.length / 4
  // One MAX_TOKENS call per chunk plus one FINAL_MAX_TOKENS consolidation call
  // for multi-chunk runs; single-chunk runs are one final-sized call.
  const outputTokens = chunks > 1 ? chunks * MAX_TOKENS + FINAL_MAX_TOKENS : FINAL_MAX_TOKENS
  const cost =
    inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN
  return {
    chunks,
    estimatedCost: Math.round(cost * 1000) / 1000,
  }
}

// The long fullSummary narrative raises the odds of the model slipping an
// unescaped quote or a raw newline into a JSON string despite the prompt.
// Walk the text tracking string state: a quote inside a string only ends it
// when followed (after whitespace) by a structural character — otherwise
// escape it. Raw newlines/tabs inside strings get escaped too.
function repairJson(text) {
  let out = ''
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (!inString) {
      if (ch === '"') inString = true
      out += ch
      continue
    }
    if (ch === '\\') {
      out += ch + (text[i + 1] ?? '')
      i++
      continue
    }
    if (ch === '"') {
      let j = i + 1
      while (j < text.length && /\s/.test(text[j])) j++
      const next = text[j]
      if (next === undefined || ',:}]'.includes(next)) {
        inString = false
        out += ch
      } else {
        out += '\\"'
      }
      continue
    }
    if (ch === '\n') out += '\\n'
    else if (ch === '\r') out += '\\r'
    else if (ch === '\t') out += '\\t'
    else out += ch
  }
  return out
}

// Defense-in-depth against schema-completion padding: a row whose content
// fields are all empty or placeholder text ("Not specified", "None", "N/A",
// "—") is filler, not information — drop it so it can never reach the UI.
// Applied to fresh model responses here AND to rows reopened from history
// (via toStructuredSummary), so old saved summaries get the same protection.
const PLACEHOLDER_ROW_VALUE = /^(not specified|none|none identified|n\/a|unknown|—|–|-)?$/i

export function sanitizeSummaryRows(rows, contentFields) {
  if (!Array.isArray(rows)) return []
  return rows.filter((row) =>
    contentFields.some(
      (f) =>
        typeof row?.[f] === 'string' && !PLACEHOLDER_ROW_VALUE.test(row[f].trim()),
    ),
  )
}

export function sanitizeSummary(summary) {
  return {
    ...summary,
    parties: sanitizeSummaryRows(summary.parties, ['name', 'role']),
    financialTerms: sanitizeSummaryRows(summary.financialTerms, ['item', 'amount', 'notes']),
    keyObligations: sanitizeSummaryRows(summary.keyObligations, [
      'party',
      'obligation',
      'deadline',
    ]),
    importantDates: sanitizeSummaryRows(summary.importantDates, ['date', 'event']),
    // `source` is deliberately not a content field — a row carrying only a
    // citation says nothing.
    risksAndFlags: sanitizeSummaryRows(summary.risksAndFlags, ['description', 'title']),
  }
}

// The model is instructed to return bare JSON, but defensively strip any
// surrounding prose/code fences by slicing to the outermost braces, and
// attempt a repair pass before giving up.
function parseSummary(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw friendlyError('The analysis came back in an unexpected shape. Please try again.')
  }
  const slice = text.slice(start, end + 1)
  let raw
  try {
    raw = JSON.parse(slice)
  } catch {
    try {
      raw = JSON.parse(repairJson(slice))
    } catch {
      throw friendlyError('The analysis came back garbled. Please try again.')
    }
  }
  const str = (v) => (typeof v === 'string' ? v : '')
  const arr = (v) => (Array.isArray(v) ? v : [])
  return sanitizeSummary({
    documentTitle: str(raw.documentTitle),
    documentType: str(raw.documentType),
    preparedDate: str(raw.preparedDate),
    parties: arr(raw.parties),
    financialTerms: arr(raw.financialTerms),
    keyObligations: arr(raw.keyObligations),
    importantDates: arr(raw.importantDates),
    risksAndFlags: arr(raw.risksAndFlags),
    fullSummary: str(raw.fullSummary),
    overview: str(raw.overview),
  })
}

export function splitIntoChunks(text, size = CHUNK_SIZE) {
  const chunks = []
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size))
  }
  return chunks
}

// Shared transport for every Claude call. Attaches the Supabase access token,
// posts { messages, system, max_tokens, model } to the proxy, and normalizes
// the response. Returns { text, usage, stopReason } — callers decide how to
// treat a "refusal" stop reason.
async function postToProxy(messages, system, maxTokens, model) {
  const { data: sessionData } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (!accessToken) {
    throw friendlyError('Your session has timed out. Please log out and log back in.')
  }

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      messages,
      system,
      max_tokens: maxTokens,
      model,
    }),
  })

  if (!response.ok) {
    let message = `Claude API error (${response.status})`
    try {
      const err = await response.json()
      if (err?.error?.message) message = err.error.message
    } catch {
      // non-JSON error body; keep the status message
    }
    throw new Error(message)
  }

  const data = await response.json()
  return {
    text: data.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n'),
    usage: data.usage,
    stopReason: data.stop_reason,
  }
}

async function callClaude(system, userContent, maxTokens = MAX_TOKENS) {
  const result = await postToProxy(
    [{ role: 'user', content: userContent }],
    system,
    maxTokens,
    SUMMARY_MODEL,
  )
  if (result.stopReason === 'refusal') {
    throw friendlyError('The analysis service declined to summarize this content.')
  }
  return result
}

/**
 * Summarize a full document. The text is split into 150k-char chunks,
 * each chunk reduced to a few key bullets, then consolidated into one
 * structured summary object (see buildFinalSystemPrompt for its shape).
 *
 * onProgress({ current, total, percent, stage }) fires before each API call.
 * Returns { summary, chunksProcessed, usage } where usage holds the summed
 * input/output tokens across all calls and the actual cost in dollars.
 */
export async function summarizeDocument(text, { depth, focus }, onProgress) {
  const chunks = splitIntoChunks(text)
  const total = chunks.length
  const focusLine = focus?.trim()
    ? `Pay particular attention to the following focus areas: ${focus.trim()}.\n`
    : ''

  // Summary Depth drives how dense the fullSummary narrative is — the word
  // target scales with the document's own length, clamped per depth.
  const docWords = text.split(/\s+/).filter(Boolean).length
  const finalSystemPrompt = buildFinalSystemPrompt({
    depth,
    narrativeWords: narrativeWordTarget(docWords, depth),
  })

  let inputTokens = 0
  let outputTokens = 0
  const track = (usage) => {
    inputTokens += usage?.input_tokens ?? 0
    outputTokens += usage?.output_tokens ?? 0
  }
  const totalUsage = () => ({
    inputTokens,
    outputTokens,
    actualCost:
      Math.round(
        (inputTokens * INPUT_COST_PER_TOKEN + outputTokens * OUTPUT_COST_PER_TOKEN) * 1e6,
      ) / 1e6,
  })

  // Single-chunk documents skip the map-reduce pass — summarize the full text
  // directly into the final structured format.
  if (total === 1) {
    onProgress?.({ current: 1, total: 1, percent: 0, stage: 'Reading your document and writing the brief…' })
    const { text: response, usage, stopReason } = await callClaude(
      finalSystemPrompt,
      `${focusLine}Summarize this document:\n\n${chunks[0]}`,
      FINAL_MAX_TOKENS,
    )
    track(usage)
    if (stopReason === 'max_tokens') {
      throw friendlyError('The summary came back incomplete. Please try again.')
    }
    onProgress?.({ current: 1, total: 1, percent: 100, stage: 'Done' })
    return { summary: parseSummary(response), chunksProcessed: 1, usage: totalUsage() }
  }

  const chunkSummaries = []
  for (let i = 0; i < total; i++) {
    onProgress?.({
      current: i + 1,
      total,
      percent: Math.round((i / total) * 100),
      stage: `Reading section ${i + 1} of ${total}…`,
    })
    const { text: summary, usage } = await callClaude(
      CHUNK_SYSTEM_PROMPT,
      `${focusLine}This is part ${i + 1} of ${total} of a larger document:\n\n${chunks[i]}`,
    )
    track(usage)
    chunkSummaries.push(summary)
  }

  onProgress?.({
    current: total,
    total,
    percent: 95,
    stage: 'Writing the final brief…',
  })
  const { text: response, usage, stopReason } = await callClaude(
    finalSystemPrompt,
    `Below are ${total} partial summaries of consecutive sections of one document. ` +
      `Merge them into a single final summary.\n${focusLine}\n` +
      chunkSummaries.map((s, i) => `--- Part ${i + 1} ---\n${s}`).join('\n\n'),
    FINAL_MAX_TOKENS,
  )
  track(usage)
  if (stopReason === 'max_tokens') {
    throw friendlyError('The summary came back incomplete. Please try again.')
  }

  onProgress?.({ current: total, total, percent: 100, stage: 'Done' })
  return { summary: parseSummary(response), chunksProcessed: total, usage: totalUsage() }
}

const CHAT_SYSTEM_PROMPT =
  'You are briefing an experienced business professional on a document they just ' +
  'uploaded. Answer their question conversationally in 2-4 sentences, like a knowledgeable ' +
  'colleague walking them through their own paperwork — not like you are reading a form. ' +
  'Never invent information that is not present in the provided text; if the document ' +
  'does not answer the question, say so plainly.\n\n' +
  'Respond with ONLY a single valid JSON object — no markdown, no code fences, no ' +
  'commentary — of exactly this shape:\n' +
  '{\n' +
  '  "answer": string,\n' +
  '  "citation": string\n' +
  '}\n' +
  'answer: the 2-4 sentence conversational reply. citation: exactly where this comes ' +
  'from in the source document. When the provided text contains "[Page N]" markers, cite ' +
  'the page it came from (e.g. "Page 4"); otherwise cite the section, exhibit, or clause ' +
  'name (e.g. "Exhibit D" or "Section 5.2"). Never fabricate a page number that is not ' +
  'shown in the text. Use an empty string for citation when the answer is not in the document.'

const CHAT_MAX_TOKENS = 1000

// The chat model is asked for bare JSON; defensively slice to the outermost
// braces, and fall back to treating the whole reply as the answer so a
// non-conforming response still renders something useful.
function parseAnswer(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end > start) {
    try {
      const raw = JSON.parse(text.slice(start, end + 1))
      return {
        answer: typeof raw.answer === 'string' ? raw.answer : '',
        citation: typeof raw.citation === 'string' ? raw.citation : '',
      }
    } catch {
      // fall through to the raw-text fallback
    }
  }
  return { answer: text.trim(), citation: '' }
}

/**
 * Answer a follow-up question about the document. The whole conversation is
 * replayed to Claude each turn, with the document text attached as context to
 * the first user message so every answer stays grounded in the source.
 *
 * When `pages` (a per-page text array, PDFs only) is provided, the document is
 * replayed with "[Page N]" markers so Claude can cite real page numbers;
 * otherwise it cites section/exhibit names. `documentText` (doc.text) is left
 * untouched so the summary path sees identical input.
 *
 * conversationHistory is the prior turns as [{ role, content }] (excluding the
 * new question). Returns { answer, citation, usage }.
 */
const MAX_CHAT_DOC_CHARS = 700000 // ~175k tokens; the Q&A model holds ~200k total

export async function askQuestion(question, documentText, conversationHistory = [], pages = null) {
  const sourceText =
    Array.isArray(pages) && pages.length
      ? pages.map((p, i) => `[Page ${i + 1}]\n${p}`).join('\n\n')
      : documentText

  if ((sourceText?.length ?? 0) > MAX_CHAT_DOC_CHARS) {
    throw friendlyError(
      'This document is too long for follow-up questions — roughly 250 pages is the ' +
        'limit. The summary tabs still cover the whole document.',
    )
  }

  const history = conversationHistory.map((m) => ({ role: m.role, content: m.content }))
  const messages = [...history, { role: 'user', content: question }]

  // The document rides along on the first user message only — replaying it on
  // every turn would waste tokens and blow past the context window.
  const firstUserIdx = messages.findIndex((m) => m.role === 'user')
  if (firstUserIdx !== -1) {
    messages[firstUserIdx] = {
      role: 'user',
      content:
        'Here is the document to answer questions about:\n\n' +
        `<document>\n${sourceText}\n</document>\n\n` +
        `Question: ${messages[firstUserIdx].content}`,
    }
  }

  const { text, usage, stopReason } = await postToProxy(
    messages,
    CHAT_SYSTEM_PROMPT,
    CHAT_MAX_TOKENS,
    CHAT_MODEL,
  )
  if (stopReason === 'refusal') {
    throw friendlyError('The service declined to answer that question.')
  }
  return { ...parseAnswer(text), usage }
}
