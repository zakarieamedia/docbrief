import Markdown from './Markdown'
import PagePointer from './PagePointer'

// Severity → visual weight. HIGH is the loud one: red-orange fill badge, thick
// red-orange rail, warm tinted panel. MEDIUM is amber. LOW is quiet navy.
const RISK = {
  high: {
    rail: 'border-l-risk-high',
    panel: 'bg-risk-high/[0.07]',
    badge: 'bg-risk-high text-white',
    order: 0,
  },
  medium: {
    rail: 'border-l-amber',
    panel: 'bg-amber/[0.06]',
    badge: 'bg-amber text-white',
    order: 1,
  },
  low: {
    rail: 'border-l-navy/30',
    panel: 'bg-surface',
    badge: 'bg-navy/10 text-navy',
    order: 2,
  },
}

// A quiet section heading — serif label over a hairline rule.
function SectionHead({ children, tone = 'navy' }) {
  return (
    <h2
      className={`font-serif text-lg font-bold ${
        tone === 'faint' ? 'text-faint' : 'text-navy'
      } border-b border-hair pb-1.5`}
    >
      {children}
    </h2>
  )
}

function CleanTable({ columns, rows }) {
  if (!rows?.length) {
    return <p className="px-4 py-3 text-sm italic text-faint">None identified.</p>
  }
  return (
    <div className="overflow-x-auto rounded-md border border-hair bg-surface">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-hair bg-navy/[0.04]">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-4 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-faint"
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hair">
          {rows.map((row, i) => (
            <tr key={i}>
              {columns.map((col) => (
                <td key={col.key} className="px-4 py-2.5 align-top text-ink">
                  {row[col.key] || '—'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ——— Tab panels ————————————————————————————————————————————————————————
// Each panel below is one sidebar tab's content, rendered on the paper sheet
// by ResultView. They were the sections of the single-scroll memo.

// Overview tab: letterhead masthead + the memo's opening lead.
export function OverviewPanel({ summary, fileName }) {
  const metaLine = [summary.documentType, summary.preparedDate, fileName && `Source: ${fileName}`]
    .filter(Boolean)
    .join('   ·   ')

  return (
    <div>
      <header className="border-b-2 border-navy pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-faint">
          Document Brief
        </p>
        <h1 className="mt-1.5 font-serif text-2xl font-bold leading-tight text-navy sm:text-[1.9rem]">
          {summary.documentTitle || fileName || 'Untitled Document'}
        </h1>
        {metaLine && <p className="mt-2 text-sm text-faint">{metaLine}</p>}
      </header>

      {/* The lead paragraph. No box, bigger serif type, reads like the
          opening of a memo. */}
      <Markdown className="mt-6 font-serif text-lg leading-relaxed text-ink sm:text-xl [&_p]:mb-3 [&_:last-child]:mb-0 [&_strong]:font-semibold">
        {summary.overview || 'No overview was generated for this document.'}
      </Markdown>
    </div>
  )
}

// Full Summary tab: the narrative walkthrough — the document explained
// section by section in plain English, denser than the overview lead.
export function FullSummaryPanel({ summary }) {
  return (
    <div>
      <SectionHead>Full Summary</SectionHead>
      <Markdown
        className="mt-4 text-[15px] leading-relaxed text-ink
          [&_h1]:font-serif [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-navy [&_h1]:mt-5 [&_h1]:mb-2
          [&_h2]:font-serif [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-navy [&_h2]:mt-5 [&_h2]:mb-2
          [&_h3]:font-serif [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-navy [&_h3]:mt-4 [&_h3]:mb-1
          [&_:first-child]:mt-0
          [&_p]:mb-2.5 [&_strong]:font-semibold
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:space-y-1
          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_ol]:space-y-1
          [&_hr]:my-4 [&_hr]:border-hair"
      >
        {summary.fullSummary}
      </Markdown>
    </div>
  )
}

// Risks & Flags tab: the hero. Strongest visual weight in the app.
export function RisksPanel({ summary }) {
  const risks = [...(summary.risksAndFlags ?? [])].sort(
    (a, b) =>
      (RISK[String(a.severity).toLowerCase()] ?? RISK.low).order -
      (RISK[String(b.severity).toLowerCase()] ?? RISK.low).order,
  )

  return (
    <section>
      <div className="flex items-baseline justify-between border-b-2 border-risk-high/70 pb-1.5">
        <h2 className="font-serif text-xl font-bold text-risk-high-ink">Risks &amp; Flags</h2>
        <span className="text-xs font-semibold uppercase tracking-wide text-faint">
          {risks.length} flagged
        </span>
      </div>

      {risks.length ? (
        <div className="mt-4 space-y-3">
          {risks.map((risk, i) => {
            const sev = String(risk.severity || 'low').toLowerCase()
            const style = RISK[sev] ?? RISK.low
            return (
              <div
                key={i}
                className={`rounded-md border border-hair border-l-4 ${style.rail} ${style.panel} px-4 py-3`}
              >
                <div className="mb-1.5 flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${style.badge}`}
                  >
                    {sev}
                  </span>
                  {risk.source && <PagePointer citation={risk.source} />}
                </div>
                <p className="text-[15px] leading-relaxed text-ink">{risk.description || '—'}</p>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="mt-4 rounded-md border border-hair bg-surface px-4 py-3 text-sm italic text-faint">
          None identified.
        </p>
      )}
    </section>
  )
}

// Parties & Financials tab: the two clean tables, deliberately not
// over-designed.
export function PartiesFinancialsPanel({ summary }) {
  return (
    <div>
      <section>
        <SectionHead>Key Parties</SectionHead>
        <div className="mt-3">
          <CleanTable
            columns={[
              { key: 'name', label: 'Name' },
              { key: 'role', label: 'Role' },
            ]}
            rows={summary.parties}
          />
        </div>
      </section>

      <section className="mt-8">
        <SectionHead>Financial Terms</SectionHead>
        <div className="mt-3">
          <CleanTable
            columns={[
              { key: 'item', label: 'Item' },
              { key: 'amount', label: 'Amount' },
              { key: 'notes', label: 'Notes' },
            ]}
            rows={summary.financialTerms}
          />
        </div>
      </section>
    </div>
  )
}

// Obligations & Dates tab: the two-column reference section.
// Each column gets min-w-0 so a long, non-wrapping deadline can't blow out
// its grid track and bleed across the gap into the other column (grid/flex
// items default to min-width:auto). The party/deadline row wraps, and the
// deadline itself wraps + breaks long tokens.
export function ObligationsDatesPanel({ summary }) {
  const obligations = summary.keyObligations ?? []
  const dates = summary.importantDates ?? []

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <section className="min-w-0">
        <SectionHead tone="faint">Obligations</SectionHead>
        {obligations.length ? (
          <ul className="mt-2 divide-y divide-hair">
            {obligations.map((o, i) => (
              <li key={i} className="py-2.5 text-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="min-w-0 break-words font-semibold text-ink">{o.party || '—'}</span>
                  {o.deadline && (
                    <span className="min-w-0 break-words text-xs text-faint">due {o.deadline}</span>
                  )}
                </div>
                <p className="mt-0.5 break-words leading-relaxed text-ink/80">{o.obligation || '—'}</p>
                {o.source && <PagePointer citation={o.source} className="mt-1.5" />}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm italic text-faint">None identified.</p>
        )}
      </section>

      <section className="min-w-0">
        <SectionHead tone="faint">Important Dates</SectionHead>
        {dates.length ? (
          <ul className="mt-2 divide-y divide-hair">
            {dates.map((d, i) => (
              <li key={i} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2.5 text-sm">
                <span className="min-w-0 break-words">
                  <span className="text-ink">{d.event || '—'}</span>
                  {d.source && <PagePointer citation={d.source} className="ml-2 align-middle" />}
                </span>
                <span className="whitespace-nowrap font-semibold text-navy">{d.date || '—'}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm italic text-faint">None identified.</p>
        )}
      </section>
    </div>
  )
}
