// Prompt construction for the summarize pipeline. Deliberately dependency-free
// (no supabase, no import.meta.env) so Node scripts can import the exact same
// prompts the app sends — verification runs never drift from production.

// How dense the narrative walkthrough is per Summary Depth setting.
// `pct` is the target share of the original document's length; `cap` keeps
// giant documents from demanding an impossible narrative. Unknown depths fall
// back to Standard.
const NARRATIVE_TARGETS = {
  Brief: { pct: 0.08, cap: 500 },
  Standard: { pct: 0.15, cap: 900 },
  Deep: { pct: 0.2, cap: 1300 },
  Executive: { pct: 0.1, cap: 600 },
}

const DEPTH_GUIDANCE = {
  Brief:
    'Depth is Brief: at most ONE sentence per section — two only when a section is ' +
    'genuinely pivotal — and fold minor or routine sections together under one ' +
    'heading. The whole narrative must be skimmable in under a minute.',
  Standard:
    'Depth is Standard: a balanced walkthrough — every substantive section gets a ' +
    'short paragraph of 2-4 sentences; boilerplate gets grouped into one brief mention.',
  Deep:
    'Depth is Deep: a thorough walkthrough — cover every substantive section ' +
    'including secondary provisions, with enough detail that the reader rarely ' +
    'needs the original.',
  Executive:
    'Depth is Executive: lead every section with its business implication — what ' +
    'it costs, risks, or obliges — in 1-3 sentences each, and keep legal ' +
    'mechanics to a minimum.',
}

/**
 * Word target for the narrative summary: roughly 15-20% of the original at
 * Standard/Deep, less at Brief/Executive, clamped to sane bounds.
 */
export function narrativeWordTarget(docWords, depth) {
  const target = NARRATIVE_TARGETS[depth] ?? NARRATIVE_TARGETS.Standard
  const words = Math.round(docWords * target.pct)
  return Math.max(150, Math.min(words, target.cap))
}

// Per-chunk extraction for the map-reduce path. Bullets feed the structured
// fields; the SECTIONS outline is what lets the consolidation call write a
// section-by-section narrative it never saw the full text for.
export const CHUNK_SYSTEM_PROMPT =
  'You are an expert document analyst. Extract ONLY the most critical information ' +
  'from this chunk in 3-4 bullet points maximum. Focus exclusively on: parties and ' +
  'their roles, key obligations, dollar amounts, dates, deadlines, and risks. Be ' +
  'extremely concise. No boilerplate, no obvious statements, no lengthy explanations.\n' +
  'Then add a line "SECTIONS:" followed by one line per major section, article, or ' +
  'exhibit in this chunk — its name exactly as titled, a dash, and a one-sentence ' +
  'plain-English gist of what it does. This outline is later used to write a ' +
  'narrative summary, so include every substantive section, in document order.'

/**
 * System prompt for the final structured-summary call. `depth` is the Summary
 * Depth label ("Brief" | "Standard" | "Deep" | "Executive"); `narrativeWords`
 * is the computed word target for the fullSummary narrative.
 */
export function buildFinalSystemPrompt({ depth = 'Standard', narrativeWords = 600 } = {}) {
  const depthLine = DEPTH_GUIDANCE[depth] ?? DEPTH_GUIDANCE.Standard
  return (
    'You are an expert document analyst. Respond with ONLY a single valid JSON object — ' +
    'no markdown fences, no commentary. The response must be strictly parseable by ' +
    'JSON.parse: inside string values never use the straight double-quote character — ' +
    'use typographic quotes (“ ”) or single quotes in prose instead — and use \\n for ' +
    'line breaks. Use exactly this shape:\n' +
    '{\n' +
    '  "documentTitle": string,\n' +
    '  "documentType": string,\n' +
    '  "preparedDate": string,\n' +
    '  "parties": [{ "name": string, "role": string }],\n' +
    '  "financialTerms": [{ "item": string, "amount": string, "notes": string }],\n' +
    '  "keyObligations": [{ "party": string, "obligation": string, "deadline": string, "source": string }],\n' +
    '  "importantDates": [{ "date": string, "event": string, "source": string }],\n' +
    '  "risksAndFlags": [{ "severity": "high" | "medium" | "low", "description": string, "source": string }],\n' +
    '  "fullSummary": string,\n' +
    '  "overview": string\n' +
    '}\n' +
    'The overview is 2-3 sentences maximum — an orientation, not the summary. ' +
    'Maximum 4 entries per array — keep only what is decision-critical. ' +
    'Use "Not specified" when the document does not state a scalar field. ' +
    'If the document genuinely contains no entries for an array (no risks, no dates, ' +
    'no financial terms, or no obligations), return an empty array [] for it — never ' +
    'pad a section with placeholder rows, restated boilerplate, or minor trivia ' +
    'promoted to fill space. An empty array is a correct and useful answer. ' +
    'For every risk, obligation, and important date, set "source" to where it is found ' +
    'in the document — the section, exhibit, clause, or article name (e.g. "Exhibit D", ' +
    '"Section 5.2", "Recitals"). Use "" when the location is unclear. Never fabricate a ' +
    'page number or a citation that is not supported by the source. Quote dates as the ' +
    'document states them; do not convert relative deadlines (e.g. "30 days after ' +
    'closing") into computed calendar dates. Never invent facts that are not present ' +
    'in the source.\n\n' +
    'fullSummary is a genuine narrative summary, distinct from the overview: walk ' +
    'through the document section by section, in document order, in plain English — ' +
    'written like a knowledgeable colleague explaining the document to a smart ' +
    'non-lawyer. Use markdown with a "### <section name>" heading per section (use ' +
    "the document's own section/article names) and short paragraphs beneath. Explain " +
    'what each provision actually means in practice, translate jargon the first time ' +
    'it appears, and keep every amount, date, and name exact. Group boilerplate ' +
    'sections into a single brief paragraph rather than skipping them silently. ' +
    depthLine +
    ` Aim for roughly ${narrativeWords} words in fullSummary; treat ` +
    `${Math.round(narrativeWords * 1.25)} words as a hard ceiling.`
  )
}
