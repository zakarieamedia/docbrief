import { useRef, useState } from 'react'
import * as pdfjsLib from 'pdfjs-dist'
import mammoth from 'mammoth'

pdfjsLib.GlobalWorkerOptions.workerSrc =
  `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

const ACCEPTED = ['.pdf', '.docx', '.txt', '.csv', '.md']

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
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()
    pages.push(content.items.map((item) => item.str).join(' '))
  }
  return pages.join('\n\n')
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
      setError(`Unsupported file type. Accepted: ${ACCEPTED.join(', ')}`)
      return
    }
    setError('')
    setExtracting(true)
    try {
      let text
      if (ext === '.pdf') text = await extractPdf(file)
      else if (ext === '.docx') text = await extractDocx(file)
      else text = await extractPlainText(file)

      if (!text?.trim()) {
        throw new Error('No extractable text found in this file.')
      }
      onExtracted({
        name: file.name,
        size: file.size,
        type: ext.slice(1).toUpperCase(),
        text,
        wordCount: countWords(text),
      })
    } catch (err) {
      setError(err.message || 'Text extraction failed.')
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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
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
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
        className={`rounded-lg border-2 border-dashed px-6 py-10 text-center cursor-pointer transition-colors
          ${dragging ? 'border-navy bg-navy-pale' : 'border-gray-300 hover:border-navy hover:bg-gray-50'}
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
            <p className="text-sm text-gray-600">Extracting text…</p>
          </div>
        ) : (
          <>
            <svg
              className="mx-auto h-10 w-10 text-gray-400"
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
            <p className="mt-3 text-sm font-medium text-gray-700">
              Drag &amp; drop a document here, or click to browse
            </p>
            <p className="mt-1 text-xs text-gray-500">PDF, DOCX, TXT, CSV, MD</p>
          </>
        )}
      </div>

      {error && (
        <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {doc && !extracting && (
        <div className="mt-4 flex items-center gap-3 bg-navy-pale border border-navy/10 rounded-lg px-4 py-3">
          <div className="h-10 w-10 rounded-md bg-navy flex items-center justify-center shrink-0">
            <span className="text-white text-xs font-bold">{doc.type}</span>
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-800 truncate">{doc.name}</p>
            <p className="text-xs text-gray-500">
              {formatSize(doc.size)} · {doc.wordCount.toLocaleString()} words
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
