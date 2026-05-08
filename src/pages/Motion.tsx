import { useState, useMemo, useEffect, useRef } from 'react'
import type { ExecutionSettings } from '../data/types'
import FlowPageHeader from '../components/FlowPageHeader'
import FlowTabs from '../components/FlowTabs'
import ExecutionSettingsCard from '../components/ExecutionSettingsCard'
import { supabase } from '../lib/supabaseClient'
import { useUser } from '../components/AuthGate'

interface Props {
  settings: ExecutionSettings
  onSaveSettings: (updated: ExecutionSettings) => void
}

const TABS = [
  { id: 'overview',  label: 'Overview'  },
  { id: 'deep-work', label: 'Ops'       },
  { id: 'pipeline',  label: 'Pipeline'  },
  { id: 'feedback',  label: 'Feedback'  },
  { id: 'queue',     label: 'Queue'     },
  { id: 'finance',   label: 'Finance'   },
]

// ─── Prompt Queue types ───────────────────────────────────────────────────────
type QStatus    = 'waiting' | 'running' | 'done' | 'tweaking'
type QSectionId = 'tasks' | 'notes' | 'run_log'

type QTask = { id: string; text: string; done: boolean }

type QItem = {
  id: string
  project: string
  parent_id: string | null
  order_index: number
  title: string
  prompt_text: string
  status: QStatus
  tasks: QTask[]
  notes: string
  run_log: string
  created_at: string
}

type QRow = {
  id: string; project: string; parent_id: string | null
  order_index: number; title: string; prompt_text: string
  status: string; tasks: QTask[]; notes: string; run_log: string; created_at: string
}

const Q_STATUS: Record<QStatus, { label: string; cls: string }> = {
  waiting:  { label: 'WAITING',  cls: 'bg-white/5 text-white/40 border-white/10' },
  running:  { label: 'RUNNING',  cls: 'bg-blue-500/10 text-blue-400/80 border-blue-500/30' },
  done:     { label: 'DONE',     cls: 'bg-emerald-500/10 text-emerald-400/80 border-emerald-500/30' },
  tweaking: { label: 'TWEAKING', cls: 'bg-amber-500/10 text-amber-400/75 border-amber-500/30' },
}
const Q_CYCLE: QStatus[] = ['waiting', 'running', 'done', 'tweaking']

function qMapRow(r: QRow): QItem {
  return {
    id: r.id, project: r.project, parent_id: r.parent_id,
    order_index: r.order_index, title: r.title, prompt_text: r.prompt_text,
    status: r.status as QStatus, tasks: Array.isArray(r.tasks) ? r.tasks : [],
    notes: r.notes ?? '', run_log: r.run_log ?? '', created_at: r.created_at,
  }
}

function quid(): string { return crypto.randomUUID() }

// ─── Finance types ────────────────────────────────────────────────────────────
type FEntryType   = 'setup' | 'retainer'
type FEntryStatus = 'active' | 'paused' | 'churned'

type FEntry = {
  id: string
  client_name: string
  revenue_type: FEntryType
  amount: number
  close_date: string   // YYYY-MM-DD
  status: FEntryStatus
  created_at: string
}

type FPayment = {
  id: string
  entry_id: string
  payment_date: string  // YYYY-MM-DD
  amount: number
  collected: boolean
}

type FNetWorth = {
  id: string
  amount: number
  recorded_date: string
}

type FEntryRow = {
  id: string; client_name: string; revenue_type: string; amount: number
  close_date: string; status: string; created_at: string
}
type FPaymentRow = {
  id: string; entry_id: string; payment_date: string; amount: number; collected: boolean
}
type FNetWorthRow = { id: string; amount: number; recorded_date: string }

type FPhase = 1 | 2 | 3

type FCapitalSplit = { label: string; pct: number }

const F_PHASE_CONFIG: Record<FPhase, { label: string; salaryPct: number; capitalPct: number; splits: FCapitalSplit[] }> = {
  1: {
    label: 'Phase 1 — Accumulation (0 → 25k/mo)',
    salaryPct: 0.20, capitalPct: 0.80,
    splits: [
      { label: 'Business reinvestment', pct: 0.60 },
      { label: 'ETF',                   pct: 0.20 },
      { label: 'Gold',                  pct: 0.10 },
      { label: 'Cash reserve',          pct: 0.10 },
    ],
  },
  2: {
    label: 'Phase 2 — Scale (25k → 75k/mo)',
    salaryPct: 0.25, capitalPct: 0.75,
    splits: [
      { label: 'Business reinvestment', pct: 0.50 },
      { label: 'Real estate fund',      pct: 0.25 },
      { label: 'ETF',                   pct: 0.15 },
      { label: 'Gold',                  pct: 0.05 },
      { label: 'Reserve',               pct: 0.05 },
    ],
  },
  3: {
    label: 'Phase 3 — Wealth (75k → 150k/mo)',
    salaryPct: 0.30, capitalPct: 0.70,
    splits: [
      { label: 'Real estate',           pct: 0.40 },
      { label: 'Business acquisitions', pct: 0.30 },
      { label: 'ETF',                   pct: 0.20 },
      { label: 'Private equity',        pct: 0.05 },
      { label: 'Liquidity',             pct: 0.05 },
    ],
  },
}

type FMilestone = {
  id: string
  label: string
  description: string
  check: (nw: number, passiveCashflow: number) => boolean
  progress: (nw: number, passiveCashflow: number) => { current: number; target: number }
  prefix: string
}

const F_MILESTONES: FMilestone[] = [
  {
    id: 'car1', label: 'First luxury car (≤ $30k cash)',
    description: 'Net worth ≥ $300k',
    check: (nw) => nw >= 300_000,
    progress: (nw) => ({ current: Math.min(nw, 300_000), target: 300_000 }),
    prefix: '$',
  },
  {
    id: 'parents', label: 'Parents retired',
    description: 'Passive cashflow covers 2× parents annual expenses',
    check: (_nw, pc) => pc >= 10_000,
    progress: (_nw, pc) => ({ current: Math.min(pc, 10_000), target: 10_000 }),
    prefix: '$',
  },
  {
    id: 'bmw', label: 'BMW M3',
    description: 'Net worth ≥ $1M (≤ 7% net worth, cash)',
    check: (nw) => nw >= 1_000_000,
    progress: (nw) => ({ current: Math.min(nw, 1_000_000), target: 1_000_000 }),
    prefix: '$',
  },
  {
    id: 'penthouse', label: 'Penthouse',
    description: 'Net worth ≥ $3M',
    check: (nw) => nw >= 3_000_000,
    progress: (nw) => ({ current: Math.min(nw, 3_000_000), target: 3_000_000 }),
    prefix: '$',
  },
  {
    id: 'garage', label: 'Serious garage',
    description: 'Net worth ≥ $5M',
    check: (nw) => nw >= 5_000_000,
    progress: (nw) => ({ current: Math.min(nw, 5_000_000), target: 5_000_000 }),
    prefix: '$',
  },
  {
    id: 'sadaqa', label: 'Sadaqa Jariya project',
    description: 'Passive cashflow ≥ $50k/month',
    check: (_nw, pc) => pc >= 50_000,
    progress: (_nw, pc) => ({ current: Math.min(pc, 50_000), target: 50_000 }),
    prefix: '$',
  },
  {
    id: 'house', label: 'The house',
    description: 'Net worth ≥ $10M',
    check: (nw) => nw >= 10_000_000,
    progress: (nw) => ({ current: Math.min(nw, 10_000_000), target: 10_000_000 }),
    prefix: '$',
  },
  {
    id: 'final', label: 'Final goal',
    description: 'Passive income ≥ $1M/month (~$150–170M capital)',
    check: (_nw, pc) => pc >= 1_000_000,
    progress: (_nw, pc) => ({ current: Math.min(pc, 1_000_000), target: 1_000_000 }),
    prefix: '$',
  },
]

function fmtMoney(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(1)}k`
  return `$${n.toFixed(0)}`
}

function fmtDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return new Date(Number(y), Number(m) - 1, Number(d)).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function fNextMonthSameDay(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1 + n, d)
  // Handle month-end overflow (e.g., Jan 31 + 1 month → Feb 28/29)
  if (dt.getDate() !== d) dt.setDate(0)
  return dt.toISOString().slice(0, 10)
}

const STAGE_REVENUE      = 3000
const STAGE_SVC_EMAILS   = 500
const STAGE_SVC_CALLS    = 700
const STAGE_SVC_DEALS    = 5

// ─── Motion Stage System ──────────────────────────────────────────────────────
type MotionMetricId     = 'emails_sent' | 'calls_done' | 'meetings_booked' | 'meetings_held' | 'deals_closed' | 'revenue'
type MotionMetricStatus = 'required' | 'focus' | 'maintained' | 'tracked'

type MotionStageDef = {
  id:                number
  name:              string
  revenueThreshold:  number   // stage 1 = cumulative total; stages 2–5 = per-month target
  consistencyMonths: number   // 0 = cumulative check only; 2+ = consecutive months required
  metrics:           Record<MotionMetricId, MotionMetricStatus>
}

// Stage progression = revenue only (strict rule)
const MOTION_STAGES: MotionStageDef[] = [
  {
    id: 1, name: 'Self-Control', revenueThreshold: 3_000, consistencyMonths: 1,
    metrics: {
      emails_sent:     'required',   // outreach = foundation
      calls_done:      'required',
      meetings_booked: 'focus',
      meetings_held:   'tracked',
      deals_closed:    'required',
      revenue:         'tracked',
    },
  },
  {
    id: 2, name: 'Stability', revenueThreshold: 5_000, consistencyMonths: 2,
    metrics: {
      emails_sent:     'maintained',
      calls_done:      'maintained',
      meetings_booked: 'focus',
      meetings_held:   'focus',
      deals_closed:    'required',
      revenue:         'required',
    },
  },
  {
    id: 3, name: 'Growth', revenueThreshold: 7_000, consistencyMonths: 3,
    metrics: {
      emails_sent:     'maintained',
      calls_done:      'maintained',
      meetings_booked: 'tracked',
      meetings_held:   'focus',
      deals_closed:    'focus',
      revenue:         'required',
    },
  },
  {
    id: 4, name: 'Independence', revenueThreshold: 10_000, consistencyMonths: 4,
    metrics: {
      emails_sent:     'maintained',
      calls_done:      'maintained',
      meetings_booked: 'maintained',
      meetings_held:   'maintained',
      deals_closed:    'focus',
      revenue:         'required',
    },
  },
  {
    id: 5, name: 'Expansion', revenueThreshold: 15_000, consistencyMonths: 6,
    metrics: {
      emails_sent:     'maintained',
      calls_done:      'maintained',
      meetings_booked: 'maintained',
      meetings_held:   'maintained',
      deals_closed:    'focus',
      revenue:         'required',
    },
  },
]

const MOTION_METRIC_LABELS: Record<MotionMetricId, string> = {
  emails_sent:     'Emails sent',
  calls_done:      'Calls done',
  meetings_booked: 'Meetings booked',
  meetings_held:   'Meetings held',
  deals_closed:    'Deals closed',
  revenue:         'Revenue',
}

const MOTION_STATUS_CFG: Record<MotionMetricStatus, { label: string; dot: string; text: string; bg: string; border: string }> = {
  required:   { label: 'Required',   dot: 'bg-red-400',      text: 'text-red-400/80',      bg: 'bg-red-500/6',      border: 'border-red-500/15'      },
  focus:      { label: 'Focus',      dot: 'bg-emerald-400',  text: 'text-emerald-400/80',  bg: 'bg-emerald-500/6',  border: 'border-emerald-500/15'  },
  maintained: { label: 'Maintained', dot: 'bg-blue-400',     text: 'text-blue-400/80',     bg: 'bg-blue-500/6',     border: 'border-blue-500/15'     },
  tracked:    { label: 'Tracked',    dot: 'bg-white/20',     text: 'text-white/35',        bg: 'bg-white/3',        border: 'border-white/6'         },
}

// ─── Types ────────────────────────────────────────────────────────────────────
type ServiceRecord = {
  date: string
  emails: number; calls: number
  meetingsBooked: number; meetingsHeld: number; deals: number
  revenue: number
}
type WorkSession = {
  id: string; date: string
  type: 'service'
  category: 'building' | 'outreach' | 'calls' | 'follow-ups' | 'meetings' | 'fulfillment' | 'feedback'
  isDeepWork?: boolean
  minutes: number; note: string
}

// ─── Storage ──────────────────────────────────────────────────────────────────
const LS_SVC      = 'motion_service'
const LS_SESSIONS = 'motion_sessions'

function lsGet<T>(key: string, fb: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fb } catch { return fb }
}
function lsSet(key: string, val: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function motionToday(): string { return new Date().toISOString().slice(0, 10) }
// Week boundary: Sunday 00:00 → Saturday 23:59
function motionWeekSunday(): string {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())   // getDay() === 0 on Sun → no change; otherwise steps back
  return d.toISOString().slice(0, 10)
}
// Sunday of N complete weeks ago (1 = last week, 2 = two weeks ago, etc.)
function sundayOfWeeksAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay() - n * 7)
  return d.toISOString().slice(0, 10)
}
function isWeekday(iso: string): boolean {
  const d = new Date(iso + 'T12:00:00').getDay(); return d >= 1 && d <= 5
}
function fmtMin(m: number): string {
  if (m === 0) return '0m'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60), r = m % 60
  return r === 0 ? `${h}h` : `${h}h ${r}m`
}
const blankSvc = (d: string): ServiceRecord =>
  ({ date: d, emails: 0, calls: 0, meetingsBooked: 0, meetingsHeld: 0, deals: 0, revenue: 0 })

const CAT_LABEL: Record<WorkSession['category'], string> = {
  'building':   'Building',
  'outreach':   'Outreach',
  'calls':      'Calls',
  'follow-ups': 'Follow-ups',
  'meetings':   'Meetings',
  'fulfillment':'Fulfillment',
  'feedback':   'Feedback',
}
const SVC_CATS = ['building', 'outreach', 'calls', 'follow-ups', 'meetings', 'fulfillment', 'feedback'] as const

// ─── Auto priority system ────────────────────────────────────────────────────
type PriorityKey = 'calls' | 'emails' | 'deep_work'
type AutoPriority = {
  key:        PriorityKey
  label:      string
  nextAction: string
  done:       number
  target:     number
  pct:        number
  complete:   boolean
}
const AUTO_NEXT_ACTIONS: Record<PriorityKey, string> = {
  calls:     'Make 3 calls (45 min)',
  emails:    'Send 10 emails (30 min)',
  deep_work: 'Deep work session (60 min)',
}

// ─── Monthly revenue helpers ──────────────────────────────────────────────────
function buildMonthlyRevMap(svcLog: ServiceRecord[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of svcLog) {
    const k = r.date.slice(0, 7); m.set(k, (m.get(k) ?? 0) + r.revenue)
  }
  return m
}
// Count consecutive calendar months (starting from current month, going back) where revenue ≥ threshold
function consecutiveMonthsAbove(revMap: Map<string, number>, threshold: number): number {
  let count = 0
  const d = new Date()
  for (let i = 0; i < 24; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if ((revMap.get(key) ?? 0) < threshold) break
    count++
    d.setMonth(d.getMonth() - 1)
  }
  return count
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Motion({ settings, onSaveSettings }: Props) {
  const today = motionToday()
  const user  = useUser()

  const [activeTab,   setActiveTab]   = useState('overview')
  const [serviceLog,  setServiceLog]  = useState<ServiceRecord[]>(() => lsGet(LS_SVC, []))
  const [sessions,    setSessions]    = useState<WorkSession[]>(() => lsGet(LS_SESSIONS, []))
  const [sessionForm, setSessionForm] = useState({
    type:        'service'   as WorkSession['type'],
    category:    'outreach'  as WorkSession['category'],
    isDeepWork:  false,
    minutes:     30, note: '',
  })
  const [svcRevInput, setSvcRevInput] = useState('')

  // ── Load all Motion data from Supabase on mount ───────────────────────────
  useEffect(() => {
    if (!user) return

    // service_records — full history for cumulative totals + weekly calcs
    supabase
      .from('service_records')
      .select('record_date,emails,calls,meetings_booked,meetings_held,deals,revenue')
      .eq('user_id', user.id)
      .then(({ data, error }) => {
        if (error) { console.error('[motion] fetch service_records:', error); return }
        if (!data?.length) return
        const mapped: ServiceRecord[] = data.map(r => ({
          date:           r.record_date,
          emails:         r.emails          ?? 0,
          calls:          r.calls           ?? 0,
          meetingsBooked: r.meetings_booked ?? 0,
          meetingsHeld:   r.meetings_held   ?? 0,
          deals:          r.deals           ?? 0,
          revenue:        r.revenue         ?? 0,
        }))
        setServiceLog(mapped)
        lsSet(LS_SVC, mapped)
      })

    // work_sessions — last 200 for history
    supabase
      .from('work_sessions')
      .select('id,session_date,type,category,is_deep_work,minutes,note')
      .eq('user_id', user.id)
      .order('session_date', { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) { console.error('[motion] fetch work_sessions:', error); return }
        if (!data?.length) return
        const mapped: WorkSession[] = data.map(r => ({
          id:         String(r.id),
          date:       r.session_date,
          type:       r.type       as WorkSession['type'],
          category:   r.category   as WorkSession['category'],
          isDeepWork: r.is_deep_work ?? false,
          minutes:    r.minutes,
          note:       r.note ?? '',
        }))
        setSessions(mapped)
        lsSet(LS_SESSIONS, mapped)
      })

    // execution_settings — single row per user; hydrate App settings state
    supabase
      .from('execution_settings')
      .select('emails_per_day,calls_per_day,deep_work_min_per_day')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error('[motion] fetch execution_settings:', error); return }
        if (!data) return
        onSaveSettings({
          emailsPerDay:      data.emails_per_day       ?? settings.emailsPerDay,
          callsPerDay:       data.calls_per_day         ?? settings.callsPerDay,
          deepWorkMinPerDay: data.deep_work_min_per_day ?? settings.deepWorkMinPerDay,
          lastUpdated:       today,
        })
      })

  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Today ──────────────────────────────────────────────────────────────────
  const todaySvc      = serviceLog.find(r => r.date === today) ?? null
  const todaySessions = sessions.filter(s => s.date === today)
  const todayDwMin    = todaySessions.reduce((s, r) => s + r.minutes, 0)

  // ── Stage totals (all-time cumulative) ────────────────────────────────────
  const stageTotals = useMemo(() => {
    const svc = serviceLog.reduce((a, r) => ({
      emails: a.emails + r.emails, calls: a.calls + r.calls,
      deals:  a.deals  + r.deals,  revenue: a.revenue + r.revenue,
    }), { emails: 0, calls: 0, deals: 0, revenue: 0 })
    return { svc, totalRevenue: svc.revenue }
  }, [serviceLog])

  // ── Current-month revenue (stage validation window) ───────────────────────
  const currentMonthRev = useMemo(() => {
    const prefix = new Date().toISOString().slice(0, 7)
    const total = serviceLog.filter(r => r.date.startsWith(prefix)).reduce((s, r) => s + r.revenue, 0)
    return { total }
  }, [serviceLog])

  const revPct = Math.min(100, Math.round((currentMonthRev.total / STAGE_REVENUE) * 100))

  // ── Weekly days (Sun–Sat) ──────────────────────────────────────────────────
  const weekDays = useMemo(() => {
    const sun = motionWeekSunday()
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sun + 'T12:00:00')
      d.setDate(d.getDate() + i)
      const iso = d.toISOString().slice(0, 10)
      return { iso, label: d.toLocaleDateString('en-GB', { weekday: 'short' }), num: d.getDate(), isToday: iso === today, isFuture: iso > today }
    })
  }, [today])

  // ── Adaptive effective targets ─────────────────────────────────────────────
  const effectiveTargets = useMemo(() => {
    const wkRecs = serviceLog.filter(r => isWeekday(r.date)).sort((a, b) => b.date.localeCompare(a.date))
    const last5  = wkRecs.slice(0, 5)
    const last3  = wkRecs.slice(0, 3)

    let emails = settings.emailsPerDay
    let calls  = settings.callsPerDay

    if (last5.length >= 3) {
      if (last5.reduce((s, r) => s + r.emails / settings.emailsPerDay, 0) / last5.length < 0.6)
        emails = Math.max(1, Math.round(settings.emailsPerDay * 0.8))
      if (last5.reduce((s, r) => s + r.calls / settings.callsPerDay, 0) / last5.length < 0.6)
        calls = Math.max(1, Math.round(settings.callsPerDay * 0.8))
    }
    if (last3.length === 3) {
      if (last3.every(r => r.emails / settings.emailsPerDay > 1.1)) emails = Math.min(50, Math.round(settings.emailsPerDay * 1.2))
      if (last3.every(r => r.calls  / settings.callsPerDay  > 1.1)) calls  = Math.min(15, Math.round(settings.callsPerDay  * 1.2))
    }

    const anyAdapted = emails !== settings.emailsPerDay || calls !== settings.callsPerDay

    return {
      emailsPerDay:      emails,
      callsPerDay:       calls,
      deepWorkMinPerDay: settings.deepWorkMinPerDay,
      emailsAdapted:     emails !== settings.emailsPerDay,
      callsAdapted:      calls  !== settings.callsPerDay,
      anyAdapted,
    }
  }, [serviceLog, settings])

  // ── Weekly data ───────────────────────────────────────────────────────────
  const weeklyData = useMemo(() => {
    const wkSet   = new Set(weekDays.map(d => d.iso))
    const past    = weekDays.filter(d => !d.isFuture && !d.isToday)
    const pastWkd = past.filter(d => isWeekday(d.iso))

    const svcRecs  = serviceLog.filter(r => wkSet.has(r.date))
    const sessRecs = sessions.filter(s => wkSet.has(s.date))

    const svc = svcRecs.reduce((a, r) => ({
      emails: a.emails + r.emails, calls: a.calls + r.calls,
      meetingsBooked: a.meetingsBooked + r.meetingsBooked,
      meetingsHeld:   a.meetingsHeld   + r.meetingsHeld,
      deals: a.deals + r.deals, revenue: a.revenue + r.revenue,
    }), { emails: 0, calls: 0, meetingsBooked: 0, meetingsHeld: 0, deals: 0, revenue: 0 })

    const dwMin = sessRecs.reduce((s, r) => s + r.minutes, 0)

    // Conversions
    const contacts       = svc.emails + svc.calls
    const emailCallToMtg = contacts          > 0 ? Math.round((svc.meetingsBooked / contacts)          * 100) : null
    const mtgBookedHeld  = svc.meetingsBooked > 0 ? Math.round((svc.meetingsHeld   / svc.meetingsBooked) * 100) : null
    const mtgHeldDeal    = svc.meetingsHeld   > 0 ? Math.round((svc.deals          / svc.meetingsHeld)   * 100) : null

    function pct(actual: number, target: number, n: number): number | null {
      if (n === 0 || target === 0) return null
      return Math.min(100, Math.round((actual / (n * target)) * 100))
    }
    const emailsPct = pct(svc.emails, effectiveTargets.emailsPerDay, pastWkd.length)
    const callsPct  = pct(svc.calls,  effectiveTargets.callsPerDay,  pastWkd.length)
    const dealsPct  = pastWkd.length > 0 ? Math.min(100, Math.round(svc.deals / (pastWkd.length * 0.2) * 100)) : null
    const dwPct     = pct(dwMin, effectiveTargets.deepWorkMinPerDay, past.length)

    const scored = [
      { label: 'Emails',    pct: emailsPct },
      { label: 'Calls',     pct: callsPct  },
      { label: 'Deals',     pct: dealsPct  },
      { label: 'Deep Work', pct: dwPct     },
    ].filter((c): c is { label: string; pct: number } => c.pct !== null)
    const weakest = scored.length === 0 ? null : scored.reduce((a, b) => a.pct <= b.pct ? a : b)

    const missed: string[] = []
    for (const day of past) {
      const s  = serviceLog.find(r => r.date === day.iso)
      const dw = sessions.filter(r => r.date === day.iso).reduce((sum, r) => sum + r.minutes, 0)
      if (isWeekday(day.iso)) {
        if (!s || s.emails < effectiveTargets.emailsPerDay) missed.push(`Emails — ${day.label} ${day.num}`)
        if (!s || s.calls  < effectiveTargets.callsPerDay)  missed.push(`Calls — ${day.label} ${day.num}`)
      }
      if (dw < effectiveTargets.deepWorkMinPerDay) missed.push(`Deep Work — ${day.label} ${day.num}`)
    }

    return { svc, dwMin, emailCallToMtg, mtgBookedHeld, mtgHeldDeal, emailsPct, callsPct, dealsPct, dwPct, weakest, missed, pastWkdCount: pastWkd.length }
  }, [serviceLog, sessions, weekDays, effectiveTargets])

  // ── Weekly history (last 4 complete Sun–Sat weeks) ────────────────────────
  const weeklyHistory = useMemo(() => {
    return Array.from({ length: 4 }, (_, i) => {
      const sunIso = sundayOfWeeksAgo(i + 1)
      const days   = Array.from({ length: 7 }, (_, j) => {
        const d = new Date(sunIso + 'T12:00:00')
        d.setDate(d.getDate() + j)
        return d.toISOString().slice(0, 10)
      })
      const satIso = days[6]
      const daySet = new Set(days)
      const svc = serviceLog.filter(r => daySet.has(r.date)).reduce(
        (a, r) => ({ emails: a.emails + r.emails, calls: a.calls + r.calls, deals: a.deals + r.deals, revenue: a.revenue + r.revenue }),
        { emails: 0, calls: 0, deals: 0, revenue: 0 },
      )
      const hasData  = svc.emails > 0 || svc.calls > 0 || svc.deals > 0
      const totalRev = svc.revenue
      const s1Emails = svc.emails >= Math.round(STAGE_SVC_EMAILS / 52)
      const s1Calls  = svc.calls  >= Math.round(STAGE_SVC_CALLS  / 52)
      const s1Deals  = svc.deals  >= 0
      return { weekStart: sunIso, weekEnd: satIso, svc, totalRev, hasData, s1Emails, s1Calls, s1Deals }
    })
  }, [serviceLog])

  // ── Motion stage system ───────────────────────────────────────────────────
  const monthlyRevMap = useMemo(
    () => buildMonthlyRevMap(serviceLog),
    [serviceLog],
  )

  const currentMotionStage = useMemo((): MotionStageDef => {
    // Every stage uses consecutive-month validation — no cumulative carry-over.
    // Walk from highest stage down — return the stage AFTER the first completed one.
    for (let i = MOTION_STAGES.length - 1; i >= 0; i--) {
      const stage = MOTION_STAGES[i]
      const done  = consecutiveMonthsAbove(monthlyRevMap, stage.revenueThreshold) >= stage.consistencyMonths
      if (done) return MOTION_STAGES[Math.min(i + 1, MOTION_STAGES.length - 1)]
    }
    return MOTION_STAGES[0]
  }, [monthlyRevMap])

  const nextMotionStage = useMemo((): MotionStageDef | null => {
    const idx = MOTION_STAGES.findIndex(s => s.id === currentMotionStage.id)
    return idx < MOTION_STAGES.length - 1 ? MOTION_STAGES[idx + 1] : null
  }, [currentMotionStage])

  const motionStageProgress = useMemo(() => {
    const stage       = currentMotionStage
    const consecutive = consecutiveMonthsAbove(monthlyRevMap, stage.revenueThreshold)
    return {
      pct:           Math.min(100, Math.round((consecutive / stage.consistencyMonths) * 100)),
      progressLabel: `${consecutive} / ${stage.consistencyMonths} month${stage.consistencyMonths > 1 ? 's' : ''} ≥ $${stage.revenueThreshold.toLocaleString()}/mo`,
      contextLabel:  `This month: $${currentMonthRev.total.toLocaleString()}`,
    }
  }, [currentMotionStage, currentMonthRev, monthlyRevMap])

  // ── Revenue history (derived from monthlyRevMap, no new fetch) ──────────────
  const revenueHistory = useMemo(() => {
    return Array.from(monthlyRevMap.entries())
      .map(([key, rev]) => {
        const [y, m] = key.split('-')
        const label  = new Date(parseInt(y), parseInt(m) - 1, 1)
          .toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
        const isCurrent = key === new Date().toISOString().slice(0, 7)
        return { key, label, rev, isCurrent }
      })
      .sort((a, b) => b.key.localeCompare(a.key))
      .slice(0, 6)
  }, [monthlyRevMap])

  const motionMetricStatuses = useMemo(
    (): Record<MotionMetricId, MotionMetricStatus> => ({ ...currentMotionStage.metrics }),
    [currentMotionStage],
  )

  // ── Persist computed stage to Supabase whenever it changes ───────────────
  useEffect(() => {
    if (!user) return
    supabase
      .from('motion_stage_state')
      .upsert({
        user_id:            user.id,
        current_stage:      currentMotionStage.id,
        stage_name:         currentMotionStage.name,
        revenue_threshold:  currentMotionStage.revenueThreshold,
        consistency_months: currentMotionStage.consistencyMonths,
        status:             'active',
      }, { onConflict: 'user_id' })
      .then(({ error }) => { if (error) console.error('[motion] upsert motion_stage_state:', error) })
  }, [user, currentMotionStage]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Stage-aware weakest area (required + focus implemented metrics only) ───
  const motionWeakestArea = useMemo(() => {
    const wRev       = weeklyData.svc.revenue
    const wRevTarget = currentMotionStage.revenueThreshold / 4.3   // approx weekly portion
    const mtgBkdTgt  = Math.max(1, Math.round((weeklyData.svc.emails + weeklyData.svc.calls) * 0.1))
    const mtgHeldTgt = Math.max(1, weeklyData.svc.meetingsBooked)

    const scores: { id: MotionMetricId; label: string; score: number; status: MotionMetricStatus }[] = [
      { id: 'emails_sent',     label: MOTION_METRIC_LABELS['emails_sent'],     score: weeklyData.emailsPct ?? 0,                                                                                           status: motionMetricStatuses['emails_sent']     },
      { id: 'calls_done',      label: MOTION_METRIC_LABELS['calls_done'],      score: weeklyData.callsPct  ?? 0,                                                                                           status: motionMetricStatuses['calls_done']      },
      { id: 'deals_closed',    label: MOTION_METRIC_LABELS['deals_closed'],    score: weeklyData.dealsPct  ?? 0,                                                                                           status: motionMetricStatuses['deals_closed']    },
      { id: 'meetings_booked', label: MOTION_METRIC_LABELS['meetings_booked'], score: Math.min(100, Math.round((weeklyData.svc.meetingsBooked / mtgBkdTgt)  * 100)),                                      status: motionMetricStatuses['meetings_booked'] },
      { id: 'meetings_held',   label: MOTION_METRIC_LABELS['meetings_held'],   score: mtgHeldTgt > 0 ? Math.min(100, Math.round((weeklyData.svc.meetingsHeld / mtgHeldTgt) * 100)) : 0,                   status: motionMetricStatuses['meetings_held']   },
      { id: 'revenue',         label: MOTION_METRIC_LABELS['revenue'],         score: wRevTarget > 0 ? Math.min(100, Math.round((wRev / wRevTarget) * 100)) : 0,                                          status: motionMetricStatuses['revenue']         },
    ]

    const important = scores.filter(m => m.status === 'required' || m.status === 'focus')
    if (important.length === 0) return null
    return important.reduce((a, b) => a.score <= b.score ? a : b)
  }, [motionMetricStatuses, weeklyData, currentMotionStage])

  // ── Outreach / deal-flow warnings ─────────────────────────────────────────
  const motionWarnings = useMemo((): string[] => {
    const w: string[] = []
    const eSt = motionMetricStatuses['emails_sent'],  ePct = weeklyData.emailsPct ?? 0
    const cSt = motionMetricStatuses['calls_done'],   cPct = weeklyData.callsPct  ?? 0
    const dSt = motionMetricStatuses['deals_closed'], dPct = weeklyData.dealsPct  ?? 0
    if ((eSt === 'required' || eSt === 'focus') && ePct < 60)
      w.push(`Outreach low — emails at ${ePct}% this week`)
    if ((cSt === 'required' || cSt === 'focus') && cPct < 60)
      w.push(`Outreach low — calls at ${cPct}% this week`)
    if ((dSt === 'required' || dSt === 'focus') && dPct < 60)
      w.push(`Deal flow stalling — deals at ${dPct}% this week`)
    return w
  }, [motionMetricStatuses, weeklyData])

  // ── Auto priority: simple day-type-aware rules ───────────────────────────
  const autoPriority = useMemo((): AutoPriority => {
    function mk(key: PriorityKey, label: string, done: number, target: number): AutoPriority {
      return { key, label, nextAction: AUTO_NEXT_ACTIONS[key], done, target, pct: Math.min(100, Math.round(done / target * 100)), complete: done >= target }
    }
    const cDone = todaySvc?.calls  ?? 0; const cTgt = effectiveTargets.callsPerDay
    const eDone = todaySvc?.emails ?? 0; const eTgt = effectiveTargets.emailsPerDay
    if (cDone < cTgt) return mk('calls',     'Calls',     cDone,      cTgt)
    if (eDone < eTgt) return mk('emails',    'Emails',    eDone,      eTgt)
    return                  mk('deep_work', 'Deep Work', todayDwMin, effectiveTargets.deepWorkMinPerDay)
  }, [todaySvc, todayDwMin, effectiveTargets])

  // ── Session history ───────────────────────────────────────────────────────
  const sessionHistory = useMemo(() => {
    const past = sessions.filter(s => s.date !== today).sort((a, b) => b.date.localeCompare(a.date))
    const groups: { date: string; label: string; items: WorkSession[] }[] = []
    let cur = ''
    for (const s of past) {
      if (s.date !== cur) {
        cur = s.date
        const d = new Date(s.date + 'T12:00:00')
        groups.push({ date: s.date, label: d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }), items: [] })
      }
      groups[groups.length - 1].items.push(s)
    }
    return groups
  }, [sessions, today])

  // ── Daily score: avg of per-metric completion rates for today ────────────
  const todayScore = useMemo(() => {
    const metrics: number[] = [
      Math.min(todayDwMin / effectiveTargets.deepWorkMinPerDay, 1) * 100,
      Math.min((todaySvc?.emails ?? 0) / effectiveTargets.emailsPerDay, 1) * 100,
      Math.min((todaySvc?.calls  ?? 0) / effectiveTargets.callsPerDay,  1) * 100,
    ]
    return Math.round(metrics.reduce((s, v) => s + v, 0) / metrics.length)
  }, [todaySvc, todayDwMin, effectiveTargets])

  // ── Ineffective work: high time + low output ──────────────────────────────
  const ineffectiveWorkFlag = useMemo(() => {
    if (todayDwMin < 60) return false
    const inputPct = (
      (todaySvc?.emails ?? 0) / effectiveTargets.emailsPerDay +
      (todaySvc?.calls  ?? 0) / effectiveTargets.callsPerDay
    ) / 2
    return inputPct < 0.3
  }, [todayDwMin, todaySvc, effectiveTargets])

  // ── Today priority: one metric, closest to revenue, below 80% ────────────
  const todayPriority = useMemo(() => {
    const T = 80

    // Build a result object — includes scheduling: duration, output target, intensity
    function mk(
      metric: string, rate: number, field: string,
      done: number, target: number, action: string,
      blockMax: number, blockUnit: string
    ) {
      const remaining     = Math.max(0, target - done)
      const isIncomplete  = rate < T
      const intensity     = rate < 40 ? 'high' as const : 'medium' as const
      // high deficit → longer block; low deficit → shorter block
      const blockDuration = rate < 40 ? 60 : rate < 60 ? 45 : 30
      const blockTarget   = remaining > 0 ? Math.min(blockMax, remaining) : blockMax
      return { metric, rate, field, done, target, remaining, isIncomplete, action, intensity, blockDuration, blockTarget, blockUnit }
    }

    const eDone = todaySvc?.emails ?? 0;  const eTarget = effectiveTargets.emailsPerDay
    const cDone = todaySvc?.calls  ?? 0;  const cTarget = effectiveTargets.callsPerDay
    const emailsRate = Math.min(100, Math.round(eDone / eTarget * 100))
    const callsRate  = Math.min(100, Math.round(cDone / cTarget * 100))

    const { svc, pastWkdCount } = weeklyData
    const contacts    = svc.emails + svc.calls
    const mtgBkdTgt   = Math.max(1, Math.round(contacts * 0.10))
    const mtgHeldTgt  = Math.max(1, Math.round(svc.meetingsBooked * 0.80))
    const dealsTgt    = Math.max(1, Math.round(pastWkdCount * 0.20))
    const mtgBkdRate  = contacts           > 0 ? Math.min(100, Math.round(svc.meetingsBooked / mtgBkdTgt  * 100)) : null
    const mtgHeldRate = svc.meetingsBooked > 0 ? Math.min(100, Math.round(svc.meetingsHeld   / mtgHeldTgt * 100)) : null
    const dealsRate   = weeklyData.dealsPct

    if (dealsRate   !== null && dealsRate   < T) return mk('Deals',           dealsRate,   'deals',          svc.deals,          dealsTgt,   'Follow up on held meetings. Close.',           1, 'deal'           )
    if (mtgHeldRate !== null && mtgHeldRate < T) return mk('Meetings held',   mtgHeldRate, 'meetingsHeld',   svc.meetingsHeld,   mtgHeldTgt, 'Reach out to booked contacts. Hold the call.', 1, 'meeting held'   )
    if (mtgBkdRate  !== null && mtgBkdRate  < T) return mk('Meetings booked', mtgBkdRate,  'meetingsBooked', svc.meetingsBooked, mtgBkdTgt,  'Follow up / book calls',                       1, 'meeting booked' )
    if (callsRate   < T) return mk('Calls',  callsRate,  'calls',  cDone, cTarget, `Make ${Math.min(3,  Math.max(1, cTarget - cDone))} calls`,  3,  'calls'  )
    if (emailsRate  < T) return mk('Emails', emailsRate, 'emails', eDone, eTarget, `Send ${Math.min(10, Math.max(1, eTarget - eDone))} emails`, 10, 'emails' )
    return null
  }, [todaySvc, weeklyData, effectiveTargets])

  // ── Anti-escape: score penalty + warning ──────────────────────────────────
  const priorityIncomplete = todayPriority !== null && todayPriority.rate < 80
  const displayScore       = priorityIncomplete ? Math.round(todayScore * 0.5) : todayScore
  const scoreWarning       = priorityIncomplete

  // ── Log functions ─────────────────────────────────────────────────────────
  function logSvc(field: keyof Omit<ServiceRecord, 'date'>, amount = 1) {
    // Compute next record now (for Supabase sync) — safe at point-of-click
    const current = serviceLog.find(r => r.date === today) ?? blankSvc(today)
    const next: ServiceRecord = { ...current, [field]: Math.max(0, (current[field] as number) + amount) }

    // Optimistic local update
    setServiceLog(prev => {
      const rec     = prev.find(r => r.date === today) ?? blankSvc(today)
      const updated = [...prev.filter(r => r.date !== today), { ...rec, [field]: (rec[field] as number) + amount }]
      lsSet(LS_SVC, updated); return updated
    })

    // Persist to Supabase
    if (user) {
      supabase
        .from('service_records')
        .upsert({
          user_id:         user.id,
          record_date:     today,
          emails:          next.emails,
          calls:           next.calls,
          meetings_booked: next.meetingsBooked,
          meetings_held:   next.meetingsHeld,
          deals:           next.deals,
          revenue:         next.revenue,
        }, { onConflict: 'user_id,record_date' })
        .then(({ error }) => { if (error) console.error('[motion] upsert service_records:', error) })
    }
  }
  function logSvcRevenue() {
    const n = parseFloat(svcRevInput); if (isNaN(n) || n <= 0) return
    logSvc('revenue', n); setSvcRevInput('')
  }
  function logSession() {
    if (sessionForm.minutes <= 0) return
    const s: WorkSession = {
      id:         `${today}-${Date.now()}`,
      date:       today,
      type:       sessionForm.type,
      category:   sessionForm.category,
      isDeepWork: sessionForm.isDeepWork,
      minutes:    sessionForm.minutes,
      note:       sessionForm.note.trim(),
    }
    setSessions(prev => { const u = [...prev, s]; lsSet(LS_SESSIONS, u); return u })
    setSessionForm(f => ({ ...f, minutes: 30, note: '', isDeepWork: false }))

    if (user) {
      supabase
        .from('work_sessions')
        .insert({
          user_id:      user.id,
          session_date: today,
          type:         s.type,
          category:     s.category,
          is_deep_work: s.isDeepWork,
          minutes:      s.minutes,
          note:         s.note,
        })
        .then(({ error }) => { if (error) console.error('[motion] insert work_sessions:', error) })
    }
  }

  // ── Execution settings save — persist to Supabase then update App state ──
  function handleSaveSettings(updated: ExecutionSettings) {
    onSaveSettings(updated)
    if (user) {
      supabase
        .from('execution_settings')
        .upsert({
          user_id:               user.id,
          emails_per_day:        updated.emailsPerDay,
          calls_per_day:         updated.callsPerDay,
          deep_work_min_per_day: updated.deepWorkMinPerDay,
        }, { onConflict: 'user_id' })
        .then(({ error }) => { if (error) console.error('[motion] upsert execution_settings:', error) })
    }
  }

  // ── Queue state ───────────────────────────────────────────────────────────
  const [qItems,           setQItems]          = useState<QItem[]>([])
  const [qLoading,         setQLoading]        = useState(false)
  const [qLoaded,          setQLoaded]         = useState(false)
  const [qExpandedCards,   setQExpandedCards]  = useState<Set<string>>(new Set())
  const [qOpenSections,    setQOpenSections]   = useState<Record<string, Set<QSectionId>>>({})
  const [qCollapsedFolders,setQCollapsedFolders] = useState<Set<string>>(new Set())
  const [qCopiedId,        setQCopiedId]       = useState<string | null>(null)
  const [qDragOverId,      setQDragOverId]     = useState<string | null>(null)
  const [qShowNewFolder,   setQShowNewFolder]  = useState(false)
  const [qNewFolderName,   setQNewFolderName]  = useState('')
  const qDragSrcId      = useRef<string | null>(null)
  const qDragSrcProject = useRef<string | null>(null)
  const qPendingUpdates = useRef<Map<string, Partial<QItem>>>(new Map())
  const qUpdateTimers   = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  // Lazy-load queue when tab is first opened
  useEffect(() => {
    if (activeTab !== 'queue' || !user || qLoaded) return
    setQLoading(true)
    setQLoaded(true)
    supabase
      .from('prompt_queue_items')
      .select('id,project,parent_id,order_index,title,prompt_text,status,tasks,notes,run_log,created_at')
      .eq('user_id', user.id)
      .order('order_index', { ascending: true })
      .then(({ data, error }) => {
        setQLoading(false)
        if (error) { console.error('[queue] fetch:', error); return }
        setQItems((data ?? [] as QRow[]).map(r => qMapRow(r as QRow)))
      })
  }, [activeTab, user, qLoaded])

  // ── Queue derived ─────────────────────────────────────────────────────────
  const qProjects = useMemo(() => {
    const map = new Map<string, QItem[]>()
    for (const item of qItems) {
      if (item.parent_id !== null) continue
      if (!map.has(item.project)) map.set(item.project, [])
      map.get(item.project)!.push(item)
    }
    for (const arr of map.values()) arr.sort((a, b) => a.order_index - b.order_index)
    return map
  }, [qItems])

  function qGetSubs(parentId: string): QItem[] {
    return qItems.filter(i => i.parent_id === parentId).sort((a, b) => a.order_index - b.order_index)
  }

  function qGetNum(item: QItem): string {
    if (item.parent_id === null) {
      const proj = qProjects.get(item.project) ?? []
      return `#${proj.findIndex(i => i.id === item.id) + 1}`
    }
    const subs   = qGetSubs(item.parent_id)
    const parent = qItems.find(i => i.id === item.parent_id)
    const pNum   = parent ? qGetNum(parent).replace('#', '') : '?'
    return `#${pNum}.${subs.findIndex(i => i.id === item.id) + 1}`
  }

  // ── Queue mutations ───────────────────────────────────────────────────────
  function qScheduleUpdate(id: string, patch: Partial<QItem>) {
    qPendingUpdates.current.set(id, { ...(qPendingUpdates.current.get(id) ?? {}), ...patch })
    const existing = qUpdateTimers.current.get(id)
    if (existing) clearTimeout(existing)
    qUpdateTimers.current.set(id, setTimeout(async () => {
      const update = qPendingUpdates.current.get(id)
      if (!update) return
      qPendingUpdates.current.delete(id)
      qUpdateTimers.current.delete(id)
      const { error } = await supabase.from('prompt_queue_items').update(update)
        .eq('id', id).eq('user_id', user?.id ?? '')
      if (error) console.error('[queue] update:', error)
    }, 700))
  }

  function qUpdateItem(id: string, patch: Partial<QItem>, immediate = false) {
    setQItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i))
    if (immediate) {
      supabase.from('prompt_queue_items').update(patch).eq('id', id).eq('user_id', user?.id ?? '')
        .then(({ error }) => { if (error) console.error('[queue] update:', error) })
    } else {
      qScheduleUpdate(id, patch)
    }
  }

  async function qAddItem(project: string, parentId: string | null = null) {
    if (!user) return
    const siblings    = parentId ? qGetSubs(parentId) : (qProjects.get(project) ?? [])
    const order_index = siblings.length
    const id          = quid()
    const newItem: QItem = {
      id, project, parent_id: parentId, order_index,
      title: '', prompt_text: '', status: 'waiting',
      tasks: [], notes: '', run_log: '', created_at: new Date().toISOString(),
    }
    setQItems(prev => [...prev, newItem])
    setQExpandedCards(prev => new Set([...prev, id]))
    const { error } = await supabase.from('prompt_queue_items').insert({
      id, user_id: user.id, project, parent_id: parentId, order_index,
      title: '', prompt_text: '', status: 'waiting', tasks: [], notes: '', run_log: '',
    })
    if (error) {
      console.error('[queue] insert:', error)
      setQItems(prev => prev.filter(i => i.id !== id))
    }
  }

  async function qDeleteItem(id: string) {
    const toDelete = [id, ...qItems.filter(i => i.parent_id === id).map(i => i.id)]
    setQItems(prev => prev.filter(i => !toDelete.includes(i.id)))
    for (const did of toDelete) {
      const { error } = await supabase.from('prompt_queue_items').delete()
        .eq('id', did).eq('user_id', user?.id ?? '')
      if (error) console.error('[queue] delete:', error)
    }
  }

  function qAddFolder(name: string) {
    if (!name.trim()) return
    void qAddItem(name.trim())
    setQShowNewFolder(false)
    setQNewFolderName('')
  }

  function qCycleStatus(id: string, current: QStatus) {
    const next = Q_CYCLE[(Q_CYCLE.indexOf(current) + 1) % Q_CYCLE.length]
    qUpdateItem(id, { status: next }, true)
  }

  function qCopy(item: QItem) {
    const text = item.prompt_text.trim() || item.title.trim()
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setQCopiedId(item.id)
      setTimeout(() => setQCopiedId(null), 1500)
    }).catch(() => {})
  }

  function qAddTask(itemId: string) {
    const item = qItems.find(i => i.id === itemId)
    if (!item) return
    qUpdateItem(itemId, { tasks: [...item.tasks, { id: quid(), text: '', done: false }] }, true)
  }

  function qUpdateTask(itemId: string, taskId: string, patch: Partial<QTask>) {
    const item = qItems.find(i => i.id === itemId)
    if (!item) return
    qUpdateItem(itemId, { tasks: item.tasks.map(t => t.id === taskId ? { ...t, ...patch } : t) }, true)
  }

  function qDeleteTask(itemId: string, taskId: string) {
    const item = qItems.find(i => i.id === itemId)
    if (!item) return
    qUpdateItem(itemId, { tasks: item.tasks.filter(t => t.id !== taskId) }, true)
  }

  function qToggleCard(id: string) {
    setQExpandedCards(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function qToggleSection(itemId: string, section: QSectionId) {
    setQOpenSections(prev => {
      const cur = new Set(prev[itemId] ?? [])
      if (cur.has(section)) cur.delete(section); else cur.add(section)
      return { ...prev, [itemId]: cur }
    })
  }

  function qSectionOpen(itemId: string, section: QSectionId): boolean {
    return qOpenSections[itemId]?.has(section) ?? false
  }

  // ── Queue drag & drop ─────────────────────────────────────────────────────
  function qDragStart(e: React.DragEvent, id: string, project: string) {
    qDragSrcId.current      = id
    qDragSrcProject.current = project
    e.dataTransfer.effectAllowed = 'move'
  }

  function qDragOver(e: React.DragEvent, id: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setQDragOverId(id)
  }

  function qDrop(e: React.DragEvent, targetId: string, targetProject: string) {
    e.preventDefault()
    setQDragOverId(null)
    const srcId = qDragSrcId.current
    if (!srcId || srcId === targetId) return
    const srcProject = qDragSrcProject.current ?? targetProject

    const srcList = [...(qProjects.get(srcProject) ?? [])]
    const tgtList = srcProject === targetProject ? srcList : [...(qProjects.get(targetProject) ?? [])]

    if (srcProject === targetProject) {
      const si = srcList.findIndex(i => i.id === srcId)
      const ti = srcList.findIndex(i => i.id === targetId)
      if (si === -1 || ti === -1) return
      const reordered = [...srcList]
      const [moved] = reordered.splice(si, 1)
      reordered.splice(ti, 0, moved)
      const updates = reordered.map((item, idx) => ({ ...item, order_index: idx }))
      setQItems(prev => {
        const ids = new Set(updates.map(u => u.id))
        return [...prev.filter(i => !ids.has(i.id)), ...updates]
      })
      for (const u of updates) {
        supabase.from('prompt_queue_items').update({ order_index: u.order_index })
          .eq('id', u.id).eq('user_id', user?.id ?? '')
          .then(({ error }) => { if (error) console.error('[queue] reorder:', error) })
      }
    } else {
      const srcItem = qItems.find(i => i.id === srcId)
      if (!srcItem) return
      const ti = tgtList.findIndex(i => i.id === targetId)
      const newTgt = [...tgtList]
      newTgt.splice(ti, 0, { ...srcItem, project: targetProject })
      const newSrc    = srcList.filter(i => i.id !== srcId).map((i, idx) => ({ ...i, order_index: idx }))
      const newTgtOrd = newTgt.map((i, idx) => ({ ...i, order_index: idx }))
      const all       = [...newSrc, ...newTgtOrd]
      setQItems(prev => {
        const ids = new Set(all.map(u => u.id))
        return [...prev.filter(i => !ids.has(i.id)), ...all]
      })
      for (const u of all) {
        supabase.from('prompt_queue_items').update({ order_index: u.order_index, project: u.project })
          .eq('id', u.id).eq('user_id', user?.id ?? '')
          .then(({ error }) => { if (error) console.error('[queue] move:', error) })
      }
    }
    qDragSrcId.current = null; qDragSrcProject.current = null
  }

  // ── Queue card renderer ───────────────────────────────────────────────────
  function qRenderCard(item: QItem, depth: number): React.ReactNode {
    const isExpanded = qExpandedCards.has(item.id)
    const subs       = depth === 0 ? qGetSubs(item.id) : []
    const num        = qGetNum(item)
    const sc         = Q_STATUS[item.status]
    const isCopied   = qCopiedId === item.id
    const isDragOver = qDragOverId === item.id

    return (
      <div key={item.id} className={depth > 0 ? 'ml-5 mt-1.5' : ''}>
        <div
          draggable={depth === 0}
          onDragStart={depth === 0 ? e => qDragStart(e, item.id, item.project) : undefined}
          onDragOver={depth === 0 ? e => qDragOver(e, item.id) : undefined}
          onDragLeave={depth === 0 ? () => setQDragOverId(null) : undefined}
          onDrop={depth === 0 ? e => qDrop(e, item.id, item.project) : undefined}
          className={`rounded-xl border bg-white/[0.03] transition-all ${
            isDragOver
              ? 'border-white/25 bg-white/6'
              : depth === 0
                ? 'border-white/8 hover:border-white/12 cursor-grab active:cursor-grabbing'
                : 'border-white/5 bg-white/[0.015]'
          }`}
        >
          {/* Header row */}
          <div className="flex items-center gap-2 px-3.5 py-2.5">
            <span className="text-[10px] font-mono text-white/25 shrink-0 w-9 select-none">{num}</span>

            <input
              type="text"
              value={item.title}
              onChange={e => qUpdateItem(item.id, { title: e.target.value })}
              placeholder={depth === 0 ? 'Prompt title…' : 'Sub-prompt…'}
              className="flex-1 min-w-0 bg-transparent text-sm text-white/75 placeholder-white/20 focus:outline-none focus:text-white"
            />

            {/* Status — click to cycle */}
            <button
              onClick={() => qCycleStatus(item.id, item.status)}
              className={`shrink-0 px-2 py-0.5 rounded text-[9px] font-bold tracking-wider border transition-colors ${sc.cls}`}
              title="Click to cycle status"
            >
              {sc.label}
            </button>

            {/* Copy */}
            <button
              onClick={() => qCopy(item)}
              title="Copy prompt to clipboard"
              className={`shrink-0 transition-colors ${isCopied ? 'text-emerald-400' : 'text-white/25 hover:text-white/55'}`}
            >
              {isCopied ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
              )}
            </button>

            {/* Expand */}
            <button onClick={() => qToggleCard(item.id)} className="shrink-0 text-white/25 hover:text-white/55 transition-colors">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                {isExpanded ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
              </svg>
            </button>

            {/* Delete */}
            <button onClick={() => void qDeleteItem(item.id)} className="shrink-0 text-white/15 hover:text-red-400/60 transition-colors">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          {/* Expanded body */}
          {isExpanded && (
            <div className="border-t border-white/5 px-3.5 pb-3.5">
              {/* Prompt textarea */}
              <textarea
                value={item.prompt_text}
                onChange={e => qUpdateItem(item.id, { prompt_text: e.target.value })}
                placeholder="Full prompt text…"
                rows={3}
                className="w-full mt-3 bg-white/[0.04] border border-white/8 rounded-lg px-3 py-2.5 text-sm text-white/65 placeholder-white/18 focus:outline-none focus:border-white/15 resize-none leading-relaxed"
              />

              {/* Collapsible sections */}
              <div className="flex flex-col gap-1.5 mt-3">

                {/* TASKS */}
                <div className="rounded-lg border border-white/6 overflow-hidden">
                  <button
                    onClick={() => qToggleSection(item.id, 'tasks')}
                    className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold tracking-widest text-white/30 uppercase hover:text-white/50 transition-colors"
                  >
                    <span>Tasks{item.tasks.length > 0 && <span className="ml-1.5 text-white/20 normal-case tracking-normal font-mono">{item.tasks.filter(t => t.done).length}/{item.tasks.length}</span>}</span>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      {qSectionOpen(item.id, 'tasks') ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
                    </svg>
                  </button>
                  {qSectionOpen(item.id, 'tasks') && (
                    <div className="px-3 pb-3 flex flex-col gap-1.5">
                      {item.tasks.map(task => (
                        <div key={task.id} className="flex items-center gap-2.5">
                          <input type="checkbox" checked={task.done}
                            onChange={e => qUpdateTask(item.id, task.id, { done: e.target.checked })}
                            className="w-3.5 h-3.5 shrink-0 accent-emerald-500"
                          />
                          <input type="text" value={task.text}
                            onChange={e => qUpdateTask(item.id, task.id, { text: e.target.value })}
                            placeholder="Task…"
                            className={`flex-1 bg-transparent text-sm focus:outline-none placeholder-white/18 ${task.done ? 'line-through text-white/25' : 'text-white/60'}`}
                          />
                          <button onClick={() => qDeleteTask(item.id, task.id)} className="shrink-0 text-white/18 hover:text-red-400/50 transition-colors">
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                      ))}
                      <button onClick={() => qAddTask(item.id)} className="text-[10px] text-white/28 hover:text-white/55 transition-colors text-left mt-0.5">+ Add task</button>
                    </div>
                  )}
                </div>

                {/* NOTES */}
                <div className="rounded-lg border border-white/6 overflow-hidden">
                  <button
                    onClick={() => qToggleSection(item.id, 'notes')}
                    className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold tracking-widest text-white/30 uppercase hover:text-white/50 transition-colors"
                  >
                    <span>Notes</span>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      {qSectionOpen(item.id, 'notes') ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
                    </svg>
                  </button>
                  {qSectionOpen(item.id, 'notes') && (
                    <div className="px-3 pb-3">
                      <textarea value={item.notes} onChange={e => qUpdateItem(item.id, { notes: e.target.value })}
                        placeholder="Notes about this prompt…" rows={2}
                        className="w-full bg-transparent text-sm text-white/55 placeholder-white/18 focus:outline-none resize-none leading-relaxed"
                      />
                    </div>
                  )}
                </div>

                {/* RUN LOG */}
                <div className="rounded-lg border border-white/6 overflow-hidden">
                  <button
                    onClick={() => qToggleSection(item.id, 'run_log')}
                    className="w-full flex items-center justify-between px-3 py-2 text-[10px] font-semibold tracking-widest text-white/30 uppercase hover:text-white/50 transition-colors"
                  >
                    <span>Run Log</span>
                    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      {qSectionOpen(item.id, 'run_log') ? <polyline points="18 15 12 9 6 15"/> : <polyline points="6 9 12 15 18 9"/>}
                    </svg>
                  </button>
                  {qSectionOpen(item.id, 'run_log') && (
                    <div className="px-3 pb-3">
                      <textarea value={item.run_log} onChange={e => qUpdateItem(item.id, { run_log: e.target.value })}
                        placeholder="Paste terminal / AI output here…" rows={5}
                        className="w-full bg-transparent text-[11px] font-mono text-white/50 placeholder-white/18 focus:outline-none resize-y leading-relaxed"
                        style={{ whiteSpace: 'pre', overflowX: 'auto' }}
                      />
                    </div>
                  )}
                </div>

              </div>

              {/* Add sub-prompt (top-level only) */}
              {depth === 0 && (
                <button
                  onClick={() => void qAddItem(item.project, item.id)}
                  className="mt-3 text-[10px] text-white/28 hover:text-white/55 border border-white/6 hover:border-white/12 rounded-lg px-3 py-1.5 transition-colors"
                >
                  + Sub-prompt
                </button>
              )}
            </div>
          )}
        </div>

        {/* Sub-items */}
        {subs.map(sub => qRenderCard(sub, 1))}
      </div>
    )
  }

  // ── Finance state ─────────────────────────────────────────────────────────
  const [fEntries,      setFEntries]     = useState<FEntry[]>([])
  const [fPayments,     setFPayments]    = useState<FPayment[]>([])
  const [fNetWorth,     setFNetWorth]    = useState<FNetWorth[]>([])
  const [fLoaded,       setFLoaded]      = useState(false)
  const [fLoading,      setFLoading]     = useState(false)
  const [fView,         setFView]        = useState<'dashboard' | 'clients' | 'calendar' | 'milestones'>('dashboard')
  const [fNwInput,      setFNwInput]     = useState('')
  const [fNwSaving,     setFNwSaving]    = useState(false)
  const [fShowForm,     setFShowForm]    = useState(false)
  const [fForm,         setFForm]        = useState({
    client_name: '', revenue_type: 'retainer' as FEntryType,
    amount: '', close_date: new Date().toISOString().slice(0, 10), status: 'active' as FEntryStatus,
  })
  const [fSaving,       setFSaving]      = useState(false)
  const [fCalMonth,     setFCalMonth]    = useState(() => new Date().toISOString().slice(0, 7))

  // Lazy-load finance data when tab first opened
  useEffect(() => {
    if (activeTab !== 'finance' || !user || fLoaded) return
    setFLoaded(true)
    setFLoading(true)
    Promise.all([
      supabase.from('finance_entries').select('*').eq('user_id', user.id).order('close_date', { ascending: false }),
      supabase.from('finance_payments').select('*').eq('user_id', user.id).order('payment_date', { ascending: true }),
      supabase.from('finance_networth').select('*').eq('user_id', user.id).order('recorded_date', { ascending: false }).limit(12),
    ]).then(([er, pr, nr]) => {
      setFLoading(false)
      if (!er.error) setFEntries((er.data ?? [] as FEntryRow[]).map(r => (r as FEntryRow) as FEntry))
      if (!pr.error) setFPayments((pr.data ?? [] as FPaymentRow[]).map(r => (r as FPaymentRow) as FPayment))
      if (!nr.error) setFNetWorth((nr.data ?? [] as FNetWorthRow[]).map(r => (r as FNetWorthRow) as FNetWorth))
      if (er.error) console.error('[finance] entries:', er.error)
      if (pr.error) console.error('[finance] payments:', pr.error)
      if (nr.error) console.error('[finance] networth:', nr.error)
    })
  }, [activeTab, user, fLoaded])

  // ── Finance derived ───────────────────────────────────────────────────────
  const fCurrentMonthYM = fCalMonth  // YYYY-MM

  const fThisMonthGross = useMemo(() => {
    const ym = new Date().toISOString().slice(0, 7)
    return fPayments
      .filter(p => p.collected && p.payment_date.slice(0, 7) === ym)
      .reduce((s, p) => s + p.amount, 0)
  }, [fPayments])

  const fPhase: FPhase = fThisMonthGross > 75_000 ? 3 : fThisMonthGross > 25_000 ? 2 : 1
  const fTaxes  = fThisMonthGross * 0.30
  const fNet    = fThisMonthGross * 0.70
  const fPhaseCfg = F_PHASE_CONFIG[fPhase]
  const fSalary = fNet * fPhaseCfg.salaryPct
  const fCapital = fNet * fPhaseCfg.capitalPct

  const fLatestNetWorth = fNetWorth[0]?.amount ?? 0

  // Monthly passive cashflow = sum of active retainer amounts
  const fMonthlyPassive = useMemo(() =>
    fEntries.filter(e => e.revenue_type === 'retainer' && e.status === 'active')
      .reduce((s, e) => s + e.amount, 0),
    [fEntries],
  )

  // Per-client: total collected
  const fClientTotals = useMemo(() => {
    const map = new Map<string, number>()
    for (const p of fPayments.filter(p => p.collected)) {
      map.set(p.entry_id, (map.get(p.entry_id) ?? 0) + p.amount)
    }
    return map
  }, [fPayments])

  // Calendar: payments in selected month
  const fCalPayments = useMemo(() => {
    return fPayments
      .filter(p => p.payment_date.slice(0, 7) === fCurrentMonthYM)
      .sort((a, b) => a.payment_date.localeCompare(b.payment_date))
  }, [fPayments, fCurrentMonthYM])

  // Next payment per entry
  const fNextPayment = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const map   = new Map<string, FPayment>()
    for (const p of fPayments) {
      if (p.payment_date < today || p.collected) continue
      const existing = map.get(p.entry_id)
      if (!existing || p.payment_date < existing.payment_date) map.set(p.entry_id, p)
    }
    return map
  }, [fPayments])

  // ── Finance mutations ─────────────────────────────────────────────────────
  async function fAddEntry() {
    if (!user || fSaving) return
    const amount = parseFloat(fForm.amount)
    if (!fForm.client_name.trim() || !amount || !fForm.close_date) return
    setFSaving(true)

    const { data: entryData, error: entryErr } = await supabase
      .from('finance_entries')
      .insert({
        user_id: user.id, client_name: fForm.client_name.trim(),
        revenue_type: fForm.revenue_type, amount,
        close_date: fForm.close_date, status: fForm.status,
      })
      .select('*').single()

    if (entryErr || !entryData) {
      console.error('[finance] insert entry:', entryErr)
      setFSaving(false)
      return
    }

    const entry = entryData as FEntry
    setFEntries(prev => [entry, ...prev])

    // Generate payment records
    const months = fForm.revenue_type === 'retainer' ? 24 : 1
    const paymentRows = Array.from({ length: months }, (_, i) => ({
      user_id: user.id, entry_id: entry.id,
      payment_date: i === 0 ? fForm.close_date : fNextMonthSameDay(fForm.close_date, i),
      amount, collected: false,
    }))

    const { data: pmtData, error: pmtErr } = await supabase
      .from('finance_payments').insert(paymentRows).select('*')
    if (pmtErr) console.error('[finance] insert payments:', pmtErr)
    if (pmtData) setFPayments(prev => [...prev, ...(pmtData as FPayment[])])

    setFSaving(false)
    setFShowForm(false)
    setFForm({ client_name: '', revenue_type: 'retainer', amount: '', close_date: new Date().toISOString().slice(0, 10), status: 'active' })
  }

  async function fUpdateEntryStatus(id: string, status: FEntryStatus) {
    setFEntries(prev => prev.map(e => e.id === id ? { ...e, status } : e))
    const { error } = await supabase.from('finance_entries').update({ status }).eq('id', id).eq('user_id', user?.id ?? '')
    if (error) console.error('[finance] update status:', error)
  }

  async function fDeleteEntry(id: string) {
    setFEntries(prev => prev.filter(e => e.id !== id))
    setFPayments(prev => prev.filter(p => p.entry_id !== id))
    const { error } = await supabase.from('finance_entries').delete().eq('id', id).eq('user_id', user?.id ?? '')
    if (error) console.error('[finance] delete:', error)
  }

  async function fTogglePayment(paymentId: string, collected: boolean) {
    setFPayments(prev => prev.map(p => p.id === paymentId ? { ...p, collected } : p))
    const { error } = await supabase.from('finance_payments').update({ collected })
      .eq('id', paymentId).eq('user_id', user?.id ?? '')
    if (error) console.error('[finance] toggle payment:', error)
  }

  async function fSaveNetWorth() {
    if (!user || fNwSaving) return
    const amount = parseFloat(fNwInput)
    if (!amount) return
    setFNwSaving(true)
    const recorded_date = new Date().toISOString().slice(0, 10)
    const { data, error } = await supabase.from('finance_networth')
      .insert({ user_id: user.id, amount, recorded_date }).select('*').single()
    setFNwSaving(false)
    if (error) { console.error('[finance] networth:', error); return }
    if (data) {
      setFNetWorth(prev => [data as FNetWorth, ...prev])
      setFNwInput('')
    }
  }

  // ── Shared sub-component ──────────────────────────────────────────────────
  function PctCard({ label, pct }: { label: string; pct: number | null }) {
    return (
      <div className="rounded-lg border border-white/8 bg-white/3 px-3 py-2.5 flex flex-col gap-1.5">
        <span className="text-[9px] text-white/50 uppercase tracking-widest">{label}</span>
        <span className={`text-base font-black tabular-nums leading-none ${
          pct === null ? 'text-white/45' : pct >= 80 ? 'text-emerald-400/80' : pct >= 50 ? 'text-amber-400/80' : 'text-red-400/80'
        }`}>{pct !== null ? `${pct}%` : '—'}</span>
        <div className="h-0.5 bg-white/8 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${
            pct === null ? 'bg-white/12' : pct >= 80 ? 'bg-emerald-500/55' : pct >= 50 ? 'bg-amber-400/55' : 'bg-red-500/55'
          }`} style={{ width: `${pct ?? 0}%` }} />
        </div>
      </div>
    )
  }

  function DefRow({ label, done, target, isTime }: { label: string; done: number; target: number; isTime?: boolean }) {
    const remaining = Math.max(0, target - done)
    const hit = remaining === 0
    const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0
    const doneStr = isTime ? fmtMin(done) : String(done)
    const tgtStr  = isTime ? fmtMin(target) : String(target)
    const remStr  = isTime ? `${fmtMin(remaining)} left` : `${remaining} left`
    return (
      <div className="py-3 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${hit ? 'bg-emerald-500' : 'bg-red-500/60'}`} />
            <span className={`text-sm font-semibold ${hit ? 'text-emerald-400/70' : 'text-white/70'}`}>{label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-white/35">{doneStr} / {tgtStr}</span>
            {hit
              ? <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border border-emerald-500/20 bg-emerald-500/8 text-emerald-400/60">Done</span>
              : <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded border border-red-500/20 bg-red-500/8 text-red-400/65">{remStr}</span>
            }
          </div>
        </div>
        <div className="h-0.5 bg-white/8 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${hit ? 'bg-emerald-500/50' : 'bg-red-500/35'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  function PipeBar({ label, done, target }: { label: string; done: number; target: number }) {
    const pct = target > 0 ? Math.min(100, Math.round((done / target) * 100)) : 0
    const hit = done >= target
    return (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-white/50">{label}</span>
          <span className={`text-xs font-mono tabular-nums ${hit ? 'text-emerald-400/70' : 'text-white/55'}`}>{done.toLocaleString()} / {target.toLocaleString()}</span>
        </div>
        <div className="h-1 bg-white/8 rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${hit ? 'bg-emerald-500/60' : 'bg-emerald-500/30'}`} style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <FlowPageHeader title="Motion" subtitle="Revenue & outreach engine" badge="dominant" />
      <FlowTabs tabs={TABS} active={activeTab} onChange={setActiveTab} accent="emerald" />

      {/* ── OVERVIEW ────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-4">

          {/* Revenue — current month only (stage validation window) */}
          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">This Month's Revenue</span>
              <span className="text-xs text-emerald-400/60 font-mono">{revPct}% of ${STAGE_REVENUE.toLocaleString()}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[9px] text-white/50 uppercase tracking-widest">Revenue</span>
              <span className="text-lg font-bold tabular-nums text-emerald-400">
                ${currentMonthRev.total.toLocaleString()}
              </span>
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500/60 rounded-full transition-all" style={{ width: `${revPct}%` }} />
            </div>
            <span className="text-[9px] text-white/50 text-right">${Math.max(0, STAGE_REVENUE - currentMonthRev.total).toLocaleString()} remaining to $3,000 this month</span>
          </div>

          {/* Revenue History */}
          {revenueHistory.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/55 uppercase tracking-widest font-semibold">Revenue History</span>
                <span className="text-[10px] text-white/50 font-mono tabular-nums">
                  All-time: ${stageTotals.totalRevenue.toLocaleString()}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                {revenueHistory.map(m => {
                  const barPct = revenueHistory[0].rev > 0
                    ? Math.round((m.rev / revenueHistory[0].rev) * 100)
                    : 0
                  return (
                    <div key={m.key} className="flex items-center gap-3">
                      <span className={`text-[10px] w-20 shrink-0 ${m.isCurrent ? 'text-white/55 font-semibold' : 'text-white/55'}`}>
                        {m.label}
                      </span>
                      <div className="flex-1 h-1 bg-white/8 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${m.isCurrent ? 'bg-emerald-500/50' : 'bg-white/20'}`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                      <span className={`text-[10px] font-mono tabular-nums w-16 text-right shrink-0 ${m.isCurrent ? 'text-emerald-400/80 font-bold' : 'text-white/35'}`}>
                        ${m.rev.toLocaleString()}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Motion Stage card */}
          {(() => {
            const stage    = currentMotionStage
            const next     = nextMotionStage
            const progress = motionStageProgress
            return (
              <div className="rounded-xl border border-emerald-500/18 bg-white/5 p-5 flex flex-col gap-3.5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] text-white/55 uppercase tracking-widest font-semibold">
                      Stage {stage.id} · Motion
                    </span>
                    <p className="text-base font-black text-white leading-tight mt-0.5">{stage.name}</p>
                    {next
                      ? <p className="text-xs text-white/35 mt-0.5">Next: {next.name} at ${next.revenueThreshold.toLocaleString()}{next.consistencyMonths > 0 ? `/mo × ${next.consistencyMonths}` : ' total'}</p>
                      : <p className="text-xs text-white/50 mt-0.5">Final stage</p>
                    }
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-emerald-500/25 bg-emerald-500/8 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    <span className="text-[10px] font-bold text-emerald-400">Active</span>
                  </div>
                </div>

                {/* Stage progress */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-baseline text-[10px] font-mono">
                    <span className="text-white/35">{progress.progressLabel}</span>
                    <span className="text-white/45">{progress.contextLabel}</span>
                  </div>
                  <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${progress.pct >= 100 ? 'bg-emerald-500/60' : 'bg-emerald-500/35'}`}
                      style={{ width: `${progress.pct}%` }}
                    />
                  </div>
                  <div className="flex justify-end">
                    <span className={`text-[10px] font-semibold font-mono ${progress.pct >= 100 ? 'text-emerald-400' : 'text-white/50'}`}>
                      {progress.pct}%
                    </span>
                  </div>
                </div>

                {/* Metric statuses */}
                <div className="flex flex-col gap-2 pt-1 border-t border-white/6">
                  <span className="text-[9px] text-white/45 uppercase tracking-widest font-semibold">
                    Metric priority — Stage {stage.id}
                  </span>
                  {/* Service track */}
                  <span className="text-[8px] text-white/42 uppercase tracking-widest">Service</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['emails_sent', 'calls_done', 'meetings_booked', 'meetings_held', 'deals_closed', 'revenue'] as const).map(id => {
                      const st  = motionMetricStatuses[id]
                      const cfg = MOTION_STATUS_CFG[st]
                      // Stage 1: show cumulative numeric progress for required metrics
                      const stage1Num: Partial<Record<typeof id, { value: number; target: number }>> = stage.id === 1 ? {
                        emails_sent:  { value: stageTotals.svc.emails, target: STAGE_SVC_EMAILS },
                        calls_done:   { value: stageTotals.svc.calls,  target: STAGE_SVC_CALLS  },
                        deals_closed: { value: stageTotals.svc.deals,  target: STAGE_SVC_DEALS  },
                      } : {}
                      const num = stage1Num[id]
                      return (
                        <div key={id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${cfg.bg} ${cfg.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                          <div className="flex flex-col leading-none gap-0.5 min-w-0">
                            <span className={`text-[10px] font-semibold truncate ${cfg.text}`}>{MOTION_METRIC_LABELS[id]}</span>
                            {num
                              ? <span className={`text-[9px] font-mono font-bold tabular-nums ${num.value >= num.target ? 'text-emerald-400/80' : cfg.text}`}>
                                  {num.value.toLocaleString()} / {num.target.toLocaleString()}
                                </span>
                              : <span className="text-[8px] text-white/42 uppercase tracking-wide">{cfg.label}</span>
                            }
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })()}

          {/* Today Priority + Next Action */}
          {(() => {
            const p    = autoPriority
            const done = p.complete
            return (
              <div className={`rounded-xl border p-4 flex flex-col gap-3 ${
                done ? 'border-emerald-500/20 bg-emerald-500/4' : 'border-white/10 bg-white/5'
              }`}>
                {/* Header */}
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-white/55 uppercase tracking-widest font-semibold">Today Priority</span>
                  <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full border border-blue-500/15 bg-blue-500/8 text-blue-400/60">Service</span>
                </div>

                {/* Priority metric + progress */}
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-bold ${done ? 'text-emerald-400/80' : 'text-white/85'}`}>{p.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-white/55">{p.done} / {p.target}</span>
                    <span className={`text-xs font-black tabular-nums ${
                      p.pct >= 100 ? 'text-emerald-400/80'
                      : p.pct >= 60 ? 'text-amber-400/75'
                      : 'text-red-400/75'
                    }`}>{p.pct}%</span>
                  </div>
                </div>
                <div className="h-1 bg-white/8 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${
                    p.pct >= 100 ? 'bg-emerald-500/60'
                    : p.pct >= 60 ? 'bg-amber-400/50'
                    : 'bg-red-500/50'
                  }`} style={{ width: `${p.pct}%` }} />
                </div>

                {/* Next Action */}
                <div className="flex items-center gap-2.5 pt-1 border-t border-white/6">
                  <span className="text-[9px] text-white/45 uppercase tracking-widest shrink-0">Next action</span>
                  <span className={`text-xs font-semibold ${done ? 'text-emerald-400/65' : 'text-white/70'}`}>
                    {done ? 'Target met — stay consistent.' : p.nextAction}
                  </span>
                </div>

                {/* Score penalty */}
                {scoreWarning && (
                  <div className="flex items-center gap-1.5 pt-0.5 border-t border-red-500/10">
                    <span className="text-[9px] font-semibold text-red-400/55">Score −50%</span>
                    <span className="text-[9px] text-white/45">·</span>
                    <span className="text-[9px] text-white/55">Priority not yet met</span>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Today's snapshot + deficit */}
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 divide-y divide-white/5">
            <div className="flex items-center justify-between py-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Today's Deficit</span>
                {effectiveTargets.anyAdapted && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded border border-purple-500/20 bg-purple-500/8 text-purple-400/60 font-semibold">Adapted</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-mono tabular-nums font-semibold ${
                  displayScore >= 70 ? 'text-emerald-400/65' : displayScore >= 40 ? 'text-amber-400/65' : 'text-red-400/65'
                }`}>{displayScore}%</span>
                <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full border border-blue-500/15 bg-blue-500/8 text-blue-400/60">Service day</span>
              </div>
            </div>
            <DefRow label="Deep Work" done={todayDwMin} target={effectiveTargets.deepWorkMinPerDay} isTime />
            <DefRow label="Emails" done={todaySvc?.emails ?? 0} target={effectiveTargets.emailsPerDay} />
            <DefRow label="Calls"  done={todaySvc?.calls  ?? 0} target={effectiveTargets.callsPerDay}  />
          </div>

        </div>
      )}

      {/* ── DEEP WORK ───────────────────────────────────────────────────── */}
      {activeTab === 'deep-work' && (
        <div className="flex flex-col gap-4">
          <ExecutionSettingsCard settings={settings} onSave={handleSaveSettings} />

          {ineffectiveWorkFlag && (
            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg border border-amber-500/20 bg-amber-500/6">
              <span className="text-amber-400/60 text-sm shrink-0 mt-px">⚠</span>
              <div>
                <span className="text-xs font-semibold text-amber-400/70">Ineffective work detected</span>
                <p className="text-[10px] text-white/35 mt-0.5 leading-relaxed">High session time logged but output is below 30% of today's targets. Redirect focus toward inputs.</p>
              </div>
            </div>
          )}

          {/* Log session form */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-4">
            <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Log Session</span>


            {/* Deep Work toggle */}
            <button
              onClick={() => setSessionForm(f => ({ ...f, isDeepWork: !f.isDeepWork }))}
              className={`flex items-center justify-between px-3 py-2.5 rounded-lg border text-xs font-semibold transition-colors ${
                sessionForm.isDeepWork
                  ? 'border-blue-500/30 bg-blue-500/10 text-blue-400'
                  : 'border-white/10 bg-white/3 text-white/35 hover:text-white/55'
              }`}>
              <span>Deep Work</span>
              <span className={`w-3.5 h-3.5 rounded-full border-2 transition-colors ${
                sessionForm.isDeepWork ? 'bg-blue-400 border-blue-400' : 'border-white/25 bg-transparent'
              }`} />
            </button>

            <div className="flex flex-col gap-2">
              <span className="text-[10px] text-white/55 uppercase tracking-widest">Category</span>
              <div className="flex flex-wrap gap-2">
                {SVC_CATS.map(c => (
                  <button key={c} onClick={() => setSessionForm(f => ({ ...f, category: c }))}
                    className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors ${
                      sessionForm.category === c ? 'border-emerald-500/30 bg-emerald-500/12 text-emerald-400' : 'border-white/10 text-white/35 hover:text-white/55 bg-white/3'
                    }`}>{CAT_LABEL[c]}</button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[10px] text-white/55 uppercase tracking-widest">Duration</span>
              <div className="flex gap-2">
                {[15, 30, 45, 60, 90].map(m => (
                  <button key={m} onClick={() => setSessionForm(f => ({ ...f, minutes: m }))}
                    className={`flex-1 py-2 rounded-lg border text-xs font-semibold transition-colors ${
                      sessionForm.minutes === m ? 'border-emerald-500/30 bg-emerald-500/12 text-emerald-400' : 'border-white/8 text-white/55 hover:text-white/50 bg-white/3'
                    }`}>{m}m</button>
                ))}
              </div>
              <input type="number" min={1} max={480} value={sessionForm.minutes}
                onChange={e => setSessionForm(f => ({ ...f, minutes: Math.max(1, parseInt(e.target.value) || 1) }))}
                className="w-24 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-white/20 transition-colors"
                placeholder="min" />
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-[10px] text-white/55 uppercase tracking-widest">Note (optional)</span>
              <input type="text" value={sessionForm.note}
                onChange={e => setSessionForm(f => ({ ...f, note: e.target.value }))}
                placeholder="What did you work on?"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20 transition-colors" />
            </div>

            <button onClick={logSession}
              className="w-full py-2.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 text-sm font-semibold hover:bg-emerald-500/18 transition-colors">
              Log Session — {fmtMin(sessionForm.minutes)}
            </button>
          </div>

          {/* Today's sessions */}
          {todaySessions.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 divide-y divide-white/5">
              <div className="flex items-center justify-between py-3">
                <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Today</span>
                <span className="text-xs font-mono text-white/55">{fmtMin(todayDwMin)} total</span>
              </div>
              {todaySessions.map(s => (
                <div key={s.id} className="flex items-center gap-3 py-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-white/65 capitalize">{s.type}</span>
                      <span className="text-[9px] text-white/50">·</span>
                      <span className="text-xs text-white/40">{CAT_LABEL[s.category]}</span>
                      {s.isDeepWork && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded border border-blue-500/25 bg-blue-500/8 text-blue-400/70 font-semibold">DW</span>
                      )}
                    </div>
                    {s.note && <p className="text-[10px] text-white/50 mt-0.5 truncate">{s.note}</p>}
                  </div>
                  <span className="text-xs font-mono text-white/45 shrink-0">{fmtMin(s.minutes)}</span>
                </div>
              ))}
            </div>
          )}

          {/* History */}
          {sessionHistory.length > 0 && (
            <div className="flex flex-col gap-3">
              <span className="text-[10px] text-white/50 uppercase tracking-widest font-semibold px-1">History</span>
              {sessionHistory.slice(0, 7).map(group => (
                <div key={group.date} className="rounded-xl border border-white/8 bg-white/3 px-4 divide-y divide-white/4">
                  <div className="flex items-center justify-between py-2.5">
                    <span className="text-[10px] text-white/35 font-semibold">{group.label}</span>
                    <span className="text-[10px] font-mono text-white/50">{fmtMin(group.items.reduce((s, r) => s + r.minutes, 0))}</span>
                  </div>
                  {group.items.map(s => (
                    <div key={s.id} className="flex items-center gap-3 py-2.5">
                      <span className="text-xs text-white/45 capitalize">{s.type}</span>
                      <span className="text-[9px] text-white/45">·</span>
                      <span className="text-[10px] text-white/55">{CAT_LABEL[s.category]}</span>
                      {s.isDeepWork && (
                        <span className="text-[9px] px-1 py-px rounded border border-blue-500/20 bg-blue-500/6 text-blue-400/60 font-semibold">DW</span>
                      )}
                      {s.note && <span className="text-[10px] text-white/45 flex-1 truncate">{s.note}</span>}
                      <span className="text-[10px] font-mono text-white/35 ml-auto shrink-0">{fmtMin(s.minutes)}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── PIPELINE ────────────────────────────────────────────────────── */}
      {activeTab === 'pipeline' && (
        <div className="flex flex-col gap-4">

          {/* ── SERVICE PIPELINE ── */}
          {(() => {
            return (
            <div className="flex flex-col gap-4">

              {/* Inputs */}
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 divide-y divide-white/5">
                <div className="py-3"><span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Inputs</span></div>
                {([
                  { label: 'Emails sent', done: todaySvc?.emails ?? 0, target: effectiveTargets.emailsPerDay, field: 'emails' as const },
                  { label: 'Calls made',  done: todaySvc?.calls  ?? 0, target: effectiveTargets.callsPerDay,  field: 'calls'  as const },
                ] as const).map(row => {
                  const hit      = row.done >= row.target
                  const isPrior  = todayPriority?.field === row.field
                  return (
                    <div key={row.label} className={`flex items-center gap-3 py-3.5 ${isPrior ? '-mx-4 px-4 bg-amber-500/6 border-l-2 border-amber-400/40' : ''}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${hit ? 'bg-emerald-500' : row.done > 0 ? 'bg-amber-400/60' : 'bg-white/15'}`} />
                      <div className="flex-1 flex items-center gap-2">
                        <span className={`text-sm font-semibold ${hit ? 'text-emerald-400/70' : 'text-white/70'}`}>{row.label}</span>
                        <span className="text-[9px] text-white/45">target {row.target}</span>
                        {isPrior && <span className="text-[9px] px-1.5 py-0.5 rounded border border-amber-500/25 bg-amber-500/10 text-amber-400/70 font-semibold">Priority</span>}
                      </div>
                      <span className={`text-sm font-bold tabular-nums ${hit ? 'text-emerald-400/70' : row.done > 0 ? 'text-white/55' : 'text-white/50'}`}>
                        {row.done}/{row.target}
                      </span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => logSvc(row.field, -1)} disabled={row.done <= 0}
                          className="px-2.5 py-1.5 rounded-lg border border-white/12 text-white/35 bg-white/4 text-xs font-semibold hover:bg-white/8 disabled:opacity-30 transition-colors">
                          −1
                        </button>
                        <button onClick={() => logSvc(row.field)}
                          className="px-2.5 py-1.5 rounded-lg border border-emerald-500/25 text-emerald-400/70 bg-emerald-500/8 text-xs font-semibold hover:bg-emerald-500/15 transition-colors">
                          +1
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Flow */}
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 divide-y divide-white/5">
                <div className="py-3"><span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Flow</span></div>
                {([
                  { label: 'Meetings booked', done: todaySvc?.meetingsBooked ?? 0, field: 'meetingsBooked' as const },
                  { label: 'Meetings held',   done: todaySvc?.meetingsHeld   ?? 0, field: 'meetingsHeld'   as const },
                  { label: 'Deals closed',    done: todaySvc?.deals           ?? 0, field: 'deals'          as const },
                ] as const).map(row => {
                  const isPrior = todayPriority?.field === row.field
                  return (
                    <div key={row.label} className={`flex items-center gap-3 py-3.5 ${isPrior ? '-mx-4 px-4 bg-amber-500/6 border-l-2 border-amber-400/40' : ''}`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${row.done > 0 ? 'bg-emerald-500' : 'bg-white/15'}`} />
                      <div className="flex-1 flex items-center gap-2">
                        <span className={`text-sm font-semibold ${row.done > 0 ? 'text-emerald-400/70' : 'text-white/70'}`}>{row.label}</span>
                        {isPrior && <span className="text-[9px] px-1.5 py-0.5 rounded border border-amber-500/25 bg-amber-500/10 text-amber-400/70 font-semibold">Priority</span>}
                      </div>
                      <span className={`text-sm font-bold tabular-nums ${row.done > 0 ? 'text-emerald-400/70' : 'text-white/50'}`}>{row.done}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button onClick={() => logSvc(row.field, -1)} disabled={row.done <= 0}
                          className="px-2.5 py-1.5 rounded-lg border border-white/12 text-white/35 bg-white/4 text-xs font-semibold hover:bg-white/8 disabled:opacity-30 transition-colors">
                          −1
                        </button>
                        <button onClick={() => logSvc(row.field)}
                          className="px-2.5 py-1.5 rounded-lg border border-emerald-500/25 text-emerald-400/70 bg-emerald-500/8 text-xs font-semibold hover:bg-emerald-500/15 transition-colors">
                          +1
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Revenue */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
                <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Revenue</span>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-white/8 bg-white/3 px-3 py-2.5 flex flex-col gap-0.5">
                    <span className="text-[9px] text-white/50 uppercase tracking-widest">Today</span>
                    <span className="text-lg font-bold text-emerald-400">${(todaySvc?.revenue ?? 0).toLocaleString()}</span>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-white/3 px-3 py-2.5 flex flex-col gap-0.5">
                    <span className="text-[9px] text-white/50 uppercase tracking-widest">Cumulative</span>
                    <span className="text-lg font-bold text-white/55">${stageTotals.svc.revenue.toLocaleString()}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input type="number" step={0.01} value={svcRevInput}
                    onChange={e => setSvcRevInput(e.target.value)} placeholder="Amount ($)"
                    className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20 transition-colors" />
                  <button onClick={logSvcRevenue}
                    className="px-3 py-2 rounded-lg border border-emerald-500/25 bg-emerald-500/8 text-emerald-400/70 text-sm font-semibold hover:bg-emerald-500/15 transition-colors shrink-0">
                    +Add
                  </button>
                  <button
                    onClick={() => {
                      const n = parseFloat(svcRevInput)
                      if (isNaN(n) || n < 0) return
                      logSvc('revenue', n - (todaySvc?.revenue ?? 0))
                      setSvcRevInput('')
                    }}
                    className="px-3 py-2 rounded-lg border border-white/12 bg-white/4 text-white/40 text-sm font-semibold hover:bg-white/8 transition-colors shrink-0">
                    Set
                  </button>
                </div>
              </div>

              {/* Conversions */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
                <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Conversion (this week)</span>
                <div className="flex flex-col gap-2">
                  {[
                    { label: 'Email + Call → Meeting booked', pct: weeklyData.emailCallToMtg, a: weeklyData.svc.meetingsBooked, b: weeklyData.svc.emails + weeklyData.svc.calls },
                    { label: 'Meeting booked → Meeting held', pct: weeklyData.mtgBookedHeld,  a: weeklyData.svc.meetingsHeld,   b: weeklyData.svc.meetingsBooked               },
                    { label: 'Meeting held → Deal closed',    pct: weeklyData.mtgHeldDeal,    a: weeklyData.svc.deals,           b: weeklyData.svc.meetingsHeld                 },
                  ].map(c => (
                    <div key={c.label} className="flex items-center justify-between px-3 py-2.5 rounded-lg border border-white/8 bg-white/3">
                      <div>
                        <span className="text-xs text-white/50">{c.label}</span>
                        <span className="text-[9px] text-white/45 ml-2">{c.a} / {c.b}</span>
                      </div>
                      <span className={`text-sm font-black tabular-nums ml-3 shrink-0 ${
                        c.pct === null ? 'text-white/45' : c.pct >= 20 ? 'text-emerald-400' : c.pct >= 10 ? 'text-amber-400' : 'text-red-400'
                      }`}>{c.pct !== null ? `${c.pct}%` : '—'}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stage progress */}
              <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-4">
                <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Stage Progress</span>
                <PipeBar label="Emails" done={stageTotals.svc.emails} target={STAGE_SVC_EMAILS} />
                <PipeBar label="Calls"  done={stageTotals.svc.calls}  target={STAGE_SVC_CALLS}  />
                <PipeBar label="Deals"  done={stageTotals.svc.deals}  target={STAGE_SVC_DEALS}  />
              </div>
            </div>
            )
          })()}

        </div>
      )}

      {/* ── FEEDBACK ────────────────────────────────────────────────────── */}
      {activeTab === 'feedback' && (
        <div className="flex flex-col gap-4">

          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Weekly Summary</span>
            <span className="text-[10px] text-white/45 font-mono">{weekDays[0]?.iso} → {weekDays[6]?.iso}</span>
          </div>

          {/* Stage 1 Evidence — cumulative all-time progress toward Self-Control requirements */}
          {currentMotionStage.id === 1 && (
            <div className="rounded-xl border border-emerald-500/15 bg-white/5 p-4 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-white/55 uppercase tracking-widest font-semibold">Stage 1 Evidence</span>
                <span className="text-[9px] text-white/42">cumulative all-time</span>
              </div>
              <div className="flex flex-col gap-2">
                {[
                  { label: 'Emails sent',  value: stageTotals.svc.emails, target: STAGE_SVC_EMAILS },
                  { label: 'Calls done',   value: stageTotals.svc.calls,  target: STAGE_SVC_CALLS  },
                  { label: 'Deals closed', value: stageTotals.svc.deals,  target: STAGE_SVC_DEALS  },
                  { label: 'Revenue (this month)', value: currentMonthRev.total, target: STAGE_REVENUE, isCurrency: true },
                ].map(item => {
                  const pct = Math.min(100, Math.round((item.value / item.target) * 100))
                  const met = item.value >= item.target
                  const valStr = 'isCurrency' in item && item.isCurrency ? `$${item.value.toLocaleString()}` : item.value.toLocaleString()
                  const tgtStr = 'isCurrency' in item && item.isCurrency ? `$${item.target.toLocaleString()}` : item.target.toLocaleString()
                  return (
                    <div key={item.label} className="flex flex-col gap-1">
                      <div className="flex justify-between items-baseline">
                        <span className="text-[10px] text-white/40">{item.label}</span>
                        <span className={`text-[10px] font-mono font-bold tabular-nums ${met ? 'text-emerald-400/80' : 'text-white/40'}`}>
                          {valStr} / {tgtStr}{met ? ' ✓' : ''}
                        </span>
                      </div>
                      <div className="h-1 bg-white/8 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${met ? 'bg-emerald-500/55' : 'bg-emerald-500/30'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
            <span className="text-[10px] text-white/55 uppercase tracking-widest font-semibold">Totals</span>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Emails',    value: String(weeklyData.svc.emails)               },
                { label: 'Calls',     value: String(weeklyData.svc.calls)                },
                { label: 'Mtg Bkd',  value: String(weeklyData.svc.meetingsBooked)        },
                { label: 'Mtg Held', value: String(weeklyData.svc.meetingsHeld)          },
                { label: 'Deals',    value: String(weeklyData.svc.deals)                 },
                { label: 'Svc Rev',  value: `$${weeklyData.svc.revenue.toLocaleString()}` },
                { label: 'Deep Wk',  value: fmtMin(weeklyData.dwMin)                    },
              ].map(item => (
                <div key={item.label} className="rounded-lg border border-white/8 bg-white/3 px-2.5 py-2 flex flex-col gap-0.5">
                  <span className="text-[9px] text-white/50 uppercase tracking-widest">{item.label}</span>
                  <span className="text-sm font-bold text-white/60 tabular-nums">{item.value || '0'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Conversions */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-2">
            <span className="text-[10px] text-white/55 uppercase tracking-widest font-semibold mb-1">Conversion</span>
            {[
              { label: 'Email + Call → Meeting booked', pct: weeklyData.emailCallToMtg, a: weeklyData.svc.meetingsBooked, b: weeklyData.svc.emails + weeklyData.svc.calls },
              { label: 'Meeting booked → Meeting held', pct: weeklyData.mtgBookedHeld,  a: weeklyData.svc.meetingsHeld,   b: weeklyData.svc.meetingsBooked               },
              { label: 'Meeting held → Deal',           pct: weeklyData.mtgHeldDeal,    a: weeklyData.svc.deals,           b: weeklyData.svc.meetingsHeld                 },
            ].map(c => (
              <div key={c.label} className="flex items-center justify-between px-3 py-2 rounded-lg border border-white/8 bg-white/3">
                <div>
                  <span className="text-[10px] text-white/45">{c.label}</span>
                  <span className="text-[9px] text-white/42 ml-2">{c.a} / {c.b}</span>
                </div>
                <span className={`text-sm font-black tabular-nums ml-3 shrink-0 ${
                  c.pct === null ? 'text-white/45' : c.pct >= 20 ? 'text-emerald-400/80' : c.pct >= 10 ? 'text-amber-400/80' : 'text-red-400/80'
                }`}>{c.pct !== null ? `${c.pct}%` : '—'}</span>
              </div>
            ))}
          </div>

          {/* Daily target completion */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
            <span className="text-[10px] text-white/55 uppercase tracking-widest font-semibold">Daily Target Completion</span>
            <div className="grid grid-cols-2 gap-2">
              <PctCard label="Emails (wkdays)"   pct={weeklyData.emailsPct}   />
              <PctCard label="Calls (wkdays)"    pct={weeklyData.callsPct}    />
              <PctCard label="Deals (wkdays)"    pct={weeklyData.dealsPct}    />
              <PctCard label="Deep Work (daily)" pct={weeklyData.dwPct}       />
            </div>
          </div>

          {/* Weakest area (raw — all metrics) */}
          {weeklyData.weakest && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/15 bg-amber-500/4">
              <span className="text-[9px] text-white/50 uppercase tracking-widest shrink-0">Weakest area</span>
              <span className="text-xs text-amber-400/70 font-semibold">{weeklyData.weakest.label}</span>
              <span className="ml-auto text-[10px] text-amber-400/45 font-mono">{weeklyData.weakest.pct}%</span>
            </div>
          )}

          {/* Stage-aware priority focus (required + focus only) */}
          {motionWeakestArea && motionWeakestArea.score < 100 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/15 bg-red-500/4">
              <span className="text-[9px] text-white/50 uppercase tracking-widest shrink-0">Priority focus</span>
              <span className="text-xs text-red-400/70 font-semibold">{motionWeakestArea.label}</span>
              <span className="text-[9px] text-white/42 ml-1 capitalize shrink-0">({motionWeakestArea.status})</span>
              <span className="ml-auto text-[10px] text-red-400/45 font-mono">{motionWeakestArea.score}%</span>
            </div>
          )}

          {/* Outreach / deal-flow warnings */}
          {motionWarnings.length > 0 && (
            <div className="flex flex-col gap-1 px-3 py-2.5 rounded-lg border border-amber-500/15 bg-amber-500/4">
              <span className="text-[9px] text-amber-400/60 uppercase tracking-widest font-semibold mb-0.5">Warnings</span>
              {motionWarnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-amber-400/40 text-[10px] shrink-0">·</span>
                  <span className="text-[10px] text-white/40">{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Missed days */}
          {weeklyData.missed.length > 0 ? (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-2">
              <span className="text-[9px] text-white/50 uppercase tracking-widest mb-0.5">Missed days</span>
              {weeklyData.missed.map((item, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="text-red-400/45 text-[10px] mt-px shrink-0">·</span>
                  <span className="text-[10px] text-white/35">{item}</span>
                </div>
              ))}
            </div>
          ) : weeklyData.emailsPct !== null ? (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/15 bg-emerald-500/4">
              <span className="text-[10px] text-emerald-400/65">✓ No missed days this week</span>
            </div>
          ) : (
            <p className="text-[10px] text-white/45 italic">No completed days yet this week.</p>
          )}

          {/* Past 4 weeks history */}
          {weeklyHistory.some(w => w.hasData) && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-3">
              <span className="text-[10px] text-white/55 uppercase tracking-widest font-semibold">Past Weeks</span>
              <div className="flex flex-col gap-2">
                {weeklyHistory.filter(w => w.hasData).map(w => (
                  <div key={w.weekStart} className="flex flex-col gap-1.5 px-3 py-2.5 rounded-lg border border-white/8 bg-white/3">
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-mono text-white/55">{w.weekStart} → {w.weekEnd}</span>
                      <span className={`text-[10px] font-bold font-mono tabular-nums ${w.totalRev > 0 ? 'text-emerald-400/70' : 'text-white/50'}`}>
                        ${w.totalRev.toLocaleString()}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {[
                        { label: 'Emails', value: w.svc.emails },
                        { label: 'Calls',  value: w.svc.calls  },
                        { label: 'Deals',  value: w.svc.deals  },
                      ].map(item => (
                        <div key={item.label} className="flex flex-col gap-0.5">
                          <span className="text-[8px] text-white/45 uppercase tracking-widest">{item.label}</span>
                          <span className="text-xs font-bold text-white/45 tabular-nums">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[9px] text-white/40 italic">Service + Deep Work metrics · Today excluded · Week = Sun–Sat</p>
        </div>
      )}

      {/* ── QUEUE ────────────────────────────────────────────────────────── */}
      {activeTab === 'queue' && (
        <div className="flex flex-col gap-4">

          {qLoading && (
            <p className="text-xs text-white/30 italic">Loading queue…</p>
          )}

          {/* Empty state */}
          {!qLoading && qProjects.size === 0 && (
            <div className="rounded-xl border border-white/8 bg-white/[0.03] p-10 flex flex-col items-center gap-4">
              <p className="text-sm text-white/35">Queue is empty.</p>
              <button
                onClick={() => void qAddItem('Reviany')}
                className="px-4 py-2 rounded-lg border border-white/12 text-sm font-semibold text-white/50 hover:bg-white/6 hover:text-white/75 transition-colors"
              >
                + New Prompt
              </button>
            </div>
          )}

          {/* Project folders */}
          {[...qProjects.entries()].map(([project, projItems]) => {
            const isCollapsed = qCollapsedFolders.has(project)
            const doneCount   = projItems.filter(i => i.status === 'done').length
            return (
              <div key={project} className="flex flex-col gap-2">
                {/* Folder header */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setQCollapsedFolders(prev => {
                      const next = new Set(prev)
                      if (next.has(project)) next.delete(project); else next.add(project)
                      return next
                    })}
                    className="flex items-center gap-2 flex-1 min-w-0 group"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/25 shrink-0 group-hover:text-white/45 transition-colors">
                      {isCollapsed ? <polyline points="9 18 15 12 9 6"/> : <polyline points="6 9 12 15 18 9"/>}
                    </svg>
                    <span className="text-xs font-semibold text-white/50 group-hover:text-white/70 transition-colors truncate">{project}</span>
                    <span className="text-[10px] text-white/22 font-mono shrink-0">{doneCount}/{projItems.length}</span>
                  </button>
                  <button
                    onClick={() => void qAddItem(project)}
                    className="shrink-0 text-[10px] text-white/28 hover:text-white/55 border border-white/6 hover:border-white/14 rounded-lg px-2.5 py-1 transition-colors"
                  >
                    + Prompt
                  </button>
                </div>

                {/* Cards */}
                {!isCollapsed && (
                  <div className="flex flex-col gap-2 pl-4 border-l border-white/5">
                    {projItems.map(item => qRenderCard(item, 0))}
                  </div>
                )}
              </div>
            )
          })}

          {/* Footer actions */}
          <div className="flex items-center gap-2 pt-1">
            {qShowNewFolder ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={qNewFolderName}
                  onChange={e => setQNewFolderName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') qAddFolder(qNewFolderName)
                    if (e.key === 'Escape') { setQShowNewFolder(false); setQNewFolderName('') }
                  }}
                  placeholder="Folder name…"
                  autoFocus
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20 w-44"
                />
                <button onClick={() => qAddFolder(qNewFolderName)} className="text-xs text-white/55 hover:text-white transition-colors font-semibold">Add</button>
                <button onClick={() => { setQShowNewFolder(false); setQNewFolderName('') }} className="text-xs text-white/30 hover:text-white/55 transition-colors">Cancel</button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => setQShowNewFolder(true)}
                  className="text-[11px] text-white/28 hover:text-white/55 border border-white/6 hover:border-white/12 rounded-lg px-3 py-1.5 transition-colors"
                >
                  + New Folder
                </button>
                {qProjects.size > 0 && (
                  <button
                    onClick={() => void qAddItem([...qProjects.keys()][qProjects.size - 1])}
                    className="text-[11px] text-white/28 hover:text-white/55 border border-white/6 hover:border-white/12 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    + Prompt
                  </button>
                )}
              </>
            )}
          </div>

        </div>
      )}

      {/* ── FINANCE ─────────────────────────────────────────────────────── */}
      {activeTab === 'finance' && (
        <div className="flex flex-col gap-5">

          {fLoading && <p className="text-xs text-white/30 italic">Loading…</p>}

          {/* ── Sub-nav ── */}
          <div className="flex items-center gap-1 flex-wrap">
            {(['dashboard', 'clients', 'calendar', 'milestones'] as const).map(v => (
              <button key={v} onClick={() => setFView(v)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors ${
                  fView === v ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/60 hover:bg-white/5'
                }`}
              >{v}</button>
            ))}
            <button onClick={() => setFShowForm(v => !v)}
              className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-white/50 hover:bg-white/8 hover:text-white/80 transition-colors"
            >+ Client</button>
          </div>

          {/* ── Add client form ── */}
          {fShowForm && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 flex flex-col gap-4">
              <span className="text-[10px] font-semibold tracking-widest text-white/35 uppercase">New Client / Revenue Entry</span>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1 col-span-2 sm:col-span-1">
                  <span className="text-[10px] text-white/45">Client name</span>
                  <input type="text" value={fForm.client_name}
                    onChange={e => setFForm(f => ({ ...f, client_name: e.target.value }))}
                    placeholder="Acme Corp"
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-white/45">Type</span>
                  <select value={fForm.revenue_type}
                    onChange={e => setFForm(f => ({ ...f, revenue_type: e.target.value as FEntryType }))}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20"
                  >
                    <option value="retainer">Monthly Retainer</option>
                    <option value="setup">Setup Fee</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-white/45">Amount ($)</span>
                  <input type="number" value={fForm.amount} min="0" step="0.01"
                    onChange={e => setFForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="2500"
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-white/45">Close / first payment date</span>
                  <input type="date" value={fForm.close_date}
                    onChange={e => setFForm(f => ({ ...f, close_date: e.target.value }))}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] text-white/45">Status</span>
                  <select value={fForm.status}
                    onChange={e => setFForm(f => ({ ...f, status: e.target.value as FEntryStatus }))}
                    className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-white/20"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="churned">Churned</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => void fAddEntry()} disabled={fSaving || !fForm.client_name.trim() || !fForm.amount}
                  className="px-4 py-2 rounded-lg border border-white/12 text-sm font-semibold text-white/55 hover:bg-white/8 hover:text-white/80 disabled:opacity-40 transition-colors"
                >{fSaving ? 'Saving…' : 'Add Entry'}</button>
                <button onClick={() => setFShowForm(false)} className="text-xs text-white/30 hover:text-white/55 transition-colors">Cancel</button>
                {fForm.revenue_type === 'retainer' && (
                  <span className="text-[10px] text-white/30 italic ml-2">Generates 24 monthly payment records</span>
                )}
              </div>
            </div>
          )}

          {/* ── DASHBOARD ── */}
          {fView === 'dashboard' && (
            <div className="flex flex-col gap-4">

              {/* Gross / Taxes / Net */}
              <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold tracking-widest text-white/35 uppercase">This Month — Gross Revenue</span>
                  <span className={`text-[10px] font-bold tracking-wider px-2 py-0.5 rounded border ${
                    fPhase === 3 ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' :
                    fPhase === 2 ? 'border-blue-500/30 text-blue-400 bg-blue-500/10' :
                    'border-white/10 text-white/40 bg-white/5'
                  }`}>{fPhaseCfg.label}</span>
                </div>

                <div className="text-3xl font-black text-white tabular-nums">{fmtMoney(fThisMonthGross)}</div>

                {/* Tax / Net split */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-lg border border-white/8 bg-white/3 px-4 py-3">
                    <span className="text-[10px] text-white/40 uppercase tracking-widest">Taxes (30%)</span>
                    <p className="text-lg font-bold text-red-400/80 tabular-nums mt-1">{fmtMoney(fTaxes)}</p>
                  </div>
                  <div className="rounded-lg border border-white/8 bg-white/3 px-4 py-3">
                    <span className="text-[10px] text-white/40 uppercase tracking-widest">Net exploitable (70%)</span>
                    <p className="text-lg font-bold text-emerald-400/80 tabular-nums mt-1">{fmtMoney(fNet)}</p>
                  </div>
                </div>

                {/* Phase allocation */}
                <div className="rounded-lg border border-white/6 bg-white/[0.02] p-4 flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-white/40 uppercase tracking-widest">Personal salary ({Math.round(fPhaseCfg.salaryPct * 100)}%)</span>
                      <p className="text-base font-bold text-white/70 tabular-nums mt-1">{fmtMoney(fSalary)}</p>
                    </div>
                    <div>
                      <span className="text-[10px] text-white/40 uppercase tracking-widest">Capital ({Math.round(fPhaseCfg.capitalPct * 100)}%)</span>
                      <p className="text-base font-bold text-white/70 tabular-nums mt-1">{fmtMoney(fCapital)}</p>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5 pt-2 border-t border-white/5">
                    <span className="text-[10px] text-white/30 uppercase tracking-widest mb-1">Capital allocation</span>
                    {fPhaseCfg.splits.map(s => {
                      const amt = fCapital * s.pct
                      const pct = Math.round(s.pct * 100)
                      return (
                        <div key={s.label} className="flex items-center justify-between">
                          <span className="text-xs text-white/50">{s.label} <span className="text-white/25">({pct}%)</span></span>
                          <span className="text-xs font-mono font-semibold text-white/65 tabular-nums">{fmtMoney(amt)}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>

              {/* Net worth input + passive cashflow */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4 flex flex-col gap-2">
                  <span className="text-[10px] text-white/35 uppercase tracking-widest">Current Net Worth</span>
                  <p className="text-2xl font-black text-white/80 tabular-nums">{fmtMoney(fLatestNetWorth)}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <input type="number" value={fNwInput} onChange={e => setFNwInput(e.target.value)}
                      placeholder="Enter amount"
                      className="flex-1 min-w-0 bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-white/20"
                    />
                    <button onClick={() => void fSaveNetWorth()} disabled={fNwSaving || !fNwInput}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border border-white/10 text-white/50 hover:bg-white/8 disabled:opacity-40 transition-colors"
                    >{fNwSaving ? '…' : 'Update'}</button>
                  </div>
                </div>
                <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4 flex flex-col gap-2">
                  <span className="text-[10px] text-white/35 uppercase tracking-widest">Monthly Passive Cashflow</span>
                  <p className="text-2xl font-black text-emerald-400/80 tabular-nums">{fmtMoney(fMonthlyPassive)}</p>
                  <span className="text-[10px] text-white/28">Active retainers only</span>
                </div>
              </div>

            </div>
          )}

          {/* ── CLIENTS ── */}
          {fView === 'clients' && (
            <div className="flex flex-col gap-3">
              {fEntries.length === 0 && !fLoading && (
                <p className="text-sm text-white/30 italic">No clients yet. Click "+ Client" to add one.</p>
              )}
              {fEntries.map(entry => {
                const next  = fNextPayment.get(entry.id)
                const total = fClientTotals.get(entry.id) ?? 0
                const statusCls = entry.status === 'active'
                  ? 'border-emerald-500/25 text-emerald-400/80 bg-emerald-500/8'
                  : entry.status === 'paused'
                    ? 'border-amber-500/25 text-amber-400/80 bg-amber-500/8'
                    : 'border-white/10 text-white/35 bg-white/5'
                return (
                  <div key={entry.id} className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3.5 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white/80 truncate">{entry.client_name}</p>
                        <p className="text-[10px] text-white/35 mt-0.5">
                          {entry.revenue_type === 'retainer' ? 'Monthly Retainer' : 'Setup Fee'} · Closed {fmtDate(entry.close_date)}
                        </p>
                      </div>
                      <span className="text-lg font-black text-white/70 tabular-nums shrink-0">{fmtMoney(entry.amount)}</span>
                      <span className={`text-[9px] font-bold tracking-wider px-2 py-0.5 rounded border capitalize shrink-0 ${statusCls}`}>{entry.status}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg border border-white/5 bg-white/[0.02] py-2">
                        <p className="text-[9px] text-white/30 uppercase tracking-widest">Total collected</p>
                        <p className="text-sm font-bold text-emerald-400/70 tabular-nums mt-0.5">{fmtMoney(total)}</p>
                      </div>
                      <div className="rounded-lg border border-white/5 bg-white/[0.02] py-2">
                        <p className="text-[9px] text-white/30 uppercase tracking-widest">Next payment</p>
                        <p className="text-sm font-bold text-white/55 tabular-nums mt-0.5">
                          {next ? fmtDate(next.payment_date) : '—'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-white/5 bg-white/[0.02] py-2">
                        <p className="text-[9px] text-white/30 uppercase tracking-widest">Type</p>
                        <p className="text-sm font-bold text-white/55 mt-0.5">{entry.revenue_type === 'retainer' ? 'Retainer' : 'Setup'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {(['active', 'paused', 'churned'] as FEntryStatus[]).map(s => (
                        <button key={s} onClick={() => void fUpdateEntryStatus(entry.id, s)}
                          disabled={entry.status === s}
                          className={`text-[10px] px-2.5 py-1 rounded-lg border capitalize transition-colors ${
                            entry.status === s
                              ? 'border-white/12 text-white/50 bg-white/6'
                              : 'border-white/6 text-white/28 hover:text-white/55 hover:border-white/12'
                          }`}
                        >{s}</button>
                      ))}
                      <button onClick={() => void fDeleteEntry(entry.id)}
                        className="ml-auto text-[10px] text-white/20 hover:text-red-400/60 transition-colors"
                      >Remove</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── CALENDAR ── */}
          {fView === 'calendar' && (
            <div className="flex flex-col gap-4">
              {/* Month nav */}
              <div className="flex items-center gap-3">
                <button onClick={() => setFCalMonth(m => {
                  const d = new Date(m + '-01'); d.setMonth(d.getMonth() - 1)
                  return d.toISOString().slice(0, 7)
                })} className="text-white/40 hover:text-white/70 transition-colors px-2 py-1 rounded-lg border border-white/8 hover:border-white/15 text-sm">‹</button>
                <span className="text-sm font-semibold text-white/70 flex-1 text-center">
                  {new Date(fCalMonth + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
                <button onClick={() => setFCalMonth(m => {
                  const d = new Date(m + '-01'); d.setMonth(d.getMonth() + 1)
                  return d.toISOString().slice(0, 7)
                })} className="text-white/40 hover:text-white/70 transition-colors px-2 py-1 rounded-lg border border-white/8 hover:border-white/15 text-sm">›</button>
              </div>

              {fCalPayments.length === 0 && (
                <p className="text-sm text-white/30 italic">No payments scheduled this month.</p>
              )}

              <div className="flex flex-col gap-2">
                {fCalPayments.map(p => {
                  const entry   = fEntries.find(e => e.id === p.entry_id)
                  const today   = new Date().toISOString().slice(0, 10)
                  const overdue = !p.collected && p.payment_date < today
                  const upcoming = !p.collected && p.payment_date >= today
                  return (
                    <div key={p.id} className={`rounded-xl border px-4 py-3 flex items-center gap-4 transition-colors ${
                      p.collected  ? 'border-emerald-500/20 bg-emerald-500/5' :
                      overdue      ? 'border-red-500/20 bg-red-500/5' :
                      upcoming     ? 'border-amber-500/15 bg-amber-500/5' :
                      'border-white/8 bg-white/[0.02]'
                    }`}>
                      <div className="flex flex-col items-center shrink-0 w-10">
                        <span className="text-[10px] text-white/30">{new Date(p.payment_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</span>
                        <span className="text-xl font-black text-white/65 leading-none">{new Date(p.payment_date + 'T00:00:00').getDate()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white/75 truncate">{entry?.client_name ?? '—'}</p>
                        <p className="text-[10px] text-white/35 mt-0.5">
                          {entry?.revenue_type === 'retainer' ? 'Retainer' : 'Setup'} · {fmtMoney(p.amount)}
                        </p>
                      </div>
                      {overdue && <span className="text-[9px] font-bold text-red-400/70 uppercase tracking-wider shrink-0">Overdue</span>}
                      <button onClick={() => void fTogglePayment(p.id, !p.collected)}
                        className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                          p.collected
                            ? 'border-emerald-500/30 text-emerald-400/80 bg-emerald-500/10 hover:bg-emerald-500/5'
                            : 'border-white/10 text-white/40 hover:border-white/20 hover:text-white/65'
                        }`}
                      >{p.collected ? '✓ Collected' : 'Mark collected'}</button>
                    </div>
                  )
                })}
              </div>

              {/* Month total */}
              {fCalPayments.length > 0 && (
                <div className="rounded-xl border border-white/8 bg-white/[0.03] px-4 py-3 flex items-center justify-between">
                  <span className="text-xs text-white/45">
                    {fCalPayments.filter(p => p.collected).length} of {fCalPayments.length} collected
                  </span>
                  <span className="text-sm font-bold text-emerald-400/80 tabular-nums">
                    {fmtMoney(fCalPayments.filter(p => p.collected).reduce((s, p) => s + p.amount, 0))} collected
                    <span className="text-white/30 font-normal"> / {fmtMoney(fCalPayments.reduce((s, p) => s + p.amount, 0))} total</span>
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── MILESTONES ── */}
          {fView === 'milestones' && (
            <div className="flex flex-col gap-3">
              {F_MILESTONES.map(m => {
                const unlocked = m.check(fLatestNetWorth, fMonthlyPassive)
                const { current, target } = m.progress(fLatestNetWorth, fMonthlyPassive)
                const pct = Math.min(100, Math.round((current / target) * 100))
                return (
                  <div key={m.id} className={`rounded-xl border p-5 flex flex-col gap-3 transition-colors ${
                    unlocked ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-white/8 bg-white/[0.03]'
                  }`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className={`text-base ${unlocked ? '✓' : ''}`}>{unlocked ? '✓' : '◻'}</span>
                          <span className={`text-sm font-bold ${unlocked ? 'text-emerald-400/90' : 'text-white/70'}`}>{m.label}</span>
                        </div>
                        <p className="text-[11px] text-white/35 mt-0.5 ml-6">{m.description}</p>
                      </div>
                      <span className={`text-xs font-mono font-semibold tabular-nums shrink-0 ${unlocked ? 'text-emerald-400/70' : 'text-white/45'}`}>
                        {pct}%
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${unlocked ? 'bg-emerald-500/70' : 'bg-white/20'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-white/30">
                      <span>{m.prefix}{current.toLocaleString()}</span>
                      <span>{m.prefix}{target.toLocaleString()}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

        </div>
      )}

    </div>
  )
}
