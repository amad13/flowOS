import { useState, useMemo, useEffect } from 'react'
import type { StageRequirement, FlowState, HomeState, FlowStatus, FlowType } from '../data/types'
import { supabase } from '../lib/supabaseClient'
import { useUser } from '../components/AuthGate'
import { stages, scheduleBlocks } from '../data/mockState'
import { computeHomeState } from '../engine/brain'
import BlockStartCard from '../components/BlockStartCard'
import ConsequenceCard from '../components/ConsequenceCard'
import CurrentBlockCard from '../components/CurrentBlockCard'
import FocusTimer from '../components/FocusTimer'
import AvatarCard from '../components/AvatarCard'
import StageProgressCard from '../components/StageProgressCard'
import FlowPriorityCard from '../components/FlowPriorityCard'
import StageStatusCard from '../components/StageStatusCard'
import DisciplineCard from '../components/DisciplineCard'
import FlowNotesCard from '../components/FlowNotesCard'
import { flowDisplayName, flowText } from '../data/flowColors'

// ── Constants ─────────────────────────────────────────────────────────────────
const MOTION_TARGET   = 3000
const ESS_HABIT_TOTAL = 4

// ── Types ─────────────────────────────────────────────────────────────────────
type TodayHabits = { wake: boolean; sleep: boolean; morning: boolean; evening: boolean }
type BlockEntry  = { id: string; flow: string; duration: number; date: string }

// ── Helpers ───────────────────────────────────────────────────────────────────
function getToday():                 string { return new Date().toISOString().slice(0, 10) }
function getMonthStart(t: string):   string { return `${t.slice(0, 7)}-01` }
function getNextMonthStart(ms: string): string {
  const d = new Date(ms + 'T12:00:00')
  d.setMonth(d.getMonth() + 1)
  return d.toISOString().slice(0, 10)
}

function getYesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().slice(0, 10)
}

export default function Home() {
  const user      = useUser()
  const today     = getToday()
  const yesterday = getYesterday()
  const mStart    = getMonthStart(today)
  const mNext     = getNextMonthStart(mStart)

  // ── Block session state ───────────────────────────────────────────────────
  const [blockStatus,    setBlockStatus]    = useState<'idle' | 'running' | 'done' | 'failed'>('idle')
  const [blockStartedAt, setBlockStartedAt] = useState<number | null>(null)
  const [selectedFlow,   setSelectedFlow]   = useState<FlowType>('motion')
  const [selectedDur,    setSelectedDur]    = useState(30)
  const [blockHistory,   setBlockHistory]   = useState<BlockEntry[]>([])
  const [blocksLogged,   setBlocksLogged]   = useState(0)
  const [focusMode,      setFocusMode]      = useState(false)

  // ── Real DB state ─────────────────────────────────────────────────────────
  const [monthRevSvc, setMonthRevSvc] = useState(0)
  const [todaySalah,  setTodaySalah]  = useState(0)
  const [todayHabits, setTodayHabits] = useState<TodayHabits>({
    wake: false, sleep: false, morning: false, evening: false,
  })

  // ── Motion ────────────────────────────────────────────────────────────────
  const motionRevenue = monthRevSvc
  const motionPct     = Math.min(100, Math.round(motionRevenue / MOTION_TARGET * 100))
  const motionDeficit = Math.max(0, MOTION_TARGET - motionRevenue)
  const motionStatus  = (motionPct >= 100 ? 'on_track' : motionPct >= 50 ? 'behind' : 'failing') as FlowStatus

  // ── Deen ──────────────────────────────────────────────────────────────────
  const deenPct    = Math.min(100, Math.round(todaySalah / 5 * 100))
  const deenStatus = (todaySalah >= 5 ? 'on_track' : todaySalah > 0 ? 'behind' : 'failing') as FlowStatus

  // ── Essentials ────────────────────────────────────────────────────────────
  const essDone   = (todayHabits.wake ? 1 : 0) + (todayHabits.sleep ? 1 : 0)
                  + (todayHabits.morning ? 1 : 0) + (todayHabits.evening ? 1 : 0)
  const essPct    = Math.round(essDone / ESS_HABIT_TOTAL * 100)
  const essStatus = (essDone >= ESS_HABIT_TOTAL ? 'on_track' : essDone > 0 ? 'behind' : 'failing') as FlowStatus

  // ── Discipline ────────────────────────────────────────────────────────────
  const disciplineScore = Math.round((motionPct + deenPct + essPct) / 3)
  const momentum        = (disciplineScore >= 80 ? 'HIGH' : disciplineScore >= 50 ? 'MEDIUM' : 'LOW') as 'LOW' | 'MEDIUM' | 'HIGH'

  // ── Stage requirements ────────────────────────────────────────────────────
  const reqs = useMemo<StageRequirement[]>(() => [
    { id: 'sr-1', flow: 'motion',     title: 'Earn $3,000 revenue', target: MOTION_TARGET,   current: motionRevenue, unit: '$',       isCompleted: motionRevenue >= MOTION_TARGET, locked: true },
    { id: 'sr-2', flow: 'creed',      title: '8 weeks consistency',  target: 8,              current: 0,            unit: 'weeks',   isCompleted: false,                          locked: true },
    { id: 'sr-3', flow: 'deen',       title: 'Daily salah (5/5)',    target: 5,              current: todaySalah,   unit: 'prayers', isCompleted: todaySalah >= 5,               locked: true },
    { id: 'sr-4', flow: 'essentials', title: 'Daily habits (4/4)',   target: ESS_HABIT_TOTAL, current: essDone,     unit: 'habits',  isCompleted: essDone >= ESS_HABIT_TOTAL,    locked: true },
  ], [motionRevenue, todaySalah, essDone])

  // ── Flow states ───────────────────────────────────────────────────────────
  const flows = useMemo<FlowState[]>(() => [
    { flow: 'motion',     priorityMode: 'dominant',  status: motionStatus },
    { flow: 'creed',      priorityMode: 'maintain',  status: 'on_track'  },
    { flow: 'deen',       priorityMode: 'minimum',   status: deenStatus  },
    { flow: 'essentials', priorityMode: 'required',  status: essStatus   },
  ], [motionStatus, deenStatus, essStatus])

  // ── HomeState (brain) ─────────────────────────────────────────────────────
  const homeState: HomeState = useMemo(() =>
    computeHomeState({
      stages,
      stageRequirements: reqs,
      flowStates: flows,
      scheduleBlocks,
      operationalMetrics: [],
      now: new Date().toISOString(),
    }),
    [reqs, flows],
  )

  // ── WHY THIS NOW ──────────────────────────────────────────────────────────
  const actionWhy = useMemo(() => {
    if (motionDeficit <= 0) return 'Motion target met this month. Maintain momentum for Stage 2.'
    return `Motion is ${motionPct}% complete — $${motionDeficit.toLocaleString()} behind target. This block is required.`
  }, [motionPct, motionDeficit])

  // ── IF YOU STOP NOW ───────────────────────────────────────────────────────
  const consequences = useMemo(() => {
    const items: string[] = []
    if (motionDeficit > 0)
      items.push(`Motion: $${motionDeficit.toLocaleString()} deficit — Stage 1 deadline slips.`)
    if (deenStatus === 'failing')
      items.push('Deen: No salah logged today.')
    else if (deenStatus === 'behind')
      items.push(`Deen: ${todaySalah}/5 prayers — ${5 - todaySalah} remaining.`)
    if (essStatus === 'failing')
      items.push('Essentials: No habits logged today.')
    else if (essStatus === 'behind')
      items.push(`Essentials: ${essDone}/${ESS_HABIT_TOTAL} habits done.`)
    return items.length > 0 ? items : ['All flows on track. Maintain output or fall behind.']
  }, [motionDeficit, deenStatus, todaySalah, essStatus, essDone])

  // ── Avatar ────────────────────────────────────────────────────────────────
  const avatarData = useMemo(() => ({
    statusLabel:    disciplineScore >= 80 ? 'On Track' : disciplineScore >= 50 ? 'Behind' : 'Struggling',
    lastEvolution:  '—',
    flowIndicators: flows.map(fs => ({ flow: fs.flow, state: fs.status })),
  }), [flows, disciplineScore])

  const weeklyOutcomes = useMemo(() =>
    flows.map(fs => ({
      flow:   fs.flow,
      result: (fs.status === 'failing' ? 'FAIL' : 'PASS') as 'PASS' | 'FAIL',
    })),
    [flows],
  )

  // ── Block history fetch (shared — called on mount and after insert) ────────
  function fetchBlocks() {
    if (!user) return
    supabase
      .from('work_sessions')
      .select('id, session_date, note, minutes')
      .eq('user_id', user.id)
      .like('note', 'home-block:%')
      .gte('session_date', yesterday)
      .order('session_date', { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error('[home] fetch blocks:', error); return }
        setBlockHistory((data ?? []).map(r => ({
          id:       String(r.id),
          flow:     String(r.note ?? '').replace('home-block:', ''),
          duration: Number(r.minutes ?? 0),
          date:     String(r.session_date ?? ''),
        })))
      })
  }

  // ── Fetch all real data ───────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return

    // Motion: service_records for current month
    supabase
      .from('service_records')
      .select('revenue')
      .eq('user_id', user.id)
      .gte('record_date', mStart)
      .lt('record_date', mNext)
      .then(({ data, error }) => {
        if (error) { console.error('[home] fetch service_records:', error); return }
        setMonthRevSvc((data ?? []).reduce((s, r) => s + (r.revenue ?? 0), 0))
      })

    // Deen: today's salah count
    supabase
      .from('salah_records')
      .select('count')
      .eq('user_id', user.id)
      .eq('record_date', today)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error('[home] fetch salah_records:', error); return }
        if (data) setTodaySalah(Math.min(5, data.count ?? 0))
      })

    // Essentials: today's habits
    supabase
      .from('habit_records')
      .select('wake, sleep, morning_routine, evening_routine')
      .eq('user_id', user.id)
      .eq('record_date', today)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error('[home] fetch habit_records:', error); return }
        if (data) setTodayHabits({
          wake:    data.wake            ?? false,
          sleep:   data.sleep           ?? false,
          morning: data.morning_routine ?? false,
          evening: data.evening_routine ?? false,
        })
      })

    // Recent home blocks
    fetchBlocks()

  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Block handlers ────────────────────────────────────────────────────────
  function handleStart() {
    setBlockStatus('running')
    setBlockStartedAt(Date.now())
  }

  function handleBlockDone() {
    setFocusMode(false)
    setBlockStatus('done')
    const elapsed   = blockStartedAt ? Math.round((Date.now() - blockStartedAt) / 60000) : selectedDur
    const actualMin = Math.max(1, elapsed)
    const tempId    = `__tmp_${Date.now()}`

    // Optimistic: add to today's list immediately
    setBlockHistory(prev => [
      { id: tempId, flow: selectedFlow, duration: actualMin, date: today },
      ...prev,
    ])
    setBlocksLogged(prev => prev + 1)

    // Persist — source of truth
    if (user) {
      supabase
        .from('work_sessions')
        .insert({
          user_id:      user.id,
          session_date: today,
          type:         'service',
          category:     'building',
          is_deep_work: true,
          minutes:      actualMin,
          note:         `home-block:${selectedFlow}`,
        })
        .select('id')
        .then(({ error }) => {
          if (error) {
            console.error('[home] insert work_sessions:', error)
            setBlockHistory(prev => prev.filter(e => e.id !== tempId))
            return
          }
          // Re-fetch to replace temp entry with real persisted data
          fetchBlocks()
        })
    }

    setTimeout(() => setBlockStatus('idle'), 1500)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Fullscreen focus timer */}
      {focusMode && blockStatus === 'running' && blockStartedAt !== null && (
        <FocusTimer
          flow={selectedFlow}
          duration={selectedDur}
          startedAt={blockStartedAt}
          onDone={handleBlockDone}
          onClose={() => setFocusMode(false)}
        />
      )}
      {blocksLogged > 0 && (
        <div className="flex justify-end">
          <span className="text-xs font-mono text-emerald-400/60">
            {blocksLogged} block{blocksLogged !== 1 ? 's' : ''} logged
          </span>
        </div>
      )}

      {/* Row 1: Block Start + Current Block + History */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="md:col-span-3">
          <BlockStartCard
            selectedFlow={selectedFlow}
            selectedDuration={selectedDur}
            why={actionWhy}
            urgency={homeState.nextAction.urgency}
            blockStatus={blockStatus}
            onSelectFlow={setSelectedFlow}
            onSelectDuration={setSelectedDur}
            onStart={handleStart}
            onDone={handleBlockDone}
          />
        </div>
        <div className="md:col-span-2 flex flex-col gap-4">
          <CurrentBlockCard
            block={homeState.currentBlock}
            blockStatus={blockStatus}
            blockStartedAt={blockStartedAt}
            commandFlow={selectedFlow}
            duration={selectedDur}
          />

          {/* Enter fullscreen focus mode */}
          {blockStatus === 'running' && (
            <button
              onClick={() => setFocusMode(true)}
              className="w-full py-2.5 rounded-xl border border-white/10 bg-white/4 text-white/45 text-xs font-bold uppercase tracking-widest hover:bg-white/8 hover:text-white/65 transition-all"
            >
              ⟢ Focus Mode
            </button>
          )}

          {/* Recent blocks — today + yesterday */}
          {(() => {
            const todayBlocks = blockHistory.filter(b => b.date === today)
            const yestBlocks  = blockHistory.filter(b => b.date === yesterday)
            return (
              <div className="rounded-xl border border-white/8 bg-white/3 p-4 flex flex-col gap-3">
                {/* Today */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[9px] font-semibold tracking-widest text-white/50 uppercase">Today</span>
                  {todayBlocks.length > 0 ? todayBlocks.map(b => (
                    <div key={b.id} className="flex items-center justify-between">
                      <span className={`text-xs font-semibold ${flowText[b.flow as FlowType] ?? 'text-white/40'}`}>
                        {flowDisplayName[b.flow as FlowType] ?? b.flow}
                      </span>
                      <span className="text-[10px] font-mono text-white/55">{b.duration} min</span>
                    </div>
                  )) : (
                    <span className="text-[10px] text-white/42 italic">No blocks today</span>
                  )}
                </div>
                {/* Yesterday */}
                <div className="flex flex-col gap-1.5 pt-2.5 border-t border-white/6">
                  <span className="text-[9px] font-semibold tracking-widest text-white/50 uppercase">Yesterday</span>
                  {yestBlocks.length > 0 ? yestBlocks.map(b => (
                    <div key={b.id} className="flex items-center justify-between">
                      <span className={`text-xs font-semibold ${flowText[b.flow as FlowType] ?? 'text-white/40'}`}>
                        {flowDisplayName[b.flow as FlowType] ?? b.flow}
                      </span>
                      <span className="text-[10px] font-mono text-white/55">{b.duration} min</span>
                    </div>
                  )) : (
                    <span className="text-[10px] text-white/42 italic">No blocks yesterday</span>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* Row 2: Consequence */}
      <ConsequenceCard consequences={consequences} />

      {/* Row 3: Avatar + Stage Progress + Flow Priority */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AvatarCard
          statusLabel={avatarData.statusLabel}
          lastEvolution={avatarData.lastEvolution}
          flowIndicators={avatarData.flowIndicators}
          disciplineScore={disciplineScore}
          weeklyOutcomes={weeklyOutcomes}
        />
        <StageProgressCard
          stageName={homeState.currentStage.name}
          requirements={reqs}
        />
        <FlowPriorityCard flowStates={flows} />
      </div>

      {/* Row 4: Stage Status + Discipline */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StageStatusCard status={homeState.stageStatus} />
        <DisciplineCard score={disciplineScore} momentum={momentum} />
      </div>

      {/* Row 5: Flow Notes */}
      <FlowNotesCard />
    </div>
  )
}
