import { useEffect } from 'react'

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-800 text-right min-w-0 break-words">{value}</dd>
    </div>
  )
}

export default function ConfirmModal({ doc, estimate, onConfirm, onCancel }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-analysis-title"
        className="w-full max-w-md bg-white rounded-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-gray-100">
          <h2
            id="confirm-analysis-title"
            className="text-base font-semibold text-gray-800"
          >
            Confirm Analysis
          </h2>
        </div>

        <dl className="px-6 py-4 space-y-3 text-sm">
          <Row label="Document" value={doc.name} />
          <Row label="Word Count" value={doc.wordCount.toLocaleString()} />
          <Row label="Chunks" value={estimate.chunks} />
          <Row label="Estimated API Cost" value={`$${estimate.estimatedCost.toFixed(3)}`} />
        </dl>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium px-4 py-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-lg bg-navy hover:bg-navy-dark text-white text-sm font-medium px-4 py-2 transition-colors"
          >
            Proceed
          </button>
        </div>
      </div>
    </div>
  )
}
