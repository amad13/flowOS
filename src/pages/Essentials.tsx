import { useState, useMemo, useEffect } from 'react'
import { stageRequirements } from '../data/mockState'
import { supabase } from '../lib/supabaseClient'
import { useUser } from '../components/AuthGate'
import FlowPageHeader from '../components/FlowPageHeader'
import FlowTabs from '../components/FlowTabs'
import MetricsCard from '../components/MetricsCard'
import StageReqBar from '../components/StageReqBar'
import DeficitCard from '../components/DeficitCard'

const SLEEP_TARGET_HOUR = 23

const TABS = [
  { id: 'overview',     label: 'Overview'     },
  { id: 'daily-habits', label: 'Daily Habits' },
  { id: 'discipline',   label: 'Discipline'   },
  { id: 'feedback',     label: 'Feedback'     },
]

// ─── Types ────────────────────────────────────────────────────────────────────
type HabitStatus = 'done' | 'missed' | 'pending'
type HabitRecord = {
  date:            string
  wake:            boolean
  sleep:           boolean
  recouche?:       boolean
  morningRoutine?: boolean
  eveningRoutine?: boolean
}
type EssStatus   = 'green' | 'red'
type WakeSchedule = {
  wakeTime:      string   // display label, e.g. "3:45"
  allowRecouche: boolean  // whether a second wake (up by 6:00) is required
  recoucheTime:  string   // "6:00" when allowRecouche, else ""
}

// ─── Wake schedule (Fajr-based, month-driven) ─────────────────────────────────
// Nov–Feb  → 6:00, single wake
// Mar–Apr  → 5:00, single wake
// May–Aug  → 3:45, recouche allowed (must be up by 6:00)
// Sep–Oct  → 5:00, single wake
function getWakeSchedule(iso: string): WakeSchedule {
  const month = new Date(iso + 'T12:00:00').getMonth() + 1  // 1-based
  if (month >= 11 || month <= 2)
    return { wakeTime: '6:00',  allowRecouche: false, recoucheTime: '' }
  if (month <= 4)
    return { wakeTime: '5:00',  allowRecouche: false, recoucheTime: '' }
  if (month <= 8)
    return { wakeTime: '3:45',  allowRecouche: true,  recoucheTime: '6:00' }
  return   { wakeTime: '5:00',  allowRecouche: false, recoucheTime: '' }
}

// A clean day requires all 4: wakeOK + morningRoutine + eveningRoutine + sleepOK
// wakeOK also includes recouche when the seasonal schedule requires it
function isCleanDay(rec: HabitRecord | undefined, sched: WakeSchedule): boolean {
  if (!rec) return false
  const wakeOK    = rec.wake && (!sched.allowRecouche || (rec.recouche ?? false))
  const sleepOK   = rec.sleep
  const morningOK = rec.morningRoutine ?? false
  const eveningOK = rec.eveningRoutine ?? false
  return wakeOK && sleepOK && morningOK && eveningOK
}

// ─── localStorage ─────────────────────────────────────────────────────────────
const LS_HABITS = 'ess_habits'

function lsGet<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback }
}
function lsSet(key: string, val: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function essToday(): string { return new Date().toISOString().slice(0, 10) }
function essWeekSunday(): string {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().slice(0, 10)
}

const ESS_DOT: Record<EssStatus, string> = { green: 'bg-emerald-500', red: 'bg-red-500' }
const DISCIPLINE_INIT = { wakeUpStreak: 0, sleepStreak: 0, disciplineDays: 0 }

// ─── Essentials Stage System ──────────────────────────────────────────────────
type FamilySupportEntry = { date: string; amount: number }

type EssStructuralState = {
  familySupport:     FamilySupportEntry[]
  independentLiving: { active: boolean; activeSince: string | null }
}

type EssMetricId     = 'wake' | 'sleep' | 'morning_routine' | 'evening_routine' | 'clean_day'
                     | 'family_support' | 'independent_living' | 'stable_independent_life'
type EssMetricStatus = 'required' | 'maintained' | 'tracked'

type EssStageDef = {
  id:          number
  name:        string
  description: string
  metrics:     Record<EssMetricId, EssMetricStatus>
}

const ESS_STAGES: EssStageDef[] = [
  {
    id: 1, name: 'Self-Control',
    description: '1-alarm wake-up for 30 days',
    metrics: {
      wake: 'required', sleep: 'required', morning_routine: 'required',
      evening_routine: 'required', clean_day: 'required',
      family_support: 'tracked', independent_living: 'tracked', stable_independent_life: 'tracked',
    },
  },
  {
    id: 2, name: 'Stability',
    description: '60 clean days + $500/month family support',
    metrics: {
      wake: 'required', sleep: 'required', morning_routine: 'required',
      evening_routine: 'required', clean_day: 'required',
      family_support: 'required', independent_living: 'tracked', stable_independent_life: 'tracked',
    },
  },
  {
    id: 3, name: 'Family Relief',
    description: '$1,500/month family support for 3 months',
    metrics: {
      wake: 'maintained', sleep: 'maintained', morning_routine: 'maintained',
      evening_routine: 'maintained', clean_day: 'maintained',
      family_support: 'required', independent_living: 'tracked', stable_independent_life: 'tracked',
    },
  },
  {
    id: 4, name: 'Independence',
    description: 'Living independently for 3 months',
    metrics: {
      wake: 'maintained', sleep: 'maintained', morning_routine: 'maintained',
      evening_routine: 'maintained', clean_day: 'maintained',
      family_support: 'maintained', independent_living: 'required', stable_independent_life: 'tracked',
    },
  },
  {
    id: 5, name: 'Expansion',
    description: 'Stable independent life for 6 months',
    metrics: {
      wake: 'maintained', sleep: 'maintained', morning_routine: 'maintained',
      evening_routine: 'maintained', clean_day: 'maintained',
      family_support: 'maintained', independent_living: 'maintained', stable_independent_life: 'required',
    },
  },
]

const ESS_STATUS_CFG: Record<EssMetricStatus, { label: string; dot: string; text: string; bg: string; border: string }> = {
  required:   { label: 'Required',   dot: 'bg-red-400',    text: 'text-red-400/80',    bg: 'bg-red-500/6',    border: 'border-red-500/15'    },
  maintained: { label: 'Maintained', dot: 'bg-purple-400', text: 'text-purple-400/80', bg: 'bg-purple-500/6', border: 'border-purple-500/15' },
  tracked:    { label: 'Tracked',    dot: 'bg-white/20',   text: 'text-white/35',      bg: 'bg-white/3',      border: 'border-white/6'       },
}

const STRUCTURAL_DISPLAY: Record<'family_support' | 'independent_living' | 'stable_independent_life', { label: string; sublabel: string }> = {
  family_support:          { label: 'Family Support',     sublabel: 'Log monthly contributions'          },
  independent_living:      { label: 'Independent Living', sublabel: 'Activate when moved out'            },
  stable_independent_life: { label: 'Stable Independent', sublabel: 'Derived: 6 months independent'     },
}

const LS_STRUCTURAL = 'ess_structural'
const DEFAULT_STRUCTURAL: EssStructuralState = {
  familySupport:     [],
  independentLiving: { active: false, activeSince: null },
}

// Completed full calendar months since activeSince
function monthsActive(activeSince: string | null): number {
  if (!activeSince) return 0
  const start = new Date(activeSince + 'T12:00:00')
  const now   = new Date()
  return Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()))
}

// Sum of family support contributions for a given YYYY-MM month
function familySupportForMonth(entries: FamilySupportEntry[], yearMonth: string): number {
  return entries.filter(e => e.date.startsWith(yearMonth)).reduce((s, e) => s + e.amount, 0)
}

// Consecutive months (walking back from current) where family support >= threshold
function consecutiveFamilySupportMonths(entries: FamilySupportEntry[], threshold: number): number {
  let count = 0
  const d = new Date()
  for (let i = 0; i < 24; i++) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    if (familySupportForMonth(entries, key) < threshold) break
    count++
    d.setMonth(d.getMonth() - 1)
  }
  return count
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function Essentials() {
  const today        = essToday()
  const wakeSchedule = getWakeSchedule(today)

  const [activeTab,  setActiveTab]  = useState('overview')
  const [discipline, setDiscipline] = useState(DISCIPLINE_INIT)
  const [habitLog,   setHabitLog]   = useState<HabitRecord[]>(() => lsGet(LS_HABITS, []))

  const req = stageRequirements.find(r => r.flow === 'essentials')!

  // ── Structural milestones (persisted) ──────────────────────────────────────
  const [structural, setStructural] = useState<EssStructuralState>(() =>
    lsGet<EssStructuralState>(LS_STRUCTURAL, DEFAULT_STRUCTURAL)
  )
  const [fsSupportInput, setFsSupportInput] = useState('')

  const user = useUser()

  // ── Load Essentials data from Supabase on mount ───────────────────────────
  useEffect(() => {
    if (!user) return

    // All habit records — hydrates full history for feedback + current day state
    supabase
      .from('habit_records')
      .select('record_date,wake,sleep,recouche,morning_routine,evening_routine')
      .eq('user_id', user.id)
      .order('record_date', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error('[essentials] fetch habit_records:', error); return }
        if (!data?.length) return
        const mapped: HabitRecord[] = data.map(r => ({
          date:           r.record_date,
          wake:           r.wake            ?? false,
          sleep:          r.sleep           ?? false,
          recouche:       r.recouche        ?? false,
          morningRoutine: r.morning_routine ?? false,
          eveningRoutine: r.evening_routine ?? false,
        }))
        setHabitLog(mapped)
        lsSet(LS_HABITS, mapped)
      })

    // All family support entries
    supabase
      .from('family_support_entries')
      .select('entry_date,amount')
      .eq('user_id', user.id)
      .order('entry_date', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error('[essentials] fetch family_support_entries:', error); return }
        if (!data?.length) return
        const entries: FamilySupportEntry[] = data.map(r => ({ date: r.entry_date, amount: r.amount }))
        setStructural(prev => {
          const updated = { ...prev, familySupport: entries }
          lsSet(LS_STRUCTURAL, updated); return updated
        })
      })

    // Independent living state
    supabase
      .from('ess_structural_state')
      .select('independent_living_active,independent_living_active_since')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error('[essentials] fetch ess_structural_state:', error); return }
        if (!data) return
        setStructural(prev => {
          const updated = {
            ...prev,
            independentLiving: {
              active:      data.independent_living_active       ?? false,
              activeSince: data.independent_living_active_since ?? null,
            },
          }
          lsSet(LS_STRUCTURAL, updated); return updated
        })
      })

    // essentials_stage_state — current_stage and stage_name are computed from
    // habit/structural data hydrated above; DB row is a persisted mirror only.
    supabase
      .from('essentials_stage_state')
      .select('current_stage,stage_name')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ error }) => {
        if (error) console.error('[essentials] fetch essentials_stage_state:', error)
      })

  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Upsert today's habit record to Supabase ───────────────────────────────
  function upsertHabit(patch: Partial<Omit<HabitRecord, 'date'>>) {
    if (!user) return
    const cur  = habitLog.find(r => r.date === today) ?? { date: today, wake: false, sleep: false }
    const next = { ...cur, ...patch }
    supabase
      .from('habit_records')
      .upsert({
        user_id:         user.id,
        record_date:     today,
        wake:            next.wake            ?? false,
        sleep:           next.sleep           ?? false,
        recouche:        next.recouche        ?? false,
        morning_routine: next.morningRoutine  ?? false,
        evening_routine: next.eveningRoutine  ?? false,
      }, { onConflict: 'user_id,record_date' })
      .then(({ error }) => { if (error) console.error('[essentials] upsert habit_records:', error) })
  }

  function logFamilySupport() {
    const amt = parseFloat(fsSupportInput)
    if (isNaN(amt) || amt <= 0) return
    const entry: FamilySupportEntry = { date: essToday(), amount: amt }
    setStructural(prev => {
      const updated = { ...prev, familySupport: [...prev.familySupport, entry] }
      lsSet(LS_STRUCTURAL, updated); return updated
    })
    setFsSupportInput('')
    if (user) {
      supabase
        .from('family_support_entries')
        .insert({ user_id: user.id, entry_date: entry.date, amount: entry.amount })
        .then(({ error }) => { if (error) console.error('[essentials] insert family_support_entries:', error) })
    }
  }

  function toggleIndependentLiving() {
    const next = structural.independentLiving.active
      ? { active: false, activeSince: null }
      : { active: true,  activeSince: essToday() }
    setStructural(prev => {
      const updated = { ...prev, independentLiving: next }
      lsSet(LS_STRUCTURAL, updated); return updated
    })
    if (user) {
      supabase
        .from('ess_structural_state')
        .upsert({
          user_id:                          user.id,
          independent_living_active:        next.active,
          independent_living_active_since:  next.activeSince,
        }, { onConflict: 'user_id' })
        .then(({ error }) => { if (error) console.error('[essentials] upsert ess_structural_state:', error) })
    }
  }

  // ── Derive today's status ──────────────────────────────────────────────────
  const todayRec          = habitLog.find(r => r.date === today) ?? null
  const wakeUpToday       = todayRec?.wake            ?? false
  const sleepToday        = todayRec?.sleep           ?? false
  const recoucheToday     = todayRec?.recouche        ?? false
  const morningRoutineDone = todayRec?.morningRoutine ?? false
  const eveningRoutineDone = todayRec?.eveningRoutine ?? false
  const bothDone           = isCleanDay(todayRec ?? undefined, wakeSchedule)

  // base 4 habits: wake + morning + evening + sleep; +1 if recouche required
  const totalHabits = (wakeSchedule.allowRecouche ? 5 : 4)
  const doneSoFar   =
    (wakeUpToday        ? 1 : 0) +
    (sleepToday         ? 1 : 0) +
    (morningRoutineDone ? 1 : 0) +
    (eveningRoutineDone ? 1 : 0) +
    (wakeSchedule.allowRecouche && recoucheToday ? 1 : 0)

  // ── Metrics / deficit ──────────────────────────────────────────────────────
  const metrics = useMemo(() => [
    { label: 'Wake-up streak',  value: discipline.wakeUpStreak,   unit: 'days'    },
    { label: 'Sleep streak',    value: discipline.sleepStreak,    unit: 'days'    },
    { label: 'Discipline days', value: discipline.disciplineDays, unit: 'total'   },
    { label: 'Daily habits',    value: String(totalHabits),       unit: 'targets' },
  ], [discipline, totalHabits])

  const deficitItems = useMemo(() => {
    const items: { label: string; value: string; urgent: boolean }[] = [
      {
        label:  `Wake up before ${wakeSchedule.wakeTime}`,
        value:  wakeUpToday ? '✓ Done' : '✗ Not logged',
        urgent: !wakeUpToday,
      },
    ]
    if (wakeSchedule.allowRecouche) {
      items.push({
        label:  `Recouche — up by ${wakeSchedule.recoucheTime}`,
        value:  recoucheToday ? '✓ Done' : '✗ Not logged',
        urgent: !recoucheToday,
      })
    }
    items.push(
      {
        label:  'Morning routine',
        value:  morningRoutineDone ? '✓ Done' : '✗ Not logged',
        urgent: !morningRoutineDone,
      },
      {
        label:  'Evening routine',
        value:  eveningRoutineDone ? '✓ Done' : '✗ Not logged',
        urgent: !eveningRoutineDone,
      },
      {
        label:  `Sleep before ${SLEEP_TARGET_HOUR}:00`,
        value:  sleepToday ? '✓ Done' : '✗ Not logged',
        urgent: !sleepToday,
      },
    )
    return items
  }, [wakeUpToday, recoucheToday, morningRoutineDone, eveningRoutineDone, sleepToday, wakeSchedule])

  // ── Essentials stage system ───────────────────────────────────────────────
  const cleanDaysCount = discipline.disciplineDays   // includes seed + real habit completions

  const currentMonth = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const monthlySupport = useMemo(
    () => familySupportForMonth(structural.familySupport, currentMonth),
    [structural.familySupport, currentMonth],
  )

  const consec1500 = useMemo(
    () => consecutiveFamilySupportMonths(structural.familySupport, 1500),
    [structural.familySupport],
  )

  const independentMonths = useMemo(
    () => monthsActive(structural.independentLiving.activeSince),
    [structural.independentLiving.activeSince],
  )

  const currentEssStage = useMemo((): EssStageDef => {
    const indepActive = structural.independentLiving.active
    for (let i = ESS_STAGES.length - 1; i >= 0; i--) {
      const s = ESS_STAGES[i]
      let done = true
      if      (s.id === 1) { if (cleanDaysCount < 30) done = false }
      else if (s.id === 2) { if (cleanDaysCount < 60 || monthlySupport < 500) done = false }
      else if (s.id === 3) { if (consec1500 < 3) done = false }
      else if (s.id === 4) { if (!indepActive || independentMonths < 3) done = false }
      else if (s.id === 5) { if (!indepActive || independentMonths < 6) done = false }
      if (done) return ESS_STAGES[Math.min(i + 1, ESS_STAGES.length - 1)]
    }
    return ESS_STAGES[0]
  }, [cleanDaysCount, monthlySupport, consec1500, independentMonths, structural.independentLiving.active])

  const nextEssStage = useMemo((): EssStageDef | null => {
    const idx = ESS_STAGES.findIndex(s => s.id === currentEssStage.id)
    return idx < ESS_STAGES.length - 1 ? ESS_STAGES[idx + 1] : null
  }, [currentEssStage])

  // ── Persist stage state to Supabase ──────────────────────────────────────
  useEffect(() => {
    if (!user) return
    supabase
      .from('essentials_stage_state')
      .upsert({
        user_id:       user.id,
        current_stage: currentEssStage.id,
        stage_name:    currentEssStage.name,
      }, { onConflict: 'user_id' })
      .then(({ error }) => { if (error) console.error('[essentials] upsert essentials_stage_state:', error) })
  }, [user, currentEssStage]) // eslint-disable-line react-hooks/exhaustive-deps

  const essStageProgress = useMemo((): { pct: number; primary: string; secondary: string | null } => {
    const stage = currentEssStage
    if (stage.id === 1) {
      return {
        pct:       Math.min(100, Math.round((cleanDaysCount / 30) * 100)),
        primary:   `${cleanDaysCount} / 30 clean days`,
        secondary: null,
      }
    }
    if (stage.id === 2) {
      const pctDays    = Math.min(100, Math.round((cleanDaysCount / 60) * 100))
      const pctSupport = Math.min(100, Math.round((monthlySupport / 500) * 100))
      return {
        pct:       Math.round((pctDays + pctSupport) / 2),
        primary:   `${cleanDaysCount} / 60 clean days`,
        secondary: monthlySupport >= 500
          ? `✓ $${monthlySupport.toLocaleString()}/mo support`
          : `✗ $${monthlySupport.toLocaleString()} / $500/mo support`,
      }
    }
    if (stage.id === 3) {
      return {
        pct:       Math.min(100, Math.round((consec1500 / 3) * 100)),
        primary:   `${consec1500} / 3 months at $1,500/mo`,
        secondary: null,
      }
    }
    if (stage.id === 4) {
      return {
        pct:       Math.min(100, Math.round((independentMonths / 3) * 100)),
        primary:   `${independentMonths} / 3 months independent`,
        secondary: structural.independentLiving.active
          ? `Active since ${structural.independentLiving.activeSince}`
          : '✗ Not activated',
      }
    }
    return {
      pct:       Math.min(100, Math.round((independentMonths / 6) * 100)),
      primary:   `${independentMonths} / 6 months stable independent`,
      secondary: structural.independentLiving.active
        ? `Active since ${structural.independentLiving.activeSince}`
        : '✗ Not activated',
    }
  }, [currentEssStage, cleanDaysCount, monthlySupport, consec1500, independentMonths, structural.independentLiving])

  const essMetricStatuses = useMemo(
    (): Record<EssMetricId, EssMetricStatus> => ({ ...currentEssStage.metrics }),
    [currentEssStage],
  )

  // ── Log actions ────────────────────────────────────────────────────────────
  // Helper: checks whether logging one more habit would complete the full day
  function othersDone(except: keyof HabitRecord): boolean {
    const wakeOK    = except === 'wake'            ? true : wakeUpToday
    const recOK     = except === 'recouche'        ? true : (!wakeSchedule.allowRecouche || recoucheToday)
    const morningOK = except === 'morningRoutine'  ? true : morningRoutineDone
    const eveningOK = except === 'eveningRoutine'  ? true : eveningRoutineDone
    const sleepOK   = except === 'sleep'           ? true : sleepToday
    return wakeOK && recOK && morningOK && eveningOK && sleepOK
  }

  function logWakeUp() {
    if (wakeUpToday) return
    const willComplete = othersDone('wake')
    setDiscipline(prev => ({
      ...prev,
      wakeUpStreak:   prev.wakeUpStreak + 1,
      disciplineDays: willComplete ? prev.disciplineDays + 1 : prev.disciplineDays,
    }))
    setHabitLog(prev => {
      const rec     = prev.find(r => r.date === today) ?? { date: today, wake: false, sleep: false }
      const updated = [...prev.filter(r => r.date !== today), { ...rec, wake: true }]
      lsSet(LS_HABITS, updated); return updated
    })
    upsertHabit({ wake: true })
  }

  function logRecouche() {
    if (recoucheToday || !wakeUpToday) return
    const willComplete = othersDone('recouche')
    setDiscipline(prev => ({
      ...prev,
      disciplineDays: willComplete ? prev.disciplineDays + 1 : prev.disciplineDays,
    }))
    setHabitLog(prev => {
      const rec     = prev.find(r => r.date === today) ?? { date: today, wake: false, sleep: false }
      const updated = [...prev.filter(r => r.date !== today), { ...rec, recouche: true }]
      lsSet(LS_HABITS, updated); return updated
    })
    upsertHabit({ recouche: true })
  }

  function logMorningRoutine() {
    if (morningRoutineDone) return
    const willComplete = othersDone('morningRoutine')
    setDiscipline(prev => ({
      ...prev,
      disciplineDays: willComplete ? prev.disciplineDays + 1 : prev.disciplineDays,
    }))
    setHabitLog(prev => {
      const rec     = prev.find(r => r.date === today) ?? { date: today, wake: false, sleep: false }
      const updated = [...prev.filter(r => r.date !== today), { ...rec, morningRoutine: true }]
      lsSet(LS_HABITS, updated); return updated
    })
    upsertHabit({ morningRoutine: true })
  }

  function logEveningRoutine() {
    if (eveningRoutineDone) return
    const willComplete = othersDone('eveningRoutine')
    setDiscipline(prev => ({
      ...prev,
      disciplineDays: willComplete ? prev.disciplineDays + 1 : prev.disciplineDays,
    }))
    setHabitLog(prev => {
      const rec     = prev.find(r => r.date === today) ?? { date: today, wake: false, sleep: false }
      const updated = [...prev.filter(r => r.date !== today), { ...rec, eveningRoutine: true }]
      lsSet(LS_HABITS, updated); return updated
    })
    upsertHabit({ eveningRoutine: true })
  }

  function logSleep() {
    if (sleepToday) return
    const willComplete = othersDone('sleep')
    setDiscipline(prev => ({
      ...prev,
      sleepStreak:    prev.sleepStreak + 1,
      disciplineDays: willComplete ? prev.disciplineDays + 1 : prev.disciplineDays,
    }))
    setHabitLog(prev => {
      const rec     = prev.find(r => r.date === today) ?? { date: today, wake: false, sleep: false }
      const updated = [...prev.filter(r => r.date !== today), { ...rec, sleep: true }]
      lsSet(LS_HABITS, updated); return updated
    })
    upsertHabit({ sleep: true })
  }

  // ── Feedback — weekly grid (auto-computed) ─────────────────────────────────
  const fbWeekDays = useMemo(() => {
    const sun = essWeekSunday()
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
      const rec   = habitLog.find(r => r.date === iso)
      const sched = getWakeSchedule(iso)
      const wake:     EssStatus | null = isFuture ? null : (rec?.wake  ? 'green' : 'red')
      const sleep:    EssStatus | null = isFuture ? null : (rec?.sleep ? 'green' : 'red')
      const cleanDay: EssStatus | null = isFuture ? null : (isCleanDay(rec, sched) ? 'green' : 'red')
      return { ...day, wake, sleep, cleanDay }
    }),
    [fbWeekDays, habitLog],
  )

  const fbWeekSummary = useMemo(() => {
    const pastDays = fbDashboard.filter(d => !d.isFuture && !d.isToday)
    const total    = pastDays.length
    if (total === 0) return {
      overallPct: null as number | null,
      wakePct:    null as number | null,
      sleepPct:   null as number | null,
      cleanDays:  0,
      weakest:    null as string | null,
      missed:     [] as string[],
    }

    const wakeGreen  = pastDays.filter(d => d.wake     === 'green').length
    const sleepGreen = pastDays.filter(d => d.sleep    === 'green').length
    const cleanCount = pastDays.filter(d => d.cleanDay === 'green').length

    const wakePct    = Math.round((wakeGreen  / total) * 100)
    const sleepPct   = Math.round((sleepGreen / total) * 100)
    const overallPct = Math.round(((wakeGreen + sleepGreen) / (total * 2)) * 100)
    const weakest    = wakePct <= sleepPct ? 'Wake' : 'Sleep'

    const missed: string[] = []
    for (const day of pastDays) {
      if (day.wake  === 'red') missed.push(`Wake — ${day.label} ${day.num}`)
      if (day.sleep === 'red') missed.push(`Sleep — ${day.label} ${day.num}`)
    }

    return { overallPct, wakePct, sleepPct, cleanDays: cleanCount, weakest, missed }
  }, [fbDashboard])

  // ── Daily Habits row statuses (time-aware for Wake) ───────────────────────
  const { wakeStatus, recoucheStatus } = useMemo((): {
    wakeStatus: HabitStatus; recoucheStatus: HabitStatus
  } => {
    const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
    const [wh, wm] = wakeSchedule.wakeTime.split(':').map(Number)
    const wakeTargetMin = wh * 60 + (wm || 0)
    // Missed if more than 2 hours past the wake target
    const wakeStatus: HabitStatus = wakeUpToday    ? 'done'
      : nowMin > wakeTargetMin + 120               ? 'missed' : 'pending'
    // Recouche: missed if past 8:00 (2h grace after 6:00 target) and still not logged
    const recoucheStatus: HabitStatus = recoucheToday ? 'done'
      : !wakeUpToday                               ? 'pending'
      : nowMin > 8 * 60                            ? 'missed' : 'pending'
    return { wakeStatus, recoucheStatus }
  }, [wakeUpToday, recoucheToday, wakeSchedule])

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <FlowPageHeader title="Essentials" subtitle="Life discipline & daily habits" badge="required" />
      <FlowTabs tabs={TABS} active={activeTab} onChange={setActiveTab} accent="purple" />

      {/* ── OVERVIEW ─────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-4">
          {/* Stage card — dynamic */}
          {(() => {
            const stage    = currentEssStage
            const next     = nextEssStage
            const progress = essStageProgress
            const HABIT_METRICS: EssMetricId[] = ['wake', 'sleep', 'morning_routine', 'evening_routine', 'clean_day']
            const HABIT_LABELS: Record<string, string> = {
              wake: 'Wake-up', sleep: 'Sleep', morning_routine: 'Morning Routine',
              evening_routine: 'Evening Routine', clean_day: 'Clean Day',
            }
            return (
              <div className="rounded-xl border border-purple-500/20 bg-white/5 p-5 flex flex-col gap-3.5">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] text-white/55 uppercase tracking-widest font-semibold">
                      Stage {stage.id} · Essentials
                    </span>
                    <p className="text-base font-black text-white leading-tight mt-0.5">{stage.name}</p>
                    <p className="text-xs text-white/35 mt-0.5">{stage.description}</p>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-purple-500/25 bg-purple-500/8 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-purple-400 shrink-0" />
                    <span className="text-[10px] font-bold text-purple-400">Active</span>
                  </div>
                </div>

                {/* Progress */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-baseline text-[10px] font-mono">
                    <span className="text-white/35">{progress.primary}</span>
                    {progress.secondary && (
                      <span className={`text-[10px] font-semibold ${progress.secondary.startsWith('✓') ? 'text-emerald-400/70' : 'text-red-400/60'}`}>
                        {progress.secondary}
                      </span>
                    )}
                  </div>
                  <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${progress.pct >= 100 ? 'bg-emerald-500/55' : 'bg-purple-500/45'}`}
                      style={{ width: `${progress.pct}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-white/45">
                      {next ? `Next: ${next.name}` : 'Final stage'}
                    </span>
                    <span className={`text-[10px] font-semibold font-mono ${progress.pct >= 100 ? 'text-emerald-400' : 'text-white/50'}`}>
                      {progress.pct}%
                    </span>
                  </div>
                </div>

                {/* Daily habit metric statuses */}
                <div className="flex flex-col gap-2 pt-1 border-t border-white/6">
                  <span className="text-[9px] text-white/45 uppercase tracking-widest font-semibold">Metric priority — Stage {stage.id}</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {HABIT_METRICS.map(id => {
                      const st  = essMetricStatuses[id]
                      const cfg = ESS_STATUS_CFG[st]
                      return (
                        <div key={id} className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${cfg.bg} ${cfg.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                          <div className="flex flex-col leading-none gap-0.5 min-w-0">
                            <span className={`text-[10px] font-semibold truncate ${cfg.text}`}>{HABIT_LABELS[id]}</span>
                            <span className="text-[8px] text-white/42 uppercase tracking-wide">{cfg.label}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Structural metrics */}
                <div className="flex flex-col gap-2 pt-1 border-t border-white/6">
                  <span className="text-[9px] text-white/45 uppercase tracking-widest font-semibold">Life milestones</span>
                  <div className="flex flex-col gap-1.5">
                    {/* Family support */}
                    {(() => {
                      const st      = essMetricStatuses['family_support']
                      const cfg     = ESS_STATUS_CFG[st]
                      const stageId = currentEssStage.id
                      if (stageId <= 1) return (
                        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/5 bg-white/2 opacity-50">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-white/10" />
                          <div className="flex flex-col leading-none gap-0.5 min-w-0 flex-1">
                            <span className="text-[10px] font-semibold text-white/50">Family Support</span>
                            <span className="text-[8px] text-white/40 uppercase tracking-wide">Unlocks at Stage 2</span>
                          </div>
                        </div>
                      )
                      if (stageId === 2) {
                        const ok = monthlySupport >= 500
                        return (
                          <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${ok ? `${cfg.bg} ${cfg.border}` : 'bg-white/2 border-white/5'}`}>
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ok ? cfg.dot : 'bg-white/15'}`} />
                            <div className="flex flex-col leading-none gap-0.5 min-w-0 flex-1">
                              <span className={`text-[10px] font-semibold ${ok ? cfg.text : 'text-white/55'}`}>Family Support</span>
                              <span className="text-[8px] text-white/42 uppercase tracking-wide">
                                ${monthlySupport.toLocaleString()} / $500 this month · {cfg.label}
                              </span>
                            </div>
                          </div>
                        )
                      }
                      const ok = consec1500 >= 3
                      return (
                        <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border ${ok ? `${cfg.bg} ${cfg.border}` : 'bg-white/2 border-white/5'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ok ? cfg.dot : 'bg-white/15'}`} />
                          <div className="flex flex-col leading-none gap-0.5 min-w-0 flex-1">
                            <span className={`text-[10px] font-semibold ${ok ? cfg.text : 'text-white/55'}`}>Family Support</span>
                            <span className="text-[8px] text-white/42 uppercase tracking-wide">
                              ${monthlySupport.toLocaleString()}/mo · {consec1500} / 3 months at $1,500 · {cfg.label}
                            </span>
                          </div>
                        </div>
                      )
                    })()}
                    {/* Independent living */}
                    {(() => {
                      const st      = essMetricStatuses['independent_living']
                      const cfg     = ESS_STATUS_CFG[st]
                      const il      = structural.independentLiving
                      const stageId = currentEssStage.id
                      if (stageId <= 3) return (
                        <div className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-white/5 bg-white/2 opacity-40">
                          <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-white/10" />
                          <div className="flex flex-col leading-none gap-0.5 min-w-0 flex-1">
                            <span className="text-[10px] font-semibold text-white/45">Independent Living</span>
                            <span className="text-[8px] text-white/38 uppercase tracking-wide">Locked until Stage 4</span>
                          </div>
                        </div>
                      )
                      return (
                        <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-colors ${
                          il.active ? `${cfg.bg} ${cfg.border}` : 'bg-white/2 border-white/5 opacity-45'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${il.active ? cfg.dot : 'bg-white/15'}`} />
                          <div className="flex flex-col leading-none gap-0.5 min-w-0 flex-1">
                            <span className={`text-[10px] font-semibold ${il.active ? cfg.text : 'text-white/50'}`}>Independent Living</span>
                            <span className="text-[8px] text-white/40 uppercase tracking-wide">
                              {il.active ? `${independentMonths} month${independentMonths !== 1 ? 's' : ''} active · ${cfg.label}` : 'Inactive'}
                            </span>
                          </div>
                        </div>
                      )
                    })()}
                    {/* Stable independent life (derived) */}
                    {(() => {
                      const st       = essMetricStatuses['stable_independent_life']
                      const cfg      = ESS_STATUS_CFG[st]
                      const isStable = structural.independentLiving.active && independentMonths >= 6
                      return (
                        <div className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-colors ${
                          isStable ? `${cfg.bg} ${cfg.border}` : 'bg-white/2 border-white/5 opacity-35'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isStable ? cfg.dot : 'bg-white/10'}`} />
                          <div className="flex flex-col leading-none gap-0.5 min-w-0 flex-1">
                            <span className={`text-[10px] font-semibold ${isStable ? cfg.text : 'text-white/45'}`}>Stable Independent</span>
                            <span className="text-[8px] text-white/38 uppercase tracking-wide">
                              {isStable ? `Derived · ${independentMonths}mo independent · ${cfg.label}` : 'Derived — 6 months independent required'}
                            </span>
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>
              </div>
            )
          })()}

          <MetricsCard metrics={metrics} accent="purple" />

          <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs text-white/40 uppercase tracking-widest font-semibold">Today</span>
              <span className="text-sm text-white/70">
                {bothDone
                  ? 'Full day completed. +1 discipline day.'
                  : doneSoFar === 0
                    ? 'No habits logged yet today.'
                    : `${doneSoFar}/${totalHabits} habits done.`}
              </span>
              {wakeSchedule.allowRecouche && (
                <span className="text-[10px] text-white/50 mt-0.5">
                  Fajr period — wake {wakeSchedule.wakeTime} · recouche allowed · up by {wakeSchedule.recoucheTime}
                </span>
              )}
            </div>
            <div className={`text-2xl font-bold ${bothDone ? 'text-emerald-400' : 'text-amber-400/60'}`}>
              {bothDone ? '✓' : `${doneSoFar}/${totalHabits}`}
            </div>
          </div>

          <DeficitCard items={deficitItems} />
          <StageReqBar title={req.title} current={req.current} target={req.target} unit={req.unit} accent="purple" />
        </div>
      )}

      {/* ── DAILY HABITS ─────────────────────────────────────────────── */}
      {activeTab === 'daily-habits' && (() => {
        type HabitRow = {
          id:       string
          label:    string
          rule:     string
          status:   HabitStatus
          onLog:    () => void
          canLog:   boolean
        }
        const rows: HabitRow[] = [
          {
            id:     'wake',
            label:  'Wake up',
            rule:   `Before ${wakeSchedule.wakeTime}${wakeSchedule.allowRecouche ? ' · Fajr — recouche allowed' : ' · no return to sleep'}`,
            status: wakeStatus,
            onLog:  logWakeUp,
            canLog: !wakeUpToday,
          },
          ...(wakeSchedule.allowRecouche ? [{
            id:     'recouche',
            label:  'Recouche',
            rule:   `Up by ${wakeSchedule.recoucheTime} · requires wake logged first`,
            status: recoucheStatus,
            onLog:  logRecouche,
            canLog: !recoucheToday && wakeUpToday,
          }] : []),
          {
            id:     'morning',
            label:  'Morning Routine',
            rule:   'Bismillah · Cold shower · Skin care',
            status: (morningRoutineDone ? 'done' : 'pending') as HabitStatus,
            onLog:  logMorningRoutine,
            canLog: !morningRoutineDone,
          },
          {
            id:     'evening',
            label:  'Evening Routine',
            rule:   'Skin care · Shutdown · Alhamdoulillah',
            status: (eveningRoutineDone ? 'done' : 'pending') as HabitStatus,
            onLog:  logEveningRoutine,
            canLog: !eveningRoutineDone,
          },
          {
            id:     'sleep',
            label:  'Sleep',
            rule:   `Before ${SLEEP_TARGET_HOUR}:00`,
            status: (sleepToday ? 'done' : 'pending') as HabitStatus,
            onLog:  logSleep,
            canLog: !sleepToday,
          },
        ]

        return (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Today's Habits</span>
              <span className="text-[10px] text-white/50 font-mono">{doneSoFar}/{totalHabits} done</span>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 px-4 divide-y divide-white/5">
              {rows.map(row => (
                <div key={row.id} className="flex items-center gap-3 py-3.5">
                  {/* Status dot */}
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    row.status === 'done'   ? 'bg-emerald-500'
                    : row.status === 'missed' ? 'bg-red-500/70'
                    : 'bg-white/15'
                  }`} />

                  {/* Label + rule */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold leading-tight ${
                      row.status === 'done'   ? 'text-emerald-400/70'
                      : row.status === 'missed' ? 'text-red-400/60'
                      : 'text-white/75'
                    }`}>{row.label}</p>
                    <p className="text-[10px] text-white/47 mt-0.5 leading-snug">{row.rule}</p>
                  </div>

                  {/* Status badge */}
                  <span className={`text-[9px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${
                    row.status === 'done'   ? 'border-emerald-500/20 bg-emerald-500/8 text-emerald-400/60'
                    : row.status === 'missed' ? 'border-red-500/20 bg-red-500/8 text-red-400/55'
                    : 'border-white/8 bg-white/3 text-white/47'
                  }`}>
                    {row.status}
                  </span>

                  {/* Action button */}
                  <button
                    onClick={row.canLog ? row.onLog : undefined}
                    disabled={!row.canLog}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors shrink-0 ${
                      row.status === 'done'
                        ? 'border-emerald-500/15 text-emerald-400/35 cursor-default'
                        : !row.canLog
                          ? 'border-white/8 text-white/42 cursor-not-allowed'
                          : row.status === 'missed'
                            ? 'border-red-500/25 text-red-400/60 bg-red-500/8 hover:bg-red-500/15'
                            : 'border-purple-500/30 text-purple-400 bg-purple-500/10 hover:bg-purple-500/20'
                    }`}
                  >
                    {row.status === 'done'   ? 'Done ✓'
                    : row.status === 'missed' ? 'Log late'
                    : 'Log'}
                  </button>
                </div>
              ))}
            </div>

            {bothDone && (
              <div className="rounded-lg border border-emerald-500/15 bg-emerald-500/5 px-4 py-2.5">
                <span className="text-xs text-emerald-400/65">✓ All habits complete — clean day logged</span>
              </div>
            )}
          </div>
        )
      })()}

      {/* ── DISCIPLINE ───────────────────────────────────────────────── */}
      {activeTab === 'discipline' && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className={`rounded-xl border p-4 flex flex-col gap-1 ${
              discipline.wakeUpStreak >= 7 ? 'border-purple-500/30 bg-purple-500/5' : 'border-white/10 bg-white/5'
            }`}>
              <span className="text-xs text-white/40">Wake-up streak</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-purple-400">{discipline.wakeUpStreak}</span>
                <span className="text-xs text-white/55">days</span>
              </div>
              <span className="text-xs text-white/50">
                {discipline.wakeUpStreak >= 7 ? 'Weekly goal hit' : `${7 - discipline.wakeUpStreak} to weekly goal`}
              </span>
              <div className="mt-1 h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500/50 rounded-full" style={{ width: `${Math.min(100, (discipline.wakeUpStreak / 30) * 100)}%` }} />
              </div>
              <span className="text-xs text-white/45">{discipline.wakeUpStreak}/30 stage target</span>
            </div>

            <div className={`rounded-xl border p-4 flex flex-col gap-1 ${
              discipline.sleepStreak >= 7 ? 'border-purple-500/30 bg-purple-500/5' : 'border-white/10 bg-white/5'
            }`}>
              <span className="text-xs text-white/40">Sleep streak</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-purple-400">{discipline.sleepStreak}</span>
                <span className="text-xs text-white/55">days</span>
              </div>
              <span className="text-xs text-white/50">
                {discipline.sleepStreak >= 7 ? 'Weekly goal hit' : `${7 - discipline.sleepStreak} to weekly goal`}
              </span>
              <div className="mt-1 h-1 bg-white/10 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500/50 rounded-full" style={{ width: `${Math.min(100, (discipline.sleepStreak / 30) * 100)}%` }} />
              </div>
              <span className="text-xs text-white/45">{discipline.sleepStreak}/30 stage target</span>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3">
            <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Stage Discipline Score</span>
            <div className="flex items-end justify-between">
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold text-purple-400">{discipline.disciplineDays}</span>
                <span className="text-xs text-white/55">clean days</span>
              </div>
              <span className="text-xs text-white/55">/ 30 target</span>
            </div>
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-purple-500/50 rounded-full transition-all"
                style={{ width: `${Math.min(100, (discipline.disciplineDays / 30) * 100)}%` }}
              />
            </div>
            <p className="text-xs text-white/50">
              A clean day = all required habits logged. {Math.max(0, 30 - discipline.disciplineDays)} days remaining.
            </p>
          </div>

          {/* Current period rule */}
          <div className="rounded-lg border border-white/8 bg-white/3 px-4 py-3 flex flex-col gap-1">
            <span className="text-[10px] text-white/50 uppercase tracking-widest font-semibold">Current Period Rule</span>
            <p className="text-xs text-white/45">
              Wake by <span className="text-white/70 font-semibold">{wakeSchedule.wakeTime}</span>
              {wakeSchedule.allowRecouche
                ? ` · Recouche allowed · Up by ${wakeSchedule.recoucheTime} · Sleep by ${SLEEP_TARGET_HOUR}:00`
                : ` · Sleep by ${SLEEP_TARGET_HOUR}:00 · No recouche`}
            </p>
          </div>

          {/* Life milestone controls */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Life Milestones</span>
              <span className="text-[10px] text-white/45">Stage {currentEssStage.id} gates</span>
            </div>

            {/* Family support log */}
            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <p className={`text-sm font-semibold ${essMetricStatuses['family_support'] === 'required' ? 'text-red-400/80' : 'text-white/55'}`}>
                    Family Support
                  </p>
                  {currentEssStage.id <= 1 ? (
                    <p className="text-[10px] text-white/47 mt-0.5">Unlocks at Stage 2</p>
                  ) : currentEssStage.id === 2 ? (
                    <p className="text-[10px] text-white/47 mt-0.5">
                      This month: <span className="text-white/50 font-semibold">${monthlySupport.toLocaleString()}</span>
                      {' '}· target $500/mo
                    </p>
                  ) : (
                    <p className="text-[10px] text-white/47 mt-0.5">
                      This month: <span className="text-white/50 font-semibold">${monthlySupport.toLocaleString()}</span>
                      {' '}· {consec1500} / 3 consecutive months at $1,500+
                    </p>
                  )}
                </div>
                {essMetricStatuses['family_support'] === 'required' && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded border border-red-500/25 bg-red-500/10 text-red-400/70 font-semibold uppercase shrink-0">Required</span>
                )}
              </div>
              {currentEssStage.id <= 1 ? (
                <div className="px-3 py-2.5 rounded-lg border border-white/8 bg-white/3 opacity-50">
                  <span className="text-[10px] text-white/50">Locked — available from Stage 2</span>
                </div>
              ) : (
                <>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min="0"
                      step="50"
                      placeholder={`Amount ($) · target $${currentEssStage.id === 2 ? '500' : '1,500'}/mo`}
                      value={fsSupportInput}
                      onChange={e => setFsSupportInput(e.target.value)}
                      className="flex-1 bg-white/5 border border-white/12 rounded-lg px-3 py-2 text-sm text-white/75 placeholder:text-white/45 focus:outline-none focus:border-purple-500/40"
                    />
                    <button
                      onClick={logFamilySupport}
                      disabled={!fsSupportInput || parseFloat(fsSupportInput) <= 0}
                      className="px-4 py-2 rounded-lg text-xs font-semibold border border-purple-500/30 text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 disabled:opacity-30 disabled:cursor-not-allowed transition-colors shrink-0"
                    >
                      Log
                    </button>
                  </div>
                  {structural.familySupport.length > 0 && (
                    <div className="flex flex-col gap-1 rounded-lg border border-white/6 bg-white/3 px-3 py-2">
                      <span className="text-[9px] text-white/45 uppercase tracking-widest mb-0.5">Recent contributions</span>
                      {structural.familySupport.slice(-5).reverse().map((e, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-[10px] text-white/55 font-mono">{e.date}</span>
                          <span className="text-[10px] text-white/55 font-semibold">${e.amount.toLocaleString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Independent living toggle */}
            {currentEssStage.id <= 3 ? (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-white/6 bg-white/2 opacity-50">
                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-white/10" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight text-white/35">Independent Living</p>
                  <p className="text-[10px] text-white/45 mt-0.5">Locked until Stage 4</p>
                </div>
              </div>
            ) : (
              <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${
                structural.independentLiving.active
                  ? essMetricStatuses['independent_living'] === 'required'
                    ? 'border-red-500/20 bg-red-500/5'
                    : 'border-emerald-500/15 bg-emerald-500/4'
                  : 'border-white/8 bg-white/3'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  structural.independentLiving.active
                    ? essMetricStatuses['independent_living'] === 'required' ? 'bg-red-400' : 'bg-emerald-500'
                    : 'bg-white/15'
                }`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold leading-tight ${
                    structural.independentLiving.active
                      ? essMetricStatuses['independent_living'] === 'required' ? 'text-red-400/80' : 'text-emerald-400/70'
                      : 'text-white/50'
                  }`}>
                    Independent Living
                  </p>
                  <p className="text-[10px] text-white/47 mt-0.5">
                    {structural.independentLiving.active && structural.independentLiving.activeSince
                      ? `Active since ${structural.independentLiving.activeSince} · ${independentMonths} month${independentMonths !== 1 ? 's' : ''}`
                      : STRUCTURAL_DISPLAY['independent_living'].sublabel}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {essMetricStatuses['independent_living'] === 'required' && !structural.independentLiving.active && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded border border-red-500/25 bg-red-500/10 text-red-400/70 font-semibold uppercase">Required</span>
                  )}
                  <button
                    onClick={toggleIndependentLiving}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                      structural.independentLiving.active
                        ? 'border-white/10 text-white/55 hover:text-white/50 hover:border-white/20'
                        : 'border-purple-500/30 text-purple-400 bg-purple-500/10 hover:bg-purple-500/20'
                    }`}
                  >
                    {structural.independentLiving.active ? 'Deactivate' : 'Activate'}
                  </button>
                </div>
              </div>
            )}

            {/* Stable independent life — derived */}
            {(() => {
              const isStable = structural.independentLiving.active && independentMonths >= 6
              return (
                <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${
                  isStable ? 'border-emerald-500/15 bg-emerald-500/4' : 'border-white/6 bg-white/2 opacity-50'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isStable ? 'bg-emerald-500' : 'bg-white/10'}`} />
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold leading-tight ${isStable ? 'text-emerald-400/70' : 'text-white/35'}`}>
                      Stable Independent Life
                    </p>
                    <p className="text-[10px] text-white/45 mt-0.5">
                      {isStable
                        ? `Derived — ${independentMonths} months independent`
                        : `Derived — requires 6 months independent living (${independentMonths} / 6)`}
                    </p>
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded border font-semibold uppercase shrink-0 ${
                    isStable
                      ? 'border-emerald-500/20 bg-emerald-500/8 text-emerald-400/60'
                      : 'border-white/8 bg-white/3 text-white/45'
                  }`}>
                    {isStable ? 'Active' : 'Pending'}
                  </span>
                </div>
              )
            })()}
          </div>

          <StageReqBar title={req.title} current={req.current} target={req.target} unit={req.unit} accent="purple" />
        </div>
      )}

      {/* ── FEEDBACK ─────────────────────────────────────────────────── */}
      {activeTab === 'feedback' && (
        <div className="flex flex-col gap-4">

          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Weekly Dashboard</span>
            <span className="text-[10px] text-white/45 font-mono">{fbWeekDays[0]?.iso} → {fbWeekDays[6]?.iso}</span>
          </div>

          {/* Week grid */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-0">
            <div className="grid grid-cols-[2.75rem_1fr_1fr_1fr] gap-x-3 pb-2.5 border-b border-white/6 mb-1">
              <span />
              {(['Wake', 'Sleep', 'Clean Day'] as const).map(label => (
                <span key={label} className="text-[9px] text-white/50 uppercase tracking-widest text-center font-semibold">
                  {label}
                </span>
              ))}
            </div>

            {fbDashboard.map(day => (
              <div
                key={day.iso}
                className={`grid grid-cols-[2.75rem_1fr_1fr_1fr] gap-x-3 items-center py-2 border-b border-white/4 last:border-0 ${
                  day.isToday ? 'rounded-lg' : ''
                }`}
              >
                <div className="flex flex-col leading-none gap-0.5">
                  <span className={`text-[9px] font-semibold ${day.isToday ? 'text-white/55' : 'text-white/47'}`}>{day.label}</span>
                  <span className={`text-[10px] font-mono ${day.isToday ? 'text-white/40' : 'text-white/42'}`}>{day.num}</span>
                </div>
                {([day.wake, day.sleep, day.cleanDay] as const).map((status, i) => (
                  <div key={i} className="flex justify-center items-center">
                    {status
                      ? <span className={`w-2.5 h-2.5 rounded-full ${ESS_DOT[status]}`} />
                      : <span className="text-[9px] text-white/40">—</span>
                    }
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 px-1">
            <span className="text-[9px] text-white/45 uppercase tracking-widest">Key</span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-[9px] text-white/50">Done</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
              <span className="text-[9px] text-white/50">Missed</span>
            </span>
            <span className="text-[9px] text-white/40 ml-auto">— = future</span>
          </div>

          {/* Weekly summary */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-4">
            <span className="text-[10px] text-white/35 uppercase tracking-widest font-semibold">Weekly Summary</span>

            {/* Overall compliance */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-baseline gap-2">
                <span className={`text-3xl font-black tabular-nums leading-none ${
                  fbWeekSummary.overallPct === null ? 'text-white/45'
                  : fbWeekSummary.overallPct >= 80  ? 'text-emerald-400'
                  : fbWeekSummary.overallPct >= 50  ? 'text-amber-400'
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

            {/* Habit cards */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: 'Wake',      pct: fbWeekSummary.wakePct  },
                { label: 'Sleep',     pct: fbWeekSummary.sleepPct },
                { label: 'Clean Days', pct: (() => {
                    const past = fbDashboard.filter(d => !d.isFuture && !d.isToday).length
                    return past > 0 ? Math.round((fbWeekSummary.cleanDays / past) * 100) : null
                  })() },
              ].map(card => {
                const barColor = card.pct === null ? 'bg-white/12'
                  : card.pct >= 80 ? 'bg-emerald-500/55'
                  : card.pct >= 50 ? 'bg-amber-400/55'
                  : 'bg-red-500/55'
                return (
                  <div key={card.label} className="rounded-lg border border-white/8 bg-white/3 px-3 py-2.5 flex flex-col gap-1.5">
                    <span className="text-[9px] text-white/52 uppercase tracking-widest">{card.label}</span>
                    <span className={`text-base font-black tabular-nums leading-none ${
                      card.pct === null ? 'text-white/45'
                      : card.pct >= 80  ? 'text-emerald-400/80'
                      : card.pct >= 50  ? 'text-amber-400/80'
                      : 'text-red-400/80'
                    }`}>
                      {card.pct !== null ? `${card.pct}%` : '—'}
                    </span>
                    <div className="h-0.5 bg-white/8 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${barColor}`} style={{ width: `${card.pct ?? 0}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Weakest habit */}
            {fbWeekSummary.weakest && fbWeekSummary.overallPct !== null && fbWeekSummary.overallPct < 100 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-amber-500/15 bg-amber-500/4">
                <span className="text-[9px] text-white/50 uppercase tracking-widest shrink-0">Weakest</span>
                <span className="text-xs text-amber-400/70 font-semibold">{fbWeekSummary.weakest}</span>
                <span className="ml-auto text-[10px] text-amber-400/45 font-mono">
                  {fbWeekSummary.weakest === 'Wake' ? fbWeekSummary.wakePct : fbWeekSummary.sleepPct}%
                </span>
              </div>
            )}

            {/* Stage-aware metric priority */}
            {(() => {
              const HABIT_LABELS: Record<string, string> = {
                wake: 'Wake-up', sleep: 'Sleep',
                morning_routine: 'Morning Routine', evening_routine: 'Evening Routine', clean_day: 'Clean Day',
              }
              const habitIds = ['wake', 'sleep', 'morning_routine', 'evening_routine', 'clean_day'] as const
              const requiredHabits   = habitIds.filter(id => essMetricStatuses[id] === 'required')
              const maintainedHabits = habitIds.filter(id => essMetricStatuses[id] === 'maintained')

              // Structural warnings
              const familySupportRequired = essMetricStatuses['family_support'] === 'required'
              const indepRequired         = essMetricStatuses['independent_living'] === 'required'
              const stableRequired        = essMetricStatuses['stable_independent_life'] === 'required'
              const familyMissing  = familySupportRequired && monthlySupport < 500
              const indepMissing   = indepRequired && !structural.independentLiving.active
              const stableMissing  = stableRequired && independentMonths < 6

              return (
                <div className="flex flex-col gap-2 pt-1 border-t border-white/6">
                  <span className="text-[9px] text-white/45 uppercase tracking-widest font-semibold">
                    Stage {currentEssStage.id} — metric priority
                  </span>

                  {/* Required habits */}
                  {requiredHabits.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {requiredHabits.map(id => (
                        <span key={id} className="text-[9px] px-1.5 py-0.5 rounded border border-red-500/20 bg-red-500/6 text-red-400/70 font-semibold">
                          {HABIT_LABELS[id]} (required)
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Maintained habits */}
                  {maintainedHabits.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {maintainedHabits.map(id => (
                        <span key={id} className="text-[9px] px-1.5 py-0.5 rounded border border-purple-500/15 bg-purple-500/5 text-purple-400/60 font-semibold">
                          {HABIT_LABELS[id]} (maintained)
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Missing required structural metrics */}
                  <div className="flex flex-col gap-1">
                    {familyMissing && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/15 bg-red-500/4">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400/60 shrink-0" />
                        <span className="text-[10px] text-red-400/70 font-semibold">Family Support</span>
                        <span className="text-[9px] text-white/45 ml-auto">
                          ${monthlySupport.toLocaleString()} / $500/mo required
                        </span>
                      </div>
                    )}
                    {indepMissing && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/15 bg-red-500/4">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400/60 shrink-0" />
                        <span className="text-[10px] text-red-400/70 font-semibold">Independent Living</span>
                        <span className="text-[9px] text-white/45 ml-auto">Required — not activated</span>
                      </div>
                    )}
                    {stableMissing && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-red-500/15 bg-red-500/4">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-400/60 shrink-0" />
                        <span className="text-[10px] text-red-400/70 font-semibold">Stable Independent Life</span>
                        <span className="text-[9px] text-white/45 ml-auto">{independentMonths} / 6 months</span>
                      </div>
                    )}
                  </div>

                  {/* Stage progress summary */}
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/8 bg-white/3">
                    <span className="text-[9px] text-white/50 uppercase tracking-widest">Stage progress</span>
                    <span className="text-[10px] font-semibold text-purple-400/70 font-mono ml-auto">{essStageProgress.pct}%</span>
                    <span className="text-[9px] text-white/45 font-mono">{essStageProgress.primary}</span>
                  </div>
                </div>
              )
            })()}

            {/* Missed days */}
            {fbWeekSummary.missed.length > 0 ? (
              <div className="flex flex-col gap-1">
                <span className="text-[9px] text-white/50 uppercase tracking-widest mb-0.5">Missed</span>
                {fbWeekSummary.missed.map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-red-400/45 text-[10px] mt-px shrink-0">·</span>
                    <span className="text-[10px] text-white/35">{item}</span>
                  </div>
                ))}
              </div>
            ) : fbWeekSummary.overallPct !== null ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-emerald-500/15 bg-emerald-500/4">
                <span className="text-[10px] text-emerald-400/65">✓ No missed days this week</span>
              </div>
            ) : (
              <p className="text-[10px] text-white/45 italic">No completed days yet this week.</p>
            )}

            <p className="text-[9px] text-white/40 italic -mt-1">
              Clean day = all required habits logged · Today excluded until complete
            </p>
          </div>

        </div>
      )}

    </div>
  )
}
