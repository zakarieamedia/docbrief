import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { COST_PER_CALL } from '../lib/claude'

// One call per chunk, plus a consolidation call for multi-chunk runs.
// Rows saved before chunks_processed existed count as one call.
function estimateRowCost(chunksProcessed) {
  const chunks = chunksProcessed || 1
  const calls = chunks > 1 ? chunks + 1 : 1
  return calls * COST_PER_CALL
}

function displayUser(row) {
  return row.user_email || `${row.user_id.slice(0, 8)}…`
}

function StatCard({ label, value }) {
  return (
    <div className="bg-surface rounded-xl border border-hair shadow-sm px-4 py-3">
      <p className="text-[11px] font-semibold text-faint uppercase tracking-[0.15em]">{label}</p>
      <p className="mt-1 text-lg font-semibold text-navy truncate">{value}</p>
    </div>
  )
}

function TableCard({ title, columns, children, empty }) {
  return (
    <section>
      <h2 className="font-serif text-lg font-bold text-navy border-b border-hair pb-1.5 mb-3">
        {title}
      </h2>
      {children ? (
        <div className="overflow-x-auto rounded-md border border-hair bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-navy/[0.04] border-b border-hair">
                {columns.map((col) => (
                  <th
                    key={col}
                    className="text-left px-4 py-2 text-[11px] font-semibold text-faint uppercase tracking-wide whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-hair">{children}</tbody>
          </table>
        </div>
      ) : (
        <p className="px-4 py-3 text-sm text-faint italic rounded-md border border-hair bg-surface">
          {empty}
        </p>
      )}
    </section>
  )
}

export default function Admin() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const { data, error } = await supabase
        .from('summaries')
        .select('*')
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (error) setError(error.message)
      else setRows(data || [])
      setLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const stats = useMemo(() => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const daysSinceMonday = (now.getDay() + 6) % 7
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday)

    let month = 0
    let week = 0
    let cost = 0
    const users = new Map()
    for (const row of rows) {
      const created = new Date(row.created_at)
      if (created >= startOfMonth) month++
      if (created >= startOfWeek) week++
      // Prefer the recorded actual cost; estimate for rows saved before it existed.
      cost += row.actual_cost != null ? Number(row.actual_cost) : estimateRowCost(row.chunks_processed)

      const key = row.user_id
      const user = users.get(key) || { id: key, email: displayUser(row), count: 0, lastActive: created }
      user.count++
      if (created > user.lastActive) user.lastActive = created
      if (row.user_email) user.email = row.user_email
      users.set(key, user)
    }
    return {
      total: rows.length,
      month,
      week,
      cost,
      users: [...users.values()].sort((a, b) => b.lastActive - a.lastActive),
    }
  }, [rows])

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete the summary of "${row.file_name}"? This cannot be undone.`)) {
      return
    }
    setDeletingId(row.id)
    setError('')
    const { data, error } = await supabase
      .from('summaries')
      .delete()
      .eq('id', row.id)
      .select()
    if (error) {
      setError(error.message)
    } else if (!data?.length) {
      // RLS silently filters rows the policy doesn't allow deleting.
      setError(
        'Delete was blocked by row-level security. Apply the admin policies in supabase/schema.sql to the database.',
      )
    } else {
      setRows((prev) => prev.filter((r) => r.id !== row.id))
    }
    setDeletingId(null)
  }

  if (loading) {
    return (
      <main className="flex-1 flex items-center justify-center">
        <div className="h-8 w-8 border-2 border-navy border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
      <h1 className="font-serif text-2xl font-bold text-navy">Admin Dashboard</h1>

      {error && (
        <p className="text-sm text-risk-high-ink bg-risk-high/[0.08] border border-risk-high/25 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Summaries" value={stats.total.toLocaleString()} />
        <StatCard label="This Month" value={stats.month.toLocaleString()} />
        <StatCard label="This Week" value={stats.week.toLocaleString()} />
        <StatCard label="Est. API Cost (All Time)" value={`$${stats.cost.toFixed(2)}`} />
      </div>

      <TableCard
        title="Users"
        columns={['Email', 'Summaries', 'Last Active']}
        empty="No users yet."
      >
        {stats.users.length
          ? stats.users.map((user) => (
              <tr key={user.id}>
                <td className="px-4 py-2.5 text-ink">{user.email}</td>
                <td className="px-4 py-2.5 text-ink">{user.count}</td>
                <td className="px-4 py-2.5 text-ink whitespace-nowrap">
                  {user.lastActive.toLocaleDateString()}
                </td>
              </tr>
            ))
          : null}
      </TableCard>

      <TableCard
        title="Recent Summaries"
        columns={['User', 'File', 'Words', 'Chunks', 'Date', '']}
        empty="No summaries yet."
      >
        {rows.length
          ? rows.slice(0, 25).map((row) => (
              <tr key={row.id}>
                <td className="px-4 py-2.5 text-ink">{displayUser(row)}</td>
                <td className="px-4 py-2.5 text-ink max-w-[16rem] truncate">{row.file_name}</td>
                <td className="px-4 py-2.5 text-ink">
                  {row.word_count != null ? row.word_count.toLocaleString() : '—'}
                </td>
                <td className="px-4 py-2.5 text-ink">{row.chunks_processed ?? '—'}</td>
                <td className="px-4 py-2.5 text-ink whitespace-nowrap">
                  {new Date(row.created_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => handleDelete(row)}
                    disabled={deletingId === row.id}
                    className="text-xs font-medium text-risk-high hover:text-risk-high-ink hover:underline disabled:opacity-50"
                  >
                    {deletingId === row.id ? 'Deleting…' : 'Delete'}
                  </button>
                </td>
              </tr>
            ))
          : null}
      </TableCard>
    </main>
  )
}
