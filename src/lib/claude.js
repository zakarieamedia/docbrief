const API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 2000
const CHUNK_SIZE = 150000
const MAX_INPUT_CHARS = 450000
const MAX_CHUNKS = 8

const CHUNK_SYSTEM_PROMPT =
  'You are an expert document analyst. Extract ONLY the most critical information ' +
  'from this chunk in 3-4 bullet points maximum. Focus exclusively on: parties and ' +
  'their roles, key obligations, dollar amounts, dates, deadlines, and risks. Be ' +
  'extremely concise. No boilerplate, no obvious statements, no lengthy explanations.'

const FINAL_SYSTEM_PROMPT =
  'You are an expert document analyst. Produce a final summary under 600 words ' +
  'total, in markdown, using exactly these section headings: "## Document Overview", ' +
  '"## Key Parties", "## Financial Terms", "## Key Obligations", "## Important Dates", ' +
  '"## Risks & Flags". Each section: maximum 4 bullet points. Ruthlessly cut anything ' +
  'that is not decision-critical. Never invent facts that are not present in the source.'

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
  return data.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
}

/**
 * Summarize a full document. Input is truncated to 450k chars, split into
 * 150k-char chunks (8 max), each chunk reduced to a few key bullets, then
 * consolidated into one structured final summary under 600 words.
 *
 * onProgress({ current, total, percent, stage }) fires before each API call.
 * Returns { summary, chunksProcessed }.
 */
export async function summarizeDocument(text, { focus }, onProgress) {
  const chunks = splitIntoChunks(text.slice(0, MAX_INPUT_CHARS)).slice(0, MAX_CHUNKS)
  const total = chunks.length
  const focusLine = focus?.trim()
    ? `Pay particular attention to the following focus areas: ${focus.trim()}.\n`
    : ''

  // Single-chunk documents skip the map-reduce pass — summarize the full text
  // directly into the final structured format.
  if (total === 1) {
    onProgress?.({ current: 1, total: 1, percent: 0, stage: 'Summarizing document' })
    const summary = await callClaude(
      FINAL_SYSTEM_PROMPT,
      `${focusLine}Summarize this document:\n\n${chunks[0]}`,
    )
    onProgress?.({ current: 1, total: 1, percent: 100, stage: 'Done' })
    return { summary, chunksProcessed: 1 }
  }

  const chunkSummaries = []
  for (let i = 0; i < total; i++) {
    onProgress?.({
      current: i + 1,
      total,
      percent: Math.round((i / total) * 100),
      stage: `Analyzing chunk ${i + 1} of ${total}`,
    })
    const summary = await callClaude(
      CHUNK_SYSTEM_PROMPT,
      `${focusLine}This is part ${i + 1} of ${total} of a larger document:\n\n${chunks[i]}`,
    )
    chunkSummaries.push(summary)
  }

  onProgress?.({
    current: total,
    total,
    percent: 95,
    stage: 'Consolidating final summary',
  })
  const finalSummary = await callClaude(
    FINAL_SYSTEM_PROMPT,
    `Below are ${total} partial summaries of consecutive sections of one document. ` +
      `Merge them into a single final summary.\n${focusLine}\n` +
      chunkSummaries.map((s, i) => `--- Part ${i + 1} ---\n${s}`).join('\n\n'),
  )

  onProgress?.({ current: total, total, percent: 100, stage: 'Done' })
  return { summary: finalSummary, chunksProcessed: total }
}
