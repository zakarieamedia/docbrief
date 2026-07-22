import { useState } from 'react'

const DEPTHS = ['Brief', 'Standard', 'Deep', 'Executive']
const FORMATS = ['Structured Sections', 'Bullet Points', 'Narrative Prose', 'Q&A']

export default function SummaryControls({ fileLoaded, processing, onAnalyze }) {
  const [depth, setDepth] = useState('Standard')
  const [format, setFormat] = useState('Structured Sections')
  const [focus, setFocus] = useState('')

  return (
    <div className="bg-surface rounded-xl border border-hair shadow-sm p-5">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint mb-3">
        Summary Options
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="depth" className="block text-sm font-medium text-ink mb-1">
            Summary Depth
          </label>
          <select
            id="depth"
            value={depth}
            onChange={(e) => setDepth(e.target.value)}
            className="w-full rounded-lg border border-hair bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
          >
            {DEPTHS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="format" className="block text-sm font-medium text-ink mb-1">
            Output Format
          </label>
          <select
            id="format"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
            className="w-full rounded-lg border border-hair bg-white px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
          >
            {FORMATS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="focus" className="block text-sm font-medium text-ink mb-1">
            Focus Areas <span className="text-faint font-normal">(optional)</span>
          </label>
          <input
            id="focus"
            type="text"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            placeholder="e.g. payment terms, termination clauses, liabilities"
            className="w-full rounded-lg border border-hair bg-white px-3 py-2 text-sm text-ink placeholder-faint focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
          />
        </div>
      </div>

      <button
        onClick={() => onAnalyze({ depth, format, focus })}
        disabled={!fileLoaded || processing}
        className="mt-4 w-full sm:w-auto rounded-lg bg-navy hover:bg-navy-dark text-white font-medium px-6 py-2.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {processing ? 'Analyzing…' : 'Analyze Document'}
      </button>
      {!fileLoaded && (
        <p className="mt-2 text-xs text-faint">Upload a document to enable analysis.</p>
      )}
    </div>
  )
}
