import { jsPDF } from 'jspdf'

// The downloadable brief, matching the tabbed UI: letterhead + overview lead,
// extraction advisories, Full Summary narrative, the risk funnel (titles,
// badges, verified/unverified quote blocks), and the reference sections —
// WITH the same honesty rules as the screen: sections the UI hides (both
// halves empty) are omitted; Risks & Flags always appears, even empty; an
// unverified quote is never labeled "exact wording".
//
// jspdf-only module so Node scripts can generate and inspect the exact
// production PDF. Times = the serif voice, Helvetica = the body voice.

const C = {
  navy: [31, 56, 100],
  ink: [43, 37, 33],
  faint: [110, 101, 92],
  hair: [214, 207, 196],
  riskHigh: [194, 65, 12],
  riskHighInk: [124, 45, 18],
  amber: [180, 83, 9],
  amberInk: [120, 53, 15],
  amberBg: [251, 243, 231],
  low: [107, 114, 128],
  quoteBg: [246, 244, 240],
}

const SEV = {
  high: { color: C.riskHigh, label: 'HIGH RISK' },
  medium: { color: C.amber, label: 'MEDIUM RISK' },
  low: { color: C.low, label: 'LOW RISK' },
}

// Strip markdown emphasis/inline-code markers for plain PDF text.
const stripMd = (s) =>
  String(s ?? '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')

// The fullSummary narrative → typed blocks (### heads, bullets, paragraphs).
function narrativeBlocks(md) {
  const blocks = []
  for (const raw of String(md).split(/\n/)) {
    const line = raw.trim()
    if (!line) continue
    const h = line.match(/^#{1,3}\s+(.*)$/)
    if (h) blocks.push({ type: 'head', text: stripMd(h[1]) })
    else if (/^[-*]\s+/.test(line)) blocks.push({ type: 'bullet', text: stripMd(line.replace(/^[-*]\s+/, '')) })
    else blocks.push({ type: 'para', text: stripMd(line) })
  }
  return blocks
}

export function buildBriefPdf(summary, result) {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const margin = 56
  const contentW = pageW - margin * 2
  const footerY = pageH - 36
  let y = margin

  const ensureSpace = (needed) => {
    if (y + needed > footerY - 16) {
      doc.addPage()
      y = margin
    }
  }

  // Wrapped text with page breaks. Returns nothing; advances y.
  const para = (text, { font = 'helvetica', style = 'normal', size = 10, color = C.ink, lineH = size * 1.35, x = margin, maxW = contentW, after = 6 } = {}) => {
    doc.setFont(font, style)
    doc.setFontSize(size)
    doc.setTextColor(...color)
    const lines = doc.splitTextToSize(String(text), maxW)
    for (const line of lines) {
      ensureSpace(lineH)
      doc.text(line, x, y + lineH * 0.8)
      y += lineH
    }
    y += after
  }

  // Serif section heading over a hairline — the app's SectionHead.
  const sectionHead = (title, color = C.navy) => {
    ensureSpace(46)
    doc.setFont('times', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(...color)
    doc.text(title, margin, y + 14)
    y += 20
    doc.setDrawColor(...C.hair)
    doc.setLineWidth(0.75)
    doc.line(margin, y, margin + contentW, y)
    y += 12
  }

  const noneLine = () =>
    para('None identified in this document.', { style: 'italic', color: C.faint, size: 10 })

  // A filled advisory/quote box with a colored left rail. Content drawn by cb
  // between measured bounds; the box height is measured first via dry run.
  const measure = (text, size, maxW, lineH) => {
    doc.setFontSize(size)
    return doc.splitTextToSize(String(text), maxW).length * lineH
  }

  // ── Letterhead ────────────────────────────────────────────────────────────
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...C.faint)
  doc.text('DOCUMENT BRIEF', margin, y + 8, { charSpace: 2 })
  y += 16

  doc.setFont('times', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...C.navy)
  const titleLines = doc.splitTextToSize(
    summary.documentTitle || result.fileName || 'Document Summary',
    contentW,
  )
  for (const line of titleLines) {
    ensureSpace(26)
    doc.text(line, margin, y + 20)
    y += 26
  }
  y += 2

  const meta = [summary.documentType, summary.preparedDate, result.fileName ? `Source: ${result.fileName}` : '']
    .filter(Boolean)
    .join('   ·   ')
  if (meta) para(meta, { size: 9.5, color: C.faint, after: 4 })

  doc.setDrawColor(...C.navy)
  doc.setLineWidth(2)
  doc.line(margin, y + 4, margin + contentW, y + 4)
  y += 22

  // ── Overview lead (serif, like the memo opening) ─────────────────────────
  if (summary.overview) {
    para(stripMd(summary.overview), { font: 'times', size: 12.5, lineH: 18, after: 10 })
  }

  // ── Extraction advisories ────────────────────────────────────────────────
  for (const note of summary.extractionNotes ?? []) {
    const boxLineH = 12.5
    const textH = measure(note, 9.5, contentW - 26, boxLineH)
    const boxH = textH + 16
    ensureSpace(boxH + 8)
    doc.setFillColor(...C.amberBg)
    doc.rect(margin, y, contentW, boxH, 'F')
    doc.setFillColor(...C.amber)
    doc.rect(margin, y, 3, boxH, 'F')
    const saveY = y
    y += 8
    para(note, { size: 9.5, color: C.amberInk, x: margin + 14, maxW: contentW - 26, lineH: boxLineH, after: 0 })
    y = saveY + boxH + 8
  }
  y += 4

  // ── Full Summary narrative ───────────────────────────────────────────────
  if (summary.fullSummary) {
    sectionHead('Full Summary')
    for (const block of narrativeBlocks(summary.fullSummary)) {
      if (block.type === 'head') {
        ensureSpace(24)
        para(block.text, { font: 'times', style: 'bold', size: 12, color: C.navy, after: 2 })
      } else if (block.type === 'bullet') {
        para(`•  ${block.text}`, { size: 10, x: margin + 8, maxW: contentW - 8, after: 3 })
      } else {
        para(block.text, { size: 10, after: 6 })
      }
    }
    y += 6
  }

  // ── Risks & Flags — always present, like the tab ─────────────────────────
  ensureSpace(50)
  doc.setFont('times', 'bold')
  doc.setFontSize(15)
  doc.setTextColor(...C.riskHighInk)
  doc.text('Risks & Flags', margin, y + 14)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(...C.faint)
  const risks = summary.risksAndFlags ?? []
  doc.text(`${risks.length} FLAGGED`, margin + contentW, y + 14, { align: 'right' })
  y += 20
  doc.setDrawColor(...C.riskHigh)
  doc.setLineWidth(1.25)
  doc.line(margin, y, margin + contentW, y)
  y += 14

  if (!risks.length) noneLine()

  for (const risk of risks) {
    const sev = SEV[String(risk.severity || 'low').toLowerCase()] ?? SEV.low

    // Badge + title + citation
    ensureSpace(60)
    const badgeW = doc.getTextWidth(sev.label) + 40
    doc.setFillColor(...sev.color)
    doc.roundedRect(margin, y, Math.max(badgeW, 66), 14, 7, 7, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(7.5)
    doc.setTextColor(255, 255, 255)
    doc.text(sev.label, margin + Math.max(badgeW, 66) / 2, y + 9.5, { align: 'center' })
    y += 22

    para(risk.title || stripMd(risk.description || 'Risk'), {
      font: 'times',
      style: 'bold',
      size: 13,
      after: 2,
    })
    if (risk.title && risk.description) {
      para(stripMd(risk.description), { size: 10, after: 4 })
    }
    if (risk.source) {
      const flagged = risk.sourceVerified === false
      para(`Found in: ${risk.source}${flagged ? ' — not found in document, verify before relying on it' : ''}`, {
        size: 8.5,
        color: flagged ? C.amberInk : C.faint,
        after: 4,
      })
    }

    // Quote block — same honesty rules as the deep-dive
    if (risk.sourceQuote) {
      const unverified = risk.quoteVerified === false
      const label = unverified
        ? 'FROM THE ANALYSIS — WORDING NOT VERIFIED'
        : `EXACT WORDING FROM THE DOCUMENT${risk.quoteVerified === true ? '  (VERIFIED)' : ''}`
      const qLineH = 14
      const quote = `“${risk.sourceQuote}”`
      doc.setFont('times', 'italic')
      const quoteH = measure(quote, 10.5, contentW - 30, qLineH)
      const boxH = quoteH + 34
      ensureSpace(boxH + 10)
      doc.setFillColor(...(unverified ? C.amberBg : C.quoteBg))
      doc.rect(margin, y, contentW, boxH, 'F')
      doc.setFillColor(...(unverified ? C.amber : sev.color))
      doc.rect(margin, y, 3, boxH, 'F')
      const saveY = y
      y += 8
      para(label, {
        size: 7.5,
        style: 'bold',
        color: unverified ? C.amberInk : C.faint,
        x: margin + 14,
        maxW: contentW - 30,
        lineH: 10,
        after: 2,
      })
      para(quote, {
        font: 'times',
        style: 'italic',
        size: 10.5,
        x: margin + 14,
        maxW: contentW - 30,
        lineH: qLineH,
        after: 0,
      })
      y = saveY + boxH + 10
    }
    y += 8
  }
  y += 4

  // ── Reference sections — omitted entirely when the UI hides them ─────────
  const parties = summary.parties ?? []
  const financials = summary.financialTerms ?? []
  if (parties.length || financials.length) {
    sectionHead('Key Parties & Financial Terms')
    if (parties.length) {
      for (const p of parties) {
        para(`${p.name || '—'} — ${p.role || '—'}`, { size: 10, after: 3 })
      }
    } else {
      noneLine()
    }
    y += 4
    if (financials.length) {
      for (const f of financials) {
        para(
          `${f.item || '—'}: ${f.amount || '—'}${f.notes ? `  (${f.notes})` : ''}`,
          { size: 10, after: 3 },
        )
      }
    } else {
      noneLine()
    }
    y += 8
  }

  const obligations = summary.keyObligations ?? []
  const dates = summary.importantDates ?? []
  if (obligations.length || dates.length) {
    sectionHead('Obligations & Important Dates', C.faint)
    if (obligations.length) {
      for (const o of obligations) {
        para(`${o.party || '—'}${o.deadline ? `  ·  due ${o.deadline}` : ''}`, {
          style: 'bold',
          size: 10,
          after: 1,
        })
        para(stripMd(o.obligation || '—'), { size: 10, after: 1 })
        if (o.source) {
          para(
            `Found in: ${o.source}${o.sourceVerified === false ? ' — not found in document' : ''}`,
            { size: 8.5, color: o.sourceVerified === false ? C.amberInk : C.faint, after: 6 },
          )
        } else y += 5
      }
    }
    if (dates.length) {
      y += 4
      for (const d of dates) {
        // Date leads, like the tab.
        para(d.date || '—', { font: 'times', style: 'bold', size: 11, color: C.navy, after: 1 })
        para(
          `${d.event || '—'}${d.source ? `   (${d.source}${d.sourceVerified === false ? ' — not found in document' : ''})` : ''}`,
          { size: 9.5, color: C.ink, after: 6 },
        )
      }
    }
  }

  // ── Footer on every page ─────────────────────────────────────────────────
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(...C.faint)
    doc.text('Confidential — Generated by DocBrief', margin, footerY + 14)
    doc.text(`Page ${i} of ${pageCount}`, pageW - margin, footerY + 14, { align: 'right' })
  }

  return doc
}

export function downloadBriefPdf(summary, result) {
  const baseName = (result.fileName || 'document').replace(/\.[^.]+$/, '')
  buildBriefPdf(summary, result).save(`${baseName}-brief.pdf`)
}
