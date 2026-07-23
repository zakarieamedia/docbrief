// Extraction-quality heuristics for PDFs, computed from per-page stats
// gathered during text extraction. Pure and dependency-free (Node-testable).
//
// Both checks WARN rather than block, and err toward over-caution — for this
// tool a spurious "verify against the original" is the safe direction to be
// wrong in; a silently-misread rent schedule is not.

// Turn 1-based page numbers into "3, 7–9, 12" (consecutive runs compressed),
// capping at `maxRanges` ranges with "and N more".
export function formatPageList(pages, maxRanges = 6) {
  if (!pages.length) return ''
  const sorted = [...pages].sort((a, b) => a - b)
  const ranges = []
  let start = sorted[0]
  let prev = sorted[0]
  for (const p of sorted.slice(1)) {
    if (p === prev + 1) {
      prev = p
      continue
    }
    ranges.push([start, prev])
    start = p
    prev = p
  }
  ranges.push([start, prev])

  const shown = ranges.slice(0, maxRanges)
  const rest = ranges.length - shown.length
  const parts = shown.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`))
  return rest > 0 ? `${parts.join(', ')} and ${rest} more` : parts.join(', ')
}

// A page with almost no extractable characters is most likely a scanned
// image. Warn when a fifth or more of the document (and at least 2 pages)
// looks that way.
const SCANNED_PAGE_MAX_CHARS = 100

export function detectScannedPages(pageStats) {
  const pages = pageStats
    .map((s, i) => ({ ...s, page: i + 1 }))
    .filter((s) => s.chars < SCANNED_PAGE_MAX_CHARS)
    .map((s) => s.page)
  const warn = pageStats.length >= 3 && pages.length >= 2 && pages.length / pageStats.length >= 0.2
  return { pages, warn }
}

// A page whose text arrives as MANY SHORT fragments with HIGH digit density
// is almost certainly a table (rent schedules, payment matrices, exhibits).
// PDF extraction can scramble table column order, so figures on these pages
// deserve explicit distrust.
export function detectTablePages(pageStats) {
  const pages = pageStats
    .map((s, i) => ({ ...s, page: i + 1 }))
    .filter(
      (s) =>
        s.chars >= 200 &&
        s.items >= 30 &&
        s.avgItemLen > 0 &&
        s.avgItemLen < 6 &&
        s.digits / Math.max(s.chars, 1) >= 0.25,
    )
    .map((s) => s.page)
  return { pages, warn: pages.length > 0 }
}

// The user-facing warnings for a PDF, ready to display and to persist with
// the analysis.
export function buildExtractionWarnings(pageStats) {
  if (!Array.isArray(pageStats) || !pageStats.length) return []
  const warnings = []

  const scanned = detectScannedPages(pageStats)
  if (scanned.warn) {
    warnings.push({
      type: 'scanned',
      pages: scanned.pages,
      message:
        `${scanned.pages.length} of ${pageStats.length} pages in this PDF contain little or no ` +
        `readable text (page${scanned.pages.length === 1 ? '' : 's'} ${formatPageList(scanned.pages)}) — ` +
        'they may be scanned images. The analysis only sees the readable pages, so it may be incomplete.',
    })
  }

  const tables = detectTablePages(pageStats)
  if (tables.warn) {
    const one = tables.pages.length === 1
    warnings.push({
      type: 'tables',
      pages: tables.pages,
      message:
        `Page${one ? '' : 's'} ${formatPageList(tables.pages)} appear${one ? 's' : ''} to contain ` +
        'tables. Numbers inside tables can be misread during text extraction — verify any amounts ' +
        'against the original document.',
    })
  }

  return warnings
}
