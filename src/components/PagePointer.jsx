// The one signature element: a small bookmark tag that recurs everywhere a
// citation appears — on each risk/obligation/date in the summary and under
// every Q&A answer — so Frank learns a single visual pattern for "this is
// where to verify it in the source." Kept visually identical in every context
// (same navy tag) on purpose; consistency is the point. It's a locator, not a
// live link — there's no in-app source viewer to jump to.
// Long citations (e.g. a quoted definition name) must WRAP inside the chip,
// never widen it past its container — max-w-full caps the chip, min-w-0 +
// break-words let the label fold onto extra lines, and the icon stays pinned
// to the first line. A nowrap label here once bled across grid columns.
export default function PagePointer({ citation, className = '' }) {
  const label = typeof citation === 'string' ? citation.trim() : ''
  if (!label) return null
  return (
    <span
      className={`inline-flex max-w-full items-start gap-1 rounded-[3px] border border-navy/25 bg-navy/[0.07] px-1.5 py-0.5 text-[11px] font-semibold leading-tight text-navy ${className}`}
      title={`Verify in the source: ${label}`}
    >
      <svg viewBox="0 0 24 24" className="mt-px h-3 w-3 shrink-0" fill="currentColor" aria-hidden="true">
        <path d="M6 2a2 2 0 0 0-2 2v17.5a.5.5 0 0 0 .79.41L12 17l7.21 4.91a.5.5 0 0 0 .79-.41V4a2 2 0 0 0-2-2H6Z" />
      </svg>
      <span className="min-w-0 break-words">{label}</span>
    </span>
  )
}
