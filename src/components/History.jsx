import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import ConfirmModal from './ConfirmModal'

// New summaries store structured JSON in summary_text; older rows store
// markdown/plain text. Show a human-readable preview for both.
function previewText(text) {
  if (!text) return ''
  if (text.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(text)
      return parsed.overview || parsed.documentTitle || ''
    } catch {
      // fall through to raw text
    }
  }
  return text
}

export default function History({ session, version, onSelect, onDelete }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  // Row awaiting delete confirmation in the modal; null = no modal.
  const [pendingDelete, setPendingDelete] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      // Scope to the signed-in user explicitly: the admin's RLS policies
      // would otherwise mix every user's rows into their personal sidebar.
      // Explicit columns, not select('*') — the list stays lean no matter
      // what heavier columns the table grows later.
      const { data, error } = await supabase
        .from('summaries')
        .select(
          'id, file_name, file_type, word_count, depth, format, focus, summary_text, chunks_processed, actual_cost, created_at, document_path',
        )
        .eq('user_id', session.user.id)
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (error) setError(error.message)
      else setItems(data || [])
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [session.user.id, version])

  // Runs after the user confirms in the modal.
  const performDelete = async (item) => {
    setError('')
    const { data, error } = await supabase
      .from('summaries')
      .delete()
      .eq('id', item.id)
      .select()
    if (error) {
      setError(error.message)
    } else if (!data?.length) {
      // RLS silently filters rows the policy doesn't allow deleting.
      setError('Delete was blocked by row-level security. Apply the policies in supabase/schema.sql to the database.')
    } else {
      // Best-effort cleanup of the stored document text — the row is already
      // gone, so a failure here only leaves an orphaned (private) file.
      if (item.document_path) {
        const { error: removeError } = await supabase.storage
          .from('documents')
          .remove([item.document_path])
        if (removeError) {
          console.warn('Could not remove stored document text:', removeError.message)
        }
      }
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      onDelete?.(item.id)
    }
  }

  return (
    <div className="bg-surface rounded-xl border border-hair shadow-sm">
      <div className="px-5 py-4 border-b border-hair">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-faint">
          History
        </h2>
      </div>

      <div className="divide-y divide-hair max-h-[70vh] overflow-y-auto">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 border-2 border-navy border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <p className="px-5 py-4 text-sm text-risk-high-ink">{error}</p>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="px-5 py-8 text-sm text-faint text-center">
            No saved summaries yet.
          </p>
        )}

        {!loading && !error && items.map((item) => {
          const preview = previewText(item.summary_text)
          return (
          <div
            key={item.id}
            onClick={() => onSelect(item)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSelect(item)
            }}
            className="px-5 py-3 hover:bg-navy-pale cursor-pointer transition-colors group"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink truncate">
                  {item.file_name}
                </p>
                <p className="text-xs text-faint mt-0.5">
                  {new Date(item.created_at).toLocaleDateString()} · {item.depth}
                </p>
                <p className="text-xs text-faint mt-1 line-clamp-2">
                  {preview.slice(0, 80)}
                  {preview.length > 80 ? '…' : ''}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setPendingDelete(item)
                }}
                title="Delete"
                className="shrink-0 p-1 text-faint/60 transition-colors hover:text-risk-high"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                  />
                </svg>
              </button>
            </div>
          </div>
          )
        })}
      </div>

      {pendingDelete && (
        <ConfirmModal
          title="Delete this summary?"
          confirmLabel="Delete"
          danger
          onConfirm={() => {
            const item = pendingDelete
            setPendingDelete(null)
            performDelete(item)
          }}
          onCancel={() => setPendingDelete(null)}
        >
          <p className="min-w-0 break-words font-medium text-ink">{pendingDelete.file_name}</p>
          <p className="mt-2 text-faint">
            This permanently removes the summary and its stored document text. It cannot be
            undone.
          </p>
        </ConfirmModal>
      )}
    </div>
  )
}
