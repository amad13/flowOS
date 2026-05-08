import { supabase } from './supabaseClient'

// ── Types ─────────────────────────────────────────────────────────────────────
export type ExportPeriod = 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'year'

// ── Toronto Eastern Time helpers ──────────────────────────────────────────────
const TZ = 'America/Toronto'

/**
 * Returns YYYY-MM-DD for the current date in Toronto ET.
 * 'en-CA' locale reliably outputs ISO date format on every browser/OS.
 */
function etToday(): string {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: TZ })
  } catch {
    // Fallback: approximate ET as UTC-4
    return new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString().slice(0, 10)
  }
}

/**
 * Returns day-of-week in Toronto ET (0 = Sun … 6 = Sat).
 * Uses weekday:'short' which is consistent across all browsers.
 */
function etDayOfWeek(): number {
  try {
    const s = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(new Date())
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(s)
  } catch {
    return new Date().getDay()
  }
}

/** Returns 0-based month in Toronto ET, derived from the ISO date string. */
function etMonth(): number {
  return parseInt(etToday().slice(5, 7), 10) - 1
}

/** Returns full year in Toronto ET. */
function etYear(): number {
  return parseInt(etToday().slice(0, 4), 10)
}

/**
 * Returns a human-readable timestamp like "2026-04-05 14:32 ET".
 * Uses en-GB locale (24-hour by default) to avoid hour12:false quirks on Safari.
 */
function etTimestamp(): string {
  const today = etToday()
  try {
    // en-GB + no hour12 option → '14:32' reliably on all browsers including iOS Safari
    const hhmm = new Date().toLocaleTimeString('en-GB', {
      timeZone: TZ, hour: '2-digit', minute: '2-digit',
    })
    return `${today} ${hhmm} ET`
  } catch {
    return `${today} ET`
  }
}

/** Adds N days to an ISO date string without DST issues. */
function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function getDateRange(period: ExportPeriod): { start: string; end: string; label: string } {
  const today = etToday()

  switch (period) {
    case 'today':
      return { start: today, end: today, label: 'Today' }

    case 'yesterday': {
      const yest = addDays(today, -1)
      return { start: yest, end: yest, label: 'Yesterday' }
    }

    case 'week': {
      const sun = addDays(today, -etDayOfWeek())
      return { start: sun, end: today, label: 'This Week (Sun → now)' }
    }

    case 'month': {
      const start = `${today.slice(0, 7)}-01`
      return { start, end: today, label: `This Month (${today.slice(0, 7)})` }
    }

    case 'quarter': {
      const q     = Math.floor(etMonth() / 3)
      const year  = etYear()
      const qMon  = String(q * 3 + 1).padStart(2, '0')
      return {
        start: `${year}-${qMon}-01`,
        end:   today,
        label: `Q${q + 1} ${year}`,
      }
    }

    case 'year': {
      const year = etYear()
      return { start: `${year}-01-01`, end: today, label: `${year}` }
    }
  }
}

// ── Formatting helpers ────────────────────────────────────────────────────────
function hm(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

// ── Main export function ──────────────────────────────────────────────────────
export async function generateExport(userId: string, period: ExportPeriod): Promise<string> {
  const { start, end, label } = getDateRange(period)
  const now = etTimestamp()

  // ── Fetch all tables in parallel ──────────────────────────────────────────
  const [
    svcRes, salahRes, readRes, weekModRes,
    habitRes, blocksRes, notesRes, workoutRes, nutRes,
  ] = await Promise.all([
    supabase.from('service_records')
      .select('record_date,emails,calls,meetings_booked,meetings_held,deals,revenue')
      .eq('user_id', userId).gte('record_date', start).lte('record_date', end)
      .order('record_date'),

    supabase.from('salah_records')
      .select('record_date,count')
      .eq('user_id', userId).gte('record_date', start).lte('record_date', end)
      .order('record_date'),

    supabase.from('reading_logs')
      .select('log_date,done,minutes')
      .eq('user_id', userId).gte('log_date', start).lte('log_date', end)
      .order('log_date'),

    supabase.from('week_records')
      .select('week_id,done,insight')
      .eq('user_id', userId)
      .gte('week_id', start.slice(0, 7))
      .lte('week_id', end.slice(0, 7)),

    supabase.from('habit_records')
      .select('record_date,wake,sleep,recouche,morning_routine,evening_routine')
      .eq('user_id', userId).gte('record_date', start).lte('record_date', end)
      .order('record_date'),

    supabase.from('work_sessions')
      .select('session_date,type,is_deep_work,minutes,note')
      .eq('user_id', userId).gte('session_date', start).lte('session_date', end)
      .order('session_date'),

    supabase.from('flow_notes')
      .select('created_at,flow,content')
      .eq('user_id', userId)
      .gte('created_at', `${start}T00:00:00`)
      .lte('created_at', `${end}T23:59:59`)
      .order('created_at', { ascending: false }),

    supabase.from('completed_workouts')
      .select('workout_date,workout_name,notes')
      .eq('user_id', userId).gte('workout_date', start).lte('workout_date', end)
      .order('workout_date'),

    supabase.from('nutrition_logs')
      .select('log_date,bodyweight,calories,protein,carbs,fats,water_intake')
      .eq('user_id', userId).gte('log_date', start).lte('log_date', end)
      .order('log_date'),
  ])

  const svc      = svcRes.data      ?? []
  const salah    = salahRes.data    ?? []
  const reading  = readRes.data     ?? []
  const weekMods = weekModRes.data  ?? []
  const habits   = habitRes.data    ?? []
  const sessions = blocksRes.data   ?? []
  const notes    = notesRes.data    ?? []
  const workouts = workoutRes.data  ?? []
  const nut      = nutRes.data      ?? []

  // ── Build report lines ────────────────────────────────────────────────────
  const L: string[] = []
  const ln  = (...s: string[]) => L.push(...s)
  const gap = ()               => L.push('')

  // Header
  ln(
    '═══════════════════════════════════════════',
    'FLOWOS REPORT',
    `Period  : ${label}`,
    `From    : ${start}`,
    `To      : ${end}`,
    `Exported: ${now}`,
    '═══════════════════════════════════════════',
  )
  gap()

  // ── MOTION ────────────────────────────────────────────────────────────────
  ln('MOTION', '───────────────────────────────────────────')

  const totalRev = svc.reduce((s, r) => s + (r.revenue ?? 0), 0)

  if (svc.length === 0) {
    ln('  No data logged.')
  } else {
    const emails = svc.reduce((s, r) => s + (r.emails          ?? 0), 0)
    const calls  = svc.reduce((s, r) => s + (r.calls           ?? 0), 0)
    const booked = svc.reduce((s, r) => s + (r.meetings_booked ?? 0), 0)
    const held   = svc.reduce((s, r) => s + (r.meetings_held   ?? 0), 0)
    const deals  = svc.reduce((s, r) => s + (r.deals           ?? 0), 0)
    ln(
      `    Emails sent      : ${emails}`,
      `    Calls done       : ${calls}`,
      `    Meetings booked  : ${booked}`,
      `    Meetings held    : ${held}`,
      `    Deals closed     : ${deals}`,
      `    Revenue          : $${totalRev.toLocaleString()}`,
    )
  }
  gap()

  // ── DEEN ─────────────────────────────────────────────────────────────────
  ln('DEEN', '───────────────────────────────────────────')

  if (salah.length === 0 && reading.length === 0 && weekMods.length === 0) {
    ln('  No data logged.')
  } else {
    if (salah.length > 0) {
      const totalPrayers = salah.reduce((s, r) => s + (r.count ?? 0), 0)
      const fullDays     = salah.filter(r => (r.count ?? 0) >= 5).length
      ln(
        '  Salah',
        `    Days tracked     : ${salah.length}`,
        `    Total prayers    : ${totalPrayers}`,
        `    Full days (5/5)  : ${fullDays}/${salah.length}`,
      )
      if (period === 'today' || period === 'week') {
        salah.forEach(r => ln(`    ${r.record_date}  → ${r.count}/5`))
      }
    }

    if (reading.length > 0) {
      gap()
      const done  = reading.filter(r => r.done).length
      const mins  = reading.reduce((s, r) => s + (r.minutes ?? 0), 0)
      ln(
        '  Arabic Reading',
        `    Days tracked     : ${reading.length}`,
        `    Sessions done    : ${done}/${reading.length}`,
        `    Total time       : ${hm(mins)}`,
      )
    }

    if (weekMods.length > 0) {
      gap()
      const completedMods = weekMods.filter(w => w.done).length
      ln(
        '  Weekly Modules',
        `    Completed        : ${completedMods}/${weekMods.length}`,
      )
    }
  }
  gap()

  // ── CREED ────────────────────────────────────────────────────────────────
  ln('CREED', '───────────────────────────────────────────')

  if (workouts.length === 0 && nut.length === 0) {
    ln('  No data logged.')
  } else {
    if (workouts.length > 0) {
      ln(`  Training`, `    Sessions logged  : ${workouts.length}`)
      workouts.forEach(w =>
        ln(`    ${w.workout_date}  ${w.workout_name}${w.notes ? `  — ${w.notes}` : ''}`)
      )
    }

    if (nut.length > 0) {
      if (workouts.length > 0) gap()
      const avgCal  = Math.round(nut.reduce((s, r) => s + (r.calories     ?? 0), 0) / nut.length)
      const avgPro  = Math.round(nut.reduce((s, r) => s + (r.protein      ?? 0), 0) / nut.length)
      const avgCarb = Math.round(nut.reduce((s, r) => s + (r.carbs        ?? 0), 0) / nut.length)
      const avgFat  = Math.round(nut.reduce((s, r) => s + (r.fats         ?? 0), 0) / nut.length)
      const lastW   = nut[nut.length - 1]?.bodyweight
      ln(
        '  Nutrition',
        `    Days tracked     : ${nut.length}`,
        `    Avg calories     : ${avgCal} kcal`,
        `    Avg protein      : ${avgPro}g`,
        `    Avg carbs        : ${avgCarb}g`,
        `    Avg fats         : ${avgFat}g`,
      )
      if (lastW) ln(`    Latest weight    : ${lastW} kg`)
    }
  }
  gap()

  // ── ESSENTIALS ───────────────────────────────────────────────────────────
  ln('ESSENTIALS', '───────────────────────────────────────────')

  if (habits.length === 0) {
    ln('  No data logged.')
  } else {
    const n         = habits.length
    const wakeOK    = habits.filter(r => r.wake).length
    const sleepOK   = habits.filter(r => r.sleep).length
    const morningOK = habits.filter(r => r.morning_routine).length
    const eveningOK = habits.filter(r => r.evening_routine).length
    const cleanDays = habits.filter(r =>
      r.wake && r.sleep && r.morning_routine && r.evening_routine
    ).length

    ln(
      `  Days tracked     : ${n}`,
      `  Wake on time     : ${wakeOK}/${n}`,
      `  Morning routine  : ${morningOK}/${n}`,
      `  Evening routine  : ${eveningOK}/${n}`,
      `  Sleep on time    : ${sleepOK}/${n}`,
      `  Clean days       : ${cleanDays}/${n}`,
    )
  }
  gap()

  // ── BLOCKS EXECUTED ──────────────────────────────────────────────────────
  ln('BLOCKS EXECUTED', '───────────────────────────────────────────')

  const homeBlocks = sessions.filter(s => String(s.note ?? '').startsWith('home-block:'))
  const deepWork   = sessions.filter(s => s.is_deep_work && !String(s.note ?? '').startsWith('home-block:'))

  if (homeBlocks.length === 0 && deepWork.length === 0) {
    ln('  No blocks logged.')
  } else {
    if (homeBlocks.length > 0) {
      const totalMins = homeBlocks.reduce((s, r) => s + (r.minutes ?? 0), 0)
      ln(
        `  Focus blocks     : ${homeBlocks.length}`,
        `  Total time       : ${hm(totalMins)}`,
      )

      // Group by flow
      const byFlow: Record<string, number> = {}
      homeBlocks.forEach(b => {
        const flow = String(b.note ?? '').replace('home-block:', '')
        byFlow[flow] = (byFlow[flow] ?? 0) + (b.minutes ?? 0)
      })
      Object.entries(byFlow).forEach(([flow, mins]) =>
        ln(`    ${capitalize(flow).padEnd(12)}: ${mins} min`)
      )
    }

    if (deepWork.length > 0) {
      if (homeBlocks.length > 0) gap()
      const totalMins = deepWork.reduce((s, r) => s + (r.minutes ?? 0), 0)
      ln(
        `  Deep work sessions: ${deepWork.length}`,
        `  Total time        : ${hm(totalMins)}`,
      )
    }
  }
  gap()

  // ── NOTES ────────────────────────────────────────────────────────────────
  ln('NOTES', '───────────────────────────────────────────')

  if (notes.length === 0) {
    ln('  No notes logged.')
  } else {
    notes.forEach(n => {
      const date = String(n.created_at ?? '').slice(0, 10)
      const flow = String(n.flow ?? 'general').toUpperCase()
      ln(`  [${date}] [${flow}]`, `  ${n.content}`)
      gap()
    })
  }
  gap()

  // Footer
  ln(
    '═══════════════════════════════════════════',
    `End of FlowOS Report — ${end}`,
    '═══════════════════════════════════════════',
  )

  return L.join('\n')
}
