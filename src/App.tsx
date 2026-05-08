import { useState, useEffect, useRef } from 'react'
import './index.css'
import type { ExecutionSettings } from './data/types'
import Home from './pages/Home'
import Motion from './pages/Motion'
import Creed from './pages/Creed'
import Deen from './pages/Deen'
import Essentials from './pages/Essentials'
import AuthGate, { useUser } from './components/AuthGate'
import { supabase } from './lib/supabaseClient'
import { generateExport, type ExportPeriod } from './lib/export'

type Tab = 'home' | 'motion' | 'creed' | 'deen' | 'essentials'

const INITIAL_SETTINGS: ExecutionSettings = {
  emailsPerDay:      25,
  callsPerDay:       5,
  productsPerDay:    10,
  deepWorkMinPerDay: 120,
  lastUpdated:       '2026-03-17',
}

const tabs: { id: Tab; label: string }[] = [
  { id: 'home',       label: 'Home'       },
  { id: 'motion',     label: 'Motion'     },
  { id: 'creed',      label: 'Creed'      },
  { id: 'deen',       label: 'Deen'       },
  { id: 'essentials', label: 'Essentials' },
]

const EXPORT_PERIODS: { id: ExportPeriod; label: string }[] = [
  { id: 'today',     label: 'Today'     },
  { id: 'yesterday', label: 'Yesterday' },
  { id: 'week',      label: 'Week'      },
  { id: 'month',     label: 'Month'     },
  { id: 'quarter',   label: 'Quarter'   },
  { id: 'year',      label: 'Year'      },
]

// ── Clipboard / share helper ──────────────────────────────────────────────────
// Root cause: after `await generateExport(...)`, the browser's user-gesture
// window expires on Apple platforms (iPhone, iPad iOS13+ with desktop UA, Mac
// web app). navigator.clipboard.writeText then throws PermissionDenied.
//
// Strategy:
//   1. PWA/standalone mode (any Apple platform) → navigator.share first.
//      This avoids the gesture-expiry problem entirely.
//   2. Regular browser → clipboard first, share as fallback.
//   3. execCommand as last resort.
//   AbortError (user dismissed share sheet) is treated as success — they saw it.

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

async function tryShare(text: string): Promise<boolean> {
  if (!navigator.share) return false
  try {
    await navigator.share({ title: 'FlowOS Report', text })
    return true
  } catch (err) {
    // AbortError = user cancelled — not a failure
    if (err instanceof Error && err.name === 'AbortError') return true
    return false
  }
}

async function tryClipboard(text: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return false
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

function tryExecCommand(text: string): boolean {
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0'
    document.body.appendChild(ta)
    ta.focus(); ta.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(ta)
    return ok
  } catch {
    return false
  }
}

async function deliverReport(text: string): Promise<'shared' | 'copied'> {
  // Standalone / PWA mode on any Apple platform: share first to avoid gesture expiry
  if (isStandalone()) {
    if (await tryShare(text)) return 'shared'
    // share not available or failed → fall through to clipboard
  }

  // Browser context: clipboard is fine (gesture is still alive here)
  if (await tryClipboard(text)) return 'copied'

  // Clipboard failed in browser → try share sheet as fallback
  if (await tryShare(text)) return 'shared'

  // Last resort
  if (tryExecCommand(text)) return 'copied'

  throw new Error('No delivery method succeeded')
}

// ── Toast type ────────────────────────────────────────────────────────────────
type Toast = { message: string; type: 'success' | 'error' }

// ── Inner app (needs useUser inside AuthGate context) ─────────────────────────
function AppInner() {
  const user = useUser()

  const [activeTab,    setActiveTab]    = useState<Tab>('home')
  const [execSettings, setExecSettings] = useState<ExecutionSettings>(INITIAL_SETTINGS)
  const [menuOpen,     setMenuOpen]     = useState(false)
  const [exportOpen,   setExportOpen]   = useState(false)
  const [exporting,    setExporting]    = useState<ExportPeriod | null>(null)
  const [toast,        setToast]        = useState<Toast | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const exportRef  = useRef<HTMLDivElement>(null)

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [])

  // Scroll to top on tab change
  useEffect(() => { window.scrollTo(0, 0) }, [activeTab])

  // iOS PWA: scroll to top when app foregrounds
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === 'visible') window.scrollTo(0, 0)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  // Close export dropdown on outside click
  useEffect(() => {
    function onOutside(e: MouseEvent) {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportOpen(false)
      }
    }
    if (exportOpen) document.addEventListener('mousedown', onOutside)
    return () => document.removeEventListener('mousedown', onOutside)
  }, [exportOpen])

  function navigate(tab: Tab) {
    setActiveTab(tab)
    setMenuOpen(false)
  }

  function showToast(message: string, type: Toast['type']) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ message, type })
    toastTimer.current = setTimeout(() => setToast(null), 2000)
  }

  async function handleExport(period: ExportPeriod) {
    if (!user) {
      showToast('Not signed in', 'error')
      return
    }

    setExporting(period)
    setExportOpen(false)
    setMenuOpen(false)

    try {
      // Generate report
      let report = await generateExport(user.id, period)

      // Guarantee non-empty
      if (!report || !report.trim()) {
        report = 'FLOWOS REPORT\nNo data recorded for this period.'
      }

      // Debug
      console.log('FlowOS Export:', report)

      // Deliver — share sheet on iOS, clipboard on desktop
      const method = await deliverReport(report)
      showToast(method === 'shared' ? 'Report shared ✓' : 'Copied to clipboard', 'success')
    } catch (err) {
      // AbortError = user dismissed share sheet — not a real failure
      if (err instanceof Error && err.name === 'AbortError') return
      console.error('[FlowOS Export] failed:', err)
      showToast('Export failed — see console', 'error')
    } finally {
      setExporting(null)
    }
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-200">

      {/* ── Floating toast ───────────────────────────────────────────────────── */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-[200] flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold shadow-2xl shadow-black/60 pointer-events-none select-none transition-all ${
            toast.type === 'success'
              ? 'bg-[#0f1a12] border-emerald-500/30 text-emerald-300'
              : 'bg-[#1a0f0f] border-red-500/30 text-red-300'
          }`}
        >
          <span>{toast.type === 'success' ? '✓' : '✕'}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* ── Global header ────────────────────────────────────────────────────── */}
      <header className="border-b border-white/5 px-4 py-3 max-w-5xl mx-auto flex items-center justify-between gap-4">
        <span className="text-white font-bold text-base tracking-tight shrink-0">FlowOS</span>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => navigate(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-white/10 text-white'
                  : 'text-white/40 hover:text-white/60 hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-white/55 font-mono">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>

          {/* Desktop export button + dropdown */}
          <div ref={exportRef} className="relative hidden md:block">
            <button
              onClick={() => setExportOpen(o => !o)}
              disabled={exporting !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 bg-white/5 text-white/55 hover:bg-white/8 hover:text-white/80 disabled:opacity-40 transition-all"
            >
              {exporting ? '…' : 'Export'}
            </button>

            {exportOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-40 bg-[#141420] border border-white/10 rounded-xl shadow-2xl shadow-black/60 overflow-hidden z-50">
                {EXPORT_PERIODS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleExport(p.id)}
                    disabled={exporting !== null}
                    className="w-full text-left px-4 py-2.5 text-sm font-medium text-white/70 hover:bg-white/6 hover:text-white transition-colors disabled:opacity-40"
                  >
                    {exporting === p.id ? '…' : p.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Hamburger — mobile only */}
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="md:hidden text-white/50 hover:text-white/80 transition-colors text-2xl leading-none px-1"
            aria-label="Open menu"
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        </div>
      </header>

      {/* ── Mobile drawer ────────────────────────────────────────────────────── */}
      {menuOpen && (
        <div
          className="md:hidden fixed inset-0 z-50 bg-black/70"
          onClick={() => setMenuOpen(false)}
        >
          <div
            className="absolute top-0 right-0 h-full w-64 bg-[#0f0f18] border-l border-white/8 flex flex-col pt-14 px-4"
            onClick={e => e.stopPropagation()}
          >
            {/* Export section */}
            <span className="text-[10px] text-white/50 uppercase tracking-widest font-semibold px-2 pb-2">
              Export Data
            </span>
            <div className="flex flex-col gap-0.5 mb-4">
              {EXPORT_PERIODS.map(p => (
                <button
                  key={p.id}
                  onClick={() => handleExport(p.id)}
                  disabled={exporting !== null}
                  className="w-full text-left px-4 py-3 rounded-xl text-sm font-semibold text-white/65 hover:text-white hover:bg-white/6 transition-colors disabled:opacity-40"
                >
                  {exporting === p.id ? 'Generating…' : `Export ${p.label}`}
                </button>
              ))}
            </div>

            {/* Disconnect — pinned to bottom */}
            <div className="mt-auto pb-10 pt-4 border-t border-white/8">
              <button
                onClick={() => supabase.auth.signOut()}
                className="w-full text-left px-4 py-4 rounded-xl text-base font-semibold text-red-400/70 hover:text-red-400 hover:bg-red-500/8 transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Page content ─────────────────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-4 py-5 pb-28 md:pb-5">
        {activeTab === 'home'       && <Home />}
        {activeTab === 'motion'     && <Motion settings={execSettings} onSaveSettings={setExecSettings} />}
        {activeTab === 'creed'      && <Creed />}
        {activeTab === 'deen'       && <Deen />}
        {activeTab === 'essentials' && <Essentials />}
      </main>

      {/* ── Mobile floating bottom nav ───────────────────────────────────────── */}
      <nav className="md:hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-40">
        <div className="flex items-center gap-0.5 bg-[#141420]/95 backdrop-blur-2xl border border-white/10 rounded-2xl px-1.5 py-1.5 shadow-2xl shadow-black/70">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => navigate(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-[11px] font-bold transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white/12 text-white'
                  : 'text-white/55 hover:text-white/75'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <AuthGate>
      <AppInner />
    </AuthGate>
  )
}
