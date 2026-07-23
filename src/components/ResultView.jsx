import { useState } from 'react'
import { jsPDF } from 'jspdf'
import { sanitizeSummary } from '../lib/claude'
import { downloadBriefPdf } from '../lib/briefPdf'
import Markdown from './Markdown'
import DocChat from './DocChat'
import {
  OverviewPanel,
  FullSummaryPanel,
  RisksPanel,
  PartiesFinancialsPanel,
  ObligationsDatesPanel,
} from './SummaryView'

const NAVY = [31, 56, 100] // #1F3864

// Fresh results carry a structured summary object; rows reopened from history
// carry summary_text — JSON for new saves, markdown/plain text for old ones.
// Returns the structured object, or null for legacy text summaries.
// Exported so App can decide which sidebar tabs a document gets.
export function toStructuredSummary(value) {
  let raw = value
  if (typeof raw === 'string') {
    if (!raw.trim().startsWith('{')) return null
    try {
      raw = JSON.parse(raw)
    } catch {
      return null
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  // Old history rows predate the anti-padding prompt — scrub filler rows the
  // same way fresh responses are scrubbed.
  return sanitizeSummary(raw)
}

function summaryToText(summary, fileName) {
  const out = [
    summary.documentTitle || fileName,
    [summary.documentType, summary.preparedDate].filter(Boolean).join(' — '),
    '',
  ]
  if (summary.overview) out.push('DOCUMENT OVERVIEW', summary.overview, '')
  for (const note of summary.extractionNotes ?? []) out.push(`NOTE: ${note}`, '')
  if (summary.fullSummary) out.push('FULL SUMMARY', summary.fullSummary, '')

  // Risks always appear — same rule as the tab.
  out.push('RISKS & FLAGS')
  const risks = summary.risksAndFlags ?? []
  if (!risks.length) out.push('None identified in this document.')
  for (const r of risks) {
    out.push(
      `- [${String(r.severity || 'low').toUpperCase()}] ${r.title || r.description || '—'}`,
    )
    if (r.title && r.description) out.push(`  ${r.description}`)
    if (r.sourceQuote) {
      out.push(
        `  ${r.quoteVerified === false ? 'From the analysis (wording not verified)' : 'Exact wording'}: “${r.sourceQuote}”`,
      )
    }
    if (r.source || r.sourcePage) {
      const where = [r.source, r.sourcePage ? `p. ${r.sourcePage}` : ''].filter(Boolean).join(', ')
      out.push(
        `  Found in: ${where}${r.sourceVerified === false ? ' — not found in document' : ''}`,
      )
    }
  }
  out.push('')

  // Reference sections only when the UI would show them.
  const parties = summary.parties ?? []
  const financials = summary.financialTerms ?? []
  if (parties.length || financials.length) {
    out.push('KEY PARTIES')
    out.push(
      ...(parties.length
        ? parties.map((p) => `- ${p.name || '—'}: ${p.role || '—'}`)
        : ['None identified in this document.']),
    )
    out.push('', 'FINANCIAL TERMS')
    out.push(
      ...(financials.length
        ? financials.map(
            (f) => `- ${f.item || '—'}: ${f.amount || '—'}${f.notes ? ` (${f.notes})` : ''}`,
          )
        : ['None identified in this document.']),
    )
    out.push('')
  }

  const obligations = summary.keyObligations ?? []
  const dates = summary.importantDates ?? []
  if (obligations.length || dates.length) {
    out.push('KEY OBLIGATIONS')
    out.push(
      ...(obligations.length
        ? obligations.map(
            (o) =>
              `- ${o.party || '—'}: ${o.obligation || '—'}${o.deadline ? ` — due ${o.deadline}` : ''}`,
          )
        : ['None identified in this document.']),
    )
    out.push('', 'IMPORTANT DATES')
    out.push(
      ...(dates.length
        ? dates.map((d) => `- ${d.date || '—'}: ${d.event || '—'}`)
        : ['None identified in this document.']),
    )
  }

  return out.join('\n').trim()
}

// Plain text-flow PDF for legacy string summaries reopened from history.
function downloadTextPdf(result) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 56
  const maxWidth = pageWidth - margin * 2
  const footerY = pageHeight - 32

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...NAVY)
  doc.text('DocBrief Summary', margin, margin)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(`${result.fileName} — ${new Date().toLocaleDateString()}`, margin, margin + 18)
  doc.setDrawColor(...NAVY)
  doc.line(margin, margin + 28, pageWidth - margin, margin + 28)

  doc.setFontSize(11)
  doc.setTextColor(30)
  const lines = doc.splitTextToSize(result.summary, maxWidth)
  let y = margin + 48
  const lineHeight = 15
  for (const line of lines) {
    if (y > footerY - 24) {
      doc.addPage()
      y = margin
    }
    doc.text(line, margin, y)
    y += lineHeight
  }

  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(9)
    doc.setTextColor(130)
    doc.text('Confidential — Generated by DocBrief', pageWidth / 2, footerY, {
      align: 'center',
    })
  }

  const baseName = (result.fileName || 'document').replace(/\.[^.]+$/, '')
  doc.save(`${baseName}-summary.pdf`)
}

// One quiet metric in the muted stats strip below the memo — process metadata
// (word count, cost, etc.) that Frank doesn't need up front.
function Stat({ label, value }) {
  return (
    <span className="whitespace-nowrap">
      <span className="text-faint">{label}:</span>{' '}
      <span className="font-medium text-ink">{value}</span>
    </span>
  )
}

// The warm paper sheet every tab panel renders on.
function Sheet({ children }) {
  return (
    <article className="bg-surface rounded-xl border border-hair shadow-sm px-6 py-7 sm:px-9 sm:py-8">
      {children}
    </article>
  )
}

// The open document's main-area view: a per-document action bar plus the
// panel for the sidebar tab that's active. One panel at a time — the old
// single-scroll memo's sections each became a tab.
export default function ResultView({
  result,
  session,
  activeTab,
  documentText,
  documentPages,
  documentTextStatus,
  saveStatus,
  saveError,
  onRetrySave,
}) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const summary = toStructuredSummary(result.summary)
  const plainText = summary
    ? summaryToText(summary, result.fileName)
    : String(result.summary ?? '')

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plainText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard API requires a secure context and user permission.
      setError('Could not copy to clipboard.')
    }
  }

  const handleDownload = () => {
    if (summary) downloadBriefPdf(summary, result)
    else downloadTextPdf(result)
  }

  // The chat tab takes over the whole content area as a full-height chat —
  // no action bar, its own pinned composer. Every other tab is a scrolling
  // panel under the per-document action bar.
  const chatActive = activeTab === 'chat'

  return (
    <div className={chatActive ? 'flex h-full flex-col' : 'space-y-4'}>
      {/* Action bar — saving is automatic; only its status shows here. */}
      {!chatActive && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {(saveStatus === 'saving' || saveStatus === 'saved' || result.saved) && (
            <span className="text-xs text-faint" aria-live="polite">
              {saveStatus === 'saving' ? 'Saving to history…' : 'Saved ✓'}
            </span>
          )}
          <button
            onClick={handleDownload}
            className="rounded-lg bg-navy hover:bg-navy-dark text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            Download PDF
          </button>
          <button
            onClick={handleCopy}
            className="rounded-lg border border-hair text-ink hover:bg-black/[0.03] text-sm font-medium px-4 py-2 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
      )}

      {/* Auto-save failure: loud, honest, retryable — never silent. */}
      {!chatActive && saveStatus === 'error' && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-risk-high/25 bg-risk-high/[0.08] px-4 py-3 text-sm text-risk-high-ink">
          <span className="min-w-0 break-words">
            This analysis couldn&rsquo;t be saved to History
            {saveError ? `: ${saveError}` : '.'}
          </span>
          <button
            onClick={onRetrySave}
            className="rounded-lg bg-navy px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-navy-dark"
          >
            Retry save
          </button>
        </div>
      )}

      {/* Active tab panel */}
      {activeTab === 'overview' && summary && (
        <>
          <Sheet>
            <OverviewPanel summary={summary} fileName={result.fileName} />
          </Sheet>

          {/* Quiet process metadata — reference, not headline */}
          <div className="flex flex-wrap gap-x-5 gap-y-1 px-1 text-xs">
            <Stat
              label="Words"
              value={result.wordCount != null ? result.wordCount.toLocaleString() : '—'}
            />
            <Stat
              label="Sections analyzed"
              value={result.chunksProcessed != null ? result.chunksProcessed : '—'}
            />
            <Stat label="Depth" value={result.depth || '—'} />
            <Stat
              label="Cost"
              value={result.actualCost != null ? `$${Number(result.actualCost).toFixed(3)}` : '—'}
            />
          </div>
        </>
      )}

      {activeTab === 'risks' && summary && (
        <Sheet>
          <RisksPanel summary={summary} />
        </Sheet>
      )}

      {activeTab === 'parties' && summary && (
        <Sheet>
          <PartiesFinancialsPanel summary={summary} />
        </Sheet>
      )}

      {activeTab === 'obligations' && summary && (
        <Sheet>
          <ObligationsDatesPanel summary={summary} />
        </Sheet>
      )}

      {/* Full Summary: the narrative walkthrough for structured summaries
          that carry one (the tab only appears when it exists)… */}
      {activeTab === 'summary' && summary?.fullSummary && (
        <Sheet>
          <FullSummaryPanel summary={summary} />
        </Sheet>
      )}

      {/* …and legacy markdown/plain-text summaries saved before the
          structured format (their whole content is prose). */}
      {activeTab === 'summary' && !summary && (
        <Sheet>
          <Markdown
            className="break-words text-[15px] text-ink leading-relaxed
              [&_h1]:font-serif [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:text-navy [&_h1]:mt-5 [&_h1]:mb-2
              [&_h2]:font-serif [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-navy [&_h2]:mt-5 [&_h2]:mb-2
              [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-navy [&_h3]:mt-3 [&_h3]:mb-1
              [&_:first-child]:mt-0
              [&_p]:mb-2 [&_strong]:font-semibold
              [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3 [&_ul]:space-y-1
              [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3 [&_ol]:space-y-1
              [&_hr]:my-4 [&_hr]:border-hair"
          >
            {plainText}
          </Markdown>
        </Sheet>
      )}

      {/* Ask a Question: kept mounted (hidden, not unmounted) so the
          conversation survives switching to other tabs. */}
      <div className={chatActive ? 'min-h-0 flex-1' : 'hidden'}>
        <DocChat
          documentText={documentText}
          documentPages={documentPages}
          textStatus={documentTextStatus}
          userInitial={(session.user.email?.[0] || '?').toUpperCase()}
        />
      </div>

      {!chatActive && error && (
        <p className="rounded-xl border border-risk-high/25 bg-risk-high/[0.08] px-4 py-3 text-sm text-risk-high-ink">
          {error}
        </p>
      )}
    </div>
  )
}
