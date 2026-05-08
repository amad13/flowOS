import { useState, useEffect, createContext, useContext, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabaseClient'

// ─── User context — call useUser() anywhere inside AuthGate children ──────────
const UserCtx = createContext<User | null>(null)
export function useUser(): User | null { return useContext(UserCtx) }

// ─── Auth Gate ────────────────────────────────────────────────────────────────
export default function AuthGate({ children }: { children: ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [mode,    setMode]    = useState<'signin' | 'signup'>('signin')
  const [email,   setEmail]   = useState('')
  const [password, setPassword] = useState('')
  const [error,   setError]   = useState('')
  const [busy,    setBusy]    = useState(false)
  const [notice,  setNotice]  = useState('')

  // ── Restore existing session + subscribe to changes ──────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      if (session?.user) window.scrollTo(0, 0)
    })

    return () => subscription.unsubscribe()
  }, [])

  // ── Sign in ───────────────────────────────────────────────────────────────
  async function handleSignIn() {
    if (!email.trim() || !password) return
    setBusy(true); setError(''); setNotice('')
    const { error: err } = await supabase.auth.signInWithPassword({
      email:    email.trim(),
      password,
    })
    setBusy(false)
    if (err) setError(err.message)
    // onAuthStateChange sets user on success
  }

  // ── Sign up ───────────────────────────────────────────────────────────────
  async function handleSignUp() {
    if (!email.trim() || !password) return
    setBusy(true); setError(''); setNotice('')
    const { error: err } = await supabase.auth.signUp({
      email:    email.trim(),
      password,
    })
    setBusy(false)
    if (err) { setError(err.message); return }
    setNotice('Account created. Check your email to confirm, then sign in.')
    setMode('signin')
  }

  function handleSubmit() {
    mode === 'signin' ? handleSignIn() : handleSignUp()
  }

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center">
        <span className="text-white/45 text-xs font-mono tracking-widest">LOADING</span>
      </div>
    )
  }

  // ── Login / signup form ───────────────────────────────────────────────────
  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center px-4">
        <div className="w-full max-w-sm flex flex-col gap-5">

          {/* Wordmark */}
          <div className="flex flex-col gap-0.5 mb-2">
            <span className="text-white font-bold text-base tracking-tight">FlowOS</span>
            <span className="text-white/50 text-xs">
              {mode === 'signin' ? 'Sign in to continue' : 'Create your account'}
            </span>
          </div>

          {/* Fields */}
          <div className="flex flex-col gap-3">
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="your@email.com"
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20 transition-colors"
            />
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="Password"
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20 transition-colors"
            />
          </div>

          {/* Primary action */}
          <button
            onClick={handleSubmit}
            disabled={busy || !email.trim() || !password}
            className="px-4 py-2.5 bg-white/10 hover:bg-white/15 disabled:opacity-40 border border-white/10 rounded-lg text-white text-sm font-semibold transition-colors"
          >
            {busy
              ? (mode === 'signin' ? 'Signing in…' : 'Creating account…')
              : (mode === 'signin' ? 'Sign in' : 'Create account')}
          </button>

          {/* Toggle mode */}
          <button
            onClick={() => { setMode(m => m === 'signin' ? 'signup' : 'signin'); setError(''); setNotice('') }}
            className="text-white/50 text-xs hover:text-white/45 transition-colors text-left"
          >
            {mode === 'signin' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
          </button>

          {/* Error */}
          {error && (
            <p className="text-red-400/60 text-xs border border-red-500/10 bg-red-500/5 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {/* Notice */}
          {notice && (
            <p className="text-emerald-400/60 text-xs border border-emerald-500/10 bg-emerald-500/5 rounded-lg px-3 py-2">
              {notice}
            </p>
          )}
        </div>
      </div>
    )
  }

  // ── Authenticated: render app ─────────────────────────────────────────────
  return <UserCtx.Provider value={user}>{children}</UserCtx.Provider>
}
