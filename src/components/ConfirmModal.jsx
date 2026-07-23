import { useEffect } from 'react'

// A labeled row for modal bodies (used by the analysis-confirm dialog).
export function ModalRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-faint">{label}</dt>
      <dd className="font-medium text-ink text-right min-w-0 break-words">{value}</dd>
    </div>
  )
}

// The app's one modal dialog: a title, arbitrary body content, and a
// Cancel/confirm pair. `danger` styles the confirm button for destructive
// actions (the only red button in the app — deliberately).
export default function ConfirmModal({
  title,
  children,
  confirmLabel = 'Proceed',
  danger = false,
  onConfirm,
  onCancel,
}) {
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
        aria-labelledby="confirm-modal-title"
        className="w-full max-w-md bg-surface rounded-xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-hair">
          <h2 id="confirm-modal-title" className="font-serif text-base font-bold text-ink">
            {title}
          </h2>
        </div>

        <div className="px-6 py-4 text-sm">{children}</div>

        <div className="px-6 py-4 border-t border-hair flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-hair text-ink hover:bg-black/[0.03] text-sm font-medium px-4 py-2 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg text-white text-sm font-medium px-4 py-2 transition-colors ${
              danger ? 'bg-risk-high hover:bg-risk-high-ink' : 'bg-navy hover:bg-navy-dark'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
