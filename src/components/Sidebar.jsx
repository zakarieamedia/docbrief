import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

// The persistent navy sidebar — the app's only navigation. Top to bottom:
// wordmark, "+ New Document", the open document's section tabs (only when a
// document is open — no dead tabs beforehand), History, and the profile
// block pinned at the bottom, which opens a small account menu.
export default function Sidebar({ session, isAdmin, docTitle, tabs, nav, onNavigate, onLogout }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()

  // Sidebar items always land on the main view, even from /admin.
  const go = (next) => {
    navigate('/')
    onNavigate(next)
  }

  const email = session.user.email || ''
  const initial = (email[0] || '?').toUpperCase()

  const itemClass = (active) =>
    `w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
      active
        ? 'bg-white/10 font-medium text-white'
        : 'text-white/65 hover:bg-white/5 hover:text-white'
    }`

  return (
    <aside className="flex w-64 shrink-0 flex-col bg-navy text-white">
      {/* Wordmark */}
      <div className="flex items-center gap-2 px-5 pb-4 pt-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-white/10">
          <span className="font-serif font-bold">D</span>
        </div>
        <span className="font-serif text-xl font-bold tracking-tight">DocBrief</span>
      </div>

      {/* New document */}
      <div className="px-3">
        <button
          onClick={() => go({ view: 'new' })}
          className={`w-full rounded-lg border border-white/20 px-3 py-2 text-left text-sm font-medium transition-colors ${
            nav.view === 'new' ? 'bg-white/10 text-white' : 'text-white/85 hover:bg-white/10'
          }`}
        >
          + New Document
        </button>
      </div>

      {/* Section tabs for the open document */}
      {tabs.length > 0 ? (
        <nav className="mt-6 min-h-0 flex-1 overflow-y-auto px-3">
          <p
            className="truncate px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45"
            title={docTitle}
          >
            {docTitle}
          </p>
          <ul className="mt-2 space-y-0.5">
            {tabs.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => go({ view: 'doc', tab: t.id })}
                  className={itemClass(nav.view === 'doc' && nav.tab === t.id)}
                >
                  {t.label}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      ) : (
        <div className="flex-1" />
      )}

      {/* History */}
      <div className="px-3 pb-2 pt-4">
        <button onClick={() => go({ view: 'history' })} className={itemClass(nav.view === 'history')}>
          History
        </button>
      </div>

      {/* Profile / account menu, pinned at the bottom */}
      <div className="relative border-t border-white/10 p-3">
        {menuOpen && (
          <>
            {/* Invisible backdrop: click anywhere outside to close */}
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute bottom-full left-3 right-3 z-20 mb-2 rounded-lg border border-hair bg-surface p-1.5 text-ink shadow-xl">
              <p className="px-3 pb-0.5 pt-2 text-xs text-faint">Signed in as</p>
              <p className="truncate px-3 pb-2 text-sm font-medium">{email}</p>
              <div className="my-1 border-t border-hair" />
              {isAdmin && (
                <Link
                  to="/admin"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-md px-3 py-2 text-sm hover:bg-black/[0.04]"
                >
                  Admin dashboard
                </Link>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false)
                  onLogout()
                }}
                className="w-full rounded-md px-3 py-2 text-left text-sm hover:bg-black/[0.04]"
              >
                Log out
              </button>
            </div>
          </>
        )}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 transition-colors hover:bg-white/5"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 font-serif font-bold">
            {initial}
          </span>
          <span className="min-w-0 flex-1 truncate text-left text-sm text-white/80">{email}</span>
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0 text-white/50"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="m8 15 4-4 4 4" />
          </svg>
        </button>
      </div>
    </aside>
  )
}
