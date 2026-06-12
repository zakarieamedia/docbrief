const API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 2000
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
  const calls = chunks > 1 ? chunks + 1 : 1
  const inputTokens = text.length / 4
  const cost =
    inputTokens * INPUT_COST_PER_TOKEN + calls * MAX_TOKENS * OUTPUT_COST_PER_TOKEN
  return {
    chunks,
    estimatedCost: Math.round(cost * 1000) / 1000,
  }
}

const CHUNK_SYSTEM_PROMPT =
  'You are an expert document analyst. Extract ONLY the most critical information ' +
  'from this chunk in 3-4 bullet points maximum. Focus exclusively on: parties and ' +
  'their roles, key obligations, dollar amounts, dates, deadlines, and risks. Be ' +
  'extremely concise. No boilerplate, no obvious statements, no lengthy explanations.'

const FINAL_SYSTEM_PROMPT =
  'You are an expert document analyst. Respond with ONLY a single valid JSON object — ' +
  'no markdown, no code fences, no commentary. Use exactly this shape:\n' +
  '{\n' +
  '  "documentTitle": string,\n' +
  '  "documentType": string,\n' +
  '  "preparedDate": string,\n' +
  '  "parties": [{ "name": string, "role": string }],\n' +
  '  "financialTerms": [{ "item": string, "amount": string, "notes": string }],\n' +
  '  "keyObligations": [{ "party": string, "obligation": string, "deadline": string }],\n' +
  '  "importantDates": [{ "date": string, "event": string }],\n' +
  '  "risksAndFlags": [{ "severity": "high" | "medium" | "low", "description": string }],\n' +
  '  "overview": string\n' +
  '}\n' +
  'The overview is 2-3 sentences maximum. Maximum 4 entries per array — keep only what ' +
  'is decision-critical. Use "Not specified" when the document does not state something. ' +
  'Never invent facts that are not present in the source.'

// The model is instructed to return bare JSON, but defensively strip any
// surrounding prose/code fences by slicing to the outermost braces.
function parseSummary(text) {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) {
    throw new Error('The model did not return a structured summary. Please try again.')
  }
  let raw
  try {
    raw = JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new Error('Could not parse the structured summary. Please try again.')
  }
  const str = (v) => (typeof v === 'string' ? v : '')
  const arr = (v) => (Array.isArray(v) ? v : [])
  return {
    documentTitle: str(raw.documentTitle),
    documentType: str(raw.documentType),
    preparedDate: str(raw.preparedDate),
    parties: arr(raw.parties),
    financialTerms: arr(raw.financialTerms),
    keyObligations: arr(raw.keyObligations),
    importantDates: arr(raw.importantDates),
    risksAndFlags: arr(raw.risksAndFlags),
    overview: str(raw.overview),
  }
}

export function splitIntoChunks(text, size = CHUNK_SIZE) {
  const chunks = []
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size))
  }
  return chunks
}

async function callClaude(system, userContent) {
  const response = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      // Required for direct browser-side calls to the Anthropic API.
      // Exposes the API key to the client — use a restricted key, or move
      // this call behind a server route before any public deployment.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system,
      messages: [{ role: 'user', content: userContent }],
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
  if (data.stop_reason === 'refusal') {
    throw new Error('The model declined to summarize this content.')
  }
  return {
    text: data.content
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('\n'),
    usage: data.usage,
  }
}

/**
 * Summarize a full document. The text is split into 150k-char chunks,
 * each chunk reduced to a few key bullets, then consolidated into one
 * structured summary object (see FINAL_SYSTEM_PROMPT for its shape).
 *
 * onProgress({ current, total, percent, stage }) fires before each API call.
 * Returns { summary, chunksProcessed, usage } where usage holds the summed
 * input/output tokens across all calls and the actual cost in dollars.
 */
export async function summarizeDocument(text, { focus }, onProgress) {
  const chunks = splitIntoChunks(text)
  const total = chunks.length
  const focusLine = focus?.trim()
    ? `Pay particular attention to the following focus areas: ${focus.trim()}.\n`
    : ''

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
    onProgress?.({ current: 1, total: 1, percent: 0, stage: 'Summarizing document' })
    const { text: response, usage } = await callClaude(
      FINAL_SYSTEM_PROMPT,
      `${focusLine}Summarize this document:\n\n${chunks[0]}`,
    )
    track(usage)
    onProgress?.({ current: 1, total: 1, percent: 100, stage: 'Done' })
    return { summary: parseSummary(response), chunksProcessed: 1, usage: totalUsage() }
  }

  const chunkSummaries = []
  for (let i = 0; i < total; i++) {
    onProgress?.({
      current: i + 1,
      total,
      percent: Math.round((i / total) * 100),
      stage: `Analyzing chunk ${i + 1} of ${total}`,
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
    stage: 'Consolidating final summary',
  })
  const { text: response, usage } = await callClaude(
    FINAL_SYSTEM_PROMPT,
    `Below are ${total} partial summaries of consecutive sections of one document. ` +
      `Merge them into a single final summary.\n${focusLine}\n` +
      chunkSummaries.map((s, i) => `--- Part ${i + 1} ---\n${s}`).join('\n\n'),
  )
  track(usage)

  onProgress?.({ current: total, total, percent: 100, stage: 'Done' })
  return { summary: parseSummary(response), chunksProcessed: total, usage: totalUsage() }
}
