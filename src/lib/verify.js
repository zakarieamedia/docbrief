// Runtime verification of model-claimed citations against the document text
// the analysis was built from. Runs once, at analysis time; verdicts are
// stamped onto the summary rows (quoteVerified / sourceVerified) and persist
// with the saved summary. Dependency-free so Node test scripts can import the
// exact production logic.
//
// Philosophy: quote checks are STRICT (the UI claims "exact wording" — that
// claim must be earned verbatim). Section-citation checks are deliberately
// LOOSE (section labels get reformatted legitimately; flag only references
// that are clearly absent — a false "not found" alarm erodes trust faster
// than a missed one).

const ELLIPSIS_SPLIT = /…|\.\.\./

export function normalizeForMatch(s) {
  return String(s ?? '')
    .replace(/[“”«»]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[—–‐]/g, '-')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim()
}

// A quote may join two excerpts with an ellipsis; every excerpt must appear
// verbatim (after normalization) for the quote to count as verified.
export function quoteAppearsIn(quote, docNorm) {
  const parts = String(quote ?? '')
    .split(ELLIPSIS_SPLIT)
    .map(normalizeForMatch)
    .filter(Boolean)
  if (!parts.length) return false
  return parts.every((p) => docNorm.includes(p))
}

const REF_KEYWORDS =
  /\b(section|article|exhibit|schedule|appendix|clause|paragraph|recital)s?\s+([a-z0-9][a-z0-9.()-]*)/g

const GENERIC_WORDS = new Set([
  'section',
  'article',
  'exhibit',
  'schedule',
  'appendix',
  'clause',
  'paragraph',
  'recital',
  'recitals',
  'page',
  'pages',
])

// Does the cited location plausibly exist in the document?
export function sourceAppearsIn(source, docNorm) {
  const norm = normalizeForMatch(source)
  if (!norm) return false

  // Whole citation appears as written.
  if (docNorm.includes(norm)) return true

  // Keyword + identifier pairs: "exhibit d", "section 4.2(b)", "schedule 4.2".
  for (const [, kw, rawRef] of norm.matchAll(REF_KEYWORDS)) {
    const ref = rawRef.replace(/[).]+$/, '')
    const base = ref.replace(/\(.*$/, '') // "4.2(b)" → "4.2"
    if (docNorm.includes(`${kw} ${ref}`) || docNorm.includes(`${kw} ${base}`)) return true
    // Numbered subsections often appear bare in the body ("4.2 Conditional…").
    if (/^\d/.test(base) && docNorm.includes(base)) return true
  }

  // Bare dotted identifiers anywhere in the citation ("Definitions — 1.7").
  const nums = norm.match(/\b\d+(?:\.\d+)+[a-z]?\b/g) ?? []
  if (nums.some((n) => docNorm.includes(n))) return true

  // Named sections ("Recitals", "Definitions — 'Substantial Completion…'"):
  // any distinctive word from the citation appearing in the document counts.
  const words = norm
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !GENERIC_WORDS.has(w))
  return words.some((w) => docNorm.includes(w))
}

/**
 * Stamp verification verdicts onto a structured summary:
 * - every risk with a sourceQuote gets `quoteVerified` (strict verbatim)
 * - every risk/obligation/date with a source gets `sourceVerified` (loose)
 * Rows without the field are left unstamped (undefined = never checked,
 * e.g. summaries saved before this feature existed).
 */
export function verifySummaryAgainstText(summary, documentText) {
  if (!summary || !documentText) return summary
  const docNorm = normalizeForMatch(documentText)

  const stampSource = (row) =>
    typeof row?.source === 'string' && row.source.trim()
      ? { ...row, sourceVerified: sourceAppearsIn(row.source, docNorm) }
      : row

  return {
    ...summary,
    risksAndFlags: (summary.risksAndFlags ?? []).map((r) => {
      let out = stampSource(r)
      if (typeof r?.sourceQuote === 'string' && r.sourceQuote.trim()) {
        out = { ...out, quoteVerified: quoteAppearsIn(r.sourceQuote, docNorm) }
      }
      return out
    }),
    keyObligations: (summary.keyObligations ?? []).map(stampSource),
    importantDates: (summary.importantDates ?? []).map(stampSource),
  }
}
