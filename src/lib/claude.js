const API_URL = 'https://api.anthropic.com/v1/messages'
const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 1000
const CHUNK_SIZE = 60000

const SYSTEM_PROMPT =
  'You are an expert document analyst specializing in legal, financial, real estate, ' +
  'and business documents. You produce precise, professional summaries that preserve ' +
  'key terms, parties, dates, figures, obligations, and risks. You never invent facts ' +
  'that are not present in the source document.'

const DEPTH_INSTRUCTIONS = {
  Brief: 'Produce a brief summary of 2-4 short paragraphs covering only the most essential points.',
  Standard: 'Produce a standard summary covering all major points, key terms, and notable details.',
  Deep: 'Produce a deep, thorough summary covering every significant clause, figure, obligation, and nuance in the document.',
  Executive: 'Produce an executive summary aimed at senior decision-makers: lead with the bottom line, key risks, financial impact, and recommended attention points.',
}

const FORMAT_INSTRUCTIONS = {
  'Structured Sections': 'Organize the output into clearly titled sections with headings.',
  'Bullet Points': 'Format the output as concise bullet points grouped under short headings.',
  'Narrative Prose': 'Write the output as flowing narrative prose in well-formed paragraphs.',
  'Q&A': 'Format the output as a series of questions a reader would ask about this document, each followed by a direct answer.',
}

export function splitIntoChunks(text, size = CHUNK_SIZE) {
  const chunks = []
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size))
  }
  return chunks
}

async function callClaude(userContent) {
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
      system: SYSTEM_PROMPT,
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
 * Summarize a full document. Splits into 60k-char chunks, summarizes each,
 * then consolidates into one final summary.
 *
 * onProgress({ current, total, percent, stage }) fires before each API call.
 * Returns { summary, chunksProcessed }.
 */
export async function summarizeDocument(text, { depth, format, focus }, onProgress) {
  const chunks = splitIntoChunks(text)
  const total = chunks.length
  const focusLine = focus?.trim()
    ? `Pay particular attention to the following focus areas: ${focus.trim()}.`
    : ''

  const chunkSummaries = []
  for (let i = 0; i < total; i++) {
    onProgress?.({
      current: i + 1,
      total,
      percent: Math.round((i / total) * 100),
      stage: `Analyzing chunk ${i + 1} of ${total}`,
    })
    const summary = await callClaude(
      `${DEPTH_INSTRUCTIONS[depth]}\n${FORMAT_INSTRUCTIONS[format]}\n${focusLine}\n\n` +
        `This is part ${i + 1} of ${total} of a larger document. Summarize this part:\n\n${chunks[i]}`,
    )
    chunkSummaries.push(summary)
  }

  // Single-chunk documents need no consolidation pass — the chunk summary is final.
  if (total === 1) {
    onProgress?.({ current: 1, total: 1, percent: 100, stage: 'Done' })
    return { summary: chunkSummaries[0], chunksProcessed: 1 }
  }

  onProgress?.({
    current: total,
    total,
    percent: 95,
    stage: 'Consolidating final summary',
  })
  const finalSummary = await callClaude(
    `Below are ${total} partial summaries of consecutive sections of one document. ` +
      `Merge them into a single coherent final summary.\n` +
      `${DEPTH_INSTRUCTIONS[depth]}\n${FORMAT_INSTRUCTIONS[format]}\n${focusLine}\n\n` +
      chunkSummaries.map((s, i) => `--- Part ${i + 1} ---\n${s}`).join('\n\n'),
  )

  onProgress?.({ current: total, total, percent: 100, stage: 'Done' })
  return { summary: finalSummary, chunksProcessed: total }
}
