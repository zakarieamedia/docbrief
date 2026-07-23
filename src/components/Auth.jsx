import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { humanizeError } from '../lib/messages'

export default function Auth() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setNotice('')
    setLoading(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        // App listens to onAuthStateChange and switches to the main view.
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        if (data.session === null) {
          setNotice('Check your email to confirm your account, then log in.')
        }
      }
    } catch (err) {
      setError(humanizeError(err, 'auth'))
    } finally {
      setLoading(false)
    }
  }

  const handleForgotPassword = async () => {
    setError('')
    setNotice('')
    if (!email.trim()) {
      setError('Enter your email above first, then click "Forgot password?".')
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email)
      if (error) throw error
      setNotice('Check your email for a password reset link.')
    } catch (err) {
      setError(humanizeError(err, 'auth'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4">
      <div className="w-full max-w-md bg-surface rounded-xl shadow-lg border border-hair p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2">
            <div className="h-10 w-10 rounded-lg bg-navy flex items-center justify-center">
              <span className="text-white font-serif font-bold text-lg">D</span>
            </div>
            <h1 className="font-serif text-2xl font-bold text-navy tracking-tight">DocBrief</h1>
          </div>
          <p className="mt-2 text-sm text-faint">
            Professional document summarization
          </p>
        </div>

        <h2 className="font-serif text-lg font-bold text-ink mb-4">
          {mode === 'login' ? 'Log in to your account' : 'Create an account'}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-ink mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-hair bg-white px-3 py-2 text-sm text-ink placeholder-faint focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
              placeholder="you@firm.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-ink mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-hair bg-white px-3 py-2 text-sm text-ink placeholder-faint focus:outline-none focus:ring-2 focus:ring-navy/20 focus:border-navy"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-sm text-risk-high-ink bg-risk-high/[0.08] border border-risk-high/25 rounded-lg px-3 py-2">
              {error}
            </p>
          )}
          {notice && (
            <p className="text-sm text-navy bg-navy-pale border border-navy/20 rounded-lg px-3 py-2">
              {notice}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-navy hover:bg-navy-dark text-white font-medium py-2.5 text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Please wait…' : mode === 'login' ? 'Log In' : 'Sign Up'}
          </button>
        </form>

        {mode === 'login' && (
          <p className="mt-3 text-center text-sm">
            <button
              type="button"
              onClick={handleForgotPassword}
              disabled={loading}
              className="font-medium text-navy hover:underline disabled:opacity-50"
            >
              Forgot password?
            </button>
          </p>
        )}

        <p className="mt-6 text-center text-sm text-faint">
          {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setError('')
              setNotice('')
            }}
            className="font-medium text-navy hover:underline"
          >
            {mode === 'login' ? 'Sign up' : 'Log in'}
          </button>
        </p>
      </div>
    </div>
  )
}
