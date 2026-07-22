import { useState } from 'react'
import { jsPDF } from 'jspdf'
import { supabase } from '../lib/supabase'
import Markdown from './Markdown'
import DocChat from './DocChat'
import {
  OverviewPanel,
  RisksPanel,
  PartiesFinancialsPanel,
  ObligationsDatesPanel,
} from './SummaryView'

const NAVY = [31, 56, 100] // #1F3864

const RISK_PDF_COLORS = {
  high: [220, 38, 38],
  medium: [202, 138, 4],
  low: [107, 114, 128],
}

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
  return raw
}

function summaryToText(summary, fileName) {
  const section = (title, lines) => [
    title.toUpperCase(),
    ...(lines.length ? lines : ['None identified.']),
    '',
  ]
  return [
    summary.documentTitle || fileName,
    [summary.documentType, summary.preparedDate].filter(Boolean).join(' — '),
    '',
    ...section('Document Overview', summary.overview ? [summary.overview] : []),
    ...section(
      'Key Parties',
      (summary.parties ?? []).map((p) => `- ${p.name || '—'}: ${p.role || '—'}`),
    ),
    ...section(
      'Financial Terms',
      (summary.financialTerms ?? []).map(
        (f) => `- ${f.item || '—'}: ${f.amount || '—'}${f.notes ? ` (${f.notes})` : ''}`,
      ),
    ),
    ...section(
      'Key Obligations',
      (summary.keyObligations ?? []).map(
        (o) => `- ${o.party || '—'}: ${o.obligation || '—'}${o.deadline ? ` — due ${o.deadline}` : ''}`,
      ),
    ),
    ...section(
      'Important Dates',
      (summary.importantDates ?? []).map((d) => `- ${d.date || '—'}: ${d.event || '—'}`),
    ),
    ...section(
      'Risks & Flags',
      (summary.risksAndFlags ?? []).map(
        (r) => `- [${String(r.severity || 'low').toUpperCase()}] ${r.description || '—'}`,
      ),
    ),
  ]
    .join('\n')
    .trim()
}

function downloadStructuredPdf(summary, result) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const margin = 56
  const contentWidth = pageWidth - margin * 2
  const footerY = pageHeight - 36
  const lineHeight = 13
  let y = margin

  const ensureSpace = (needed) => {
    if (y + needed > footerY - 16) {
      doc.addPage()
      y = margin
    }
  }

  const sectionBar = (title) => {
    ensureSpace(64) // never leave a bar orphaned at a page bottom
    doc.setFillColor(...NAVY)
    doc.rect(margin, y, contentWidth, 22, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(255)
    doc.text(title.toUpperCase(), margin + 10, y + 14.5)
    y += 32
  }

  const emptyRow = () => {
    ensureSpace(22)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(10)
    doc.setTextColor(130)
    doc.text('None identified.', margin + 2, y + 10)
    y += 26
  }

  const table = (columns, rows) => {
    if (!rows?.length) {
      emptyRow()
      return
    }
    const pad = 6
    ensureSpace(44)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(120)
    let x = margin
    for (const col of columns) {
      doc.text(col.label.toUpperCase(), x + pad, y + 8)
      x += col.width
    }
    y += 14
    doc.setDrawColor(190)
    doc.setLineWidth(0.75)
    doc.line(margin, y, margin + contentWidth, y)
    y += 2

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    for (const row of rows) {
      const cells = columns.map((col) =>
        doc.splitTextToSize(String(row[col.key] ?? '') || '—', col.width - pad * 2),
      )
      const rowHeight = Math.max(...cells.map((c) => c.length)) * lineHeight + 9
      ensureSpace(rowHeight)
      doc.setTextColor(40)
      let cx = margin
      cells.forEach((cellLines, i) => {
        doc.text(cellLines, cx + pad, y + 12)
        cx += columns[i].width
      })
      y += rowHeight
      doc.setDrawColor(228)
      doc.setLineWidth(0.5)
      doc.line(margin, y, margin + contentWidth, y)
    }
    y += 16
  }

  // Document header
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(19)
  doc.setTextColor(...NAVY)
  const titleLines = doc.splitTextToSize(
    summary.documentTitle || result.fileName || 'Document Summary',
    contentWidth,
  )
  doc.text(titleLines, margin, y + 14)
  y += titleLines.length * 22 + 4

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(110)
  const meta = [
    summary.documentType,
    summary.preparedDate,
    result.fileName ? `Source: ${result.fileName}` : '',
  ]
    .filter(Boolean)
    .join('   ·   ')
  doc.text(meta, margin, y + 8)
  y += 16
  doc.setDrawColor(...NAVY)
  doc.setLineWidth(1.5)
  doc.line(margin, y, margin + contentWidth, y)
  y += 18

  // Overview
  sectionBar('Document Overview')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(40)
  const overviewLines = doc.splitTextToSize(summary.overview || 'Not specified.', contentWidth - 4)
  ensureSpace(overviewLines.length * lineHeight + 12)
  doc.text(overviewLines, margin + 2, y + 10)
  y += overviewLines.length * lineHeight + 18

  sectionBar('Key Parties')
  table(
    [
      { key: 'name', label: 'Name', width: 170 },
      { key: 'role', label: 'Role', width: 330 },
    ],
    summary.parties,
  )

  sectionBar('Financial Terms')
  table(
    [
      { key: 'item', label: 'Item', width: 170 },
      { key: 'amount', label: 'Amount', width: 110 },
      { key: 'notes', label: 'Notes', width: 220 },
    ],
    summary.financialTerms,
  )

  sectionBar('Key Obligations')
  table(
    [
      { key: 'party', label: 'Party', width: 120 },
      { key: 'obligation', label: 'Obligation', width: 260 },
      { key: 'deadline', label: 'Deadline', width: 120 },
    ],
    summary.keyObligations,
  )

  sectionBar('Important Dates')
  table(
    [
      { key: 'date', label: 'Date', width: 140 },
      { key: 'event', label: 'Event', width: 360 },
    ],
    summary.importantDates,
  )

  sectionBar('Risks & Flags')
  const risks = summary.risksAndFlags ?? []
  if (!risks.length) emptyRow()
  for (const risk of risks) {
    const severity = String(risk.severity || 'low').toLowerCase()
    const color = RISK_PDF_COLORS[severity] || RISK_PDF_COLORS.low
    const badgeWidth = 54
    const descLines = doc.splitTextToSize(risk.description || '—', contentWidth - badgeWidth - 16)
    const blockHeight = Math.max(descLines.length * lineHeight, 15) + 10
    ensureSpace(blockHeight)
    doc.setFillColor(...color)
    doc.roundedRect(margin, y + 1, badgeWidth, 14, 7, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(255)
    doc.text(severity.toUpperCase(), margin + badgeWidth / 2, y + 10.5, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(40)
    doc.text(descLines, margin + badgeWidth + 12, y + 11)
    y += blockHeight
  }

  // Footer on every page
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(130)
    doc.text('Confidential — Generated by DocBrief', margin, footerY + 14)
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - margin, footerY + 14, { align: 'right' })
  }

  const baseName = (result.fileName || 'document').replace(/\.[^.]+$/, '')
  doc.save(`${baseName}-summary.pdf`)
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
  onSaved,
  activeTab,
  documentText,
  documentPages,
}) {
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(Boolean(result.saved))
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState('')

  const summary = toStructuredSummary(result.summary)
  const plainText = summary
    ? summaryToText(summary, result.fileName)
    : String(result.summary ?? '')

  const handleSave = async () => {
    setSaving(true)
    setError('')
    try {
      const { error } = await supabase.from('summaries').insert({
        user_id: session.user.id,
        user_email: session.user.email,
        file_name: result.fileName,
        file_type: result.fileType,
        word_count: result.wordCount,
        depth: result.depth,
        format: result.format,
        focus: result.focus || null,
        summary_text: summary ? JSON.stringify(summary) : plainText,
        chunks_processed: result.chunksProcessed ?? null,
        actual_cost: result.actualCost ?? null,
      })
      if (error) throw error
      setSaved(true)
      onSaved?.()
    } catch (err) {
      setError(err.message || 'Could not save to history.')
    } finally {
      setSaving(false)
    }
  }

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
    if (summary) downloadStructuredPdf(summary, result)
    else downloadTextPdf(result)
  }

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          onClick={handleDownload}
          className="rounded-lg bg-navy hover:bg-navy-dark text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          Download PDF
        </button>
        <button
          onClick={handleSave}
          disabled={saving || saved}
          className="rounded-lg border border-navy text-navy hover:bg-navy-pale text-sm font-medium px-4 py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saved ? 'Saved' : saving ? 'Saving…' : 'Save to History'}
        </button>
        <button
          onClick={handleCopy}
          className="rounded-lg border border-hair text-ink hover:bg-black/[0.03] text-sm font-medium px-4 py-2 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

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
            <Stat label="Format" value={result.format || '—'} />
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

      {/* Full Summary: legacy markdown/plain-text summaries saved before the
          structured format live here (their whole content is prose). */}
      {activeTab === 'summary' && !summary && (
        <Sheet>
          <Markdown
            className="text-[15px] text-ink leading-relaxed
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
      <div className={activeTab === 'chat' ? '' : 'hidden'}>
        <DocChat documentText={documentText} documentPages={documentPages} />
      </div>

      {error && (
        <p className="rounded-xl border border-risk-high/25 bg-risk-high/[0.08] px-4 py-3 text-sm text-risk-high-ink">
          {error}
        </p>
      )}
    </div>
  )
}
