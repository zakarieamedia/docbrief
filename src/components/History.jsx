import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function History({ session, version, onSelect }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      const { data, error } = await supabase
        .from('summaries')
        .select('*')
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

  const handleDelete = async (e, id) => {
    e.stopPropagation()
    const { error } = await supabase.from('summaries').delete().eq('id', id)
    if (!error) setItems((prev) => prev.filter((item) => item.id !== id))
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <div className="px-5 py-4 border-b border-gray-100">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          History
        </h2>
      </div>

      <div className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
        {loading && (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 border-2 border-navy border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <p className="px-5 py-4 text-sm text-red-600">{error}</p>
        )}

        {!loading && !error && items.length === 0 && (
          <p className="px-5 py-8 text-sm text-gray-400 text-center">
            No saved summaries yet.
          </p>
        )}

        {items.map((item) => (
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
                <p className="text-sm font-medium text-gray-800 truncate">
                  {item.file_name}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {new Date(item.created_at).toLocaleDateString()} · {item.depth}
                </p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                  {item.summary_text?.slice(0, 80)}
                  {item.summary_text?.length > 80 ? '…' : ''}
                </p>
              </div>
              <button
                onClick={(e) => handleDelete(e, item.id)}
                title="Delete"
                className="shrink-0 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
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
        ))}
      </div>
    </div>
  )
}
