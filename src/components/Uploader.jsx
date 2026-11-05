import { useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import { friendlyError, humanizeUploadError } from '../lib/messages'
import { buildExtractionWarnings } from '../lib/extractionChecks'
import mammoth from 'mammoth'
// Bundle the PDF.js worker with the app instead of loading it from a CDN at
// runtime: one less third-party script, and the worker version can never drift
// from the library version.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

const ACCEPTED = ['.pdf', '.docx', '.txt', '.csv', '.md']
// Larger files freeze the browser during extraction and blow past the
// storage bucket's object limit.
const MAX_FILE_BYTES = 25 * 1024 * 1024

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length
}

async function extractPdf(file) {
  const data = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data }).promise
  const pages = []
  const pageStats = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    const strs = content.items.map((item) => item.str)
    const pageText = strs.join(' ')
    pages.push(pageText)

    // Per-page stats feed the scanned-page and table-page heuristics.
    const nonEmpty = strs.filter((t) => t.trim().length > 0)
    const chars = pageText.replace(/\s/g, '').length
    pageStats.push({
      chars,
      digits: (pageText.match(/\d/g) ?? []).length,
      items: nonEmpty.length,
      avgItemLen: nonEmpty.length
        ? nonEmpty.reduce((a, t) => a + t.trim().length, 0) / nonEmpty.length
        : 0,
    })
  }
  // Return the flat text (unchanged — summarization sees the same input) plus
  // the per-page array, so Q&A can cite real page numbers.
  return { text: pages.join('\n\n'), pages, pageStats }
}

async function extractDocx(file) {
  const arrayBuffer = await file.arrayBuffer()
  const { value } = await mammoth.extractRawText({ arrayBuffer })
  return value
}

function extractPlainText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.readAsText(file)
  })
}

export default function Uploader({ doc, onExtracted, disabled }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [error, setError] = useState('')

  const processFile = async (file) => {
    if (!file) return
    const ext = '.' + file.name.split('.').pop().toLowerCase()
    if (!ACCEPTED.includes(ext)) {
      setError(
        'DocBrief can\u2019t read this type of file yet. It accepts PDF, Word (.docx), and plain text (.txt, .csv, .md).',
      )
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(
        `This file is too large (${formatSize(file.size)}). DocBrief accepts files up to 25 MB.`,
      )
      return
    }
    setError('')
    setExtracting(true)
    try {
      let text
      // Per-page text for PDFs enables real page-number citations in Q&A; stays
      // null for formats with no page concept (DOCX, TXT, CSV, MD).
      let pages = null
      let warnings = []
      if (ext === '.pdf') {
        const extracted = await extractPdf(file)
        text = extracted.text
        pages = extracted.pages
        warnings = buildExtractionWarnings(extracted.pageStats)
      } else if (ext === '.docx') text = await extractDocx(file)
      else text = await extractPlainText(file)

      if (!text?.trim()) {
        throw friendlyError(
          ext === '.pdf'
            ? 'No readable text was found in this PDF. If it\u2019s a scanned copy (photographed or photocopied pages), the text can\u2019t be read yet \u2014 upload a version that was saved directly from a computer instead.'
            : 'No readable text was found in this file.',
        )
      }
      onExtracted({
        name: file.name,
        size: file.size,
        type: ext.slice(1).toUpperCase(),
        text,
        wordCount: countWords(text),
        pages,
        warnings,
      })
    } catch (err) {
      setError(humanizeUploadError(err))
      onExtracted(null)
    } finally {
      setExtracting(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    if (disabled || extracting) return
    processFile(e.dataTransfer.files?.[0])
  }

  return (
    <div className="bg-surface rounded-xl border border-hair shadow-sm p-5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint mb-3">
        Document
      </h2>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled && !extracting) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => !disabled && !extracting && inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (disabled || extracting) return
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
        className={`rounded-lg border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors
          ${dragging ? 'border-navy bg-navy-pale' : 'border-hair hover:border-navy hover:bg-navy/[0.03]'}
          ${disabled || extracting ? 'opacity-60 cursor-not-allowed' : ''}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED.join(',')}
          className="hidden"
          onChange={(e) => {
            processFile(e.target.files?.[0])
            e.target.value = ''
          }}
        />

        {extracting ? (
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 border-2 border-navy border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-faint">Extracting text…</p>
          </div>
        ) : (
          <>
            <svg
              className="mx-auto h-10 w-10 text-faint/60"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
              />
            </svg>
            <p className="mt-3 text-sm font-medium text-ink">
              Drag &amp; drop a document here, or click to browse
            </p>
            <p className="mt-1 text-xs text-faint">PDF, DOCX, TXT, CSV, MD</p>
          </>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-risk-high-ink bg-risk-high/[0.08] border border-risk-high/25 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {doc && !extracting && doc.warnings?.length > 0 && (
        <div className="mt-3 space-y-2">
          {doc.warnings.map((w, i) => (
            <p
              key={i}
              className="rounded-lg border border-amber/40 bg-amber/[0.08] px-3 py-2 text-sm leading-relaxed text-amber-ink"
            >
              {w.message}
            </p>
          ))}
        </div>
      )}

      {doc && !extracting && (
        <div className="mt-4 flex items-center gap-3 bg-navy-pale border border-navy/10 rounded-lg px-4 py-3">
          <div className="h-10 w-10 rounded-md bg-navy flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">{doc.type}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-ink truncate">{doc.name}</p>
            <p className="text-xs text-faint">
              {formatSize(doc.size)} · {doc.wordCount.toLocaleString()} words
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
