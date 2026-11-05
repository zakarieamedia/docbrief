// The one signature element: a small bookmark tag that recurs everywhere a
// citation appears, so the reader learns a single visual pattern for "this is
// where to verify it in the source." It's a locator, not a live link.
//
// Long citations must WRAP inside the chip, never widen it past its container
// — max-w-full caps the chip, min-w-0 + break-words fold the label, and the
// icon stays pinned to the first line.
//
// `verified` (stamped at analysis time by lib/verify.js):
//   true       → normal navy chip (reference found in the document)
//   false      → amber warning chip + "not found" — the model cited a place
//                that couldn't be located in the text; treat with caution
//   undefined  → normal chip, no claim (summaries saved before verification)
// `page` (also stamped by lib/verify.js): a COMPUTED page number — where the
// verified quote actually sits in the PDF — never a model claim. Shown as
// "· p. N" after the label, or alone when there's no section label.
export default function PagePointer({ citation, verified, page, className = '' }) {
  const label = typeof citation === 'string' ? citation.trim() : ''
  const pageNum = Number.isInteger(page) && page > 0 ? page : null
  if (!label && !pageNum) return null
  const flagged = verified === false
  const display = label ? (pageNum ? `${label} · p. ${pageNum}` : label) : `p. ${pageNum}`
  return (
    <span
      className={`inline-flex max-w-full items-start gap-1 rounded-[3px] border px-1.5 py-0.5 text-[11px] font-semibold leading-tight ${
        flagged
          ? 'border-amber/50 bg-amber/[0.12] text-amber-ink'
          : 'border-navy/25 bg-navy/[0.07] text-navy'
      } ${className}`}
      title={
        flagged
          ? `This reference couldn't be found in the document — double-check it before relying on it: ${display}`
          : `Verify in the source: ${display}`
      }
    >
      <svg viewBox="0 0 24 24" className="mt-px h-3 w-3 shrink-0" fill="currentColor" aria-hidden="true">
        <path d="M6 2a2 2 0 0 0-2 2v17.5a.5.5 0 0 0 .79.41L12 17l7.21 4.91a.5.5 0 0 0 .79-.41V4a2 2 0 0 0-2-2H6Z" />
      </svg>
      <span className="min-w-0 break-words">
        {display}
        {flagged && <span className="font-normal italic"> · not found in document</span>}
      </span>
    </span>
  )
}
