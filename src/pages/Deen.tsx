import { useState, useMemo, useEffect } from 'react'
import { stageRequirements } from '../data/mockState'
import { supabase } from '../lib/supabaseClient'
import { useUser } from '../components/AuthGate'
import FlowPageHeader from '../components/FlowPageHeader'
import FlowTabs from '../components/FlowTabs'
import StageReqBar from '../components/StageReqBar'

// ─── Constants ────────────────────────────────────────────────────────────────
const SALAH_NAMES    = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'] as const
const SALAH_TARGET   = 5
const READING_TARGET = 20 * 60   // seconds

// ─── Deen Stage System ────────────────────────────────────────────────────────
type DeenMetricId = 'salah_on_time' | 'arabic_reading' | 'weekly_modules'
                  | 'hifz_progress' | 'tadabbur' | 'sadaqah_system' | 'tahajjud'
type MetricStatus  = 'required' | 'focus' | 'maintained' | 'tracked'

type DeenStageDef = {
  id:                number
  name:              string
  salahStreakTarget: number   // days of consecutive full salah required to complete stage
  metrics:           Record<DeenMetricId, MetricStatus>
}

// Metrics with real data today — planned ones are capped at 'tracked' regardless of stage config
const IMPLEMENTED_METRICS: ReadonlySet<DeenMetricId> = new Set<DeenMetricId>([
  'salah_on_time', 'arabic_reading', 'weekly_modules',
])

const DEEN_STAGES: DeenStageDef[] = [
  {
    id: 1, name: 'Self-Control', salahStreakTarget: 30,
    metrics: {
      salah_on_time:  'required',
      arabic_reading: 'required',
      weekly_modules: 'tracked',
      hifz_progress:  'tracked',    // planned
      tadabbur:       'tracked',    // planned
      sadaqah_system: 'tracked',    // planned
      tahajjud:       'tracked',    // planned
    },
  },
  {
    id: 2, name: 'Stability', salahStreakTarget: 60,
    metrics: {
      salah_on_time:  'required',
      arabic_reading: 'required',
      weekly_modules: 'maintained',
      hifz_progress:  'tracked',
      tadabbur:       'tracked',
      sadaqah_system: 'tracked',
      tahajjud:       'tracked',
    },
  },
  {
    id: 3, name: 'Depth', salahStreakTarget: 90,
    metrics: {
      salah_on_time:  'required',
      arabic_reading: 'maintained',
      weekly_modules: 'maintained',
      hifz_progress:  'focus',     // planned — resolved to 'tracked' until implemented
      tadabbur:       'tracked',
      sadaqah_system: 'tracked',
      tahajjud:       'tracked',
    },
  },
  {
    id: 4, name: 'Connection', salahStreakTarget: 120,
    metrics: {
      salah_on_time:  'required',
      arabic_reading: 'maintained',
      weekly_modules: 'maintained',
      hifz_progress:  'focus',     // planned
      tadabbur:       'focus',     // planned
      sadaqah_system: 'tracked',
      tahajjud:       'tracked',
    },
  },
  {
    id: 5, name: 'Expansion', salahStreakTarget: 180,
    metrics: {
      salah_on_time:  'required',
      arabic_reading: 'maintained',
      weekly_modules: 'maintained',
      hifz_progress:  'focus',     // planned
      tadabbur:       'focus',     // planned
      sadaqah_system: 'focus',     // planned
      tahajjud:       'tracked',   // planned
    },
  },
]

const METRIC_LABELS: Record<DeenMetricId, string> = {
  salah_on_time:  'Salah on Time',
  arabic_reading: 'Arabic Reading',
  weekly_modules: 'Weekly Modules',
  hifz_progress:  'Hifz Progress',
  tadabbur:       'Tadabbur',
  sadaqah_system: 'Sadaqah',
  tahajjud:       'Tahajjud',
}

const METRIC_STATUS_CFG: Record<MetricStatus, { label: string; dot: string; text: string; bg: string; border: string }> = {
  required:   { label: 'Required',   dot: 'bg-red-400',     text: 'text-red-400/80',     bg: 'bg-red-500/6',      border: 'border-red-500/15'     },
  focus:      { label: 'Focus',      dot: 'bg-blue-400',    text: 'text-blue-400/80',    bg: 'bg-blue-500/6',     border: 'border-blue-500/15'    },
  maintained: { label: 'Maintained', dot: 'bg-emerald-400', text: 'text-emerald-400/80', bg: 'bg-emerald-500/5',  border: 'border-emerald-500/12' },
  tracked:    { label: 'Tracked',    dot: 'bg-white/20',    text: 'text-white/35',       bg: 'bg-white/3',        border: 'border-white/6'        },
}

const TABS = [
  { id: 'overview',  label: 'Overview'  },
  { id: 'reading',   label: 'Reading'   },
  { id: 'pipeline',  label: 'Pipeline'  },
  { id: 'weekly',    label: 'Weekly'    },
  { id: 'salah',     label: 'Salah'     },
  { id: 'feedback',  label: 'Feedback'  },
]

// ─── Types ────────────────────────────────────────────────────────────────────
type QuranStage = 'faible' | 'moyenne' | 'stable'
type QuranSurah = { id: string; name: string; stage: QuranStage }
type ReadingLog = { date: string; done: boolean; minutes: number }
type SeerahLog  = { weekId: string; done: boolean; insight: string }
type AsmaLog    = { weekId: string; name: string; reflection: string; dua: string }
type TafsirLog  = { weekId: string; sourate: string; reflection: string }
type DayQuality  = 'green' | 'yellow' | 'red'
type SalahRecord  = { date: string; prayers: boolean[] }

// ─── localStorage ─────────────────────────────────────────────────────────────
const LS_SALAH    = 'deen_salah'
const LS_READING  = 'deen_reading'
const LS_PIPELINE = 'deen_pipeline'
const LS_SEERAH   = 'deen_seerah'
const LS_ASMA     = 'deen_asma'
const LS_TAFSIR   = 'deen_tafsir'

function lsGet<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback }
}
function lsSet(key: string, val: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function deenToday(): string { return new Date().toISOString().slice(0, 10) }
function weekMondayKey(): string {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().slice(0, 10)
}
function fmtSec(s: number): string {
  const m = Math.floor(s / 60); const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
function uid(): string { return Math.random().toString(36).slice(2) }
function deenWeekSunday(): string {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().slice(0, 10)
}
function mondayOf(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().slice(0, 10)
}
function addDaysStr(iso: string, n: number): string {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}
function prevYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`
}
function nextYMStr(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}
function ymMonthEnd(ym: string): string {
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m, 0).toISOString().slice(0, 10)
}

const FB_CATS = [
  { id: 'reading'    as const, label: 'Reading' },
  { id: 'salah'      as const, label: 'Salah'   },
  { id: 'connection' as const, label: 'Connect' },
]
const Q_DOT: Record<DayQuality, string> = {
  green:  'bg-emerald-500',
  yellow: 'bg-amber-400',
  red:    'bg-red-500',
}

const STAGE_ORDER: QuranStage[] = ['faible', 'moyenne', 'stable']
const STAGE_META: Record<QuranStage, { label: string; color: string; bar: string; badge: string }> = {
  faible:  { label: 'Faible',  color: 'text-red-400/80',     bar: 'bg-red-500/40',     badge: 'border-red-500/20 bg-red-500/6'     },
  moyenne: { label: 'Moyenne', color: 'text-amber-400/80',   bar: 'bg-amber-500/40',   badge: 'border-amber-500/20 bg-amber-500/6'   },
  stable:  { label: 'Stable',  color: 'text-emerald-400/80', bar: 'bg-emerald-500/40', badge: 'border-emerald-500/20 bg-emerald-500/6' },
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Deen() {
  const req    = stageRequirements.find(r => r.flow === 'deen')!
  const today  = deenToday()
  const weekId = weekMondayKey()
  const dow    = new Date().getDay()   // 0=Sun … 6=Sat
  const isSat  = dow === 6
  const isSun  = dow === 0
  const user   = useUser()

  const [activeTab, setActiveTab] = useState('overview')

  // ── Salah ───────────────────────────────────────────────────────────────────
  const EMPTY_PRAYERS: boolean[] = [false, false, false, false, false]

  const [salahHistory, setSalahHistory] = useState<SalahRecord[]>(() => {
    const raw = lsGet<unknown>(LS_SALAH, null)
    if (!raw) return []
    if (Array.isArray(raw)) {
      return (raw as Record<string, unknown>[]).map(r => ({
        date: (r.date as string) ?? '',
        // Migrate legacy { count } records → prayers boolean array
        prayers: Array.isArray(r.prayers)
          ? (r.prayers as boolean[])
          : Array.from({ length: 5 }, (_, i) => i < ((r.count as number) ?? 0)),
      }))
    }
    // Migrate legacy single-object format
    const leg = raw as { date?: string; count?: number }
    return leg?.date
      ? [{ date: leg.date, prayers: Array.from({ length: 5 }, (_, i) => i < (leg.count ?? 0)) }]
      : []
  })

  const [salahOffset, setSalahOffset] = useState(0)        // 0 = today, -1 = yesterday …
  const [calendarYM,  setCalendarYM]  = useState(today.slice(0, 7))  // 'YYYY-MM'

  const selectedSalahDate    = addDaysStr(today, salahOffset)
  const selectedSalahPrayers = salahHistory.find(r => r.date === selectedSalahDate)?.prayers ?? EMPTY_PRAYERS
  const selectedSalahDone    = selectedSalahPrayers.filter(Boolean).length
  const selectedSalahComplete = selectedSalahDone >= SALAH_TARGET
  const nextSelectedSalah    = SALAH_NAMES.find((_, i) => !selectedSalahPrayers[i]) ?? null

  // Keep today-based aliases for the rest of the component (overview, streak, etc.)
  const todaySalahPrayers = salahHistory.find(r => r.date === today)?.prayers ?? EMPTY_PRAYERS
  const salahDone         = todaySalahPrayers.filter(Boolean).length
  const salahComplete     = salahDone >= SALAH_TARGET


  function toggleSalahPrayer(index: number, date: string = today) {
    const current  = salahHistory.find(r => r.date === date)
    const prayers  = current ? [...current.prayers] : [...EMPTY_PRAYERS]
    prayers[index] = !prayers[index]
    const count    = prayers.filter(Boolean).length
    setSalahHistory(prev => {
      const updated = [...prev.filter(r => r.date !== date), { date, prayers }]
      lsSet(LS_SALAH, updated)
      return updated
    })
    upsertSalah(count, date)
  }

  // ── Reading ─────────────────────────────────────────────────────────────────
  const [readingLog, setReadingLog] = useState<ReadingLog[]>(() => lsGet(LS_READING, []))
  const [manualMinInput, setManualMinInput] = useState('')
  const [timerSec,   setTimerSec]   = useState(0)
  const [timerOn,    setTimerOn]    = useState(false)
  const todayReading = readingLog.find(r => r.date === today) ?? null
  const readingDone  = todayReading?.done ?? false

  useEffect(() => {
    if (!timerOn) return
    const id = setInterval(() => setTimerSec(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [timerOn])

  useEffect(() => {
    if (!timerOn || timerSec < READING_TARGET) return
    setTimerOn(false)
    const d = deenToday()
    const entry: ReadingLog = { date: d, done: true, minutes: 20 }
    setReadingLog(prev => {
      const updated = [...prev.filter(r => r.date !== d), entry]
      lsSet(LS_READING, updated)
      return updated
    })
    if (user) {
      supabase
        .from('reading_logs')
        .upsert({ user_id: user.id, log_date: d, done: true, minutes: 20 }, { onConflict: 'user_id,log_date' })
        .then(({ error }) => { if (error) console.error('[deen] upsert reading_logs:', error) })
    }
  }, [timerOn, timerSec]) // eslint-disable-line react-hooks/exhaustive-deps

  function markReadingManual() {
    setTimerOn(false)
    const mins = timerSec > 0 ? Math.round(timerSec / 60) : 20
    const entry: ReadingLog = { date: today, done: true, minutes: Math.max(1, mins) }
    const updated = [...readingLog.filter(r => r.date !== today), entry]
    setReadingLog(updated)
    lsSet(LS_READING, updated)
    upsertReading(entry)
  }

  // ── Pipeline ────────────────────────────────────────────────────────────────
  const [pipeline,     setPipeline]     = useState<QuranSurah[]>(() => lsGet(LS_PIPELINE, []))
  const [newSurahName, setNewSurahName] = useState('')
  const [dragId,       setDragId]       = useState<string | null>(null)
  const [dragOver,     setDragOver]     = useState<QuranStage | null>(null)

  function addSurah() {
    if (!newSurahName.trim()) return
    const updated = [...pipeline, { id: uid(), name: newSurahName.trim(), stage: 'faible' as QuranStage }]
    setPipeline(updated); lsSet(LS_PIPELINE, updated); setNewSurahName('')
  }

  function moveSurah(id: string, dir: -1 | 1) {
    const updated = pipeline.map(s => {
      if (s.id !== id) return s
      const i = STAGE_ORDER.indexOf(s.stage)
      return { ...s, stage: STAGE_ORDER[Math.max(0, Math.min(2, i + dir))] }
    })
    setPipeline(updated); lsSet(LS_PIPELINE, updated)
  }

  function dropSurah(stage: QuranStage) {
    if (!dragId) return
    const updated = pipeline.map(s => s.id === dragId ? { ...s, stage } : s)
    setPipeline(updated); lsSet(LS_PIPELINE, updated)
    setDragId(null); setDragOver(null)
  }

  function removeSurah(id: string) {
    const updated = pipeline.filter(s => s.id !== id)
    setPipeline(updated); lsSet(LS_PIPELINE, updated)
  }

  // ── Seerah ──────────────────────────────────────────────────────────────────
  const [seerahLog,     setSeerahLog]     = useState<SeerahLog[]>(() => lsGet(LS_SEERAH, []))
  const [seerahInsight, setSeerahInsight] = useState('')
  const thisSeerah = seerahLog.find(s => s.weekId === weekId) ?? null
  const seerahDone = thisSeerah?.done ?? false

  function saveSeerah() {
    const entry: SeerahLog = { weekId, done: true, insight: seerahInsight.trim() }
    const updated = [...seerahLog.filter(s => s.weekId !== weekId), entry]
    setSeerahLog(updated); lsSet(LS_SEERAH, updated)
    if (user) {
      supabase
        .from('seerah_logs')
        .upsert({ user_id: user.id, week_id: weekId, done: entry.done, insight: entry.insight }, { onConflict: 'user_id,week_id' })
        .then(({ error }) => { if (error) console.error('[deen] upsert seerah_logs:', error) })
    }
  }

  // ── Asma ─────────────────────────────────────────────────────────────────────
  const [asmaLog,        setAsmaLog]        = useState<AsmaLog[]>(() => lsGet(LS_ASMA, []))
  const [asmaName,       setAsmaName]       = useState('')
  const [asmaReflection, setAsmaReflection] = useState('')
  const [asmaDua,        setAsmaDua]        = useState('')
  const thisAsma = asmaLog.find(a => a.weekId === weekId) ?? null
  const asmaDone = thisAsma !== null && thisAsma.name.trim() !== ''

  function saveAsma() {
    if (!asmaName.trim()) return
    const entry: AsmaLog = { weekId, name: asmaName.trim(), reflection: asmaReflection.trim(), dua: asmaDua.trim() }
    const updated = [...asmaLog.filter(a => a.weekId !== weekId), entry]
    setAsmaLog(updated); lsSet(LS_ASMA, updated)
    setAsmaName(''); setAsmaReflection(''); setAsmaDua('')
    if (user) {
      supabase
        .from('asma_logs')
        .upsert({ user_id: user.id, week_id: weekId, name: entry.name, reflection: entry.reflection, dua: entry.dua }, { onConflict: 'user_id,week_id' })
        .then(({ error }) => { if (error) console.error('[deen] upsert asma_logs:', error) })
    }
  }

  // ── Tafsir ───────────────────────────────────────────────────────────────────
  const [tafsirLog,        setTafsirLog]        = useState<TafsirLog[]>(() => lsGet(LS_TAFSIR, []))
  const [tafsirSourate,    setTafsirSourate]    = useState('')
  const [tafsirReflection, setTafsirReflection] = useState('')
  const thisTafsir = tafsirLog.find(t => t.weekId === weekId) ?? null
  const tafsirDone = thisTafsir !== null && thisTafsir.sourate.trim() !== ''

  function saveTafsir() {
    if (!tafsirSourate.trim()) return
    const entry: TafsirLog = { weekId, sourate: tafsirSourate.trim(), reflection: tafsirReflection.trim() }
    const updated = [...tafsirLog.filter(t => t.weekId !== weekId), entry]
    setTafsirLog(updated); lsSet(LS_TAFSIR, updated)
    setTafsirSourate(''); setTafsirReflection('')
    if (user) {
      supabase
        .from('tafsir_logs')
        .upsert({ user_id: user.id, week_id: weekId, sourate: entry.sourate, reflection: entry.reflection }, { onConflict: 'user_id,week_id' })
        .then(({ error }) => { if (error) console.error('[deen] upsert tafsir_logs:', error) })
    }
  }

  function undoSeerah() {
    const entry: SeerahLog = { weekId, done: false, insight: thisSeerah?.insight ?? '' }
    const updated = [...seerahLog.filter(s => s.weekId !== weekId), entry]
    setSeerahLog(updated); lsSet(LS_SEERAH, updated)
    if (user) {
      supabase
        .from('seerah_logs')
        .upsert({ user_id: user.id, week_id: weekId, done: false, insight: entry.insight }, { onConflict: 'user_id,week_id' })
        .then(({ error }) => { if (error) console.error('[deen] undo seerah_logs:', error) })
    }
  }

  function undoAsma() {
    const updated = asmaLog.filter(a => a.weekId !== weekId)
    setAsmaLog(updated); lsSet(LS_ASMA, updated)
    if (user) {
      supabase
        .from('asma_logs')
        .upsert({ user_id: user.id, week_id: weekId, name: '', reflection: '', dua: '' }, { onConflict: 'user_id,week_id' })
        .then(({ error }) => { if (error) console.error('[deen] undo asma_logs:', error) })
    }
  }

  function undoTafsir() {
    const updated = tafsirLog.filter(t => t.weekId !== weekId)
    setTafsirLog(updated); lsSet(LS_TAFSIR, updated)
    if (user) {
      supabase
        .from('tafsir_logs')
        .upsert({ user_id: user.id, week_id: weekId, sourate: '', reflection: '' }, { onConflict: 'user_id,week_id' })
        .then(({ error }) => { if (error) console.error('[deen] undo tafsir_logs:', error) })
    }
  }

  // ── Supabase helpers ─────────────────────────────────────────────────────────
  function upsertSalah(count: number, date: string = today) {
    if (!user) return
    supabase
      .from('salah_records')
      .upsert({ user_id: user.id, record_date: date, count }, { onConflict: 'user_id,record_date' })
      .then(({ error }) => { if (error) console.error('[deen] upsert salah_records:', error) })
  }

  function fetchSalahMonth(ym: string) {
    if (!user) return
    const start = `${ym}-01`
    const end   = ymMonthEnd(ym)
    supabase
      .from('salah_records')
      .select('record_date,count')
      .eq('user_id', user.id)
      .gte('record_date', start)
      .lte('record_date', end)
      .then(({ data, error }) => {
        if (error) { console.error('[deen] fetch salah month:', error); return }
        if (!data?.length) return
        setSalahHistory(prev => {
          let updated = [...prev]
          for (const row of data) {
            const existing = updated.find(r => r.date === row.record_date)
            if (existing) continue  // keep local (has per-prayer granularity)
            const prayers = Array.from({ length: 5 }, (_, i) => i < (row.count ?? 0)) as boolean[]
            updated = [...updated.filter(r => r.date !== row.record_date), { date: row.record_date, prayers }]
          }
          lsSet(LS_SALAH, updated)
          return updated
        })
      })
  }

  function upsertReading(entry: ReadingLog) {
    if (!user) return
    supabase
      .from('reading_logs')
      .upsert({ user_id: user.id, log_date: entry.date, done: entry.done, minutes: entry.minutes }, { onConflict: 'user_id,log_date' })
      .then(({ error }) => { if (error) console.error('[deen] upsert reading_logs:', error) })
  }

  // ── Fetch all Deen data from Supabase on mount ───────────────────────────────
  useEffect(() => {
    if (!user) return

    // Salah: fetch full current month (covers today + calendar overview)
    fetchSalahMonth(today.slice(0, 7))

    // Today's reading log
    supabase
      .from('reading_logs')
      .select('log_date,done,minutes')
      .eq('user_id', user.id)
      .eq('log_date', today)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error('[deen] fetch reading_logs:', error); return }
        if (!data) return
        const entry: ReadingLog = { date: data.log_date, done: data.done ?? false, minutes: data.minutes ?? 0 }
        setReadingLog(prev => {
          const updated = [...prev.filter(r => r.date !== today), entry]
          lsSet(LS_READING, updated); return updated
        })
      })

    // This week's seerah
    supabase
      .from('seerah_logs')
      .select('week_id,done,insight')
      .eq('user_id', user.id)
      .eq('week_id', weekId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error('[deen] fetch seerah_logs:', error); return }
        if (!data) return
        setSeerahLog(prev => {
          const entry: SeerahLog = { weekId: data.week_id, done: data.done ?? false, insight: data.insight ?? '' }
          const updated = [...prev.filter(s => s.weekId !== weekId), entry]
          lsSet(LS_SEERAH, updated); return updated
        })
      })

    // This week's asma
    supabase
      .from('asma_logs')
      .select('week_id,name,reflection,dua')
      .eq('user_id', user.id)
      .eq('week_id', weekId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error('[deen] fetch asma_logs:', error); return }
        if (!data) return
        setAsmaLog(prev => {
          const entry: AsmaLog = { weekId: data.week_id, name: data.name ?? '', reflection: data.reflection ?? '', dua: data.dua ?? '' }
          const updated = [...prev.filter(a => a.weekId !== weekId), entry]
          lsSet(LS_ASMA, updated); return updated
        })
      })

    // This week's tafsir
    supabase
      .from('tafsir_logs')
      .select('week_id,sourate,reflection')
      .eq('user_id', user.id)
      .eq('week_id', weekId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error('[deen] fetch tafsir_logs:', error); return }
        if (!data) return
        setTafsirLog(prev => {
          const entry: TafsirLog = { weekId: data.week_id, sourate: data.sourate ?? '', reflection: data.reflection ?? '' }
          const updated = [...prev.filter(t => t.weekId !== weekId), entry]
          lsSet(LS_TAFSIR, updated); return updated
        })
      })

  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch salah data when calendar month changes
  useEffect(() => {
    if (!user) return
    fetchSalahMonth(calendarYM)
  }, [calendarYM, user]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived: today's tasks + weekly status ───────────────────────────────────
  const todayTasks = useMemo(() => {
    const tasks: { id: string; label: string; done: boolean; when: string }[] = [
      { id: 'reading', label: 'Arabic Reading', done: readingDone, when: 'Daily' },
    ]
    if (isSat) {
      tasks.push({ id: 'seerah', label: 'Seerah',       done: seerahDone, when: 'Saturday' })
      tasks.push({ id: 'asma',   label: 'Asma ul-Husna', done: asmaDone,  when: 'Saturday' })
    }
    if (isSun) {
      tasks.push({ id: 'tafsir', label: 'Tafsir',       done: tafsirDone, when: 'Sunday' })
    }
    return tasks
  }, [readingDone, seerahDone, asmaDone, tafsirDone, isSat, isSun])

  const weeklyModules = useMemo(() => [
    { id: 'reading', label: 'Reading',        done: readingDone, freq: 'Daily'    },
    { id: 'seerah',  label: 'Seerah',         done: seerahDone,  freq: 'Saturday' },
    { id: 'asma',    label: 'Asma ul-Husna',  done: asmaDone,    freq: 'Saturday' },
    { id: 'tafsir',  label: 'Tafsir',         done: tafsirDone,  freq: 'Sunday'   },
  ], [readingDone, seerahDone, asmaDone, tafsirDone])

  // ── Feedback Dashboard (auto-computed) ──────────────────────────────────────
  const fbWeekDays = useMemo(() => {
    const sun = deenWeekSunday()
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sun + 'T12:00:00')
      d.setDate(d.getDate() + i)
      const iso = d.toISOString().slice(0, 10)
      return {
        iso,
        label:    d.toLocaleDateString('en-GB', { weekday: 'short' }),
        num:      d.getDate(),
        isToday:  iso === today,
        isFuture: iso > today,
      }
    })
  }, [today])

  const fbDashboard = useMemo(() =>
    fbWeekDays.map(day => {
      const { iso, isFuture } = day

      // Reading: green if done, red if missed, null if future
      const reading: DayQuality | null = isFuture
        ? null
        : (readingLog.find(r => r.date === iso)?.done ? 'green' : 'red')

      // Salah: 5=green, 3–4=yellow, 0–2=red, null if future
      const count = (salahHistory.find(r => r.date === iso)?.prayers ?? []).filter(Boolean).length
      const salah: DayQuality | null = isFuture
        ? null
        : count >= 5 ? 'green' : count >= 3 ? 'yellow' : 'red'

      // Connection: Sat→Seerah+Asma, Sun→Tafsir, other days→null (N/A)
      let connection: DayQuality | null = null
      if (!isFuture) {
        const dayDow = new Date(iso + 'T12:00:00').getDay()
        const wid    = mondayOf(iso)
        if (dayDow === 6) {  // Saturday
          const sDone = seerahLog.find(e => e.weekId === wid)?.done === true
          const aDone = (asmaLog.find(e => e.weekId === wid)?.name ?? '').trim() !== ''
          connection = sDone && aDone ? 'green' : sDone || aDone ? 'yellow' : 'red'
        } else if (dayDow === 0) {  // Sunday
          const tDone = (tafsirLog.find(e => e.weekId === wid)?.sourate ?? '').trim() !== ''
          connection = tDone ? 'green' : 'red'
        }
      }

      return { ...day, reading, salah, connection }
    }),
    [fbWeekDays, readingLog, salahHistory, seerahLog, asmaLog, tafsirLog],
  )

  const fbWeekSummary = useMemo(() => {
    // Per-category stats + score (green=1, yellow=0.5, red=0)
    const catStats = FB_CATS.map(cat => {
      const applicable = fbDashboard.filter(d => d[cat.id] !== null)
      const total  = applicable.length
      const green  = applicable.filter(d => d[cat.id] === 'green').length
      const yellow = applicable.filter(d => d[cat.id] === 'yellow').length
      const red    = applicable.filter(d => d[cat.id] === 'red').length
      const score  = total === 0 ? null : Math.round(((green + yellow * 0.5) / total) * 100)
      return { ...cat, total, green, yellow, red, score }
    })

    // Overall compliance across all applicable cells
    const allVals = fbDashboard.flatMap(d =>
      FB_CATS.map(c => d[c.id]).filter((v): v is DayQuality => v !== null)
    )
    const totalCells  = allVals.length
    const greenCells  = allVals.filter(v => v === 'green').length
    const yellowCells = allVals.filter(v => v === 'yellow').length
    const overallPct  = totalCells === 0
      ? null
      : Math.round(((greenCells + yellowCells * 0.5) / totalCells) * 100)

    // Weakest category (lowest score, with data)
    const withData = catStats.filter(c => c.score !== null)
    const weakest  = withData.length === 0
      ? null
      : withData.reduce((a, b) => (a.score! <= b.score! ? a : b))

    // Missed / partial items (past days only, excluding today to avoid false negatives)
    const missed: string[] = []
    for (const day of fbDashboard) {
      if (day.isFuture || day.isToday) continue
      if (day.reading === 'red')
        missed.push(`Reading — ${day.label} ${day.num}`)
      if (day.salah === 'red') {
        const cnt = (salahHistory.find(r => r.date === day.iso)?.prayers ?? []).filter(Boolean).length
        missed.push(`Salah — ${day.label} ${day.num} (${cnt}/5)`)
      } else if (day.salah === 'yellow') {
        const cnt = (salahHistory.find(r => r.date === day.iso)?.prayers ?? []).filter(Boolean).length
        missed.push(`Salah partial — ${day.label} ${day.num} (${cnt}/5)`)
      }
      if (day.connection === 'red') {
        const dayDow = new Date(day.iso + 'T12:00:00').getDay()
        if (dayDow === 6) missed.push(`Seerah/Asma — ${day.label} ${day.num} (missed)`)
        else if (dayDow === 0) missed.push(`Tafsir — ${day.label} ${day.num} (missed)`)
      } else if (day.connection === 'yellow') {
        missed.push(`Connection partial — ${day.label} ${day.num}`)
      }
    }

    return { catStats, overallPct, weakest, missed }
  }, [fbDashboard, salahHistory])

  // ── Salah streak (consecutive days with all 5 salah) ──────────────────────
  // ── Calendar cells for monthly overview ──────────────────────────────────────
  const calendarCells = useMemo(() => {
    const [y, m] = calendarYM.split('-').map(Number)
    const firstDow    = new Date(y, m - 1, 1).getDay()   // 0=Sun
    const daysInMonth = new Date(y, m, 0).getDate()
    const cells: ({ d: number; iso: string; count: number } | null)[] = []
    for (let i = 0; i < firstDow; i++) cells.push(null)
    for (let dd = 1; dd <= daysInMonth; dd++) {
      const iso = `${calendarYM}-${String(dd).padStart(2, '0')}`
      const rec = salahHistory.find(r => r.date === iso)
      // count: actual logged value if exists; for past days with no record = 0; future = -1
      const count = rec ? rec.prayers.filter(Boolean).length : iso <= today ? 0 : -1
      cells.push({ d: dd, iso, count })
    }
    return cells
  }, [calendarYM, salahHistory, today])

  const salahStreak = useMemo(() => {
    let streak = 0
    const d = new Date()
    for (let i = 0; i < 365; i++) {
      const iso = d.toISOString().slice(0, 10)
      const rec = salahHistory.find(r => r.date === iso)
      if (!rec || rec.prayers.filter(Boolean).length < SALAH_TARGET) break
      streak++
      d.setDate(d.getDate() - 1)
    }
    return streak
  }, [salahHistory])

  // ── Current Deen stage (progression by salah streak only) ─────────────────
  const currentDeenStage = useMemo((): DeenStageDef => {
    const active = DEEN_STAGES.find(s => salahStreak < s.salahStreakTarget)
    return active ?? DEEN_STAGES[DEEN_STAGES.length - 1]
  }, [salahStreak])

  const nextDeenStage = useMemo((): DeenStageDef | null => {
    const idx = DEEN_STAGES.findIndex(s => s.id === currentDeenStage.id)
    return idx < DEEN_STAGES.length - 1 ? DEEN_STAGES[idx + 1] : null
  }, [currentDeenStage])

  // ── Persist computed stage to Supabase whenever it changes ────────────────
  useEffect(() => {
    if (!user) return
    supabase
      .from('deen_stage_state')
      .upsert({
        user_id:              user.id,
        current_stage:        currentDeenStage.id,
        stage_name:           currentDeenStage.name,
        salah_streak_target:  currentDeenStage.salahStreakTarget,
      }, { onConflict: 'user_id' })
      .then(({ error }) => { if (error) console.error('[deen] upsert deen_stage_state:', error) })
  }, [user, currentDeenStage]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Effective statuses — planned metrics capped at 'tracked' ──────────────
  const metricStatuses = useMemo((): Record<DeenMetricId, MetricStatus> => {
    const result = {} as Record<DeenMetricId, MetricStatus>
    for (const id of Object.keys(currentDeenStage.metrics) as DeenMetricId[]) {
      const configured = currentDeenStage.metrics[id]
      result[id] = IMPLEMENTED_METRICS.has(id) ? configured : 'tracked'
    }
    return result
  }, [currentDeenStage])

  // ── Stage-aware weakest area (required + focus implemented metrics only) ───
  const stageWeakestArea = useMemo(() => {
    const modDone  = weeklyModules.filter(m => m.done).length
    const modTotal = weeklyModules.length

    const scores: { id: DeenMetricId; label: string; score: number; status: MetricStatus }[] = [
      { id: 'salah_on_time',  label: METRIC_LABELS['salah_on_time'],  score: salahComplete ? 100 : Math.round((salahDone / SALAH_TARGET) * 100),             status: metricStatuses['salah_on_time']  },
      { id: 'arabic_reading', label: METRIC_LABELS['arabic_reading'], score: readingDone ? 100 : 0,                                                           status: metricStatuses['arabic_reading'] },
      { id: 'weekly_modules', label: METRIC_LABELS['weekly_modules'], score: modTotal > 0 ? Math.round((modDone / modTotal) * 100) : 0,                       status: metricStatuses['weekly_modules'] },
    ]

    const important = scores.filter(m => m.status === 'required' || m.status === 'focus')
    if (important.length === 0) return null
    return important.reduce((a, b) => a.score <= b.score ? a : b)
  }, [metricStatuses, salahComplete, salahDone, readingDone, weeklyModules])

  // ── Focus warnings ─────────────────────────────────────────────────────────
  const focusWarnings = useMemo((): string[] => {
    const w: string[] = []
    if (!salahComplete) {
      w.push(`Salah (required) — ${salahDone}/${SALAH_TARGET} prayed today`)
    }
    const rdgSt = metricStatuses['arabic_reading']
    if ((rdgSt === 'required' || rdgSt === 'focus') && !readingDone) {
      w.push(`Arabic Reading (${rdgSt}) — not done today`)
    }
    const modSt = metricStatuses['weekly_modules']
    if (modSt === 'maintained' || modSt === 'focus') {
      const pending = weeklyModules.filter(m => !m.done)
      if (pending.length > 0) {
        w.push(`Weekly Modules (${modSt}) — ${pending.length} pending this week`)
      }
    }
    return w
  }, [metricStatuses, salahComplete, salahDone, readingDone, weeklyModules])

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <FlowPageHeader title="Deen" subtitle="Spiritual discipline & daily practice" badge="minimum" />
      <FlowTabs tabs={TABS} active={activeTab} onChange={setActiveTab} accent="blue" />

      {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-4">

          {/* Stage card — fully dynamic */}
          {(() => {
            const stage     = currentDeenStage
            const next      = nextDeenStage
            const pct       = Math.min(100, Math.round((salahStreak / stage.salahStreakTarget) * 100))
            const remaining = Math.max(0, stage.salahStreakTarget - salahStreak)
            return (
              <div className="rounded-xl border border-blue-500/20 bg-white/5 p-5 flex flex-col gap-3.5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] text-white/55 uppercase tracking-widest font-semibold">
                      Stage {stage.id} · Deen
                    </span>
                    <p className="text-base font-black text-white leading-tight mt-0.5">{stage.name}</p>
                    {next
                      ? <p className="text-xs text-white/35 mt-0.5">Next: {next.name} at {next.salahStreakTarget} days</p>
                      : <p className="text-xs text-white/50 mt-0.5">Final stage</p>
                    }
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-blue-500/25 bg-blue-500/8 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                    <span className="text-[10px] font-bold text-blue-400">Active</span>
                  </div>
                </div>

                {/* Streak progress */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-baseline text-[10px] font-mono">
                    <span className="text-white/35">
                      {salahStreak} / {stage.salahStreakTarget} day streak
                    </span>
                    <span className={`font-semibold ${pct >= 100 ? 'text-emerald-400' : 'text-white/55'}`}>
                      {remaining > 0 ? `${remaining} days left` : '✓ complete'}
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${pct >= 100 ? 'bg-emerald-500/55' : 'bg-blue-500/45'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex justify-end">
                    <span className={`text-[10px] font-semibold font-mono ${pct >= 100 ? 'text-emerald-400' : 'text-white/50'}`}>
                      {pct}%
                    </span>
                  </div>
                </div>

                {/* Metric status grid */}
                <div className="flex flex-col gap-2 pt-1 border-t border-white/6">
                  <span className="text-[9px] text-white/45 uppercase tracking-widest font-semibold">
                    Metric status — Stage {stage.id}
                  </span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {/* Active metrics */}
                    {(['salah_on_time', 'arabic_reading', 'weekly_modules'] as const).map(id => {
                      const st  = metricStatuses[id]
                      const cfg = METRIC_STATUS_CFG[st]
                      return (
                        <div key={id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${cfg.bg} ${cfg.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                          <div className="flex flex-col leading-none gap-0.5 min-w-0">
                            <span className={`text-[10px] font-semibold truncate ${cfg.text}`}>{METRIC_LABELS[id]}</span>
                            <span className="text-[8px] text-white/45 uppercase tracking-wide">{cfg.label}</span>
                          </div>
                        </div>
                      )
                    })}
                    {/* Planned metrics — dimmed */}
                    {(['hifz_progress', 'tadabbur', 'sadaqah_system'] as const).map(id => (
                      <div key={id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/4 bg-white/2 opacity-35">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-white/10" />
                        <div className="flex flex-col leading-none gap-0.5 min-w-0">
                          <span className="text-[10px] font-semibold truncate text-white/50">{METRIC_LABELS[id]}</span>
                          <span className="text-[8px] text-white/40 uppercase tracking-wide">Planned</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Salah quick status */}
          <div className="rounded-lg border border-white/8 bg-white/3 px-3 py-2 flex items-center gap-3">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${salahComplete ? 'bg-blue-500/70' : 'bg-white/15'}`} />
            <span className="text-[10px] text-white/50 uppercase tracking-widest font-semibold shrink-0">Salah</span>
            <span className={`text-[11px] font-mono shrink-0 ${salahComplete ? 'text-blue-400/60' : 'text-white/55'}`}>
              {salahDone}/{SALAH_TARGET}
            </span>
            <div className="flex items-center gap-1 ml-auto shrink-0">
              {SALAH_NAMES.map((name, i) => (
                <button
                  key={name}
                  onClick={() => toggleSalahPrayer(i)}
                  title={name}
                  className={`w-6 h-6 rounded text-[9px] font-bold border transition-colors ${
                    todaySalahPrayers[i]
                      ? 'bg-blue-500/20 border-blue-500/40 text-blue-400'
                      : 'bg-white/3 border-white/10 text-white/50 hover:border-white/20 hover:text-white/45'
                  }`}
                >
                  {name[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Today's tasks */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-white/35 uppercase tracking-widest font-semibold">Today's Tasks</span>
              <span className="text-[10px] text-white/50 font-mono">{today}</span>
            </div>
            {todayTasks.map(t => (
              <div key={t.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                t.done ? 'border-emerald-500/20 bg-emerald-500/6' : 'border-white/8 bg-white/3'
              }`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${t.done ? 'bg-emerald-500' : 'bg-white/20'}`} />
                <span className={`text-sm flex-1 ${t.done ? 'text-emerald-400/80' : 'text-white/55'}`}>{t.label}</span>
                <span className="text-[9px] text-white/45 font-mono">{t.when}</span>
                <span className={`text-[10px] font-semibold ${t.done ? 'text-emerald-400/70' : 'text-white/50'}`}>
                  {t.done ? '✓' : '—'}
                </span>
              </div>
            ))}
            {!isSat && !isSun && (
              <p className="text-[10px] text-white/45 italic px-1 pt-0.5">
                Saturday adds Seerah + Asma · Sunday adds Tafsir
              </p>
            )}
          </div>

          {/* Weekly module status */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-2">
            <span className="text-[10px] text-white/35 uppercase tracking-widest font-semibold mb-1">This Week</span>
            <div className="grid grid-cols-2 gap-2">
              {weeklyModules.map(m => (
                <div key={m.id} className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${
                  m.done ? 'border-emerald-500/18 bg-emerald-500/5' : 'border-white/8 bg-white/3'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${m.done ? 'bg-emerald-500' : 'bg-white/15'}`} />
                  <div className="flex flex-col leading-none gap-0.5">
                    <span className={`text-xs font-semibold ${m.done ? 'text-emerald-400/80' : 'text-white/40'}`}>{m.label}</span>
                    <span className="text-[8px] text-white/45">{m.freq}</span>
                  </div>
                  <span className={`ml-auto text-[10px] ${m.done ? 'text-emerald-400/60' : 'text-white/45'}`}>
                    {m.done ? '✓' : '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <StageReqBar title={req.title} current={req.current} target={req.target} unit={req.unit} accent="blue" />
        </div>
      )}

      {/* ── READING ──────────────────────────────────────────────────────── */}
      {activeTab === 'reading' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Arabic Reading</span>
            <span className="text-[10px] text-white/50 font-mono">20 min · daily</span>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
            {/* Today status */}
            {readingDone && (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/6">
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                <span className="text-sm text-emerald-400/80 font-semibold">
                  ✓ Done today{todayReading?.minutes ? ` — ${todayReading.minutes} min` : ''}
                </span>
              </div>
            )}

            {/* Timer display */}
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="text-5xl font-black font-mono text-white/80 tabular-nums">
                {fmtSec(Math.min(timerSec, READING_TARGET))}
              </div>
              <div className="w-full h-1.5 bg-white/8 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${readingDone ? 'bg-emerald-500/60' : 'bg-blue-500/55'}`}
                  style={{ width: `${Math.min(100, Math.round((timerSec / READING_TARGET) * 100))}%` }}
                />
              </div>
              <span className="text-[10px] text-white/50 font-mono">
                {Math.min(100, Math.round((timerSec / READING_TARGET) * 100))}% · target 20:00
              </span>
            </div>

            {/* Timer controls */}
            <div className="flex gap-2">
              {!readingDone && (
                <button
                  onClick={() => setTimerOn(o => !o)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                    timerOn
                      ? 'border-amber-500/30 text-amber-400 bg-amber-500/10 hover:bg-amber-500/18'
                      : 'border-blue-500/30 text-blue-400 bg-blue-500/10 hover:bg-blue-500/18'
                  }`}
                >
                  {timerOn ? '⏸ Pause' : timerSec > 0 ? '▶ Resume' : '▶ Start'}
                </button>
              )}
              {timerSec > 0 && !readingDone && (
                <button
                  onClick={() => { setTimerSec(0); setTimerOn(false) }}
                  className="px-4 py-2.5 rounded-xl text-sm border border-white/10 text-white/55 hover:text-white/50 transition-colors"
                >
                  Reset
                </button>
              )}
              {!readingDone && (
                <button
                  onClick={markReadingManual}
                  className="px-4 py-2.5 rounded-xl text-sm border border-emerald-500/25 text-emerald-400/70 hover:bg-emerald-500/8 transition-colors"
                >
                  Mark done
                </button>
              )}
            </div>

            {/* Manual minutes entry */}
            {!readingDone && (
              <div className="flex gap-2 items-center pt-1 border-t border-white/5">
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={manualMinInput}
                  onChange={e => setManualMinInput(e.target.value)}
                  placeholder="min"
                  className="w-20 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/25 transition-colors tabular-nums"
                />
                <button
                  onClick={() => {
                    const mins = parseInt(manualMinInput, 10)
                    if (isNaN(mins) || mins <= 0) return
                    setTimerOn(false)
                    const entry: ReadingLog = { date: today, done: true, minutes: mins }
                    const updated = [...readingLog.filter(r => r.date !== today), entry]
                    setReadingLog(updated); lsSet(LS_READING, updated)
                    upsertReading(entry)
                    setManualMinInput('')
                  }}
                  disabled={!manualMinInput || parseInt(manualMinInput, 10) <= 0}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    manualMinInput && parseInt(manualMinInput, 10) > 0
                      ? 'border-blue-500/30 text-blue-400 bg-blue-500/10 hover:bg-blue-500/18'
                      : 'border-white/8 text-white/45 cursor-not-allowed'
                  }`}
                >
                  Log Minutes
                </button>
                <span className="text-[10px] text-white/45">skip timer</span>
              </div>
            )}

            {readingDone && (
              <button
                onClick={() => {
                  const reset: ReadingLog = { date: today, done: false, minutes: 0 }
                  const updated = [...readingLog.filter(r => r.date !== today), reset]
                  setReadingLog(updated); lsSet(LS_READING, updated)
                  setTimerSec(0); setTimerOn(false)
                  upsertReading(reset)
                }}
                className="self-start text-[10px] text-white/45 hover:text-white/40 transition-colors"
              >
                Reset today
              </button>
            )}
          </div>

          {/* Recent reading log */}
          {readingLog.length > 0 && (
            <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3 flex flex-col gap-0">
              <span className="text-[10px] text-white/50 uppercase tracking-widest font-semibold mb-2">Recent</span>
              {[...readingLog].reverse().slice(0, 7).map(r => (
                <div key={r.date} className="flex items-center gap-3 py-1.5 border-b border-white/4 last:border-0">
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${r.done ? 'bg-emerald-500/60' : 'bg-white/15'}`} />
                  <span className="text-[10px] font-mono text-white/35 flex-1">{r.date}</span>
                  <span className={`text-[10px] font-semibold ${r.done ? 'text-emerald-400/60' : 'text-white/45'}`}>
                    {r.done ? `✓ ${r.minutes} min` : '—'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── PIPELINE ─────────────────────────────────────────────────────── */}
      {activeTab === 'pipeline' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Quran Pipeline</span>
            <span className="text-[10px] text-white/50">{pipeline.length} sourate{pipeline.length !== 1 ? 's' : ''}</span>
          </div>

          {/* 3-column board */}
          <div className="grid grid-cols-3 gap-2">
            {STAGE_ORDER.map(stage => {
              const meta  = STAGE_META[stage]
              const cards = pipeline.filter(s => s.stage === stage)
              const isOver = dragOver === stage
              return (
                <div
                  key={stage}
                  onDragOver={e => { e.preventDefault(); setDragOver(stage) }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={() => dropSurah(stage)}
                  className={`rounded-xl border flex flex-col gap-2 p-2.5 min-h-[8rem] transition-colors ${
                    isOver ? 'border-blue-500/30 bg-blue-500/6' : 'border-white/8 bg-white/3'
                  }`}
                >
                  {/* Column header */}
                  <div className="flex items-center justify-between px-0.5">
                    <span className={`text-[9px] font-bold uppercase tracking-widest ${meta.color}`}>
                      {meta.label}
                    </span>
                    <span className="text-[9px] text-white/45 font-mono">{cards.length}</span>
                  </div>
                  {/* Cards */}
                  {cards.map(surah => {
                    const stageIdx = STAGE_ORDER.indexOf(surah.stage)
                    return (
                      <div
                        key={surah.id}
                        draggable
                        onDragStart={() => setDragId(surah.id)}
                        onDragEnd={() => { setDragId(null); setDragOver(null) }}
                        className={`rounded-lg border px-2.5 py-2 flex flex-col gap-1.5 cursor-grab active:cursor-grabbing select-none transition-opacity ${
                          dragId === surah.id ? 'opacity-40' : 'opacity-100'
                        } ${meta.badge}`}
                      >
                        <span className="text-[11px] font-semibold text-white/70 leading-tight">{surah.name}</span>
                        {/* Move arrows */}
                        <div className="flex gap-1">
                          <button
                            onClick={() => moveSurah(surah.id, -1)}
                            disabled={stageIdx === 0}
                            className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                              stageIdx === 0
                                ? 'border-white/5 text-white/35 cursor-not-allowed'
                                : 'border-white/15 text-white/55 hover:text-white/60 hover:border-white/25'
                            }`}
                          >←</button>
                          <button
                            onClick={() => moveSurah(surah.id, 1)}
                            disabled={stageIdx === 2}
                            className={`text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                              stageIdx === 2
                                ? 'border-white/5 text-white/35 cursor-not-allowed'
                                : 'border-white/15 text-white/55 hover:text-white/60 hover:border-white/25'
                            }`}
                          >→</button>
                          <button
                            onClick={() => removeSurah(surah.id)}
                            className="ml-auto text-[9px] px-1.5 py-0.5 rounded border border-white/5 text-white/40 hover:text-red-400/60 hover:border-red-500/20 transition-colors"
                          >✕</button>
                        </div>
                      </div>
                    )
                  })}
                  {cards.length === 0 && (
                    <p className="text-[9px] text-white/40 italic text-center pt-2">
                      {isOver ? 'Drop here' : 'Empty'}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          {/* Add surah */}
          <div className="flex gap-2">
            <input
              type="text"
              value={newSurahName}
              onChange={e => setNewSurahName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addSurah()}
              placeholder="Add a sourate name…"
              className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/30 transition-colors"
            />
            <button
              onClick={addSurah}
              disabled={!newSurahName.trim()}
              className={`px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors shrink-0 ${
                newSurahName.trim()
                  ? 'border-blue-500/30 text-blue-400 bg-blue-500/10 hover:bg-blue-500/18'
                  : 'border-white/8 text-white/45 cursor-not-allowed'
              }`}
            >
              Add
            </button>
          </div>
          <p className="text-[9px] text-white/42 -mt-2">Drag cards between columns or use ← → buttons to move</p>
        </div>
      )}

      {/* ── WEEKLY ───────────────────────────────────────────────────────── */}
      {activeTab === 'weekly' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Weekly Modules</span>
            <span className="text-[10px] text-white/50 font-mono">w/{weekId}</span>
          </div>

          {/* ─ Seerah (Saturday) */}
          <div className={`rounded-xl border bg-white/5 p-5 flex flex-col gap-3 ${
            seerahDone ? 'border-emerald-500/20' : isSat ? 'border-blue-500/20' : 'border-white/8'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Seerah</span>
                <span className="text-[9px] text-white/45 ml-2 font-mono">Saturday</span>
              </div>
              {seerahDone
                ? <span className="text-[10px] text-emerald-400/70 font-semibold border border-emerald-500/20 bg-emerald-500/8 px-2 py-0.5 rounded">✓ Done</span>
                : isSat
                  ? <span className="text-[10px] text-blue-400/60 font-semibold border border-blue-500/20 bg-blue-500/6 px-2 py-0.5 rounded">Pending · Due today</span>
                  : <span className="text-[10px] text-white/50 font-semibold border border-white/8 px-2 py-0.5 rounded">Pending</span>
              }
            </div>

            {/* Saved this week */}
            {thisSeerah && (
              <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-3 py-2.5 flex flex-col gap-1">
                <span className="text-[9px] text-emerald-400/60 uppercase tracking-widest">This week's insight</span>
                <p className="text-xs text-white/60 leading-relaxed">
                  {thisSeerah.insight || <span className="italic text-white/50">No insight recorded</span>}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <textarea
                value={seerahInsight}
                onChange={e => setSeerahInsight(e.target.value)}
                placeholder="1 insight from this week's Seerah reading…"
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/25 transition-colors resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={saveSeerah}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    isSat || seerahDone
                      ? 'border-blue-500/30 text-blue-400 bg-blue-500/10 hover:bg-blue-500/18'
                      : 'border-white/10 text-white/55 hover:bg-white/6'
                  }`}
                >
                  {seerahDone ? '↻ Update' : '+ Mark done'}
                </button>
                {seerahDone && (
                  <button
                    onClick={undoSeerah}
                    className="px-3 py-2 rounded-lg text-sm border border-white/8 text-white/50 hover:text-red-400/60 hover:border-red-500/20 transition-colors"
                  >
                    Undo
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ─ Asma ul-Husna (Saturday) */}
          <div className={`rounded-xl border bg-white/5 p-5 flex flex-col gap-3 ${
            asmaDone ? 'border-emerald-500/20' : isSat ? 'border-blue-500/20' : 'border-white/8'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Asma ul-Husna</span>
                <span className="text-[9px] text-white/45 ml-2 font-mono">Saturday</span>
              </div>
              {asmaDone
                ? <span className="text-[10px] text-emerald-400/70 font-semibold border border-emerald-500/20 bg-emerald-500/8 px-2 py-0.5 rounded">✓ Done</span>
                : isSat
                  ? <span className="text-[10px] text-blue-400/60 font-semibold border border-blue-500/20 bg-blue-500/6 px-2 py-0.5 rounded">Pending · Due today</span>
                  : <span className="text-[10px] text-white/50 font-semibold border border-white/8 px-2 py-0.5 rounded">Pending</span>
              }
            </div>

            {/* Saved this week */}
            {thisAsma && (
              <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-3 py-2.5 flex flex-col gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] text-emerald-400/60 uppercase tracking-widest">Name</span>
                  <p className="text-sm font-bold text-white/70">{thisAsma.name}</p>
                </div>
                {thisAsma.reflection && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-white/55 uppercase tracking-widest">Reflection</span>
                    <p className="text-xs text-white/50 leading-relaxed">{thisAsma.reflection}</p>
                  </div>
                )}
                {thisAsma.dua && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-white/55 uppercase tracking-widest">Du'a</span>
                    <p className="text-xs text-white/50 leading-relaxed italic">{thisAsma.dua}</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={asmaName}
                onChange={e => setAsmaName(e.target.value)}
                placeholder="Name of Allah (e.g. Al-Ghaffar)"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/25 transition-colors"
              />
              <textarea
                value={asmaReflection}
                onChange={e => setAsmaReflection(e.target.value)}
                placeholder="Reflection on this name…"
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/25 transition-colors resize-none"
              />
              <textarea
                value={asmaDua}
                onChange={e => setAsmaDua(e.target.value)}
                placeholder="Du'a using this name…"
                rows={2}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/25 transition-colors resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={saveAsma}
                  disabled={!asmaName.trim()}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    asmaName.trim()
                      ? 'border-blue-500/30 text-blue-400 bg-blue-500/10 hover:bg-blue-500/18'
                      : 'border-white/8 text-white/45 cursor-not-allowed'
                  }`}
                >
                  {asmaDone ? '↻ Update' : '+ Save'}
                </button>
                {asmaDone && (
                  <button
                    onClick={undoAsma}
                    className="px-3 py-2 rounded-lg text-sm border border-white/8 text-white/50 hover:text-red-400/60 hover:border-red-500/20 transition-colors"
                  >
                    Undo
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* ─ Tafsir (Sunday) */}
          <div className={`rounded-xl border bg-white/5 p-5 flex flex-col gap-3 ${
            tafsirDone ? 'border-emerald-500/20' : isSun ? 'border-blue-500/20' : 'border-white/8'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Tafsir</span>
                <span className="text-[9px] text-white/45 ml-2 font-mono">Sunday</span>
              </div>
              {tafsirDone
                ? <span className="text-[10px] text-emerald-400/70 font-semibold border border-emerald-500/20 bg-emerald-500/8 px-2 py-0.5 rounded">✓ Done</span>
                : isSun
                  ? <span className="text-[10px] text-blue-400/60 font-semibold border border-blue-500/20 bg-blue-500/6 px-2 py-0.5 rounded">Pending · Due today</span>
                  : <span className="text-[10px] text-white/50 font-semibold border border-white/8 px-2 py-0.5 rounded">Pending</span>
              }
            </div>

            {/* Saved this week */}
            {thisTafsir && (
              <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-3 py-2.5 flex flex-col gap-2">
                <div className="flex flex-col gap-0.5">
                  <span className="text-[9px] text-emerald-400/60 uppercase tracking-widest">Sourate</span>
                  <p className="text-sm font-bold text-white/70">{thisTafsir.sourate}</p>
                </div>
                {thisTafsir.reflection && (
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] text-white/55 uppercase tracking-widest">Reflection</span>
                    <p className="text-xs text-white/50 leading-relaxed">{thisTafsir.reflection}</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <input
                type="text"
                value={tafsirSourate}
                onChange={e => setTafsirSourate(e.target.value)}
                placeholder="Sourate studied (e.g. Al-Baqarah ayat 1–5)"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/25 transition-colors"
              />
              <textarea
                value={tafsirReflection}
                onChange={e => setTafsirReflection(e.target.value)}
                placeholder="Reflection or key takeaway…"
                rows={3}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/25 transition-colors resize-none"
              />
              <div className="flex gap-2">
                <button
                  onClick={saveTafsir}
                  disabled={!tafsirSourate.trim()}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                    tafsirSourate.trim()
                      ? 'border-blue-500/30 text-blue-400 bg-blue-500/10 hover:bg-blue-500/18'
                      : 'border-white/8 text-white/45 cursor-not-allowed'
                  }`}
                >
                  {tafsirDone ? '↻ Update' : '+ Save'}
                </button>
                {tafsirDone && (
                  <button
                    onClick={undoTafsir}
                    className="px-3 py-2 rounded-lg text-sm border border-white/8 text-white/50 hover:text-red-400/60 hover:border-red-500/20 transition-colors"
                  >
                    Undo
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SALAH ────────────────────────────────────────────────────────── */}
      {activeTab === 'salah' && (() => {
        const isToday    = salahOffset === 0
        const isFuture   = selectedSalahDate > today
        const dayLabel   = isToday ? 'Today'
          : salahOffset === -1 ? 'Yesterday'
          : new Date(selectedSalahDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

        return (
          <div className="flex flex-col gap-4">

            {/* ── Day navigator ─────────────────────────────────────── */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setSalahOffset(o => o - 1)}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white/55 hover:text-white/80 hover:bg-white/8 text-xs font-semibold transition-all"
              >
                ‹ Prev
              </button>

              <div className="flex flex-col items-center gap-0.5">
                <span className="text-xs font-bold text-white/80">{dayLabel}</span>
                {!isToday && (
                  <span className="text-[10px] text-white/40 font-mono">{selectedSalahDate}</span>
                )}
              </div>

              <button
                onClick={() => setSalahOffset(o => o + 1)}
                disabled={isToday}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-white/55 hover:text-white/80 hover:bg-white/8 text-xs font-semibold transition-all disabled:opacity-25 disabled:cursor-default"
              >
                Next ›
              </button>
            </div>

            {/* ── Prayer buttons ────────────────────────────────────── */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
              <div className="flex gap-2">
                {SALAH_NAMES.map((name, i) => {
                  const logged = selectedSalahPrayers[i]
                  return (
                    <button
                      key={name}
                      disabled={isFuture}
                      onClick={() => toggleSalahPrayer(i, selectedSalahDate)}
                      className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-lg border transition-colors ${
                        logged
                          ? 'bg-blue-500/15 border-blue-500/30 hover:bg-blue-500/8 hover:border-blue-500/15'
                          : 'bg-white/5 border-white/10 hover:bg-blue-500/6 hover:border-blue-500/18'
                      } disabled:opacity-35 disabled:cursor-default`}
                    >
                      <div className={`w-2 h-2 rounded-full ${logged ? 'bg-blue-500' : 'bg-white/15'}`} />
                      <span className={`text-xs font-medium ${logged ? 'text-blue-400' : 'text-white/55'}`}>
                        {name}
                      </span>
                    </button>
                  )
                })}
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex justify-between text-xs text-white/50">
                  <span>{selectedSalahDone} of {SALAH_TARGET} prayed</span>
                  {selectedSalahComplete
                    ? <span className="text-emerald-400/60">Alhamdulillah ✓</span>
                    : nextSelectedSalah && <span className="text-white/50">Next: {nextSelectedSalah}</span>
                  }
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-500/60 rounded-full transition-all"
                    style={{ width: `${(selectedSalahDone / SALAH_TARGET) * 100}%` }}
                  />
                </div>
              </div>

              {selectedSalahComplete
                ? <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-emerald-500/20 bg-emerald-500/6">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    <span className="text-sm text-emerald-400/80 font-semibold">✓ All Salah Done — Alhamdulillah</span>
                  </div>
                : isFuture
                  ? <p className="text-[10px] text-white/40">Future day — cannot log yet</p>
                  : <p className="text-[10px] text-white/45">Tap any prayer to log · tap again to undo</p>
              }
            </div>

            {/* ── Monthly calendar ──────────────────────────────────── */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">

              {/* Month header */}
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setCalendarYM(prevYM(calendarYM))}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-white/45 hover:text-white/75 hover:bg-white/8 transition-colors text-base"
                >‹</button>
                <span className="text-xs font-semibold text-white/65 uppercase tracking-wider">
                  {new Date(calendarYM + '-15T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
                <button
                  onClick={() => setCalendarYM(nextYMStr(calendarYM))}
                  disabled={calendarYM >= today.slice(0, 7)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-white/45 hover:text-white/75 hover:bg-white/8 transition-colors text-base disabled:opacity-20"
                >›</button>
              </div>

              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 gap-1">
                {['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => (
                  <div key={d} className="text-center text-[9px] text-white/35 font-semibold py-0.5">{d}</div>
                ))}

                {/* Day cells */}
                {calendarCells.map((cell, idx) => {
                  if (!cell) return <div key={`e${idx}`} />
                  const { d: dayNum, iso, count } = cell
                  const isFutureDay = iso > today
                  const isTodayDay  = iso === today
                  const isSelected  = iso === selectedSalahDate

                  // Fill colour based on count (0–5), -1 = future
                  const fill = isFutureDay ? ''
                    : count === 5 ? 'bg-blue-500'
                    : count === 4 ? 'bg-blue-500/75'
                    : count === 3 ? 'bg-blue-500/50'
                    : count === 2 ? 'bg-blue-500/30'
                    : count === 1 ? 'bg-blue-500/15'
                    : 'bg-white/8'   // 0 logged or no record

                  return (
                    <button
                      key={iso}
                      disabled={isFutureDay}
                      onClick={() => {
                        const diff = Math.round(
                          (new Date(iso + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime())
                          / 86400000
                        )
                        setSalahOffset(diff)
                      }}
                      className={`aspect-square rounded-full flex items-center justify-center text-[10px] font-semibold transition-all
                        ${fill}
                        ${isTodayDay  ? 'ring-1 ring-blue-400/60' : ''}
                        ${isSelected && !isTodayDay ? 'ring-1 ring-white/40' : ''}
                        ${isFutureDay ? 'text-white/18 cursor-default' : 'text-white/70 hover:ring-1 hover:ring-white/25 cursor-pointer'}
                      `}
                    >
                      {dayNum}
                    </button>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-3 pt-1 border-t border-white/6">
                <span className="text-[9px] text-white/35 uppercase tracking-widest">Legend</span>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />
                  <span className="text-[9px] text-white/45">5/5</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500/45 inline-block" />
                  <span className="text-[9px] text-white/45">Partial</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-white/8 inline-block" />
                  <span className="text-[9px] text-white/45">0</span>
                </div>
              </div>
            </div>

          </div>
        )
      })()}

      {/* ── FEEDBACK ─────────────────────────────────────────────────────── */}
      {activeTab === 'feedback' && (
        <div className="flex flex-col gap-4">

          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Weekly Dashboard</span>
            <span className="text-[10px] text-white/45 font-mono">w/{weekId}</span>
          </div>

          {/* Week grid — auto-computed, read-only */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-0">
            {/* Column headers */}
            <div className="grid grid-cols-[2.75rem_1fr_1fr_1fr] gap-x-3 pb-2.5 border-b border-white/6 mb-1">
              <span />
              {FB_CATS.map(c => (
                <span key={c.id} className="text-[9px] text-white/50 uppercase tracking-widest text-center font-semibold">
                  {c.label}
                </span>
              ))}
            </div>

            {/* Day rows */}
            {fbDashboard.map(day => (
              <div
                key={day.iso}
                className={`grid grid-cols-[2.75rem_1fr_1fr_1fr] gap-x-3 items-center py-2 border-b border-white/4 last:border-0 ${
                  day.isToday ? 'rounded-lg' : ''
                }`}
              >
                {/* Day label */}
                <div className="flex flex-col leading-none gap-0.5">
                  <span className={`text-[9px] font-semibold ${day.isToday ? 'text-white/55' : 'text-white/47'}`}>
                    {day.label}
                  </span>
                  <span className={`text-[10px] font-mono ${day.isToday ? 'text-white/40' : 'text-white/42'}`}>
                    {day.num}
                  </span>
                </div>

                {/* Status dots — read-only */}
                {FB_CATS.map(cat => {
                  const status = day[cat.id]
                  return (
                    <div key={cat.id} className="flex justify-center items-center">
                      {status
                        ? <span className={`w-2.5 h-2.5 rounded-full ${Q_DOT[status]}`} />
                        : <span className="text-[9px] text-white/40">—</span>
                      }
                    </div>
                  )
                })}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 px-1">
            <span className="text-[9px] text-white/45 uppercase tracking-widest">Key</span>
            {(['green', 'yellow', 'red'] as DayQuality[]).map((q, i) => (
              <span key={q} className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${Q_DOT[q]}`} />
                <span className="text-[9px] text-white/50">{['Good', 'Partial', 'Missed'][i]}</span>
              </span>
            ))}
            <span className="flex items-center gap-1 ml-auto">
              <span className="text-[9px] text-white/40">— = N/A</span>
            </span>
          </div>

          {/* ── Weekly Summary ───────────────────────────────────────── */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-4">
            <span className="text-[10px] text-white/35 uppercase tracking-widest font-semibold">Weekly Summary</span>

            {/* Overall compliance */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-black tabular-nums leading-none ${
                  fbWeekSummary.overallPct === null ? 'text-white/45'
                  : fbWeekSummary.overallPct >= 80 ? 'text-emerald-400'
                  : fbWeekSummary.overallPct >= 50 ? 'text-amber-400'
                  : 'text-red-400'
                }`}>
                  {fbWeekSummary.overallPct !== null ? `${fbWeekSummary.overallPct}%` : '—'}
                </span>
                <span className="text-xs text-white/50">overall compliance</span>
              </div>
              {fbWeekSummary.overallPct !== null && (
                <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      fbWeekSummary.overallPct >= 80 ? 'bg-emerald-500/60'
                      : fbWeekSummary.overallPct >= 50 ? 'bg-amber-400/60'
                      : 'bg-red-500/60'
                    }`}
                    style={{ width: `${fbWeekSummary.overallPct}%` }}
                  />
                </div>
              )}
            </div>

            {/* Per-category cards */}
            <div className="grid grid-cols-3 gap-2">
              {fbWeekSummary.catStats.map(cat => {
                const barColor = cat.score === null ? 'bg-white/12'
                  : cat.score >= 80 ? 'bg-emerald-500/55'
                  : cat.score >= 50 ? 'bg-amber-400/55'
                  : 'bg-red-500/55'
                return (
                  <div key={cat.id} className="rounded-lg border border-white/8 bg-white/3 px-3 py-2.5 flex flex-col gap-1.5">
                    <span className="text-[9px] text-white/52 uppercase tracking-widest">{cat.label}</span>
                    <span className={`text-base font-black tabular-nums leading-none ${
                      cat.score === null ? 'text-white/45'
                      : cat.score >= 80 ? 'text-emerald-400/80'
                      : cat.score >= 50 ? 'text-amber-400/80'
                      : 'text-red-400/80'
                    }`}>
                      {cat.score !== null ? `${cat.score}%` : '—'}
                    </span>
                    <div className="flex gap-1.5">
                      <span className="text-[8px] text-emerald-400/55 font-mono">{cat.green}✓</span>
                      {cat.yellow > 0 && <span className="text-[8px] text-amber-400/55 font-mono">{cat.yellow}~</span>}
                      <span className="text-[8px] text-red-400/50 font-mono">{cat.red}✕</span>
                    </div>
                    <div className="h-0.5 bg-white/8 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${cat.score ?? 0}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Weakest category */}
            {fbWeekSummary.weakest && fbWeekSummary.weakest.score !== null && fbWeekSummary.weakest.score < 100 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/15 bg-amber-500/4">
                <span className="text-[9px] text-white/50 uppercase tracking-widest shrink-0">Weakest</span>
                <span className="text-xs text-amber-400/70 font-semibold">{fbWeekSummary.weakest.label}</span>
                <span className="ml-auto text-[10px] text-amber-400/45 font-mono">
                  {fbWeekSummary.weakest.score}%
                </span>
              </div>
            )}

            {/* Stage-aware weakest area (required + focus) */}
            {stageWeakestArea && stageWeakestArea.score < 100 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/15 bg-red-500/4">
                <span className="text-[9px] text-white/50 uppercase tracking-widest shrink-0">Priority focus</span>
                <span className="text-xs text-red-400/70 font-semibold">{stageWeakestArea.label}</span>
                <span className="text-[9px] text-white/45 uppercase ml-1 capitalize shrink-0">({stageWeakestArea.status})</span>
                <span className="ml-auto text-[10px] text-red-400/45 font-mono">{stageWeakestArea.score}%</span>
              </div>
            )}

            {/* Focus / required warnings */}
            {focusWarnings.length > 0 && (
              <div className="flex flex-col gap-1 px-3 py-2 rounded-lg border border-amber-500/15 bg-amber-500/4">
                <span className="text-[9px] text-amber-400/60 uppercase tracking-widest font-semibold mb-0.5">Warnings</span>
                {focusWarnings.map((w, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-amber-400/40 text-[10px] shrink-0">·</span>
                    <span className="text-[10px] text-white/40">{w}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Salah streak */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/8 bg-white/3">
              <span className="text-[9px] text-white/50 uppercase tracking-widest">Salah streak</span>
              <span className="text-xs font-black text-blue-400/70 font-mono ml-auto">
                {salahStreak} day{salahStreak !== 1 ? 's' : ''}
              </span>
              <span className="text-[9px] text-white/45 font-mono">
                / {currentDeenStage.salahStreakTarget} (Stage {currentDeenStage.id})
              </span>
            </div>

            {/* Missed / partial items */}
            {fbWeekSummary.missed.length > 0 ? (
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-white/50 uppercase tracking-widest mb-0.5">Missed / Partial</span>
                {fbWeekSummary.missed.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-red-400/45 text-[10px] mt-px shrink-0">·</span>
                    <span className="text-[10px] text-white/35">{item}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/15 bg-emerald-500/4">
                <span className="text-[10px] text-emerald-400/65">✓ No missed items this week</span>
              </div>
            )}

            <p className="text-[9px] text-white/40 italic -mt-1">
              Connection scored on Sat (Seerah + Asma) and Sun (Tafsir) only
            </p>
          </div>

        </div>
      )}

    </div>
  )
}
