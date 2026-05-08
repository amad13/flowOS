import { useState, useMemo, useEffect } from 'react'
import { stageRequirements } from '../data/mockState'
import { supabase } from '../lib/supabaseClient'
import { useUser } from '../components/AuthGate'
import FlowPageHeader from '../components/FlowPageHeader'
import FlowTabs from '../components/FlowTabs'
import StageReqBar from '../components/StageReqBar'
import DeficitCard from '../components/DeficitCard'
import MetricsCard from '../components/MetricsCard'

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'overview',  label: 'Overview'         },
  { id: 'training',  label: 'Training'         },
  { id: 'nutrition', label: 'Nutrition Center' },
  { id: 'feedback',  label: 'Feedback'         },
]

// ─── Constants ────────────────────────────────────────────────────────────────
const TARGET_WORKOUTS_PER_WEEK = 5
const DEFAULT_NUT_TARGETS = { calories: 2800, protein: 160, carbs: 360, fats: 80 }  // starting baseline
const CARBS_PER_KCAL      = 4
const WEEK_DAYS          = 7         // Friday → Thursday inclusive
const MIN_RELIABLE_DAYS  = 5         // minimum logs needed for a reliable weekly average

// ─── Stage engine ─────────────────────────────────────────────────────────────
type CreedFlowStatus = 'active' | 'waiting' | 'maintain' | 'complete'
type CreedStageDef = {
  id:          number
  label:       string
  subtitle:    string
  description: string
  weeksTarget: number   // weeks of consistent training required
}
const CREED_STAGE_DEFS: CreedStageDef[] = [
  { id: 1, label: 'Stage 1', subtitle: 'Self Control', description: 'Build consistent training habit',         weeksTarget: 8  },
  { id: 2, label: 'Stage 2', subtitle: 'Discipline',   description: 'Sustain and deepen the training system', weeksTarget: 16 },
  { id: 3, label: 'Stage 3', subtitle: 'Mastery',      description: 'Operate at peak physical performance',   weeksTarget: 24 },
]
const FLOW_LABELS: Record<string, string> = {
  motion: 'Motion', deen: 'Deen', essentials: 'Essentials',
}

// ─── Life Stage engine ────────────────────────────────────────────────────────
type LifeStage = {
  id:           number
  name:         string
  weightTarget: number   // kg — stage complete when avg weight reaches this
}
const LIFE_STAGES: LifeStage[] = [
  { id: 1, name: 'Self-Control',  weightTarget: 70 },
  { id: 2, name: 'Stability',     weightTarget: 75 },
  { id: 3, name: 'Family Relief', weightTarget: 80 },
  { id: 4, name: 'Independence',  weightTarget: 85 },
  { id: 5, name: 'Expansion',     weightTarget: 90 },
]

// ─── Creed Physical Stage System ─────────────────────────────────────────────
type CreedPhysicalStageDef = {
  id:            number
  name:          string
  subtitle:      string
  weightTarget:  number   // kg
  maxBodyFatPct: number   // %
  requirement:   string
}

const CREED_PHYSICAL_STAGES: CreedPhysicalStageDef[] = [
  { id: 1, name: 'Foundation', subtitle: 'Reach 70 kg at ≤12% body fat', weightTarget: 70, maxBodyFatPct: 12, requirement: '5 workouts/week × 8 weeks + 3,400 kcal/day average' },
  { id: 2, name: 'Building',   subtitle: 'Reach 75 kg at ≤13% body fat', weightTarget: 75, maxBodyFatPct: 13, requirement: 'Progressive overload tracked every session + caloric surplus sustained 4+ months' },
  { id: 3, name: 'Mass',       subtitle: 'Reach 80 kg at ≤14% body fat', weightTarget: 80, maxBodyFatPct: 14, requirement: '5 sessions/week sustained + first body composition check' },
  { id: 4, name: 'Strength',   subtitle: 'Reach 85 kg at ≤15% body fat', weightTarget: 85, maxBodyFatPct: 15, requirement: 'Track big 3 lifts every cycle + sleep 7–8h prioritized' },
  { id: 5, name: 'Peak',       subtitle: 'Reach 90 kg at ≤15% body fat', weightTarget: 90, maxBodyFatPct: 15, requirement: 'Structured bulk → cut cycle + physique is a da\'wah asset' },
  { id: 6, name: 'Final',      subtitle: 'Reach 95 kg at ≤15% body fat', weightTarget: 95, maxBodyFatPct: 15, requirement: 'Maintenance phase begins — this is the end state' },
]

// Derive Monday-of-week ISO key from an ISO date (used for consistent-week counting)
function weekOf(iso: string): string {
  const d = new Date(iso + 'T12:00:00')
  const day = d.getDay()
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1))
  return d.toISOString().slice(0, 10)
}

// ─── Types ────────────────────────────────────────────────────────────────────
type WorkoutName      = 'PUSH' | 'PULL' | 'LEGS_QUADS' | 'CHEST_BACK' | 'SHOULDERS_ARMS' | 'LEGS_HAMSTRINGS'
type ExerciseCategory = 'compound' | 'isolation' | 'abs_calves'
type ExerciseDecision = 'increase' | 'maintain' | 'fix_form' | 'decrease'

type ExerciseDef = { name: string; category: ExerciseCategory; sets: number }
type WorkoutDef  = { name: WorkoutName; label: string; short: string; exercises: ExerciseDef[] }

type ExerciseDraft = {
  name: string; category: ExerciseCategory; sets: number
  weight: string; setReps: string[]
}

type ExerciseLog = {
  name: string; category: ExerciseCategory; sets: number
  weight: number; setReps: number[]
  decision: ExerciseDecision; nextWeight: number; nextRepsTarget: number
}

type CompletedWorkout = {
  id: string; date: string
  workoutIndex: number; workoutName: WorkoutName
  exercises: ExerciseLog[]
  notes: string
}

// ─── Nutrition Engine Types ───────────────────────────────────────────────────
type WaterStatus   = 'low' | 'ok' | 'on_target'
type HydrationFlag = 'possible_dehydration' | 'possible_water_retention' | null
type NutritionLog = {
  id: string; date: string; dateLabel: string
  bodyweight: number; bodyFatPct: number
  calories: number; protein: number; carbs: number; fats: number
  waterIntake: number   // liters (end-of-day, 0 if not logged)
  notes: string
}
type NutritionTargets  = { calories: number; protein: number; carbs: number; fats: number }
type NutritionDecision = 'maintain' | '+250' | '-150' | 'startup_hold' | 'startup_3000'
type AutoDecision      = 'below_target' | 'on_target' | 'above_stabilize'
                       | 'above_watch' | 'above_cut'          // kept for history display compat
                       | 'startup_on_track' | 'startup_increase'  // kept for history display compat
type WeekStatus        = 'collecting' | 'evaluated'
type WeekRecord = {
  weekId: string; weekNumber: number; startDate: string; endDate: string
  daysTracked: number
  avgWeight: number|null; avgCalories: number|null; avgProtein: number|null
  avgCarbs: number|null; avgFats: number|null
  decision: NutritionDecision|null; targetsAfter: NutritionTargets|null
  autoReason: AutoDecision | null
  watchBefore: boolean; watchAfter: boolean
}
type NutritionCycle = {
  weekId: string; weekNumber: number; weekStart: string
  status: WeekStatus
  watchFlag:        boolean           // above-target once → true; cut or reset → false
  lastEvalFriday:   string | null     // ISO date of last evaluation, prevents double-run
  lastAutoDecision: AutoDecision | null
  startupComplete:  boolean           // true after the W1–W2 calibration has run once
}
type NutritionDraft = {
  bodyweight: string; bodyFatPct: string; calories: string; protein: string
  carbs: string; fats: string; waterIntake: string; notes: string
}
type PhaseNumber = 1 | 2 | 3
type PhaseInfo = {
  phase:   PhaseNumber
  label:   string
  range:   [number, number]   // kg boundaries [low, high)
  gainMin: number             // kg gain target (low) per 2-week cycle
  gainMax: number             // kg gain target (high) per 2-week cycle
}
type TwoWeekComparison = {
  prevWeekAvgWeight: number | null
  currWeekAvgWeight: number | null
  delta:   number | null
  onTrack: 'above' | 'on_track' | 'below' | 'unknown'
}

// ─── Feedback dashboard types ─────────────────────────────────────────────────
type DayStatus = 'green' | 'orange' | 'red' | 'none'   // none = future or untracked

// ─── Persistence types ────────────────────────────────────────────────────────
type SessionResult = 'increase' | 'win' | 'hold' | 'fix'

type ExerciseState = {
  exerciseId:     string          // exercise name
  currentWeight:  number          // lbs — to use next session
  lastReps:       number[]        // what was done last time
  nextTargetReps: number[]        // mission reps for next session
  result:         SessionResult
  status:         'increase' | 'progressing' | 'hold' | 'fix'
}

type SavedSession = {
  workoutId:    string
  date:         string
  workoutIndex: number
  workoutName:  WorkoutName
  notes:        string
  exercises: {
    exerciseId: string
    weight:     number
    reps:       number[]
    result:     SessionResult
  }[]
}

type CycleState = { currentIndex: number }

// ─── Workout cycle ────────────────────────────────────────────────────────────
const WORKOUT_CYCLE: WorkoutDef[] = [
  {
    name: 'PUSH', label: 'Push – Chest / Shoulders / Triceps', short: 'PUSH',
    exercises: [
      { name: 'Incline Bench Press (Dumbbell)',   category: 'compound',  sets: 4 },
      { name: 'Bench Press (Dumbbell)',           category: 'compound',  sets: 3 },
      { name: 'Low To High Cable Fly',            category: 'isolation', sets: 3 },
      { name: 'Seated Overhead Press (Dumbbell)', category: 'compound',  sets: 3 },
      { name: 'Lateral Raise (Dumbbell)',         category: 'isolation', sets: 3 },
      { name: 'Lateral Raise (Machine)',          category: 'isolation', sets: 3 },
      { name: 'Reverse Fly (Cable)',              category: 'isolation', sets: 3 },
      { name: 'Triceps Extension (Cable)',        category: 'isolation', sets: 3 },
      { name: 'Triceps Pushdown Rope',            category: 'isolation', sets: 3 },
    ],
  },
  {
    name: 'PULL', label: 'Pull – Back / Biceps', short: 'PULL',
    exercises: [
      { name: 'Lat Pulldown (Cable)',              category: 'compound',  sets: 3 },
      { name: 'Seated Row (Cable)',                category: 'compound',  sets: 3 },
      { name: 'Incline Row (Dumbbell)',            category: 'compound',  sets: 3 },
      { name: 'Low Cable Row To Hip (Single Arm)', category: 'compound',  sets: 3 },
      { name: 'Reverse Fly (Cable)',               category: 'isolation', sets: 3 },
      { name: 'Incline Curl (Dumbbell)',           category: 'isolation', sets: 3 },
      { name: 'EZ-Bar Curl (Grip intermédiaire)',  category: 'isolation', sets: 3 },
      { name: 'Cable Curl (Standing)',             category: 'isolation', sets: 3 },
    ],
  },
  {
    name: 'LEGS_QUADS', label: 'Legs – Quad Focus', short: 'LEGS-Q',
    exercises: [
      { name: 'Hack Squat',                        category: 'compound',   sets: 4 },
      { name: 'Leg Press',                         category: 'compound',   sets: 4 },
      { name: 'Leg Extension (Machine)',           category: 'isolation',  sets: 3 },
      { name: 'Seated Leg Curl (Machine)',         category: 'isolation',  sets: 3 },
      { name: 'Hip Thrust (Machine)',              category: 'compound',   sets: 3 },
      { name: 'Standing Calf Raise (Dumbbell)',   category: 'abs_calves', sets: 3 },
      { name: 'Seated Calf Raise (Plate Loaded)', category: 'abs_calves', sets: 3 },
    ],
  },
  {
    name: 'CHEST_BACK', label: 'Chest & Back', short: 'CH/BACK',
    exercises: [
      { name: 'Incline Bench Press (Dumbbell)',    category: 'compound',   sets: 3 },
      { name: 'Bench Press (Dumbbell)',            category: 'compound',   sets: 3 },
      { name: 'Low To High Cable Fly',             category: 'isolation',  sets: 3 },
      { name: 'Incline Row (Dumbbell)',            category: 'compound',   sets: 3 },
      { name: 'Low Cable Row To Hip (Single Arm)', category: 'compound',   sets: 3 },
      { name: 'Reverse Fly (Cable)',               category: 'isolation',  sets: 3 },
      { name: 'Lateral Raise (Cable)',             category: 'isolation',  sets: 2 },
      { name: 'Crunch (Machine)',                  category: 'abs_calves', sets: 3 },
      { name: 'Decline Crunch',                   category: 'abs_calves', sets: 3 },
    ],
  },
  {
    name: 'SHOULDERS_ARMS', label: 'Shoulders & Arms', short: 'SH/ARMS',
    exercises: [
      { name: 'Seated Overhead Press (Dumbbell)', category: 'compound',   sets: 3 },
      { name: 'Lateral Raise (Dumbbell)',         category: 'isolation',  sets: 3 },
      { name: 'Lateral Raise (Machine)',          category: 'isolation',  sets: 3 },
      { name: 'Reverse Fly (Cable)',              category: 'isolation',  sets: 3 },
      { name: 'Triceps Extension (Cable)',        category: 'isolation',  sets: 3 },
      { name: 'Triceps Pushdown Rope',            category: 'isolation',  sets: 3 },
      { name: 'Triceps Press',                   category: 'isolation',  sets: 2 },
      { name: 'Cable Curl (Standing)',            category: 'isolation',  sets: 3 },
      { name: 'Hammer Curl (Dumbbell)',           category: 'isolation',  sets: 3 },
      { name: 'Crunch (Machine)',                 category: 'abs_calves', sets: 3 },
      { name: 'Decline Crunch',                  category: 'abs_calves', sets: 3 },
    ],
  },
  {
    name: 'LEGS_HAMSTRINGS', label: 'Legs – Hamstring Focus', short: 'LEGS-H',
    exercises: [
      { name: 'Hip Thrust (Machine)',              category: 'compound',   sets: 4 },
      { name: 'Romanian Deadlift (Barbell)',       category: 'compound',   sets: 4 },
      { name: 'Seated Leg Curl (Machine)',         category: 'isolation',  sets: 3 },
      { name: 'Hack Squat',                        category: 'compound',   sets: 3 },
      { name: 'Glute Kickback (Machine)',          category: 'isolation',  sets: 3 },
      { name: 'Standing Calf Raise (Dumbbell)',   category: 'abs_calves', sets: 3 },
      { name: 'Seated Calf Raise (Plate Loaded)', category: 'abs_calves', sets: 3 },
    ],
  },
]

// ─── Training helpers ─────────────────────────────────────────────────────────
function isLowerBody(name: WorkoutName): boolean {
  return name === 'LEGS_QUADS' || name === 'LEGS_HAMSTRINGS'
}

function getIncrement(name: WorkoutName): number {
  return isLowerBody(name) ? 10 : 5
}

function getRepRange(cat: ExerciseCategory): [number, number] {
  if (cat === 'compound')  return [8,  12]
  if (cat === 'isolation') return [10, 15]
  return [12, 20]
}

// ─── Mission system ───────────────────────────────────────────────────────────
type ProgressBadge = 'ready_to_increase' | 'progressing' | 'hold' | 'fix_form'

const BADGE_CONFIG: Record<ProgressBadge, { label: string; color: string }> = {
  ready_to_increase: { label: 'READY TO INCREASE', color: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10' },
  progressing:       { label: 'PROGRESSING',        color: 'border-blue-500/40 text-blue-400 bg-blue-500/10'         },
  hold:              { label: 'HOLD',               color: 'border-white/20 text-white/50 bg-white/5'               },
  fix_form:          { label: 'FIX FORM',           color: 'border-amber-500/40 text-amber-400 bg-amber-500/10'     },
}

// Distributes `delta` extra reps to weakest sets first, capped at `max`
function distributeReps(setReps: number[], delta: number, max: number): number[] {
  const result = [...setReps]
  let remaining = delta
  while (remaining > 0) {
    let minIdx = -1
    let minVal = Infinity
    for (let i = 0; i < result.length; i++) {
      if (result[i] < max && result[i] < minVal) { minVal = result[i]; minIdx = i }
    }
    if (minIdx === -1) break
    result[minIdx]++
    remaining--
  }
  return result
}

type MissionData = {
  badge:         ProgressBadge
  lastWeight:    number
  lastSetReps:   number[]
  todayWeight:   number
  statusLabel:   string
  statusHint:    string
  missionText:   string | null
  targetToBeat:  number[]
  stretchTarget: number[]
  goalText:      string
}

function computeMissionData(lastEx: ExerciseLog, workoutName: WorkoutName): MissionData {
  const [low, high] = getRepRange(lastEx.category)
  const increment   = getIncrement(workoutName)
  const filled      = lastEx.setReps.filter(r => r > 0)
  const stretchTarget = Array(lastEx.sets).fill(high) as number[]

  if (filled.length === 0) {
    return {
      badge: 'hold', lastWeight: lastEx.weight, lastSetReps: lastEx.setReps,
      todayWeight: lastEx.nextWeight, statusLabel: 'Maintain', statusHint: 'No reps recorded last session',
      missionText: null, targetToBeat: stretchTarget, stretchTarget,
      goalText: `Target ${low}–${high} reps`,
    }
  }

  const drop     = Math.max(...filled) - Math.min(...filled)
  const allMaxed = filled.every(r => r >= high)

  // Fix form
  if (drop >= 4) {
    const avgRep = Math.round(filled.reduce((a, b) => a + b, 0) / filled.length)
    const balanced = Math.min(avgRep + 1, high)
    const balancedTarget = Array(lastEx.sets).fill(balanced) as number[]
    const fixGoal = balancedTarget.join(' / ')
    return {
      badge: 'fix_form', lastWeight: lastEx.weight, lastSetReps: lastEx.setReps,
      todayWeight: lastEx.nextWeight, statusLabel: 'Fix Form',
      statusHint: `Drop of ${drop} reps detected — consistency before weight`,
      missionText: `Stabilize to ${fixGoal}`, targetToBeat: balancedTarget, stretchTarget,
      goalText: `Hit ${fixGoal} — reduce set drop to ≤ 3 reps before increasing`,
    }
  }

  // Ready to increase
  if (allMaxed) {
    return {
      badge: 'ready_to_increase', lastWeight: lastEx.weight, lastSetReps: lastEx.setReps,
      todayWeight: lastEx.nextWeight, statusLabel: 'Increase next session',
      statusHint: `Hit max last time → +${increment} lbs applied`,
      missionText: null, targetToBeat: stretchTarget, stretchTarget,
      goalText: `Maintain ${Array(lastEx.sets).fill(high).join('/')} — weight increases next session`,
    }
  }

  // Normal progression — mission: +2 total reps
  const targetToBeat = distributeReps(lastEx.setReps, 2, high)
  const nearMax      = filled.filter(r => r >= high - 1).length >= Math.ceil(filled.length / 2)
  const goalText     = nearMax
    ? `Hit ${targetToBeat.join(' / ')} → one step from +${increment} lbs`
    : `Add +2 total reps → ${targetToBeat.join(' / ')}`

  return {
    badge: 'progressing', lastWeight: lastEx.weight, lastSetReps: lastEx.setReps,
    todayWeight: lastEx.nextWeight, statusLabel: 'Maintain',
    statusHint: `Hit ${stretchTarget.join('/')} to unlock +${increment} lbs next session`,
    missionText: '+2 total reps', targetToBeat, stretchTarget, goalText,
  }
}

// ─── Micro-focus instruction ──────────────────────────────────────────────────
function computeMicroFocus(
  lastSetReps: number[], targetToBeat: number[],
  _cat: ExerciseCategory, badge: ProgressBadge,
): string {
  if (badge === 'fix_form') {
    const avg = Math.round(lastSetReps.reduce((a, b) => a + b, 0) / lastSetReps.length)
    return `Stabilize all ${lastSetReps.length} sets — aim for ${Array(lastSetReps.length).fill(avg).join(' / ')}`
  }
  if (badge === 'ready_to_increase') return `Hold form quality — weight goes up this session`

  const weaker: { idx: number; current: number; target: number }[] = []
  for (let i = 0; i < targetToBeat.length; i++) {
    if (lastSetReps[i] < targetToBeat[i]) weaker.push({ idx: i, current: lastSetReps[i], target: targetToBeat[i] })
  }
  if (weaker.length === 0) return `Maintain pace — all sets on target`

  if (weaker.length === 1) {
    const w = weaker[0]; const diff = w.target - w.current
    return `Focus: +${diff} rep${diff > 1 ? 's' : ''} on S${w.idx + 1}`
  }
  const labels   = weaker.map(w => `S${w.idx + 1}`).join(' and ')
  const targets  = [...new Set(weaker.map(w => w.target))]
  if (targets.length === 1) return `Focus: Bring ${labels} to ${targets[0]}`
  return `Focus: +1 rep each on ${labels}`
}

// ─── Live progress feedback ───────────────────────────────────────────────────
type LiveStatus = 'fixing_form' | 'behind' | 'on_track' | 'mission_complete' | 'stretch_reached' | 'ready_next'

function computeLiveProgress(
  currentReps: string[], lastSetReps: number[],
  targetToBeat: number[], stretchTarget: number[], high: number,
): { text: string; status: LiveStatus; color: string } | null {
  const entered = currentReps.filter(r => r.trim() !== '')
  if (entered.length === 0) return null

  const currentNums = currentReps.map(r => r.trim() !== '' ? Math.max(0, parseInt(r) || 0) : null)
  const filledNums  = currentNums.filter((n): n is number => n !== null)

  if (filledNums.length >= 2) {
    const drop = Math.max(...filledNums) - Math.min(...filledNums)
    if (drop >= 4) return { text: `⚠ Drop of ${drop} reps — fix consistency`, status: 'fixing_form', color: 'text-amber-400' }
  }

  const allFilled = currentReps.every(r => r.trim() !== '')

  if (allFilled) {
    if (filledNums.every(r => r >= high))
      return { text: `All sets maxed — weight increases next session`, status: 'ready_next', color: 'text-emerald-400 font-bold' }
    const curr    = filledNums.reduce((a, b) => a + b, 0)
    const last    = lastSetReps.reduce((a, b) => a + b, 0)
    const target  = targetToBeat.reduce((a, b) => a + b, 0)
    const stretch = stretchTarget.reduce((a, b) => a + b, 0)
    if (curr >= stretch) return { text: `Stretch target reached — +${curr - last} total reps`, status: 'stretch_reached', color: 'text-emerald-400 font-bold' }
    if (curr >= target)  return { text: `Mission complete — +${curr - last} total rep${curr - last !== 1 ? 's' : ''}`, status: 'mission_complete', color: 'text-emerald-400 font-semibold' }
    const needed = target - curr
    return { text: `Still needed: +${needed} rep${needed > 1 ? 's' : ''}`, status: 'behind', color: 'text-amber-400/90' }
  }

  // Partial — compare only filled sets
  const n          = filledNums.length
  const currPart   = filledNums.reduce((a, b) => a + b, 0)
  const lastPart   = lastSetReps.slice(0, n).reduce((a, b) => a + b, 0)
  const diff       = currPart - lastPart
  if (diff > 0) return { text: `+${diff} rep${diff > 1 ? 's' : ''} ahead — keep going`, status: 'on_track', color: 'text-blue-400' }
  if (diff === 0) return { text: `Same pace — push next set`, status: 'on_track', color: 'text-white/45' }
  return { text: `${Math.abs(diff)} reps behind — push harder`, status: 'behind', color: 'text-amber-400/70' }
}

// ─── End-of-exercise result ───────────────────────────────────────────────────
type ExerciseResult = 'win' | 'hold' | 'fix_form' | 'ready_next'

function computeExerciseResult(
  currentReps: string[], _lastSetReps: number[],
  targetToBeat: number[], high: number,
): ExerciseResult | null {
  if (!currentReps.every(r => r.trim() !== '')) return null
  const nums = currentReps.map(r => Math.max(0, parseInt(r) || 0))
  const drop = nums.length > 1 ? Math.max(...nums) - Math.min(...nums) : 0
  if (drop >= 4)              return 'fix_form'
  if (nums.every(r => r >= high)) return 'ready_next'
  const curr   = nums.reduce((a, b) => a + b, 0)
  const target = targetToBeat.reduce((a, b) => a + b, 0)
  return curr >= target ? 'win' : 'hold'
}

const RESULT_CONFIG: Record<ExerciseResult, { label: string; color: string }> = {
  win:        { label: '✓  WIN — PROGRESS CONFIRMED',         color: 'border-emerald-500/40 text-emerald-300 bg-emerald-500/8' },
  hold:       { label: '—  HOLD — NO PROGRESSION YET',        color: 'border-white/15 text-white/35 bg-white/3'               },
  fix_form:   { label: '⚠  FIX FORM — STABILIZE NEXT TIME',   color: 'border-amber-500/35 text-amber-300 bg-amber-500/8'      },
  ready_next: { label: '↑  READY TO INCREASE NEXT SESSION',   color: 'border-emerald-500/50 text-emerald-200 bg-emerald-500/12'},
}

// ─── Execution summary ────────────────────────────────────────────────────────
function computeExecutionSummary(last: CompletedWorkout): {
  closePriority: number; bestChance: string | null; mainBattle: string | null
} {
  let closePriority = 0
  let bestChance: { name: string; ratio: number } | null = null
  let mainBattle:  { name: string; drop:  number } | null = null
  for (const ex of last.exercises) {
    const [, high] = getRepRange(ex.category)
    const filled   = ex.setReps.filter(r => r > 0)
    if (filled.length === 0) continue
    const drop  = Math.max(...filled) - Math.min(...filled)
    const avg   = filled.reduce((a, b) => a + b, 0) / filled.length
    if (drop >= 4) {
      if (!mainBattle || drop > mainBattle.drop) mainBattle = { name: ex.name, drop }
    } else {
      const ratio = avg / high
      if (ratio >= 0.75) {
        closePriority++
        if (!bestChance || ratio > bestChance.ratio) bestChance = { name: ex.name, ratio }
      }
    }
  }
  return { closePriority, bestChance: bestChance?.name ?? null, mainBattle: mainBattle?.name ?? null }
}

// ─── localStorage helpers ─────────────────────────────────────────────────────
const LS_WORKOUTS    = 'creed_workouts'
const LS_SESSIONS    = 'flowos_sessions'
const LS_EX_STATE    = 'flowos_exercise_state'
const LS_CYCLE       = 'flowos_cycle_state'
const LS_NUT_LOGS    = 'flowos_nutrition_logs'
const LS_NUT_TARGETS = 'flowos_nutrition_targets'
const LS_NUT_CYCLE   = 'flowos_nutrition_cycle'
const LS_NUT_HISTORY = 'flowos_nutrition_history'

function lsGet<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback }
}
function lsSet(key: string, val: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch { /* quota */ }
}

// ─── computeNextTargets ───────────────────────────────────────────────────────
type NextTargets = {
  result:         SessionResult
  nextWeight:     number
  nextTargetReps: number[]
  status:         ExerciseState['status']
}

function computeNextTargets(
  _name: string, category: ExerciseCategory, sets: number,
  weight: number, setReps: number[],
  lastReps: number[] | null,
  workoutName: WorkoutName,
): NextTargets {
  const [low, high] = getRepRange(category)
  const increment   = getIncrement(workoutName)
  const filled      = setReps.filter(r => r > 0)

  // Incomplete: no reps entered
  if (filled.length === 0) {
    return { result: 'hold', nextWeight: weight, nextTargetReps: Array(sets).fill(low) as number[], status: 'hold' }
  }

  const drop = Math.max(...filled) - Math.min(...filled)

  // Fix: unstable form (big drop)
  if (drop >= 4) {
    const avgRep       = Math.round(filled.reduce((a, b) => a + b, 0) / filled.length)
    const stableTarget = Array(sets).fill(Math.min(avgRep + 1, high)) as number[]
    return { result: 'fix', nextWeight: weight, nextTargetReps: stableTarget, status: 'fix' }
  }

  // Increase: all filled sets hit max
  if (filled.every(r => r >= high)) {
    return { result: 'increase', nextWeight: weight + increment, nextTargetReps: Array(sets).fill(low) as number[], status: 'increase' }
  }

  // Compare vs last session
  if (lastReps && lastReps.length > 0) {
    const currTotal = filled.reduce((a, b) => a + b, 0)
    const lastFilled = lastReps.filter(r => r > 0)
    const lastTotal  = lastFilled.length ? lastFilled.reduce((a, b) => a + b, 0) : 0

    if (currTotal > lastTotal) {
      // Win: progress made — next mission is +2 more from current
      const nextTarget = distributeReps(setReps, 2, high)
      return { result: 'win', nextWeight: weight, nextTargetReps: nextTarget, status: 'progressing' }
    }
    if (currTotal < lastTotal - 1) {
      // Regression → fix
      return { result: 'fix', nextWeight: weight, nextTargetReps: Array(sets).fill(low) as number[], status: 'fix' }
    }
  }

  // Hold: same as last or first session
  const nextTarget = distributeReps(setReps, 2, high)
  return { result: 'hold', nextWeight: weight, nextTargetReps: nextTarget, status: 'hold' }
}

// ─── Nutrition helpers ────────────────────────────────────────────────────────
function nutDateKey(): string {
  return new Date().toISOString().slice(0, 10)
}
function nutFormatDate(key: string): string {
  const d = new Date(key + 'T12:00:00')
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' })
}
function nutAvg(vals: number[]): number | null {
  if (!vals.length) return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}
// 1-decimal precision for bodyweight (avoids rounding 85.4→85 losing delta signal)
function nutAvgFloat(vals: number[]): number | null {
  if (!vals.length) return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10
}
function nutComputeAvgs(logs: NutritionLog[]) {
  // `logs` is already filtered to the current Friday-Thursday window by the caller.
  // Clamp to WEEK_DAYS to guard against any out-of-window entries.
  const valid = logs.slice(0, WEEK_DAYS)
  return {
    weight:      nutAvgFloat(valid.filter(l => l.bodyweight  > 0).map(l => l.bodyweight)),
    calories:    nutAvg(valid.filter(l => l.calories   > 0).map(l => l.calories)),
    protein:     nutAvg(valid.filter(l => l.protein    > 0).map(l => l.protein)),
    carbs:       nutAvg(valid.filter(l => l.carbs      > 0).map(l => l.carbs)),
    fats:        nutAvg(valid.filter(l => l.fats       > 0).map(l => l.fats)),
    avgWater:    nutAvgFloat(valid.filter(l => (l.waterIntake ?? 0) > 0).map(l => l.waterIntake)),
    daysTracked: valid.length,
  }
}
function getWaterStatus(liters: number): WaterStatus {
  if (liters < 3) return 'low'
  if (liters < 4) return 'ok'
  return 'on_target'
}
// Contextual flag only — does NOT affect calorie decisions
function computeHydrationFlag(delta: number | null, avgWater: number | null): HydrationFlag {
  if (delta === null || avgWater === null || avgWater === 0) return null
  if (delta < 0 && avgWater < 3) return 'possible_dehydration'
  if (delta > 0 && avgWater >= 4) return 'possible_water_retention'
  return null
}
function nutApplyDecision(decision: NutritionDecision, targets: NutritionTargets): NutritionTargets {
  if (decision === 'maintain' || decision === 'startup_hold') return { ...targets }
  if (decision === 'startup_3000') {
    // Absolute set: force calories to 3000, adjust carbs for the difference
    const delta = 3000 - targets.calories
    return { ...targets, calories: 3000, carbs: Math.max(0, targets.carbs + Math.round(delta / CARBS_PER_KCAL)) }
  }
  const delta = decision === '+250' ? 250 : -150
  return { ...targets, calories: targets.calories + delta, carbs: Math.max(0, targets.carbs + Math.round(delta / CARBS_PER_KCAL)) }
}
// Pure: compute automatic calorie decision from 14-day weight delta + phase
// Rules: below gainMin → +250 | in range → maintain | above gainMax → stabilize (maintain)
function computeAutoDecision(
  delta: number | null, phase: PhaseInfo | null,
): { decision: NutritionDecision; reason: AutoDecision } {
  if (delta === null || phase === null)
    return { decision: 'maintain', reason: 'on_target' }
  if (delta > phase.gainMax)
    return { decision: 'maintain', reason: 'above_stabilize' }
  if (delta >= phase.gainMin)
    return { decision: 'maintain', reason: 'on_target' }
  return   { decision: '+250',     reason: 'below_target' }
}
function getLastFriday(): string {
  const d = new Date()
  const daysBack = (d.getDay() + 2) % 7  // days since last Friday (0 if today is Friday)
  d.setDate(d.getDate() - daysBack)
  return d.toISOString().slice(0, 10)
}
function isTodayFriday(): boolean {
  return new Date().getDay() === 5
}
function nutDefaultCycle(weekNumber: number): NutritionCycle {
  return { weekId: `W${weekNumber}`, weekNumber, weekStart: getLastFriday(), status: 'collecting', watchFlag: false, lastEvalFriday: null, lastAutoDecision: null, startupComplete: false }
}
function emptyNutDraft(): NutritionDraft {
  return { bodyweight: '', bodyFatPct: '', calories: '', protein: '', carbs: '', fats: '', waterIntake: '', notes: '' }
}

// ─── Phase status helpers ─────────────────────────────────────────────────────
function getNextReviewFriday(): string {
  const d = new Date()
  const day = d.getDay()
  const daysUntil = day === 5 ? 7 : (5 - day + 7) % 7   // Fri→7, others→days till next Fri
  d.setDate(d.getDate() + daysUntil)
  return d.toISOString().slice(0, 10)
}
function estimatePhaseFinish(avgWeight: number, phase: PhaseInfo): string {
  const remaining = phase.range[1] - avgWeight
  if (remaining <= 0) return 'Phase complete'
  const biweeklyMid = (phase.gainMin + phase.gainMax) / 2
  const daysNeeded  = Math.ceil((remaining / biweeklyMid) * 14)
  const finish = new Date()
  finish.setDate(finish.getDate() + daysNeeded)
  return finish.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })
}

// ─── Phase engine helpers ─────────────────────────────────────────────────────
function getPhase(avgWeight: number | null): PhaseInfo | null {
  if (avgWeight === null) return null
  if (avgWeight >= 65 && avgWeight < 75) return { phase: 1, label: 'Phase 1', range: [65, 75], gainMin: 1.0, gainMax: 1.4 }
  if (avgWeight >= 75 && avgWeight < 85) return { phase: 2, label: 'Phase 2', range: [75, 85], gainMin: 0.6, gainMax: 0.8 }
  if (avgWeight >= 85 && avgWeight < 95) return { phase: 3, label: 'Phase 3', range: [85, 95], gainMin: 0.4, gainMax: 0.5 }
  return null
}
function getPreviousCycleStart(currentWeekStart: string): string {
  const d = new Date(currentWeekStart + 'T12:00:00')
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}
function computeTwoWeekComparison(
  logs: NutritionLog[], weekStart: string, phase: PhaseInfo | null,
): TwoWeekComparison {
  const prevStart = getPreviousCycleStart(weekStart)
  const prevLogs  = logs.filter(l => l.date >= prevStart && l.date < weekStart)
  const currLogs  = logs.filter(l => l.date >= weekStart)
  const prevAvg   = nutAvgFloat(prevLogs.filter(l => l.bodyweight > 0).map(l => l.bodyweight))
  const currAvg   = nutAvgFloat(currLogs.filter(l => l.bodyweight > 0).map(l => l.bodyweight))
  if (prevAvg === null || currAvg === null || phase === null)
    return { prevWeekAvgWeight: prevAvg, currWeekAvgWeight: currAvg, delta: null, onTrack: 'unknown' }
  const delta = Math.round((currAvg - prevAvg) * 100) / 100
  const onTrack: TwoWeekComparison['onTrack'] =
    delta >= phase.gainMin && delta <= phase.gainMax ? 'on_track' :
    delta >  phase.gainMax                           ? 'above'    : 'below'
  return { prevWeekAvgWeight: prevAvg, currWeekAvgWeight: currAvg, delta, onTrack }
}

function uid(): string {
  return Math.random().toString(36).slice(2)
}

// ─── Feedback dashboard helpers ───────────────────────────────────────────────
// Parse "24 Mar 26" (CompletedWorkout.date format) → ISO "2026-03-24"
function parseDateLabel(label: string): string | null {
  const parts = label.trim().split(' ')
  if (parts.length !== 3) return null
  const [day, mon, yr] = parts
  const d = new Date(`${mon} ${day} 20${yr}`)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}
// Most recent Sunday (start of Sun–Sat display week)
function getWeekSunday(): string {
  const d = new Date()
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().slice(0, 10)
}

// ─── Decision config ──────────────────────────────────────────────────────────
const DECISION_CONFIG: Record<ExerciseDecision, { short: string; color: string; dot: string }> = {
  increase: { short: '↑ Increase', color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10', dot: 'bg-emerald-500' },
  maintain: { short: '✓ Maintain', color: 'border-white/20 text-white/60 bg-white/5',                dot: 'bg-white/40'   },
  fix_form: { short: '⚠ Fix Form', color: 'border-amber-500/30 text-amber-400 bg-amber-500/10',      dot: 'bg-amber-500'  },
  decrease: { short: '↓ Decrease', color: 'border-red-500/30 text-red-400 bg-red-500/10',            dot: 'bg-red-500'    },
}

// ─── Initial state ────────────────────────────────────────────────────────────
const INIT_WEEKLY = { workoutsDone: 0, totalSessions: 0, workoutToday: false }

// ─── Component ────────────────────────────────────────────────────────────────
export default function Creed() {
  const req  = stageRequirements.find(r => r.flow === 'creed')!
  const user = useUser()

  const [activeTab, setActiveTab] = useState('training')
  const [weekly,    setWeekly]    = useState(INIT_WEEKLY)

  // Training — persisted
  const [completedWorkouts, setCompletedWorkouts] = useState<CompletedWorkout[]>(() =>
    lsGet<CompletedWorkout[]>(LS_WORKOUTS, [])
  )
  const [exerciseStates, setExerciseStates] = useState<Record<string, ExerciseState>>(() =>
    lsGet<Record<string, ExerciseState>>(LS_EX_STATE, {})
  )
  const [cycleIndex, setCycleIndex] = useState<number>(() => {
    const stored = lsGet<CycleState | null>(LS_CYCLE, null)
    if (stored !== null) return stored.currentIndex
    // First boot: derive from existing workout history (empty on fresh install)
    const workouts = lsGet<CompletedWorkout[]>(LS_WORKOUTS, [])
    const last = workouts[workouts.length - 1]
    return last ? (last.workoutIndex + 1) % 6 : 0
  })

  // Training — ephemeral
  const [logOpen,          setLogOpen]          = useState(false)
  const [drafts,           setDrafts]           = useState<ExerciseDraft[]>([])
  const [sessionNotes,     setSessionNotes]     = useState('')
  const [, setExpandedCards]                     = useState<Set<string>>(new Set())
  const [expandedHistory,    setExpandedHistory]    = useState<Set<string>>(new Set())
  const [historyWeekOffset,  setHistoryWeekOffset]  = useState(0)   // 0 = current week, -1 = prev, etc.
  const [saveState,          setSaveState]          = useState<'idle' | 'saving' | 'saved'>('idle')
  const [savedNextLabel,   setSavedNextLabel]   = useState('')

  // Nutrition — persisted
  const [nutLogs,    setNutLogs]    = useState<NutritionLog[]>(() => lsGet<NutritionLog[]>(LS_NUT_LOGS, []))
  const [nutTargets, setNutTargets] = useState<NutritionTargets>(() => lsGet<NutritionTargets>(LS_NUT_TARGETS, DEFAULT_NUT_TARGETS))
  const [nutCycle,   setNutCycle]   = useState<NutritionCycle>(() => lsGet<NutritionCycle>(LS_NUT_CYCLE, nutDefaultCycle(1)))
  const [nutHistory, setNutHistory] = useState<WeekRecord[]>(() => lsGet<WeekRecord[]>(LS_NUT_HISTORY, []))
  // Nutrition — ephemeral
  const [nutDraft, setNutDraft] = useState<NutritionDraft>(emptyNutDraft())

  // Feedback — fully auto-computed from training + nutrition data (no manual state)

  // ── Mount fetch: hydrate all Creed state from Supabase ───────────────────
  useEffect(() => {
    if (!user) return

    // completed_workouts
    supabase
      .from('completed_workouts')
      .select('id,workout_date,workout_index,workout_name,notes,exercises')
      .eq('user_id', user.id)
      .order('workout_date', { ascending: true })
      .then(({ data, error }) => {
        if (error) { console.error('[creed] fetch completed_workouts:', error); return }
        if (!data?.length) return
        const mapped: CompletedWorkout[] = data.map(r => ({
          id:            r.id,
          date:          r.workout_date,
          workoutIndex:  r.workout_index,
          workoutName:   r.workout_name,
          notes:         r.notes ?? '',
          exercises:     (r.exercises ?? []) as ExerciseLog[],
        }))
        setCompletedWorkouts(mapped)
        lsSet(LS_WORKOUTS, mapped)
      })

    // nutrition_logs
    supabase
      .from('nutrition_logs')
      .select('id,log_date,date_label,bodyweight,body_fat_pct,calories,protein,carbs,fats,water_intake,notes')
      .eq('user_id', user.id)
      .order('log_date', { ascending: true })
      .then(({ data, error }) => {
        if (error) { console.error('[creed] fetch nutrition_logs:', error); return }
        if (!data?.length) return
        const mapped: NutritionLog[] = data.map(r => ({
          id:          r.id,
          date:        r.log_date,
          dateLabel:   r.date_label ?? nutFormatDate(r.log_date),
          bodyweight:  r.bodyweight   ?? 0,
          bodyFatPct:  r.body_fat_pct ?? 0,
          calories:    r.calories     ?? 0,
          protein:     r.protein      ?? 0,
          carbs:       r.carbs        ?? 0,
          fats:        r.fats         ?? 0,
          waterIntake: r.water_intake  ?? 0,
          notes:       r.notes        ?? '',
        }))
        setNutLogs(mapped)
        lsSet(LS_NUT_LOGS, mapped)
      })

    // nutrition_targets
    supabase
      .from('nutrition_targets')
      .select('calories,protein,carbs,fats')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error('[creed] fetch nutrition_targets:', error); return }
        if (!data) return
        const targets: NutritionTargets = {
          calories: data.calories ?? DEFAULT_NUT_TARGETS.calories,
          protein:  data.protein  ?? DEFAULT_NUT_TARGETS.protein,
          carbs:    data.carbs    ?? DEFAULT_NUT_TARGETS.carbs,
          fats:     data.fats     ?? DEFAULT_NUT_TARGETS.fats,
        }
        setNutTargets(targets)
        lsSet(LS_NUT_TARGETS, targets)
      })

    // week_records (nutrition cycle history)
    supabase
      .from('week_records')
      .select('week_id,week_number,start_date,end_date,days_tracked,avg_weight,avg_calories,avg_protein,avg_carbs,avg_fats,decision,targets_after,auto_reason,watch_before,watch_after')
      .eq('user_id', user.id)
      .order('week_number', { ascending: true })
      .then(({ data, error }) => {
        if (error) { console.error('[creed] fetch week_records:', error); return }
        if (!data?.length) return
        const mapped: WeekRecord[] = data.map(r => ({
          weekId:       r.week_id,
          weekNumber:   r.week_number,
          startDate:    r.start_date,
          endDate:      r.end_date,
          daysTracked:  r.days_tracked  ?? 0,
          avgWeight:    r.avg_weight,
          avgCalories:  r.avg_calories,
          avgProtein:   r.avg_protein,
          avgCarbs:     r.avg_carbs,
          avgFats:      r.avg_fats,
          decision:     r.decision,
          targetsAfter: (r.targets_after ?? null) as NutritionTargets | null,
          autoReason:   r.auto_reason,
          watchBefore:  r.watch_before ?? false,
          watchAfter:   r.watch_after  ?? false,
        }))
        setNutHistory(mapped)
        lsSet(LS_NUT_HISTORY, mapped)
      })

    // nutrition_cycles (active cycle state)
    supabase
      .from('nutrition_cycles')
      .select('week_id,week_number,week_start,status,watch_flag,last_eval_friday,last_auto_decision,startup_complete')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error('[creed] fetch nutrition_cycles:', error); return }
        if (!data) return
        const cycle: NutritionCycle = {
          weekId:           data.week_id,
          weekNumber:       data.week_number,
          weekStart:        data.week_start,
          status:           data.status,
          watchFlag:        data.watch_flag        ?? false,
          lastEvalFriday:   data.last_eval_friday,
          lastAutoDecision: data.last_auto_decision,
          startupComplete:  data.startup_complete  ?? true,
        }
        setNutCycle(cycle)
        lsSet(LS_NUT_CYCLE, cycle)
      })

    // cycle_state (workout cycle position)
    supabase
      .from('cycle_state')
      .select('current_index')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) { console.error('[creed] fetch cycle_state:', error); return }
        if (data === null) return
        setCycleIndex(data.current_index)
        lsSet(LS_CYCLE, { currentIndex: data.current_index })
      })

    // creed_stage_state — current_stage, stage_name, target_weight, flow_status
    // These values are computed from completedWorkouts (hydrated above); the DB
    // row is the persisted snapshot. No additional state setter needed — computed
    // values will reflect the correct stage once completedWorkouts is loaded.
    supabase
      .from('creed_stage_state')
      .select('current_stage,stage_name,target_weight,flow_status')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ error }) => {
        if (error) console.error('[creed] fetch creed_stage_state:', error)
      })
  }, [user]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived: training ─────────────────────────────────────────────────────
  const currentWorkoutIndex = cycleIndex                    // authoritative: stored cycle state
  const nextWorkoutIndex    = (currentWorkoutIndex + 1) % 6
  const currentWorkout      = WORKOUT_CYCLE[currentWorkoutIndex]
  const nextWorkout         = WORKOUT_CYCLE[nextWorkoutIndex]

  const lastSameSession = useMemo(() =>
    [...completedWorkouts].reverse().find(w => w.workoutIndex === currentWorkoutIndex) ?? null,
    [completedWorkouts, currentWorkoutIndex],
  )

  // ── Derived: overview ─────────────────────────────────────────────────────
  const trainingMetrics = useMemo(() => [
    { label: 'This week',      value: weekly.workoutsDone,         unit: `/ ${TARGET_WORKOUTS_PER_WEEK}` },
    { label: 'Total sessions', value: weekly.totalSessions                                               },
    { label: 'Cycle position', value: `${currentWorkoutIndex + 1} / 6`                                  },
    { label: 'Next workout',   value: currentWorkout.short                                               },
  ], [weekly, currentWorkoutIndex, currentWorkout.short])

  const weeklyRemaining = Math.max(0, TARGET_WORKOUTS_PER_WEEK - weekly.workoutsDone)

  // ── Derived: nutrition ────────────────────────────────────────────────────
  const todayNutKey         = nutDateKey()
  const todayNutLog         = nutLogs.find(l => l.date === todayNutKey) ?? null
  const todayWeightLogged   = todayNutLog !== null && todayNutLog.bodyweight > 0
  const todayNutLogged      = todayNutLog !== null && todayNutLog.calories  > 0
  const todayLogged         = todayWeightLogged || todayNutLogged

  const isReviewDay = isTodayFriday()

  // Friday-to-Thursday window: weekStart (Fri) through weekStart + 6 days (Thu)
  const nutWeekEnd = useMemo(() => {
    const d = new Date(nutCycle.weekStart + 'T12:00:00')
    d.setDate(d.getDate() + (WEEK_DAYS - 1))   // Fri + 6 = Thu
    return d.toISOString().slice(0, 10)
  }, [nutCycle.weekStart])

  const nutWeekLogs = useMemo(() =>
    nutLogs
      .filter(l => l.date >= nutCycle.weekStart && l.date <= nutWeekEnd)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [nutLogs, nutCycle.weekStart, nutWeekEnd],
  )
  const weeklyAvg = useMemo(() => nutComputeAvgs(nutWeekLogs), [nutWeekLogs])
  const cycleStatus = useMemo(() => ({
    dataReliable: weeklyAvg.daysTracked >= MIN_RELIABLE_DAYS,
    status: weeklyAvg.daysTracked >= MIN_RELIABLE_DAYS ? 'ready_for_decision' : 'collecting_data' as const,
  }), [weeklyAvg.daysTracked])
  // Phase engine
  const currentPhase = useMemo(() => getPhase(weeklyAvg.weight), [weeklyAvg.weight])
  const twoWeekComparison = useMemo(
    () => computeTwoWeekComparison(nutLogs, nutCycle.weekStart, currentPhase),
    [nutLogs, nutCycle.weekStart, currentPhase],
  )
  // Hydration context — read-only flag, no impact on calorie decisions
  const hydrationFlag = useMemo(
    () => computeHydrationFlag(twoWeekComparison.delta, weeklyAvg.avgWater ?? null),
    [twoWeekComparison.delta, weeklyAvg.avgWater],
  )
  const todayWaterLogged  = todayNutLog !== null && (todayNutLog.waterIntake ?? 0) > 0
  const todayWaterStatus  = todayNutLog && todayWaterLogged
    ? getWaterStatus(todayNutLog.waterIntake)
    : null

  const todayIsWeekend = [0, 6].includes(new Date().getDay())   // 0 = Sun, 6 = Sat

  const deficitItems = useMemo(() => [
    { label: 'Workouts remaining this week', value: weeklyRemaining,                   urgent: weeklyRemaining > 0 },
    {
      label:  'Workout today',
      value:  todayIsWeekend ? 'Rest day' : weekly.workoutToday ? '✓' : '✗ Missing',
      urgent: !todayIsWeekend && !weekly.workoutToday,
    },
    { label: 'Nutrition logged today',       value: todayNutLogged ? '✓' : '✗ Not logged', urgent: !todayNutLogged },
  ], [weeklyRemaining, weekly.workoutToday, todayLogged, todayIsWeekend])

  // ── Derived: session history week window ──────────────────────────────────
  const historyWeekMonday = useMemo(() => {
    const d = new Date(weekOf(nutDateKey()) + 'T12:00:00')
    d.setDate(d.getDate() + historyWeekOffset * 7)
    return d.toISOString().slice(0, 10)
  }, [historyWeekOffset])

  const historyWeekSunday = useMemo(() => {
    const d = new Date(historyWeekMonday + 'T12:00:00')
    d.setDate(d.getDate() + 6)
    return d.toISOString().slice(0, 10)
  }, [historyWeekMonday])

  const historyWeekLabel = useMemo(() => {
    const fmt = (iso: string) =>
      new Date(iso + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    return `${fmt(historyWeekMonday)} – ${fmt(historyWeekSunday)}`
  }, [historyWeekMonday, historyWeekSunday])

  const historyWeekSessions = useMemo(() =>
    [...completedWorkouts]
      .filter(w => {
        const iso = parseDateLabel(w.date)
        return iso !== null && iso >= historyWeekMonday && iso <= historyWeekSunday
      })
      .reverse(),
    [completedWorkouts, historyWeekMonday, historyWeekSunday],
  )

  // ── Derived: stage engine ─────────────────────────────────────────────────
  // Count distinct calendar weeks that have at least one workout logged (real data)
  const creedWeeksConsistent = useMemo(() => {
    const weeks = new Set<string>()
    for (const w of completedWorkouts) {
      const iso = parseDateLabel(w.date)
      if (iso) weeks.add(weekOf(iso))
    }
    return weeks.size
  }, [completedWorkouts])

  // Determine current Creed stage from weeks completed
  const currentCreedStage = useMemo((): CreedStageDef => {
    for (let i = CREED_STAGE_DEFS.length - 1; i >= 0; i--) {
      if (creedWeeksConsistent >= CREED_STAGE_DEFS[i].weeksTarget) {
        // completed this stage — show next if available, else stay on last
        return CREED_STAGE_DEFS[Math.min(i + 1, CREED_STAGE_DEFS.length - 1)]
      }
    }
    return CREED_STAGE_DEFS[0]
  }, [creedWeeksConsistent])

  // Creed complete = met its current stage requirement
  const creedStageComplete = creedWeeksConsistent >= currentCreedStage.weeksTarget

  // Other flows: read static stageRequirements (shared source of truth for all flows)
  const pendingFlows = useMemo(
    () => stageRequirements
      .filter(r => r.flow !== 'creed' && r.current < r.target)
      .map(r => ({
        flow:    r.flow,
        label:   FLOW_LABELS[r.flow] ?? r.flow,
        current: r.current,
        target:  r.target,
        unit:    r.unit,
        pct:     Math.round((r.current / r.target) * 100),
      })),
    [],
  )

  const creedFlowStatus = useMemo((): CreedFlowStatus => {
    if (!creedStageComplete) return 'active'
    if (pendingFlows.length === 0) return 'complete'
    // Creed done; split waiting vs maintain by whether any other flow is ≥ 50%
    const anyHalfway = pendingFlows.some(f => f.pct >= 50)
    return anyHalfway ? 'maintain' : 'waiting'
  }, [creedStageComplete, pendingFlows])

  // ── Persist stage state to Supabase ──────────────────────────────────────
  useEffect(() => {
    if (!user) return
    supabase
      .from('creed_stage_state')
      .upsert({
        user_id:       user.id,
        current_stage: currentCreedStage.id,
        stage_name:    currentCreedStage.label,
        target_weight: currentCreedStage.weeksTarget,
        flow_status:   creedFlowStatus,
      }, { onConflict: 'user_id' })
      .then(({ error }) => { if (error) console.error('[creed] upsert creed_stage_state:', error) })
  }, [user, currentCreedStage, creedFlowStatus]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Derived: life stage ───────────────────────────────────────────────────
  const currentLifeStage = useMemo((): LifeStage => {
    const w = weeklyAvg.weight
    if (w === null) return LIFE_STAGES[0]
    const active = LIFE_STAGES.find(s => w < s.weightTarget)
    return active ?? LIFE_STAGES[LIFE_STAGES.length - 1]
  }, [weeklyAvg.weight])

  const nextLifeStage = useMemo((): LifeStage | null => {
    const idx = LIFE_STAGES.findIndex(s => s.id === currentLifeStage.id)
    return idx < LIFE_STAGES.length - 1 ? LIFE_STAGES[idx + 1] : null
  }, [currentLifeStage])

  // ── Creed physical stage ─────────────────────────────────────────────────
  // Week boundary: Sunday 00:00 → Saturday 23:59 (same convention as Motion)
  const weeklyPhysicalAvg = useMemo(() => {
    const now   = new Date()
    const d     = new Date(now)
    d.setDate(d.getDate() - d.getDay())   // rewind to Sunday
    const sun   = d.toISOString().slice(0, 10)
    const today = now.toISOString().slice(0, 10)

    const weekLogs = nutLogs.filter(l => l.date >= sun && l.date <= today)
    const bwLogs   = weekLogs.filter(l => l.bodyweight > 0)
    const bfLogs   = weekLogs.filter(l => l.bodyFatPct > 0)

    const avgBw = bwLogs.length >= 2
      ? Math.round(bwLogs.reduce((s, l) => s + l.bodyweight, 0) / bwLogs.length * 10) / 10
      : null
    const avgBf = bfLogs.length >= 2
      ? Math.round(bfLogs.reduce((s, l) => s + l.bodyFatPct, 0) / bfLogs.length * 10) / 10
      : null

    return { bw: avgBw, bf: avgBf, bwCount: bwLogs.length, bfCount: bfLogs.length }
  }, [nutLogs])

  // Last 5 entries that have a bodyweight logged, most-recent first
  const physicalRecentLogs = useMemo(() =>
    [...nutLogs]
      .filter(l => l.bodyweight > 0)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5),
    [nutLogs],
  )

  const currentCreedPhysicalStage = useMemo((): CreedPhysicalStageDef => {
    const { bw, bf } = weeklyPhysicalAvg
    const active = CREED_PHYSICAL_STAGES.find(s => {
      const wtDone = bw !== null && bw >= s.weightTarget
      const bfDone = bf !== null && bf <= s.maxBodyFatPct
      return !(wtDone && bfDone)
    })
    return active ?? CREED_PHYSICAL_STAGES[CREED_PHYSICAL_STAGES.length - 1]
  }, [weeklyPhysicalAvg])

  const nextCreedPhysicalStage = useMemo((): CreedPhysicalStageDef | null => {
    const idx = CREED_PHYSICAL_STAGES.findIndex(s => s.id === currentCreedPhysicalStage.id)
    return idx < CREED_PHYSICAL_STAGES.length - 1 ? CREED_PHYSICAL_STAGES[idx + 1] : null
  }, [currentCreedPhysicalStage])

  // Stage complete = weight target reached AND progression not regressing (stable delta)
  const lifeStageComplete = useMemo((): boolean => {
    const w = weeklyAvg.weight
    if (w === null) return false
    const targetReached = w >= currentLifeStage.weightTarget
    const stable = twoWeekComparison.delta !== null && twoWeekComparison.delta >= 0
    return targetReached && stable
  }, [weeklyAvg.weight, currentLifeStage, twoWeekComparison.delta])

  // ── Derived: feedback dashboard ───────────────────────────────────────────
  const fbWeekSunday = useMemo(() => getWeekSunday(), [])

  const fbDashboard = useMemo(() => {
    const today = nutDateKey()
    // Build ISO date set from workout history (dates stored as "24 Mar 26")
    const workoutDates = new Set<string>()
    for (const w of completedWorkouts) {
      const iso = parseDateLabel(w.date)
      if (iso) workoutDates.add(iso)
    }
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(fbWeekSunday + 'T12:00:00')
      d.setDate(d.getDate() + i)
      const iso      = d.toISOString().slice(0, 10)
      const isFuture = iso > today
      const isToday  = iso === today
      const dayLabel = d.toLocaleDateString('en-GB', { weekday: 'short' })
      const dayNum   = d.getDate()
      // Sat (6) and Sun (0) are rest days — never expected to train
      const isWeekend = d.getDay() === 0 || d.getDay() === 6
      // Gym: green if workout logged, red only on weekdays with no workout, neutral on weekends
      const gymStatus: DayStatus = (isFuture || isWeekend) ? 'none' : workoutDates.has(iso) ? 'green' : 'red'
      // Meals: compare calories to target
      const log = nutLogs.find(l => l.date === iso)
      let mealsStatus: DayStatus = 'none'
      if (!isFuture) {
        if (!log || log.calories === 0) {
          mealsStatus = 'red'
        } else {
          const pct = (log.calories / nutTargets.calories) * 100
          mealsStatus = pct >= 90 ? 'green' : pct >= 70 ? 'orange' : 'red'
        }
      }
      // Recovery: water intake (none if not tracked)
      let waterStatus: DayStatus = 'none'
      if (!isFuture && log && (log.waterIntake ?? 0) > 0) {
        waterStatus = log.waterIntake >= 4 ? 'green' : log.waterIntake >= 3 ? 'orange' : 'red'
      }
      return { iso, dayLabel, dayNum, isToday, isFuture, isWeekend, gymStatus, mealsStatus, waterStatus }
    })
  }, [fbWeekSunday, completedWorkouts, nutLogs, nutTargets])

  const fbSummary = useMemo(() => {
    const past = fbDashboard.filter(d => !d.isFuture)
    if (past.length === 0) return null
    // Gym: only weekdays count as training expectations
    const gymDays     = past.filter(d => !d.isWeekend)
    const gymTotal    = gymDays.length
    const gymGreens   = past.filter(d => d.gymStatus   === 'green').length
    const mealsGreens = past.filter(d => d.mealsStatus === 'green').length
    const waterTracked = past.filter(d => d.waterStatus !== 'none').length
    const waterGreens  = past.filter(d => d.waterStatus === 'green').length
    const greenCells   = gymGreens + mealsGreens + waterGreens
    // Total cells: weekday gym expectations + all days for meals + water tracked
    const totalCells   = gymTotal + past.length + waterTracked
    const compliancePct = totalCells > 0 ? Math.round((greenCells / totalCells) * 100) : 0
    // Missed training days — weekdays only (weekends have gymStatus 'none', filtered automatically)
    const missedGym = past.filter(d => d.gymStatus === 'red')
      .map(d => new Date(d.iso + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }))
    // Per-category green rates
    const n = past.length
    const categories = [
      { label: 'Gym',      greens: gymGreens,   total: gymTotal,     rate: gymTotal     > 0 ? gymGreens   / gymTotal     : 0 },
      { label: 'Meals',    greens: mealsGreens, total: n,            rate: n            > 0 ? mealsGreens / n            : 0 },
      { label: 'Recovery', greens: waterGreens, total: waterTracked, rate: waterTracked > 0 ? waterGreens / waterTracked : 0 },
    ]
    const weakest = [...categories].sort((a, b) => a.rate - b.rate)[0]
    return { past: past.length, gymGreens, mealsGreens, waterGreens, waterTracked, compliancePct, missedGym, categories, weakest }
  }, [fbDashboard])

  // ── Training handlers ──────────────────────────────────────────────────────
  // Dirty check: any reps or weight entered
  const hasDirtyDraft = drafts.some(d => d.weight.trim() !== '' || d.setReps.some(r => r.trim() !== ''))

  function openLog() {
    const built = currentWorkout.exercises.map(ex => {
      const exState  = exerciseStates[ex.name]
      const lastSame = lastSameSession?.exercises.find(e => e.name === ex.name)
      const weight   = exState?.currentWeight ?? lastSame?.nextWeight
      return {
        name: ex.name, category: ex.category, sets: ex.sets,
        weight:  weight != null ? String(weight) : '',
        setReps: Array(ex.sets).fill('') as string[],
      }
    })
    setDrafts(built)
    setSessionNotes('')
    setSaveState('idle')
    setSavedNextLabel('')
    // Auto-expand first card
    setExpandedCards(new Set([built[0]?.name ?? '']))
    setLogOpen(true)
  }

  function updateDraftWeight(i: number, val: string) {
    setDrafts(prev => prev.map((d, idx) => idx === i ? { ...d, weight: val } : d))
  }

  function updateDraftSetRep(i: number, s: number, val: string) {
    setDrafts(prev => prev.map((d, idx) => {
      if (idx !== i) return d
      const setReps = [...d.setReps]
      setReps[s] = val
      return { ...d, setReps }
    }))
  }

  function saveWorkout() {
    // Only include exercises where weight was entered
    const validDrafts = drafts.filter(d => d.weight.trim() !== '')
    if (validDrafts.length === 0) return

    const sessionId = uid()
    const dateStr   = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })

    // Per-exercise: compute results + next targets once, reuse everywhere
    type ComputedEx = {
      draft:    typeof validDrafts[0]
      weight:   number
      setReps:  number[]
      targets:  NextTargets
    }
    const computed: ComputedEx[] = validDrafts.map(d => {
      const weight  = parseFloat(d.weight) || 0
      const setReps = d.setReps.map(r => parseInt(r) || 0)
      const exState  = exerciseStates[d.name]
      const lastSame = lastSameSession?.exercises.find(e => e.name === d.name)
      const lastReps = exState?.lastReps ?? lastSame?.setReps ?? null
      const targets  = computeNextTargets(d.name, d.category, d.sets, weight, setReps, lastReps, currentWorkout.name)
      return { draft: d, weight, setReps, targets }
    })

    // ── Build ExerciseLog (for UI / mission system) ──────────────────────────
    const decisionMap: Record<SessionResult, ExerciseDecision> = {
      increase: 'increase', win: 'maintain', hold: 'maintain', fix: 'fix_form',
    }
    const exercises: ExerciseLog[] = computed.map(({ draft: d, weight, setReps, targets }) => {
      const [low] = getRepRange(d.category)
      return {
        name: d.name, category: d.category, sets: d.sets,
        weight, setReps,
        decision:       decisionMap[targets.result],
        nextWeight:     targets.nextWeight,
        nextRepsTarget: targets.nextTargetReps[0] ?? low,
      }
    })

    // ── Build SavedSession (canonical persistence record) ────────────────────
    const savedSession: SavedSession = {
      workoutId: sessionId, date: dateStr,
      workoutIndex: currentWorkoutIndex, workoutName: currentWorkout.name,
      notes: sessionNotes,
      exercises: computed.map(({ draft: d, weight, setReps, targets }) => ({
        exerciseId: d.name, weight, reps: setReps, result: targets.result,
      })),
    }

    // ── Build updated ExerciseState map ──────────────────────────────────────
    const updatedExStates: Record<string, ExerciseState> = { ...exerciseStates }
    for (const { draft: d, setReps, targets } of computed) {
      updatedExStates[d.name] = {
        exerciseId:    d.name,
        currentWeight: targets.nextWeight,
        lastReps:      setReps,
        nextTargetReps: targets.nextTargetReps,
        result:        targets.result,
        status:        targets.status,
      }
    }

    // ── Advance cycle ────────────────────────────────────────────────────────
    const newCycleIndex = (currentWorkoutIndex + 1) % 6

    // ── Persist ──────────────────────────────────────────────────────────────
    const updatedWorkouts = [...completedWorkouts, {
      id: sessionId, date: dateStr,
      workoutIndex: currentWorkoutIndex, workoutName: currentWorkout.name,
      exercises, notes: sessionNotes,
    }]
    const updatedSessions = [...lsGet<SavedSession[]>(LS_SESSIONS, []), savedSession]

    lsSet(LS_WORKOUTS,  updatedWorkouts)
    lsSet(LS_SESSIONS,  updatedSessions)
    lsSet(LS_EX_STATE,  updatedExStates)
    lsSet(LS_CYCLE,     { currentIndex: newCycleIndex })

    // ── Persist to Supabase ──────────────────────────────────────────────────
    if (user) {
      const newWorkout = { id: sessionId, date: dateStr, workoutIndex: currentWorkoutIndex, workoutName: currentWorkout.name, exercises, notes: sessionNotes }
      supabase
        .from('completed_workouts')
        .insert({
          id:             newWorkout.id,
          user_id:        user.id,
          workout_date:   newWorkout.date,
          workout_index:  newWorkout.workoutIndex,
          workout_name:   newWorkout.workoutName,
          notes:          newWorkout.notes,
          exercises:      newWorkout.exercises,
        })
        .then(({ error }) => { if (error) console.error('[creed] insert completed_workouts:', error) })

      supabase
        .from('cycle_state')
        .upsert({ user_id: user.id, current_index: newCycleIndex }, { onConflict: 'user_id' })
        .then(({ error }) => { if (error) console.error('[creed] upsert cycle_state:', error) })
    }

    // ── Update React state ───────────────────────────────────────────────────
    const nextLabel = WORKOUT_CYCLE[newCycleIndex].short

    setSaveState('saving')
    // brief save animation, then show success
    setTimeout(() => {
      setCompletedWorkouts(updatedWorkouts)
      setExerciseStates(updatedExStates)
      setCycleIndex(newCycleIndex)
      setSavedNextLabel(nextLabel)
      setSaveState('saved')
      setDrafts([])
      setSessionNotes('')
      setExpandedCards(new Set())
      setWeekly(prev => ({
        ...prev,
        workoutsDone:  prev.workoutsDone + 1,
        totalSessions: prev.totalSessions + 1,
        workoutToday:  true,
      }))
      // Close log form after showing success for 1.8s
      setTimeout(() => {
        setLogOpen(false)
        setSaveState('idle')
      }, 1800)
    }, 600)
  }

  function cancelLog() {
    if (hasDirtyDraft && !window.confirm('You have an unsaved workout. Discard it?')) return
    setLogOpen(false)
    setDrafts([])
    setSessionNotes('')
    setExpandedCards(new Set())
    setSaveState('idle')
  }

  // ── Nutrition handlers ─────────────────────────────────────────────────────
  function updateNutritionDraft(field: keyof NutritionDraft, val: string) {
    setNutDraft(prev => ({ ...prev, [field]: val }))
  }

  function logWeight() {
    const bw = parseFloat(nutDraft.bodyweight)
    if (!bw) return
    const bf       = parseFloat(nutDraft.bodyFatPct) || 0
    const key      = nutDateKey()
    const existing = nutLogs.find(l => l.date === key)
    const entry: NutritionLog = existing
      ? { ...existing, bodyweight: bw, bodyFatPct: bf || existing.bodyFatPct }
      : { id: uid(), date: key, dateLabel: nutFormatDate(key), bodyweight: bw, bodyFatPct: bf, calories: 0, protein: 0, carbs: 0, fats: 0, waterIntake: 0, notes: '' }
    const updated = [...nutLogs.filter(l => l.date !== key), entry]
      .sort((a, b) => a.date.localeCompare(b.date))
    setNutLogs(updated)
    lsSet(LS_NUT_LOGS, updated)
    setNutDraft(prev => ({ ...prev, bodyweight: '', bodyFatPct: '' }))

    if (user) {
      supabase
        .from('nutrition_logs')
        .upsert({
          user_id:       user.id,
          log_date:      entry.date,
          date_label:    entry.dateLabel,
          bodyweight:    entry.bodyweight,
          body_fat_pct:  entry.bodyFatPct || null,
          calories:      entry.calories,
          protein:       entry.protein,
          carbs:         entry.carbs,
          fats:          entry.fats,
          water_intake:  entry.waterIntake,
          notes:         entry.notes,
        }, { onConflict: 'user_id,log_date' })
        .then(({ error }) => { if (error) console.error('[creed] upsert nutrition_logs (weight):', error) })
    }
  }

  function logNutrition() {
    const cal = parseFloat(nutDraft.calories)
    if (!cal) return
    const key      = nutDateKey()
    const existing = nutLogs.find(l => l.date === key)
    const water = parseFloat(nutDraft.waterIntake) || 0
    const entry: NutritionLog = existing
      ? { ...existing, calories: cal, protein: parseFloat(nutDraft.protein) || existing.protein, carbs: parseFloat(nutDraft.carbs) || existing.carbs, fats: parseFloat(nutDraft.fats) || existing.fats, waterIntake: water || (existing.waterIntake ?? 0), notes: nutDraft.notes || existing.notes }
      : { id: uid(), date: key, dateLabel: nutFormatDate(key), bodyweight: 0, bodyFatPct: 0, calories: cal, protein: parseFloat(nutDraft.protein) || 0, carbs: parseFloat(nutDraft.carbs) || 0, fats: parseFloat(nutDraft.fats) || 0, waterIntake: water, notes: nutDraft.notes }
    const updated = [...nutLogs.filter(l => l.date !== key), entry]
      .sort((a, b) => a.date.localeCompare(b.date))
    setNutLogs(updated)
    lsSet(LS_NUT_LOGS, updated)
    setNutDraft(prev => ({ ...prev, calories: '', protein: '', carbs: '', fats: '', notes: '' }))

    if (user) {
      supabase
        .from('nutrition_logs')
        .upsert({
          user_id:      user.id,
          log_date:     entry.date,
          date_label:   entry.dateLabel,
          bodyweight:   entry.bodyweight,
          calories:     entry.calories,
          protein:      entry.protein,
          carbs:        entry.carbs,
          fats:         entry.fats,
          water_intake: entry.waterIntake,
          notes:        entry.notes,
        }, { onConflict: 'user_id,log_date' })
        .then(({ error }) => { if (error) console.error('[creed] upsert nutrition_logs (nutrition):', error) })
    }
  }

  function runAutoEvaluation() {
    if (!isReviewDay) return
    if (!cycleStatus.dataReliable) return
    if (nutCycle.lastEvalFriday === nutDateKey()) return   // already ran today
    if ((nutCycle.weekNumber ?? 1) < 2) return            // need ≥2 weeks for Week A vs Week B

    const today = nutDateKey()

    // ── 14-day evaluation: compare Week B (current) vs Week A (previous) ──
    const auto      = computeAutoDecision(twoWeekComparison.delta, currentPhase)
    const decision  = auto.decision
    const reason    = auto.reason
    const newTargets = nutApplyDecision(decision, nutTargets)

    const record: WeekRecord = {
      weekId: nutCycle.weekId, weekNumber: nutCycle.weekNumber,
      startDate: nutCycle.weekStart, endDate: today,
      daysTracked: weeklyAvg.daysTracked,
      avgWeight: weeklyAvg.weight, avgCalories: weeklyAvg.calories,
      avgProtein: weeklyAvg.protein, avgCarbs: weeklyAvg.carbs, avgFats: weeklyAvg.fats,
      decision, targetsAfter: newTargets,
      autoReason: reason,
      watchBefore: false, watchAfter: false,
    }

    const updatedHistory = [...nutHistory, record]
    const newCycle: NutritionCycle = {
      weekId:           `W${nutCycle.weekNumber + 1}`,
      weekNumber:       nutCycle.weekNumber + 1,
      weekStart:        today,
      status:           'collecting',
      watchFlag:        false,       // no longer used; kept for schema compat
      lastEvalFriday:   today,       // prevents re-run this same Friday
      lastAutoDecision: reason,
      startupComplete:  true,        // kept for schema compat
    }

    setNutTargets(newTargets)
    setNutHistory(updatedHistory)
    setNutCycle(newCycle)
    lsSet(LS_NUT_TARGETS, newTargets)
    lsSet(LS_NUT_HISTORY, updatedHistory)
    lsSet(LS_NUT_CYCLE, newCycle)

    if (user) {
      // Persist the completed week record
      supabase
        .from('week_records')
        .upsert({
          user_id:      user.id,
          week_id:      record.weekId,
          week_number:  record.weekNumber,
          start_date:   record.startDate,
          end_date:     record.endDate,
          days_tracked: record.daysTracked,
          avg_weight:   record.avgWeight,
          avg_calories: record.avgCalories,
          avg_protein:  record.avgProtein,
          avg_carbs:    record.avgCarbs,
          avg_fats:     record.avgFats,
          decision:     record.decision,
          targets_after: record.targetsAfter,
          auto_reason:  record.autoReason,
          watch_before: record.watchBefore,
          watch_after:  record.watchAfter,
        }, { onConflict: 'user_id,week_id' })
        .then(({ error }) => { if (error) console.error('[creed] upsert week_records:', error) })

      // Persist new cycle
      supabase
        .from('nutrition_cycles')
        .upsert({
          user_id:            user.id,
          week_id:            newCycle.weekId,
          week_number:        newCycle.weekNumber,
          week_start:         newCycle.weekStart,
          status:             newCycle.status,
          watch_flag:         newCycle.watchFlag,
          last_eval_friday:   newCycle.lastEvalFriday,
          last_auto_decision: newCycle.lastAutoDecision,
          startup_complete:   newCycle.startupComplete,
        }, { onConflict: 'user_id' })
        .then(({ error }) => { if (error) console.error('[creed] upsert nutrition_cycles:', error) })

      // Persist updated targets
      supabase
        .from('nutrition_targets')
        .upsert({
          user_id:  user.id,
          calories: newTargets.calories,
          protein:  newTargets.protein,
          carbs:    newTargets.carbs,
          fats:     newTargets.fats,
        }, { onConflict: 'user_id' })
        .then(({ error }) => { if (error) console.error('[creed] upsert nutrition_targets:', error) })
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      <FlowPageHeader title="Creed" subtitle="Physical discipline & consistency" badge="maintain" />
      <FlowTabs tabs={TABS} active={activeTab} onChange={setActiveTab} accent="red" />

      {/* ── OVERVIEW ──────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="flex flex-col gap-4">

          {/* ── CreedStageCard — Physical Stage ── */}
          {(() => {
            const stage      = currentCreedPhysicalStage
            const next       = nextCreedPhysicalStage
            const { bw, bf, bwCount, bfCount } = weeklyPhysicalAvg
            const bwPending  = bwCount < 2
            const bfPending  = bfCount < 2
            const prevWeight = stage.id === 1 ? 65 : CREED_PHYSICAL_STAGES[stage.id - 2].weightTarget
            const wtRange    = stage.weightTarget - prevWeight
            const wtDelta    = Math.max(0, (bw ?? prevWeight) - prevWeight)
            const wtPct      = bwPending ? 0 : Math.min(100, Math.round((wtDelta / wtRange) * 100))
            const bfMax      = stage.maxBodyFatPct
            const bfPct      = (!bfPending && bf !== null)
              ? Math.min(100, Math.round((bfMax / bf) * 100))   // higher = closer to target (BF lower = better)
              : 0
            const bfOk       = !bfPending && bf !== null && bf <= bfMax
            const wtOk       = wtPct >= 100
            const isComplete = wtOk && bfOk

            // Today's single entry
            const todayBw = todayNutLog?.bodyweight ?? 0
            const todayBf = todayNutLog?.bodyFatPct ?? 0

            // Blocking condition message
            const blockMsg = (() => {
              if (isComplete) return null
              if (bwPending && bfPending)
                return `Log weight 2+ times this week (Sun–Sat) to track stage progress.`
              if (bwPending)
                return `Need ${2 - bwCount} more weight log${2 - bwCount === 1 ? '' : 's'} this week for weekly average.`
              const wtStr = wtOk
                ? 'Weight on track ✓'
                : `Need ${(stage.weightTarget - bw!).toFixed(1)} kg more to advance.`
              const bfStr = bfPending
                ? 'BF pending (log 2+ entries with BF).'
                : bfOk
                  ? 'BF on track ✓'
                  : `BF ${bf}% needs to drop to ≤${bfMax}%.`
              return `${wtStr} ${bfStr}`
            })()

            return (
              <div className="rounded-xl border border-red-500/18 bg-white/5 p-5 flex flex-col gap-4">

                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] text-white/55 uppercase tracking-widest font-semibold">
                      Stage {stage.id} · Creed
                    </span>
                    <p className="text-base font-black text-white leading-tight mt-0.5">{stage.name}</p>
                    <p className="text-xs text-white/40 mt-0.5">Target: {stage.weightTarget} kg at ≤{stage.maxBodyFatPct}% BF</p>
                  </div>
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shrink-0 ${isComplete ? 'border-emerald-500/30 bg-emerald-500/8' : 'border-red-500/25 bg-red-500/8'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isComplete ? 'bg-emerald-400' : 'bg-red-400'}`} />
                    <span className={`text-[10px] font-bold ${isComplete ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isComplete ? 'Complete' : 'Active'}
                    </span>
                  </div>
                </div>

                {/* Today vs Week avg grid */}
                <div className="grid grid-cols-2 gap-2">
                  {[
                    {
                      label: 'Today',
                      bwVal: todayBw > 0 ? `${todayBw} kg` : '—',
                      bfVal: todayBf > 0 ? `${todayBf}% BF` : null,
                      dim:   todayBw === 0,
                    },
                    {
                      label: 'Week avg',
                      bwVal: bwPending ? 'Pending' : `${bw} kg`,
                      bfVal: bfPending ? null : `${bf}% BF`,
                      dim:   bwPending,
                      hint:  bwPending ? `${bwCount}/2 logs` : `${bwCount} log${bwCount !== 1 ? 's' : ''}`,
                    },
                  ].map(col => (
                    <div key={col.label} className="flex flex-col gap-1 rounded-lg bg-white/4 border border-white/6 px-3 py-2.5">
                      <span className="text-[9px] text-white/45 uppercase tracking-widest font-semibold">{col.label}</span>
                      <span className={`text-sm font-black font-mono leading-tight ${col.dim ? 'text-white/30' : 'text-white/80'}`}>
                        {col.bwVal}
                      </span>
                      {col.bfVal && (
                        <span className="text-[10px] font-mono text-white/50">{col.bfVal}</span>
                      )}
                      {'hint' in col && col.hint && (
                        <span className="text-[9px] text-white/30 font-mono">{col.hint}</span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Progress bars */}
                <div className="flex flex-col gap-2.5">
                  {/* Weight bar */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-baseline text-[10px] font-mono">
                      <span className="text-white/45">Weight</span>
                      <span className={wtOk ? 'text-emerald-400/80' : 'text-white/40'}>
                        {bwPending ? `pending (${bwCount}/2)` : `${bw} / ${stage.weightTarget} kg${wtOk ? ' ✓' : ''}`}
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${wtOk ? 'bg-emerald-500/60' : 'bg-red-500/40'}`}
                        style={{ width: `${wtPct}%` }}
                      />
                    </div>
                  </div>
                  {/* BF bar */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between items-baseline text-[10px] font-mono">
                      <span className="text-white/45">Body Fat</span>
                      <span className={bfOk ? 'text-emerald-400/80' : bfPending ? 'text-white/30' : 'text-amber-400/80'}>
                        {bfPending ? `pending (${bfCount}/2)` : `${bf}% / ≤${bfMax}%${bfOk ? ' ✓' : ''}`}
                      </span>
                    </div>
                    <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${bfOk ? 'bg-emerald-500/60' : bfPending ? 'bg-white/10' : 'bg-amber-500/45'}`}
                        style={{ width: `${bfPct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Recent log history */}
                {physicalRecentLogs.length > 0 && (
                  <div className="flex flex-col gap-1 pt-0.5 border-t border-white/6">
                    <span className="text-[9px] text-white/40 uppercase tracking-widest font-semibold mb-0.5">Recent entries</span>
                    {physicalRecentLogs.map(l => {
                      const d = new Date(l.date + 'T12:00:00')
                      const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                      return (
                        <div key={l.date} className="flex items-center gap-2 text-[10px] font-mono">
                          <span className="text-white/30 w-14 shrink-0">{label}</span>
                          <span className="text-white/60">{l.bodyweight} kg</span>
                          {l.bodyFatPct > 0 && (
                            <span className="text-white/35">· {l.bodyFatPct}% BF</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Blocking condition */}
                {blockMsg && (
                  <div className="rounded-lg bg-white/3 border border-white/6 px-3 py-2">
                    <p className="text-[10px] text-white/50 leading-relaxed">{blockMsg}</p>
                  </div>
                )}

                {/* Next stage + requirement */}
                <div className="flex flex-col gap-1 pt-0.5 border-t border-white/6">
                  {next && (
                    <p className="text-[10px] text-white/35">
                      <span className="text-white/50 font-semibold">Next — Stage {next.id} · {next.name}:</span> {next.weightTarget} kg at ≤{next.maxBodyFatPct}% BF
                    </p>
                  )}
                  <p className="text-[10px] text-white/30">{stage.requirement}</p>
                </div>

              </div>
            )
          })()}

          {/* ── A. Current Stage card ── */}
          {(() => {
            type SC = { label: string; border: string; badge: string; dot: string; bar: string }
            const statusConfig: Record<CreedFlowStatus, SC> = {
              active:   { label: 'Active',   border: 'border-red-500/25',      badge: 'border-red-500/30 bg-red-500/10 text-red-400',          dot: 'bg-red-500',      bar: 'bg-red-500/55'      },
              waiting:  { label: 'Waiting',  border: 'border-amber-500/25',    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-400',    dot: 'bg-amber-500',    bar: 'bg-emerald-500/55'  },
              maintain: { label: 'Maintain', border: 'border-blue-500/20',     badge: 'border-blue-500/25 bg-blue-500/8 text-blue-400',        dot: 'bg-blue-400',     bar: 'bg-emerald-500/55'  },
              complete: { label: 'Complete', border: 'border-emerald-500/25',  badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400', dot: 'bg-emerald-500', bar: 'bg-emerald-500/60' },
            }
            const cfg         = statusConfig[creedFlowStatus]
            const progressPct = Math.min(100, Math.round((creedWeeksConsistent / currentCreedStage.weeksTarget) * 100))
            const remaining   = Math.max(0, currentCreedStage.weeksTarget - creedWeeksConsistent)
            // All other flows for cross-flow panel
            const allOtherFlows = stageRequirements.filter(r => r.flow !== 'creed')

            return (
              <div className={`rounded-xl border bg-white/5 p-5 flex flex-col gap-3.5 ${cfg.border}`}>

                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] text-white/55 uppercase tracking-widest font-semibold">
                      {currentCreedStage.label} · Creed
                    </span>
                    <p className="text-base font-black text-white leading-tight mt-0.5">
                      {currentCreedStage.subtitle}
                    </p>
                    <p className="text-xs text-white/35 mt-0.5">{currentCreedStage.description}</p>
                  </div>
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shrink-0 ${cfg.badge}`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
                    <span className="text-[10px] font-bold">{cfg.label}</span>
                  </div>
                </div>

                {/* Stage progress */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-baseline text-[10px] font-mono">
                    <span className="text-white/35">
                      {creedWeeksConsistent} / {currentCreedStage.weeksTarget} weeks consistent
                    </span>
                    <span className="text-white/50">
                      {remaining > 0 ? `${remaining} remaining` : '✓ done'}
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${cfg.bar}`} style={{ width: `${progressPct}%` }} />
                  </div>
                  <div className="flex justify-end">
                    <span className={`text-[10px] font-semibold font-mono ${progressPct >= 100 ? 'text-emerald-400' : 'text-white/55'}`}>
                      {progressPct}%
                    </span>
                  </div>
                </div>

                {/* Cross-flow dependency panel */}
                <div className="flex flex-col gap-2 pt-1 border-t border-white/6">
                  <span className="text-[9px] text-white/45 uppercase tracking-widest font-semibold">
                    Global Stage 1 — all flows required
                  </span>
                  {allOtherFlows.map(f => {
                    const done   = f.current >= f.target
                    const pct    = Math.min(100, Math.round((f.current / f.target) * 100))
                    const lbl    = FLOW_LABELS[f.flow] ?? f.flow
                    const barCol = done ? 'bg-emerald-500/50' : pct >= 50 ? 'bg-blue-500/40' : 'bg-amber-500/35'
                    return (
                      <div key={f.flow} className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${done ? 'bg-emerald-500' : 'bg-white/20'}`} />
                        <span className={`text-[10px] w-16 shrink-0 ${done ? 'text-emerald-400/80' : 'text-white/40'}`}>{lbl}</span>
                        <div className="flex-1 h-1 bg-white/8 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${barCol}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[9px] font-mono text-white/50 shrink-0 w-20 text-right">
                          {done ? '✓ done' : `${f.current}/${f.target} ${f.unit}`}
                        </span>
                      </div>
                    )
                  })}
                  {/* Creed own row */}
                  {(() => {
                    const done = creedStageComplete
                    const pct  = progressPct
                    return (
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${done ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <span className={`text-[10px] w-16 shrink-0 font-semibold ${done ? 'text-emerald-400/80' : 'text-red-400/80'}`}>Creed</span>
                        <div className="flex-1 h-1 bg-white/8 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${done ? 'bg-emerald-500/55' : 'bg-red-500/50'}`} style={{ width: `${pct}%` }} />
                        </div>
                        <span className="text-[9px] font-mono text-white/50 shrink-0 w-20 text-right">
                          {done ? '✓ done' : `${creedWeeksConsistent}/${currentCreedStage.weeksTarget} ${req.unit}`}
                        </span>
                      </div>
                    )
                  })()}
                  {creedFlowStatus === 'complete' && (
                    <p className="text-[10px] text-emerald-400/70 pt-0.5">
                      All flows complete — global Stage 1 ready to advance
                    </p>
                  )}
                  {creedFlowStatus === 'waiting' && (
                    <p className="text-[10px] text-amber-400/60 pt-0.5">
                      Creed complete — hold position while other flows catch up
                    </p>
                  )}
                  {creedFlowStatus === 'maintain' && (
                    <p className="text-[10px] text-blue-400/60 pt-0.5">
                      Creed complete — maintain discipline, other flows approaching
                    </p>
                  )}
                </div>
              </div>
            )
          })()}

          {/* ── B. Training snapshot ── */}
          <MetricsCard metrics={trainingMetrics} accent="red" />

          {/* ── C. Nutrition snapshot ── */}
          {(() => {
            const ph        = currentPhase
            const lastDecision = nutCycle.lastAutoDecision
            const decisionLabel: Partial<Record<AutoDecision, string>> = {
              below_target:    '+250 kcal',
              on_target:       'Maintain',
              above_stabilize: 'Stabilize',
              above_watch:     'Watch',
              above_cut:       '−150 kcal',
              startup_on_track: 'Hold',
              startup_increase: '→ 3000 kcal',
            }
            const decisionColor: Partial<Record<AutoDecision, string>> = {
              below_target:    'text-blue-400',
              on_target:       'text-emerald-400',
              above_stabilize: 'text-amber-400',
              above_watch:     'text-amber-400',
              above_cut:       'text-red-400',
              startup_on_track:'text-emerald-400',
              startup_increase:'text-blue-400',
            }
            return (
              <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/55 uppercase tracking-widest font-semibold">Nutrition</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                    todayNutLogged
                      ? 'border-emerald-500/25 bg-emerald-500/8 text-emerald-400/80'
                      : 'border-white/10 text-white/50'
                  }`}>
                    {todayNutLogged ? '✓ Logged today' : '— Not logged today'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-0.5 bg-white/4 rounded-lg px-3 py-2">
                    <span className="text-[9px] text-white/50 uppercase tracking-wide">Calories</span>
                    <span className="text-sm font-black font-mono text-orange-400">{nutTargets.calories}</span>
                    <span className="text-[9px] text-white/45">kcal target</span>
                  </div>
                  <div className="flex flex-col gap-0.5 bg-white/4 rounded-lg px-3 py-2">
                    <span className="text-[9px] text-white/50 uppercase tracking-wide">Phase</span>
                    <span className="text-sm font-black text-white/60">
                      {ph ? ph.label : '—'}
                    </span>
                    <span className="text-[9px] text-white/45">
                      {ph ? `${ph.range[0]}–${ph.range[1]} kg` : 'log weight'}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 bg-white/4 rounded-lg px-3 py-2">
                    <span className="text-[9px] text-white/50 uppercase tracking-wide">Last decision</span>
                    <span className={`text-sm font-black ${lastDecision ? (decisionColor[lastDecision] ?? 'text-white/50') : 'text-white/45'}`}>
                      {lastDecision ? (decisionLabel[lastDecision] ?? lastDecision) : '—'}
                    </span>
                    <span className="text-[9px] text-white/45">
                      {nutCycle.lastEvalFriday ?? 'no eval yet'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ── D. Life Stage card ── */}
          {(() => {
            const stage     = currentLifeStage
            const next      = nextLifeStage
            const w         = weeklyAvg.weight
            const pct       = w !== null ? Math.min(100, Math.round((w / stage.weightTarget) * 100)) : 0
            const isComplete = lifeStageComplete
            return (
              <div className={`rounded-xl border bg-white/5 px-5 py-4 flex flex-col gap-3 ${
                isComplete ? 'border-emerald-500/25' : 'border-white/10'
              }`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] text-white/55 uppercase tracking-widest font-semibold">
                      Life Stage {stage.id}
                    </span>
                    <p className="text-base font-black text-white leading-tight mt-0.5">{stage.name}</p>
                    <p className="text-xs text-white/35 mt-0.5">
                      Target: {stage.weightTarget} kg
                      {next ? ` → ${next.weightTarget} kg (${next.name})` : ' — Final stage'}
                    </p>
                  </div>
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border shrink-0 ${
                    isComplete
                      ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                      : 'border-white/12 bg-white/5 text-white/40'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isComplete ? 'bg-emerald-500' : 'bg-white/25'}`} />
                    <span className="text-[10px] font-bold">{isComplete ? 'Maintain' : 'Active'}</span>
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-baseline text-[10px] font-mono">
                    <span className="text-white/35">
                      {w !== null ? `${w} kg` : '— no weight logged'}
                      {' / '}{stage.weightTarget} kg
                    </span>
                    <span className={`font-semibold ${pct >= 100 ? 'text-emerald-400' : 'text-white/55'}`}>
                      {pct}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${isComplete ? 'bg-emerald-500/55' : 'bg-blue-500/40'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              </div>
            )
          })()}

          {/* ── E. Deficit / accountability block ── */}
          <DeficitCard items={deficitItems} />

          {/* ── F. Stage requirement progress bar ── */}
          <StageReqBar title={req.title} current={creedWeeksConsistent} target={currentCreedStage.weeksTarget} unit={req.unit} accent="red" />
        </div>
      )}

      {/* ── TRAINING – dashboard view ─────────────────────────────────── */}
      {activeTab === 'training' && !logOpen && (
        <div className="flex flex-col gap-4">

          {/* ── Top card: workout header + summary ── */}
          {(() => {
            const counts = { increase: 0, maintain: 0, fix: 0 }
            if (lastSameSession) {
              for (const ex of lastSameSession.exercises) {
                const m = computeMissionData(ex, currentWorkout.name)
                if (m.badge === 'ready_to_increase') counts.increase++
                else if (m.badge === 'fix_form')     counts.fix++
                else                                  counts.maintain++
              }
            }
            return (
              <div className="rounded-xl border border-red-500/25 bg-red-500/5 p-5 flex flex-col gap-4">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] text-red-400/60 uppercase tracking-widest font-semibold mb-0.5">Current Workout</p>
                    <p className="text-lg font-black text-white leading-tight">{currentWorkout.label}</p>
                    {lastSameSession && (
                      <p className="text-xs text-white/55 mt-0.5 font-mono">Last session: {lastSameSession.date}</p>
                    )}
                  </div>
                  <span className="text-xs font-mono text-red-400/60 border border-red-500/20 rounded-lg px-2.5 py-1 shrink-0">
                    {currentWorkoutIndex + 1} / 6
                  </span>
                </div>

                {/* Summary badges */}
                {lastSameSession && (
                  <div className="flex gap-2">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/8">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-xs font-semibold text-emerald-400">{counts.increase} increase</span>
                    </div>
                    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/12 bg-white/4">
                      <div className="w-1.5 h-1.5 rounded-full bg-white/40" />
                      <span className="text-xs font-semibold text-white/50">{counts.maintain} maintain</span>
                    </div>
                    {counts.fix > 0 && (
                      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/25 bg-amber-500/8">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        <span className="text-xs font-semibold text-amber-400">{counts.fix} fix form</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Next workout */}
                <p className="text-xs text-white/50">
                  After this → <span className="text-white/40">{nextWorkout.short}</span> ({nextWorkoutIndex + 1}/6)
                </p>

                <button
                  onClick={openLog}
                  className="w-full py-3 rounded-xl text-sm font-bold text-white bg-red-500 hover:bg-red-400 transition-colors"
                >
                  Log Today's Workout
                </button>
              </div>
            )
          })()}

          {/* ── Cycle bar ── */}
          <div className="rounded-xl border border-white/8 bg-white/3 px-3 py-2.5 flex gap-1.5">
            {WORKOUT_CYCLE.map((w, i) => {
              const isCurrent = i === currentWorkoutIndex
              const isDone    = i < currentWorkoutIndex
              return (
                <div key={w.name} className={`flex-1 rounded-lg py-2 flex flex-col items-center gap-0.5 border text-center ${
                  isCurrent ? 'border-red-500/40 bg-red-500/10'        :
                  isDone    ? 'border-emerald-500/25 bg-emerald-500/5'  :
                              'border-white/8 bg-transparent'
                }`}>
                  <span className={`text-[9px] font-bold leading-none ${
                    isCurrent ? 'text-red-400'       :
                    isDone    ? 'text-emerald-400/70' : 'text-white/47'
                  }`}>{w.short}</span>
                  <span className={`text-[8px] leading-none mt-0.5 ${
                    isCurrent ? 'text-red-400/55'    :
                    isDone    ? 'text-emerald-400/45' : 'text-white/42'
                  }`}>{isCurrent ? 'CURRENT' : isDone ? 'DONE' : String(i + 1)}</span>
                </div>
              )
            })}
          </div>

          {/* ── Session Plan ── */}
          {lastSameSession && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-0">
              <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 pb-1.5 mb-0.5 border-b border-white/8">
                <span className="text-[10px] text-white/50 uppercase">Exercise</span>
                <span className="text-[10px] text-white/50 uppercase text-right">Last</span>
                <span className="text-[10px] text-white/50 uppercase text-right">Next</span>
                <span className="text-[10px] text-white/50 uppercase text-right">Decision</span>
              </div>
              {lastSameSession.exercises.map(ex => {
                const m        = computeMissionData(ex, currentWorkout.name)
                const isUp     = m.badge === 'ready_to_increase'
                const isFix    = m.badge === 'fix_form'
                const nextReps = isUp ? m.stretchTarget : m.targetToBeat
                const decisionLabel =
                  isUp     ? '↑ Increase' :
                  isFix    ? '⚠ Fix Form' :
                  m.badge === 'progressing' ? 'Maintain' : 'Hold'
                const decisionColor =
                  isUp  ? 'text-emerald-400' :
                  isFix ? 'text-amber-400'   : 'text-white/35'
                const nextWeightColor = isUp ? 'text-emerald-400' : 'text-white/60'
                return (
                  <div key={ex.name} className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 py-2 border-b border-white/5 last:border-0 items-center">
                    <span className="text-xs text-white/65 truncate">{ex.name}</span>
                    <span className="text-[11px] font-mono text-white/40 text-right whitespace-nowrap">
                      {ex.weight} — {ex.setReps.join('/')}
                    </span>
                    <span className={`text-[11px] font-mono font-semibold text-right whitespace-nowrap ${nextWeightColor}`}>
                      {m.todayWeight} — {nextReps.join('/')}
                    </span>
                    <span className={`text-[10px] font-bold text-right whitespace-nowrap ${decisionColor}`}>
                      {decisionLabel}
                    </span>
                  </div>
                )
              })}
            </div>
          )}

          {/* ── Session History ── */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col gap-0">
            {/* Header: label + week nav */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] text-white/35 uppercase tracking-widest font-semibold">
                Session History
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setHistoryWeekOffset(o => o - 1)}
                  className="px-2 py-1 rounded-lg border border-white/10 text-[10px] text-white/35 hover:text-white/60 hover:border-white/20 transition-colors"
                >
                  ‹ Prev
                </button>
                <span className="text-[10px] font-mono text-white/55 px-2 min-w-[7rem] text-center">
                  {historyWeekOffset === 0 ? 'This week' : historyWeekLabel}
                </span>
                <button
                  onClick={() => setHistoryWeekOffset(o => o + 1)}
                  disabled={historyWeekOffset >= 0}
                  className={`px-2 py-1 rounded-lg border text-[10px] transition-colors ${
                    historyWeekOffset >= 0
                      ? 'border-white/5 text-white/40 cursor-not-allowed'
                      : 'border-white/10 text-white/35 hover:text-white/60 hover:border-white/20'
                  }`}
                >
                  Next ›
                </button>
              </div>
            </div>

            {/* Week range label (shown when not current week) */}
            {historyWeekOffset !== 0 && (
              <p className="text-[9px] text-white/45 font-mono mb-2">{historyWeekLabel}</p>
            )}

            {/* Session rows for selected week */}
            {historyWeekSessions.length === 0 ? (
              <div className="py-4 text-center">
                <span className="text-xs text-white/45">
                  {completedWorkouts.length === 0 ? 'No sessions logged yet — start today' : 'No sessions this week'}
                </span>
              </div>
            ) : (
              historyWeekSessions.map(session => {
                const isExpanded = expandedHistory.has(session.id)
                const summary = session.exercises
                  .slice(0, 3)
                  .map(ex => `${ex.weight}lbs×${ex.setReps.join('/')}`)
                  .join(' · ')
                const more = session.exercises.length > 3 ? ` +${session.exercises.length - 3}` : ''
                return (
                  <div key={session.id} className="border-b border-white/5 last:border-0">
                    <button
                      onClick={() => setExpandedHistory(prev => {
                        const next = new Set(prev)
                        next.has(session.id) ? next.delete(session.id) : next.add(session.id)
                        return next
                      })}
                      className="w-full flex items-center gap-3 py-2.5 text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold text-white/70">
                            {WORKOUT_CYCLE.find(w => w.name === session.workoutName)?.short ?? session.workoutName}
                          </span>
                          <span className="text-[10px] text-white/50 font-mono">{session.date}</span>
                        </div>
                        {!isExpanded && (
                          <p className="text-[10px] text-white/55 font-mono truncate mt-0.5">{summary}{more}</p>
                        )}
                      </div>
                      <span className="text-[10px] text-white/45 shrink-0">{isExpanded ? '▲' : '▼'}</span>
                    </button>

                    {isExpanded && (
                      <div className="pb-2.5 flex flex-col gap-0 pl-0">
                        {session.exercises.map(ex => {
                          const cfg = DECISION_CONFIG[ex.decision]
                          return (
                            <div key={ex.name} className="flex items-center gap-2 py-1 border-t border-white/4 first:border-0">
                              <div className={`w-1 h-1 rounded-full shrink-0 ${cfg.dot}`} />
                              <span className="text-[11px] text-white/50 flex-1 truncate">{ex.name}</span>
                              <span className="text-[11px] font-mono text-white/35 whitespace-nowrap">{ex.weight} lbs — {ex.setReps.join('/')}</span>
                            </div>
                          )
                        })}
                        {session.notes && (
                          <p className="text-[10px] text-white/50 italic mt-1.5 pl-3">{session.notes}</p>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>

        </div>
      )}

      {/* ── LOG FORM ──────────────────────────────────────────────────── */}
      {activeTab === 'training' && logOpen && (
        <div className="flex flex-col gap-3">

          {/* Sticky header */}
          <div className="sticky top-0 z-10 -mx-4 px-4 pt-2 pb-2 bg-[#0a0a0a]/90 backdrop-blur-sm border-b border-white/8">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div>
                  <p className="text-xs font-black text-white leading-none">{currentWorkout.short}</p>
                  <p className="text-[10px] text-white/35 leading-none mt-0.5">{currentWorkoutIndex + 1}/6</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={cancelLog}
                  className="text-xs text-white/35 hover:text-white/60 px-3 py-2 rounded-lg border border-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={saveWorkout}
                  disabled={!drafts.some(d => d.weight.trim() !== '') || saveState !== 'idle'}
                  className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
                    saveState === 'saving' ? 'border-white/20 text-white/40 bg-white/5 cursor-wait' :
                    saveState === 'saved'  ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/15' :
                    drafts.some(d => d.weight.trim() !== '')
                      ? 'border-red-500/40 text-red-300 bg-red-500/15 hover:bg-red-500/25 active:scale-95'
                      : 'border-white/8 text-white/45 bg-transparent cursor-not-allowed'
                  }`}
                >
                  {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? '✓ Saved' : 'Save'}
                </button>
              </div>
            </div>
          </div>

          {/* Save success banner */}
          {saveState === 'saved' && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-emerald-300">Workout saved ✓</p>
                <p className="text-xs text-emerald-400/60 mt-0.5">Next: {savedNextLabel}</p>
              </div>
              <span className="text-emerald-400/40 text-lg">↑</span>
            </div>
          )}

          {/* Execution summary */}
          {lastSameSession && saveState === 'idle' && (() => {
            const exec = computeExecutionSummary(lastSameSession)
            if (!exec.closePriority && !exec.bestChance && !exec.mainBattle) return null
            return (
              <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3 flex flex-col gap-1">
                {exec.closePriority > 0 && (
                  <span className="text-xs text-white/50">
                    <span className="text-emerald-400 font-semibold">{exec.closePriority}</span> ready to increase — push hard
                  </span>
                )}
                {exec.bestChance && (
                  <span className="text-xs text-white/50">
                    Best chance: <span className="text-blue-400 font-semibold">{exec.bestChance.split(' (')[0]}</span>
                  </span>
                )}
                {exec.mainBattle && (
                  <span className="text-xs text-white/50">
                    Fix form: <span className="text-amber-400 font-semibold">{exec.mainBattle.split(' (')[0]}</span>
                  </span>
                )}
              </div>
            )
          })()}

          {/* Exercise cards — all fully expanded */}
          <div className="flex flex-col gap-3">
            {drafts.map((d, i) => {
              const lastEx       = lastSameSession?.exercises.find(e => e.name === d.name) ?? null
              const mission      = lastEx ? computeMissionData(lastEx, currentWorkout.name) : null
              const catDot       = d.category === 'compound' ? 'bg-red-400/70' : d.category === 'isolation' ? 'bg-white/35' : 'bg-amber-400/50'
              const [, high]     = getRepRange(d.category)
              const liveProgress = mission
                ? computeLiveProgress(d.setReps, mission.lastSetReps, mission.targetToBeat, mission.stretchTarget, high)
                : null
              const result = mission
                ? computeExerciseResult(d.setReps, mission.lastSetReps, mission.targetToBeat, high)
                : null

              return (
                <div key={d.name} className={`rounded-xl border p-4 flex flex-col gap-3 transition-colors ${
                  result === 'win' || result === 'ready_next' ? 'border-emerald-500/25 bg-emerald-500/4' :
                  result === 'fix_form'                       ? 'border-amber-500/20 bg-amber-500/4'     :
                                                               'border-white/10 bg-white/5'
                }`}>

                  {/* Name + badge */}
                  <div className="flex items-center gap-2">
                    <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${catDot}`} />
                    <span className="text-sm font-semibold text-white/90 flex-1 truncate">{d.name}</span>
                    {mission && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border whitespace-nowrap ${BADGE_CONFIG[mission.badge].color}`}>
                        {BADGE_CONFIG[mission.badge].label}
                      </span>
                    )}
                  </div>

                  {mission ? (
                    <>
                      {/* MISSION banner */}
                      {mission.missionText ? (
                        <div className={`rounded-lg px-3 py-2.5 border ${
                          mission.badge === 'fix_form' ? 'bg-amber-500/10 border-amber-500/25' : 'bg-blue-500/10 border-blue-500/20'
                        }`}>
                          <span className={`text-sm font-black uppercase tracking-wide ${
                            mission.badge === 'fix_form' ? 'text-amber-200' : 'text-blue-100'
                          }`}>MISSION: {mission.missionText.toUpperCase()}</span>
                        </div>
                      ) : mission.badge === 'ready_to_increase' ? (
                        <div className="rounded-lg px-3 py-2.5 border bg-emerald-500/10 border-emerald-500/25">
                          <span className="text-sm font-black uppercase tracking-wide text-emerald-200">↑ INCREASE WEIGHT THIS SESSION</span>
                        </div>
                      ) : null}

                      {/* Focus */}
                      <p className="text-xs font-medium text-white/50 italic pl-0.5">
                        {computeMicroFocus(mission.lastSetReps, mission.targetToBeat, d.category, mission.badge)}
                      </p>

                      {/* Last + today target */}
                      <div className="flex flex-col gap-1 pl-3.5 border-l border-white/8">
                        <span className="text-xs text-white/40">
                          Last: <span className="font-mono text-white/60">{mission.lastWeight} lbs — {mission.lastSetReps.join(' / ')}</span>
                        </span>
                        <span className="text-xs text-white/40">
                          Today target: <span className="font-mono font-bold text-white/80">{mission.todayWeight} lbs</span>
                        </span>
                      </div>

                      {/* Targets */}
                      {mission.badge !== 'ready_to_increase' && (
                        <div className="flex gap-6 pl-3.5 border-l border-white/8">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-white/50 uppercase tracking-wide">Target to beat</span>
                            <span className="text-sm font-mono font-semibold text-white/65">{mission.targetToBeat.join(' / ')}</span>
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[10px] text-white/50 uppercase tracking-wide">Stretch</span>
                            <span className="text-sm font-mono font-semibold text-emerald-400/65">{mission.stretchTarget.join(' / ')}</span>
                          </div>
                        </div>
                      )}

                      {/* Goal */}
                      <p className="text-xs text-white/35 pl-0.5">
                        Goal: <span className="text-white/55">{mission.goalText}</span>
                      </p>
                    </>
                  ) : (
                    <p className="text-xs text-white/50 pl-0.5">First session — log your baseline</p>
                  )}

                  {/* Inputs */}
                  <div className="flex items-center gap-2">
                    <input
                      type="number" value={d.weight} inputMode="decimal"
                      onChange={e => updateDraftWeight(i, e.target.value)}
                      placeholder="lbs" step="5"
                      className="w-20 shrink-0 bg-white/8 border border-white/15 rounded-lg px-2 py-2.5 text-sm text-white text-center placeholder-white/25 focus:outline-none focus:border-red-500/35 transition-colors"
                    />
                    {d.setReps.map((rep, s) => (
                      <input
                        key={s} type="number" value={rep} inputMode="numeric"
                        onChange={e => updateDraftSetRep(i, s, e.target.value)}
                        placeholder={`S${s + 1}`} min="0"
                        className="flex-1 min-w-0 bg-white/8 border border-white/15 rounded-lg px-1 py-2.5 text-sm text-white text-center placeholder-white/25 focus:outline-none focus:border-red-500/35 transition-colors"
                      />
                    ))}
                  </div>

                  {/* Live feedback */}
                  {liveProgress && (
                    <p className={`text-xs font-semibold ${liveProgress.color}`}>{liveProgress.text}</p>
                  )}

                  {/* Result banner */}
                  {result && (
                    <div className={`rounded-lg border px-3 py-2 text-xs font-bold tracking-wide text-center ${RESULT_CONFIG[result].color}`}>
                      {RESULT_CONFIG[result].label}
                    </div>
                  )}

                </div>
              )
            })}
          </div>

          {/* Session notes */}
          <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-3 flex flex-col gap-2">
            <span className="text-[10px] text-white/55 uppercase tracking-widest font-semibold">Session Notes</span>
            <textarea
              value={sessionNotes} onChange={e => setSessionNotes(e.target.value)}
              placeholder="Feel, form, energy…" rows={2}
              className="w-full bg-transparent text-sm text-white/80 placeholder-white/20 focus:outline-none resize-none"
            />
          </div>

          {/* Bottom save / cancel — large thumb targets */}
          <div className="flex gap-3 pb-2">
            <button
              onClick={cancelLog}
              className="flex-1 py-4 rounded-xl text-sm font-semibold border border-white/10 text-white/40 bg-white/5 active:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={saveWorkout}
              disabled={!drafts.some(d => d.weight.trim() !== '') || saveState !== 'idle'}
              className={`flex-[2] py-4 rounded-xl text-sm font-black border transition-all ${
                saveState === 'saving' ? 'border-white/20 text-white/40 bg-white/5 cursor-wait' :
                saveState === 'saved'  ? 'border-emerald-500/40 text-emerald-200 bg-emerald-500/15' :
                drafts.some(d => d.weight.trim() !== '')
                  ? 'border-red-500/30 text-white bg-red-500 hover:bg-red-400 active:scale-98'
                  : 'border-white/8 text-white/45 bg-transparent cursor-not-allowed'
              }`}
            >
              {saveState === 'saving' ? 'Saving…' : saveState === 'saved' ? `✓ Saved — Next: ${savedNextLabel}` : 'Save Workout'}
            </button>
          </div>

        </div>
      )}

      {/* ── NUTRITION CENTER ──────────────────────────────────────────── */}
      {activeTab === 'nutrition' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold tracking-widest text-white/50 uppercase">Nutrition Center</span>
            <span className="text-xs text-white/55 font-mono">{nutCycle.weekId} · {cycleStatus.dataReliable ? 'Reliable' : `${weeklyAvg.daysTracked}/${WEEK_DAYS} days`}</span>
          </div>

          {/* A. Active Targets — today progress */}
          {(() => {
            const today = todayNutLog
            const macros = [
              { label: 'Calories', unit: 'kcal', target: nutTargets.calories, current: today?.calories  ?? 0 },
              { label: 'Protein',  unit: 'g',    target: nutTargets.protein,  current: today?.protein   ?? 0 },
              { label: 'Carbs',    unit: 'g',    target: nutTargets.carbs,    current: today?.carbs     ?? 0 },
              { label: 'Fats',     unit: 'g',    target: nutTargets.fats,     current: today?.fats      ?? 0 },
            ]
            return (
              <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-white/55 uppercase tracking-widest font-semibold">Today vs Target</span>
                  {!todayNutLogged && (
                    <span className="text-[10px] text-white/45 italic">Log nutrition to track progress</span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {macros.map(({ label, unit, target, current }) => {
                    const remaining  = target - current
                    const hit        = current >= target
                    const pct        = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0
                    const barColor   = hit ? 'bg-emerald-500/50' : pct >= 75 ? 'bg-orange-500/45' : 'bg-white/15'
                    return (
                      <div key={label} className="flex flex-col gap-1 bg-white/4 rounded-lg px-3 py-2">
                        <div className="flex items-baseline justify-between gap-1">
                          <span className="text-[10px] text-white/55">{label}</span>
                          <span className={`text-[9px] font-semibold ${hit ? 'text-emerald-400/80' : 'text-white/50'}`}>
                            {hit ? 'hit ✓' : `${remaining}${unit} left`}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1 font-mono">
                          <span className={`text-sm font-black ${todayNutLogged ? 'text-white/80' : 'text-white/50'}`}>
                            {todayNutLogged ? current : '—'}
                          </span>
                          <span className="text-[10px] text-white/45">/ {target} {unit}</span>
                        </div>
                        {/* Mini progress bar */}
                        <div className="h-0.5 bg-white/8 rounded-full overflow-hidden mt-0.5">
                          <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* B. Morning Weight */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">B · Morning Weight</span>
              {todayWeightLogged && (
                <span className="text-xs text-emerald-400/70 font-semibold font-mono">
                  {todayNutLog!.bodyweight} kg{todayNutLog!.bodyFatPct > 0 ? ` · ${todayNutLog!.bodyFatPct}% BF` : ''} ✓
                </span>
              )}
            </div>
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1 flex-1">
                <span className="text-xs text-white/55">Bodyweight <span className="text-white/45">(kg)</span></span>
                <input
                  type="number" step="0.1" inputMode="decimal"
                  value={nutDraft.bodyweight}
                  onChange={e => updateNutritionDraft('bodyweight', e.target.value)}
                  placeholder={todayWeightLogged ? String(todayNutLog!.bodyweight) : '84.5'}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/30 transition-colors"
                />
              </div>
              <div className="flex flex-col gap-1 w-28 shrink-0">
                <span className="text-xs text-white/55">Body Fat <span className="text-white/45">(%)</span></span>
                <input
                  type="number" step="0.1" min="3" max="50" inputMode="decimal"
                  value={nutDraft.bodyFatPct}
                  onChange={e => updateNutritionDraft('bodyFatPct', e.target.value)}
                  placeholder={todayNutLog?.bodyFatPct ? String(todayNutLog.bodyFatPct) : '12.0'}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/30 transition-colors"
                />
              </div>
              <button
                onClick={logWeight}
                disabled={!nutDraft.bodyweight}
                className={`px-4 py-2.5 rounded-lg text-sm font-semibold border transition-colors shrink-0 ${
                  nutDraft.bodyweight
                    ? 'border-orange-500/30 text-orange-400 bg-orange-500/10 hover:bg-orange-500/20'
                    : 'border-white/8 text-white/45 bg-transparent cursor-not-allowed'
                }`}
              >{todayWeightLogged ? '↻ Update' : '+ Log Weight'}</button>
            </div>
            <p className="text-[10px] text-white/30">Body Fat % is optional but required for stage progression.</p>
          </div>

          {/* C. Daily Nutrition */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">C · Daily Nutrition</span>
              {todayNutLogged && <span className="text-xs text-emerald-400/70 font-semibold">Logged ✓</span>}
            </div>
            {todayNutLogged && todayNutLog && (
              <div className="flex flex-wrap gap-3 px-3 py-2 rounded-lg bg-white/4 border border-white/6 text-[11px] font-mono text-white/45">
                <span>{todayNutLog.calories} kcal</span>
                <span>P {todayNutLog.protein}g</span>
                <span>C {todayNutLog.carbs}g</span>
                <span>F {todayNutLog.fats}g</span>
                {todayWaterLogged && todayWaterStatus && (
                  <span className={
                    todayWaterStatus === 'on_target' ? 'text-emerald-400/70' :
                    todayWaterStatus === 'ok'        ? 'text-blue-400/70'    : 'text-amber-400/70'
                  }>
                    {todayNutLog!.waterIntake}L H₂O {todayWaterStatus === 'on_target' ? '✓' : todayWaterStatus === 'ok' ? '~' : '↓'}
                  </span>
                )}
                {todayNutLog.notes && <span className="text-white/50 italic">{todayNutLog.notes}</span>}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {([
                { key: 'calories' as const, label: 'Calories', unit: 'kcal', placeholder: '2700', step: '10' },
                { key: 'protein'  as const, label: 'Protein',  unit: 'g',    placeholder: '180',  step: '1'  },
                { key: 'carbs'    as const, label: 'Carbs',    unit: 'g',    placeholder: '275',  step: '1'  },
                { key: 'fats'     as const, label: 'Fats',     unit: 'g',    placeholder: '80',   step: '1'  },
              ] as const).map(({ key, label, unit, placeholder, step }) => (
                <div key={key} className="flex flex-col gap-1">
                  <span className="text-xs text-white/55">{label} <span className="text-white/45">({unit})</span></span>
                  <input
                    type="number" step={step} inputMode="decimal"
                    value={nutDraft[key]}
                    onChange={e => updateNutritionDraft(key, e.target.value)}
                    placeholder={placeholder}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-orange-500/30 transition-colors"
                  />
                </div>
              ))}
            </div>
            {/* Water intake — end-of-day, logged alongside nutrition */}
            <div className="flex items-end gap-3">
              <div className="flex flex-col gap-1 flex-1">
                <span className="text-xs text-white/55">
                  Water <span className="text-white/45">(L)</span>
                  {todayWaterStatus && (
                    <span className={`ml-2 text-[10px] font-semibold ${
                      todayWaterStatus === 'on_target' ? 'text-emerald-400/70' :
                      todayWaterStatus === 'ok'        ? 'text-blue-400/70'    : 'text-amber-400/70'
                    }`}>
                      {todayWaterStatus === 'on_target' ? '✓ On target' : todayWaterStatus === 'ok' ? 'OK' : '↓ Low'}
                    </span>
                  )}
                </span>
                <input
                  type="number" step="0.1" min="0" inputMode="decimal"
                  value={nutDraft.waterIntake}
                  onChange={e => updateNutritionDraft('waterIntake', e.target.value)}
                  placeholder={todayWaterLogged ? String(todayNutLog!.waterIntake) : '3.0'}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-2.5 text-sm text-white placeholder-white/20 focus:outline-none focus:border-blue-500/30 transition-colors"
                />
              </div>
              <div className="text-[10px] text-white/45 pb-3 shrink-0 text-right leading-tight">
                &lt;3 low<br />3–4 ok<br />≥4 ✓
              </div>
            </div>
            <textarea
              value={nutDraft.notes}
              onChange={e => updateNutritionDraft('notes', e.target.value)}
              placeholder="Notes: hunger, digestion, adherence…"
              rows={1}
              className="w-full bg-white/5 border border-white/8 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/15 transition-colors resize-none"
            />
            <button
              onClick={logNutrition}
              disabled={!nutDraft.calories}
              className={`self-start px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
                nutDraft.calories
                  ? 'border-orange-500/30 text-orange-400 bg-orange-500/10 hover:bg-orange-500/20'
                  : 'border-white/8 text-white/45 bg-transparent cursor-not-allowed'
              }`}
            >{todayNutLogged ? '↻ Update Nutrition' : '+ Log Nutrition'}</button>
          </div>

          {/* C. Weekly Averages */}
          <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">C · Weekly Averages</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${
                cycleStatus.dataReliable
                  ? 'border-emerald-500/25 text-emerald-400/80 bg-emerald-500/8'
                  : 'border-white/10 text-white/55 bg-transparent'
              }`}>
                {cycleStatus.dataReliable ? `✓ Reliable` : `${weeklyAvg.daysTracked} / ${WEEK_DAYS} days`}
              </span>
            </div>
            {weeklyAvg.daysTracked === 0 ? (
              <p className="text-xs text-white/50 text-center py-1">No logs this cycle yet</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  {[
                    { label: 'Weight',  value: weeklyAvg.weight,   unit: 'kg',   target: null                },
                    { label: 'Cal avg', value: weeklyAvg.calories, unit: 'kcal', target: nutTargets.calories },
                    { label: 'Protein', value: weeklyAvg.protein,  unit: 'g',    target: nutTargets.protein  },
                    { label: 'Carbs',   value: weeklyAvg.carbs,    unit: 'g',    target: nutTargets.carbs    },
                    { label: 'Fats',    value: weeklyAvg.fats,     unit: 'g',    target: nutTargets.fats     },
                  ].map(item => {
                    const diff = item.target !== null && item.value !== null ? item.value - item.target : null
                    return (
                      <div key={item.label} className="flex flex-col gap-0.5 bg-white/5 rounded-lg px-3 py-2">
                        <span className="text-xs text-white/55">{item.label}</span>
                        <div className="flex items-baseline gap-1">
                          <span className="text-base font-bold text-white/80">{item.value ?? '—'}</span>
                          {item.value !== null && <span className="text-xs text-white/50">{item.unit}</span>}
                        </div>
                        {diff !== null && (
                          <span className={`text-[10px] font-mono ${Math.abs(diff) <= 50 ? 'text-emerald-400/50' : diff > 0 ? 'text-amber-400/60' : 'text-red-400/60'}`}>
                            {diff >= 0 ? '+' : ''}{diff}{item.unit}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-[10px] text-white/50">
                    <span>Days tracked this cycle</span>
                    <span>{weeklyAvg.daysTracked} / 7</span>
                  </div>
                  <div className="h-1 bg-white/8 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${cycleStatus.dataReliable ? 'bg-emerald-500/50' : 'bg-orange-500/40'}`}
                      style={{ width: `${Math.min(100, (weeklyAvg.daysTracked / 7) * 100)}%` }}
                    />
                  </div>
                </div>
              </>
            )}
          </div>

          {/* D. Phase Status */}
          {(() => {
            const twc = twoWeekComparison
            const ph  = currentPhase
            const avg = weeklyAvg.weight

            // Phase accent colours
            const phaseBorder = ph?.phase === 1 ? 'border-blue-500/20' : ph?.phase === 2 ? 'border-orange-500/20' : ph?.phase === 3 ? 'border-emerald-500/20' : 'border-white/10'
            const phaseAccent = ph?.phase === 1 ? 'text-blue-400'    : ph?.phase === 2 ? 'text-orange-400'  : ph?.phase === 3 ? 'text-emerald-400' : 'text-white/40'
            const phaseBar    = ph?.phase === 1 ? 'bg-blue-500/50'   : ph?.phase === 2 ? 'bg-orange-500/50' : ph?.phase === 3 ? 'bg-emerald-500/50' : 'bg-white/20'

            // 2-week comparison colours
            const trackColor = twc.onTrack === 'on_track' ? 'text-emerald-400' : twc.onTrack === 'above' ? 'text-amber-400' : twc.onTrack === 'below' ? 'text-red-400' : 'text-white/55'
            const trackLabel = twc.onTrack === 'on_track' ? '✓ On track' : twc.onTrack === 'above' ? '↑ Gaining fast' : twc.onTrack === 'below' ? '↓ Too slow' : '—'

            // Phase progress bar (current weight within range)
            const barPct = ph && avg !== null
              ? Math.min(100, Math.max(0, ((avg - ph.range[0]) / (ph.range[1] - ph.range[0])) * 100))
              : 0

            // Derived stats
            const remaining    = ph && avg !== null ? Math.max(0, Math.round((ph.range[1] - avg) * 10) / 10) : null
            const estFinish    = ph && avg !== null ? estimatePhaseFinish(avg, ph) : null
            const nextReview   = getNextReviewFriday()
            const nextReviewFmt = nutFormatDate(nextReview)

            return (
              <div className={`rounded-xl border bg-white/5 p-5 flex flex-col gap-4 ${phaseBorder}`}>

                {/* Header */}
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">D · Phase Status</span>
                  {ph
                    ? <span className={`text-xs font-bold ${phaseAccent}`}>{ph.label} · {ph.range[0]}–{ph.range[1]} kg</span>
                    : <span className="text-[10px] text-white/45">Log weight to detect phase</span>
                  }
                </div>

                {ph && avg !== null ? (
                  <>
                    {/* Phase progress bar */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-[10px] font-mono text-white/55">
                        <span>{ph.range[0]} kg</span>
                        <span className={`font-semibold ${phaseAccent}`}>{avg} kg</span>
                        <span>{ph.range[1]} kg</span>
                      </div>
                      <div className="relative h-2 bg-white/8 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${phaseBar}`}
                          style={{ width: `${barPct}%` }}
                        />
                        {/* Current position tick */}
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-white/60 rounded-full"
                          style={{ left: `${barPct}%`, transform: 'translateX(-50%)' }}
                        />
                      </div>
                      <div className="flex justify-end">
                        <span className="text-[10px] text-white/50">{Math.round(barPct)}% through phase</span>
                      </div>
                    </div>

                    {/* Stats grid — 3 columns */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex flex-col gap-0.5 bg-white/4 rounded-lg px-3 py-2.5">
                        <span className="text-[9px] text-white/50 uppercase tracking-wide">7-day avg</span>
                        <span className={`text-base font-black font-mono ${phaseAccent}`}>{avg} kg</span>
                        <span className="text-[9px] text-white/45">{ph.label}</span>
                      </div>
                      <div className="flex flex-col gap-0.5 bg-white/4 rounded-lg px-3 py-2.5">
                        <span className="text-[9px] text-white/50 uppercase tracking-wide">To phase end</span>
                        <span className="text-base font-black font-mono text-white/65">
                          {remaining !== null && remaining > 0 ? `+${remaining} kg` : '✓ Done'}
                        </span>
                        <span className="text-[9px] text-white/45">until {ph.range[1]} kg</span>
                      </div>
                      <div className="flex flex-col gap-0.5 bg-white/4 rounded-lg px-3 py-2.5">
                        <span className="text-[9px] text-white/50 uppercase tracking-wide">2-wk target</span>
                        <span className="text-base font-black font-mono text-white/65">
                          +{ph.gainMin}–{ph.gainMax}
                        </span>
                        <span className="text-[9px] text-white/45">kg / cycle</span>
                      </div>
                    </div>

                    {/* Timeline + calories row — 3 columns */}
                    <div className="grid grid-cols-3 gap-2">
                      <div className="flex flex-col gap-0.5 bg-white/4 rounded-lg px-3 py-2.5">
                        <span className="text-[9px] text-white/50 uppercase tracking-wide">Est. finish</span>
                        <span className="text-xs font-bold text-white/55">{estFinish ?? '—'}</span>
                        <span className="text-[9px] text-white/45">at current pace</span>
                      </div>
                      <div className="flex flex-col gap-0.5 bg-white/4 rounded-lg px-3 py-2.5">
                        <span className="text-[9px] text-white/50 uppercase tracking-wide">Next review</span>
                        <span className="text-xs font-bold text-white/55">{nextReviewFmt}</span>
                        <span className="text-[9px] text-white/45">Friday eval</span>
                      </div>
                      <div className="flex flex-col gap-0.5 bg-white/4 rounded-lg px-3 py-2.5">
                        <span className="text-[9px] text-white/50 uppercase tracking-wide">Calories</span>
                        <span className={`text-xs font-bold ${phaseAccent}`}>{nutTargets.calories} kcal</span>
                        <span className="text-[9px] text-white/45">current target</span>
                      </div>
                    </div>

                    {/* 2-week comparison strip */}
                    <div className="flex flex-col gap-1.5 pt-1 border-t border-white/6">
                      <span className="text-[9px] text-white/45 uppercase tracking-widest">2-week comparison (Fri → Fri)</span>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] text-white/45">Prev week</span>
                          <span className="text-sm font-bold font-mono text-white/45">
                            {twc.prevWeekAvgWeight !== null ? `${twc.prevWeekAvgWeight} kg` : '—'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] text-white/45">This week</span>
                          <span className="text-sm font-bold font-mono text-white/45">
                            {twc.currWeekAvgWeight !== null ? `${twc.currWeekAvgWeight} kg` : '—'}
                          </span>
                        </div>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] text-white/45">Delta</span>
                          <span className={`text-sm font-bold font-mono ${twc.delta !== null ? trackColor : 'text-white/50'}`}>
                            {twc.delta !== null ? (twc.delta >= 0 ? `+${twc.delta}` : `${twc.delta}`) + ' kg' : '—'}
                          </span>
                        </div>
                      </div>
                      {twc.delta !== null && (
                        <div className="flex items-center justify-between mt-0.5">
                          <span className={`text-[10px] font-semibold ${trackColor}`}>{trackLabel}</span>
                          <span className="text-[9px] text-white/45 font-mono">
                            target +{ph.gainMin}–{ph.gainMax} kg / 2 Fridays
                          </span>
                        </div>
                      )}
                      {hydrationFlag && (
                        <div className={`mt-1.5 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[10px] font-semibold ${
                          hydrationFlag === 'possible_dehydration'
                            ? 'border-amber-500/20 bg-amber-500/6 text-amber-400/80'
                            : 'border-blue-500/20 bg-blue-500/6 text-blue-400/80'
                        }`}>
                          <span>{hydrationFlag === 'possible_dehydration' ? '⚠' : '💧'}</span>
                          <span>
                            {hydrationFlag === 'possible_dehydration'
                              ? `Possible dehydration — avg water ${weeklyAvg.avgWater !== null ? weeklyAvg.avgWater + 'L' : 'low'} this week`
                              : `Possible water retention — high intake with weight spike`
                            }
                          </span>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-white/50">Log morning bodyweight to activate phase tracking (65–95 kg).</p>
                    <div className="grid grid-cols-3 gap-2 opacity-30">
                      {['7-day avg','To phase end','2-wk target'].map(l => (
                        <div key={l} className="flex flex-col gap-0.5 bg-white/4 rounded-lg px-3 py-2.5">
                          <span className="text-[9px] text-white/50 uppercase tracking-wide">{l}</span>
                          <span className="text-base font-black font-mono text-white/55">—</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )
          })()}

          {/* E. Cycle Status */}
          <div className="rounded-xl border border-white/10 bg-white/5 px-5 py-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-white/55 uppercase tracking-widest font-semibold">Cycle</span>
              <span className="text-lg font-black text-orange-400">{nutCycle.weekId}</span>
              <span className="text-[10px] text-white/45">since {nutCycle.weekStart}</span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-white/55 uppercase tracking-widest">Eval day</span>
              <span className={`text-sm font-semibold ${isReviewDay ? 'text-orange-400' : 'text-white/55'}`}>
                {isReviewDay ? '✓ Today (Fri)' : 'Friday only'}
              </span>
              <span className="text-[10px] text-white/45">
                {nutCycle.lastEvalFriday === nutDateKey() ? 'Evaluated ✓' : isReviewDay ? 'Ready to run' : 'Adjust on Friday'}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-white/55 uppercase tracking-widest">Data</span>
              <span className={`text-sm font-semibold ${cycleStatus.dataReliable ? 'text-emerald-400' : 'text-white/55'}`}>
                {cycleStatus.dataReliable ? '✓ Reliable' : `${weeklyAvg.daysTracked} / ${WEEK_DAYS} days`}
              </span>
              <span className="text-[10px] text-white/45">
                {cycleStatus.dataReliable ? 'Ready' : `Need ${Math.max(0, MIN_RELIABLE_DAYS - weeklyAvg.daysTracked)} more`}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[10px] text-white/55 uppercase tracking-widest">Last decision</span>
              {nutCycle.lastAutoDecision ? (() => {
                const d = nutCycle.lastAutoDecision
                const color = d === 'below_target' ? 'text-blue-400' : d === 'on_target' ? 'text-emerald-400' : d === 'above_stabilize' ? 'text-amber-400' : 'text-white/55'
                const label = d === 'below_target' ? '+250 kcal' : d === 'on_target' ? '✓ Maintain' : d === 'above_stabilize' ? 'Stabilize' : d
                return (
                  <>
                    <span className={`text-sm font-semibold ${color}`}>{label}</span>
                    <span className="text-[10px] text-white/45">last eval</span>
                  </>
                )
              })() : (
                <>
                  <span className="text-sm font-semibold text-white/50">—</span>
                  <span className="text-[10px] text-white/45">no eval yet</span>
                </>
              )}
            </div>
          </div>

          {/* F. Auto Evaluation */}
          {(() => {
            const alreadyRan    = nutCycle.lastEvalFriday === nutDateKey()
            const needMoreWeeks = (nutCycle.weekNumber ?? 1) < 2
            const canRun        = isReviewDay && cycleStatus.dataReliable && !alreadyRan && !needMoreWeeks

            // Live preview from current data
            const preview = currentPhase && twoWeekComparison.delta !== null
              ? computeAutoDecision(twoWeekComparison.delta, currentPhase)
              : null

            const twc = twoWeekComparison
            const ph  = currentPhase

            const reasonLabel: Partial<Record<AutoDecision, string>> = {
              below_target:      '↑ +250 kcal — gaining too slow',
              on_target:         '✓ Maintain — on track',
              above_stabilize:   '◼ Stabilize — gaining too fast, hold calories',
              // history compat
              above_watch:       '⚠ Maintain + watch',
              above_cut:         '↓ −150 kcal',
              startup_on_track:  '✓ Startup: hold',
              startup_increase:  '↑ Startup: 3000 kcal',
            }
            const reasonColor: Partial<Record<AutoDecision, string>> = {
              below_target:     'text-blue-400',
              on_target:        'text-emerald-400',
              above_stabilize:  'text-amber-400',
              above_watch:      'text-amber-400',
              above_cut:        'text-red-400',
              startup_on_track: 'text-emerald-400',
              startup_increase: 'text-blue-400',
            }
            const reasonBorder: Partial<Record<AutoDecision, string>> = {
              below_target:     'border-blue-500/20 bg-blue-500/8',
              on_target:        'border-emerald-500/20 bg-emerald-500/8',
              above_stabilize:  'border-amber-500/20 bg-amber-500/8',
              above_watch:      'border-amber-500/20 bg-amber-500/8',
              above_cut:        'border-red-500/20 bg-red-500/8',
              startup_on_track: 'border-emerald-500/20 bg-emerald-500/8',
              startup_increase: 'border-blue-500/20 bg-blue-500/8',
            }
            const lastReason = nutCycle.lastAutoDecision

            return (
              <div className={`rounded-xl border p-5 flex flex-col gap-3 ${canRun ? 'border-orange-500/20 bg-orange-500/5' : 'border-white/10 bg-white/5'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">F · Auto Evaluation</span>
                  {alreadyRan && lastReason && (
                    <span className={`text-[10px] font-semibold ${reasonColor[lastReason] ?? 'text-white/55'}`}>
                      Ran this cycle
                    </span>
                  )}
                </div>

                {/* 14-day breakdown — Week A vs Week B */}
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] text-white/45 uppercase tracking-widest">14-day comparison · Week A → Week B</span>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="flex flex-col gap-0.5 bg-white/4 rounded-lg px-3 py-2.5">
                      <span className="text-[9px] text-white/50 uppercase tracking-wide">Week A avg</span>
                      <span className="text-base font-black font-mono text-white/55">
                        {twc.prevWeekAvgWeight !== null ? `${twc.prevWeekAvgWeight} kg` : '—'}
                      </span>
                      <span className="text-[9px] text-white/45">prev 7-day</span>
                    </div>
                    <div className="flex flex-col gap-0.5 bg-white/4 rounded-lg px-3 py-2.5">
                      <span className="text-[9px] text-white/50 uppercase tracking-wide">Week B avg</span>
                      <span className="text-base font-black font-mono text-white/55">
                        {twc.currWeekAvgWeight !== null ? `${twc.currWeekAvgWeight} kg` : '—'}
                      </span>
                      <span className="text-[9px] text-white/45">curr 7-day</span>
                    </div>
                    <div className="flex flex-col gap-0.5 bg-white/4 rounded-lg px-3 py-2.5">
                      <span className="text-[9px] text-white/50 uppercase tracking-wide">14-day delta</span>
                      <span className={`text-base font-black font-mono ${
                        twc.delta === null   ? 'text-white/50' :
                        twc.onTrack === 'on_track' ? 'text-emerald-400' :
                        twc.onTrack === 'above'    ? 'text-amber-400'   : 'text-red-400'
                      }`}>
                        {twc.delta !== null ? (twc.delta >= 0 ? `+${twc.delta}` : `${twc.delta}`) + ' kg' : '—'}
                      </span>
                      <span className="text-[9px] text-white/45">
                        {ph ? `target +${ph.gainMin}–${ph.gainMax} kg` : 'no phase'}
                      </span>
                    </div>
                  </div>

                  {/* Phase + target range row */}
                  {ph && (
                    <div className="flex items-center justify-between px-0.5">
                      <span className="text-[10px] text-white/50">
                        {ph.label} ({ph.range[0]}–{ph.range[1]} kg) · target +{ph.gainMin}–{ph.gainMax} kg / 2 wks
                      </span>
                    </div>
                  )}
                </div>

                {/* Result after eval ran */}
                {alreadyRan && lastReason && (
                  <div className={`rounded-lg px-3 py-2.5 border ${reasonBorder[lastReason] ?? 'border-white/10 bg-white/5'}`}>
                    <p className={`text-sm font-bold ${reasonColor[lastReason] ?? 'text-white/40'}`}>
                      {reasonLabel[lastReason] ?? lastReason}
                    </p>
                    <p className="text-[10px] text-white/55 mt-1">Applied to {nutCycle.weekId} — targets updated</p>
                  </div>
                )}

                {/* Live preview before eval */}
                {!alreadyRan && preview && (
                  <div className="flex flex-col gap-2">
                    <p className="text-xs text-white/55">Based on current data, the decision will be:</p>
                    <div className={`rounded-lg px-3 py-2.5 border ${reasonBorder[preview.reason] ?? 'border-white/10 bg-white/5'}`}>
                      <p className={`text-sm font-bold ${reasonColor[preview.reason] ?? 'text-white/40'}`}>
                        {reasonLabel[preview.reason] ?? preview.reason}
                      </p>
                    </div>
                    {preview.decision === '+250' && (() => {
                      const next = nutApplyDecision(preview.decision, nutTargets)
                      return (
                        <div className="grid grid-cols-2 gap-2">
                          {([
                            { label: 'Cal',   cur: nutTargets.calories, next: next.calories, unit: 'kcal' },
                            { label: 'Carbs', cur: nutTargets.carbs,    next: next.carbs,    unit: 'g'    },
                          ] as const).map(item => {
                            const diff = item.next - item.cur
                            return (
                              <div key={item.label} className="flex flex-col gap-0.5 bg-white/5 rounded-lg px-3 py-2">
                                <span className="text-[10px] text-white/55">{item.label}</span>
                                <span className="text-sm font-bold font-mono text-white/70">{item.cur} → {item.next}</span>
                                <span className="text-[10px] font-mono text-blue-400/70">+{diff}{item.unit}</span>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>
                )}

                {/* Gate messages */}
                {!isReviewDay && (
                  <p className="text-xs text-white/50 italic">Opens Friday — evaluation runs once per cycle</p>
                )}
                {isReviewDay && needMoreWeeks && (
                  <p className="text-xs text-white/50 italic">
                    Collecting data — Week A needed · evaluation opens {nutCycle.weekId === 'W1' ? 'next' : 'this'} Friday
                  </p>
                )}
                {isReviewDay && !needMoreWeeks && !cycleStatus.dataReliable && (
                  <p className="text-xs text-white/50 italic">
                    Need {Math.max(0, MIN_RELIABLE_DAYS - weeklyAvg.daysTracked)} more days of data before evaluating
                  </p>
                )}

                {/* Run button */}
                <button
                  onClick={runAutoEvaluation}
                  disabled={!canRun}
                  className={`w-full py-3 rounded-xl text-sm font-bold border transition-colors ${
                    canRun
                      ? 'border-orange-500/35 text-orange-200 bg-orange-500/12 hover:bg-orange-500/22'
                      : 'border-white/8 text-white/45 bg-transparent cursor-not-allowed'
                  }`}
                >
                  {alreadyRan
                    ? `✓ Evaluated — ${nutCycle.weekId} active`
                    : 'Run 14-Day Evaluation'
                  }
                </button>
                <p className="text-[10px] text-white/45">Protein fixed · Fats fixed · Carbs adjusted (4 kcal/g)</p>
              </div>
            )
          })()}

          {/* G. Weekly Review */}
          {(() => {
            const twc  = twoWeekComparison
            const ph   = currentPhase
            const live = ph && twc.delta !== null
              ? computeAutoDecision(twc.delta, ph)
              : null

            // decision display maps
            const decisionLabel: Partial<Record<AutoDecision, string>> = {
              below_target:    '↑ Increase +250 kcal',
              on_target:       '✓ Maintain — on track',
              above_stabilize: '◼ Stabilize — hold calories',
            }
            const decisionColor: Partial<Record<AutoDecision, string>> = {
              below_target:    'text-blue-400',
              on_target:       'text-emerald-400',
              above_stabilize: 'text-amber-400',
            }
            const decisionBg: Partial<Record<AutoDecision, string>> = {
              below_target:    'border-blue-500/20 bg-blue-500/6',
              on_target:       'border-emerald-500/20 bg-emerald-500/6',
              above_stabilize: 'border-amber-500/20 bg-amber-500/6',
            }

            // delta status colour (matches phase evaluation)
            const deltaColor =
              twc.delta === null            ? 'text-white/50'    :
              twc.onTrack === 'on_track'    ? 'text-emerald-400' :
              twc.onTrack === 'above'       ? 'text-amber-400'   : 'text-red-400'

            const hasData = twc.prevWeekAvgWeight !== null || twc.currWeekAvgWeight !== null

            return (
              <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">G · Weekly Review</span>
                  {ph
                    ? <span className="text-[10px] text-white/55 font-mono">{ph.label} · target +{ph.gainMin}–{ph.gainMax} kg</span>
                    : <span className="text-[10px] text-white/45 italic">Log weight to detect phase</span>
                  }
                </div>

                {/* Week A / Week B / Delta — 3-cell grid */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      label: 'Week A avg',
                      sub:   'prev 7-day',
                      value: twc.prevWeekAvgWeight !== null ? `${twc.prevWeekAvgWeight} kg` : '—',
                      color: 'text-white/55',
                    },
                    {
                      label: 'Week B avg',
                      sub:   'curr 7-day',
                      value: twc.currWeekAvgWeight !== null ? `${twc.currWeekAvgWeight} kg` : '—',
                      color: 'text-white/55',
                    },
                    {
                      label: '14-day delta',
                      sub:   ph ? `target +${ph.gainMin}–${ph.gainMax}` : 'no phase',
                      value: twc.delta !== null ? (twc.delta >= 0 ? `+${twc.delta}` : `${twc.delta}`) + ' kg' : '—',
                      color: deltaColor,
                    },
                  ].map(cell => (
                    <div key={cell.label} className="flex flex-col gap-0.5 bg-white/4 rounded-lg px-3 py-2.5">
                      <span className="text-[9px] text-white/50 uppercase tracking-wide">{cell.label}</span>
                      <span className={`text-base font-black font-mono ${cell.color}`}>{cell.value}</span>
                      <span className="text-[9px] text-white/45">{cell.sub}</span>
                    </div>
                  ))}
                </div>

                {/* Final decision */}
                {live ? (
                  <div className={`rounded-lg px-4 py-3 border flex flex-col gap-0.5 ${decisionBg[live.reason] ?? 'border-white/10 bg-white/5'}`}>
                    <span className="text-[9px] text-white/50 uppercase tracking-widest">Decision</span>
                    <span className={`text-sm font-bold ${decisionColor[live.reason] ?? 'text-white/40'}`}>
                      {decisionLabel[live.reason] ?? live.reason}
                    </span>
                    {live.decision === '+250' && (
                      <span className="text-[10px] text-white/55 font-mono mt-0.5">
                        {nutTargets.calories} → {nutTargets.calories + 250} kcal · carbs +{Math.round(250 / CARBS_PER_KCAL)}g
                      </span>
                    )}
                    {live.reason === 'on_target' && (
                      <span className="text-[10px] text-white/55 mt-0.5">No change — targets stay at {nutTargets.calories} kcal</span>
                    )}
                    {live.reason === 'above_stabilize' && (
                      <span className="text-[10px] text-white/55 mt-0.5">No change — hold at {nutTargets.calories} kcal until gain slows</span>
                    )}
                  </div>
                ) : (
                  <div className="rounded-lg px-4 py-3 border border-white/8 bg-white/3">
                    <span className="text-[9px] text-white/45 uppercase tracking-widest block mb-0.5">Decision</span>
                    <span className="text-sm font-semibold text-white/45">
                      {!hasData ? 'Log bodyweight in both weeks to compute' : '—'}
                    </span>
                  </div>
                )}

                {/* Hydration warning — display only, never overrides calorie decision */}
                {hydrationFlag && (
                  <div className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border text-[10px] font-semibold ${
                    hydrationFlag === 'possible_dehydration'
                      ? 'border-amber-500/20 bg-amber-500/6 text-amber-400/80'
                      : 'border-blue-500/20 bg-blue-500/6 text-blue-400/80'
                  }`}>
                    <span className="shrink-0 mt-px">{hydrationFlag === 'possible_dehydration' ? '⚠' : '💧'}</span>
                    <span>
                      {hydrationFlag === 'possible_dehydration'
                        ? `Possible dehydration — avg water ${weeklyAvg.avgWater !== null ? weeklyAvg.avgWater + ' L' : 'low'} this week. Weight drop may not reflect true gain.`
                        : `Possible water retention — high avg intake with weight spike. Delta may be overstated.`
                      }
                      <span className="text-white/50 font-normal ml-1">(warning only — no calorie impact)</span>
                    </span>
                  </div>
                )}
              </div>
            )
          })()}

          {/* H. Weekly History */}
          {nutHistory.length > 0 && (
            <div className="rounded-xl border border-white/8 bg-white/3 p-4 flex flex-col gap-0">
              <span className="text-[10px] text-white/55 uppercase tracking-widest font-semibold mb-2">Cycle History</span>
              <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 pb-1.5 border-b border-white/6">
                {['Week','Result','Avg Cal','Avg Wt','Days'].map(h => (
                  <span key={h} className="text-[9px] text-white/45 uppercase">{h}</span>
                ))}
              </div>
              {[...nutHistory].reverse().map(w => {
                const reasonShort: Record<string, string> = {
                  below_target:     '+250',
                  on_target:        '✓ Hold',
                  above_stabilize:  '◼ Stab.',
                  above_watch:      '⚠ Watch',
                  above_cut:        '−150',
                  startup_on_track: '✓ 2700',
                  startup_increase: '↑ 3000',
                }
                const reasonColor: Record<string, string> = {
                  below_target:     'text-blue-400/70',
                  on_target:        'text-emerald-400/70',
                  above_stabilize:  'text-amber-400/70',
                  above_watch:      'text-amber-400/70',
                  above_cut:        'text-red-400/70',
                  startup_on_track: 'text-emerald-400/70',
                  startup_increase: 'text-blue-400/70',
                }
                const rLabel = w.autoReason ? (reasonShort[w.autoReason] ?? w.decision ?? '—') : (w.decision ?? '—')
                const rColor = w.autoReason ? (reasonColor[w.autoReason] ?? 'text-white/40') : 'text-white/40'
                return (
                  <div key={w.weekId} className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-x-3 py-1.5 border-b border-white/4 last:border-0 items-center">
                    <span className="text-[10px] font-mono font-semibold text-white/50">{w.weekId}</span>
                    <span className={`text-[10px] font-semibold ${rColor}`}>{rLabel}</span>
                    <span className="text-[10px] font-mono text-white/35">{w.avgCalories ?? '—'}</span>
                    <span className="text-[10px] font-mono text-white/35">{w.avgWeight ? `${w.avgWeight}kg` : '—'}</span>
                    <span className="text-[10px] font-mono text-white/50">{w.daysTracked}/7</span>
                  </div>
                )
              })}
              {nutHistory.length > 0 && nutHistory[nutHistory.length - 1]?.targetsAfter && (
                <div className="mt-2 pt-2 border-t border-white/5 flex flex-wrap gap-3">
                  <span className="text-[10px] text-white/45 w-full">Last applied targets →</span>
                  {[
                    { label: 'Cal',   value: nutHistory[nutHistory.length - 1].targetsAfter!.calories, unit: 'kcal' },
                    { label: 'Pro',   value: nutHistory[nutHistory.length - 1].targetsAfter!.protein,  unit: 'g'    },
                    { label: 'Carbs', value: nutHistory[nutHistory.length - 1].targetsAfter!.carbs,    unit: 'g'    },
                    { label: 'Fats',  value: nutHistory[nutHistory.length - 1].targetsAfter!.fats,     unit: 'g'    },
                  ].map(t => (
                    <span key={t.label} className="text-[10px] font-mono text-white/55">
                      {t.label} <span className="text-white/50">{t.value}</span><span className="text-white/42">{t.unit}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

        </div>
      )}

      {/* ── FEEDBACK ──────────────────────────────────────────────────── */}
      {activeTab === 'feedback' && (() => {
        // Shared status helpers (defined once, used across both panels)
        const statusDot = (s: DayStatus) => {
          const cls =
            s === 'green'  ? 'bg-emerald-500/70' :
            s === 'orange' ? 'bg-orange-500/65'  :
            s === 'red'    ? 'bg-red-500/65'      : 'bg-white/12'
          return <span className={`inline-block w-2.5 h-2.5 rounded-full ${cls} shrink-0`} />
        }
        const statusText = (s: DayStatus, labels: [string, string, string, string] = ['✓','~','✗','—']) => {
          const [g, o, r, n] = labels
          return s === 'green' ? g : s === 'orange' ? o : s === 'red' ? r : n
        }
        const statusColor = (s: DayStatus) =>
          s === 'green'  ? 'text-emerald-400/80' :
          s === 'orange' ? 'text-orange-400/80'  :
          s === 'red'    ? 'text-red-400/80'      : 'text-white/45'

        // Week date range label
        const weekEnd = new Date(fbWeekSunday + 'T12:00:00')
        weekEnd.setDate(weekEnd.getDate() + 6)
        const weekLabel = `${new Date(fbWeekSunday + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`

        return (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold tracking-widest text-white/50 uppercase">Weekly Dashboard</span>
              <span className="text-xs text-white/50 font-mono">{weekLabel}</span>
            </div>

            {/* ── 7-day grid table ── */}
            <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 flex flex-col gap-0">
              {/* Column headers */}
              <div className="grid grid-cols-[2.5rem_1fr_1fr_1fr] gap-x-2 pb-2 border-b border-white/8">
                <span className="text-[9px] text-white/45 uppercase" />
                {['Gym', 'Meals', 'Recovery'].map(h => (
                  <span key={h} className="text-[9px] text-white/50 uppercase tracking-widest text-center">{h}</span>
                ))}
              </div>

              {/* Day rows */}
              {fbDashboard.map(day => (
                <div
                  key={day.iso}
                  className={`grid grid-cols-[2.5rem_1fr_1fr_1fr] gap-x-2 py-2 border-b border-white/5 last:border-0 items-center ${
                    day.isToday ? 'bg-white/3 -mx-4 px-4 rounded' : ''
                  }`}
                >
                  {/* Day label */}
                  <div className="flex flex-col leading-none">
                    <span className={`text-[10px] font-semibold ${day.isToday ? 'text-white/70' : day.isFuture ? 'text-white/42' : 'text-white/40'}`}>
                      {day.dayLabel}
                    </span>
                    <span className={`text-[9px] font-mono ${day.isToday ? 'text-white/40' : 'text-white/42'}`}>
                      {day.dayNum}
                    </span>
                  </div>

                  {/* Gym */}
                  <div className="flex flex-col items-center gap-0.5">
                    {statusDot(day.gymStatus)}
                    <span className={`text-[8px] font-semibold ${statusColor(day.gymStatus)}`}>
                      {statusText(day.gymStatus, ['Done', '—', 'Miss', '—'])}
                    </span>
                  </div>

                  {/* Meals */}
                  <div className="flex flex-col items-center gap-0.5">
                    {statusDot(day.mealsStatus)}
                    <span className={`text-[8px] font-semibold ${statusColor(day.mealsStatus)}`}>
                      {statusText(day.mealsStatus, ['≥90%', '70%+', '<70%', '—'])}
                    </span>
                  </div>

                  {/* Recovery / water */}
                  <div className="flex flex-col items-center gap-0.5">
                    {statusDot(day.waterStatus)}
                    <span className={`text-[8px] font-semibold ${statusColor(day.waterStatus)}`}>
                      {statusText(day.waterStatus, ['≥4L', '3L+', '<3L', '—'])}
                    </span>
                  </div>
                </div>
              ))}

              {/* Legend */}
              <div className="flex gap-3 pt-2.5 mt-0.5 border-t border-white/5">
                {([['green','On target'],['orange','Partial'],['red','Missed'],['none','No data']] as const).map(([s, lbl]) => (
                  <div key={s} className="flex items-center gap-1">
                    {statusDot(s as DayStatus)}
                    <span className="text-[8px] text-white/45">{lbl}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Weekly summary ── */}
            {fbSummary ? (() => {
              const { past, compliancePct, missedGym, categories, weakest } = fbSummary
              const barColor = compliancePct >= 80 ? 'bg-emerald-500/50' : compliancePct >= 55 ? 'bg-orange-500/45' : 'bg-red-500/40'
              const pctColor = compliancePct >= 80 ? 'text-emerald-400'  : compliancePct >= 55 ? 'text-orange-400'  : 'text-red-400'
              return (
                <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
                  <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Weekly Summary</span>

                  {/* Compliance meter */}
                  <div className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between">
                      <div className="flex items-baseline gap-1.5">
                        <span className={`text-3xl font-black font-mono ${pctColor}`}>{compliancePct}%</span>
                        <span className="text-xs text-white/55 ml-1">overall compliance</span>
                      </div>
                      <span className="text-xs text-white/50 font-mono">{past} day{past !== 1 ? 's' : ''} tracked</span>
                    </div>
                    <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${compliancePct}%` }} />
                    </div>
                  </div>

                  {/* Per-category breakdown */}
                  <div className="grid grid-cols-3 gap-2">
                    {categories.map(cat => {
                      const catPct   = cat.total > 0 ? Math.round((cat.greens / cat.total) * 100) : 0
                      const catColor = catPct >= 80 ? 'text-emerald-400' : catPct >= 55 ? 'text-orange-400' : 'text-red-400'
                      const catBar   = catPct >= 80 ? 'bg-emerald-500/45' : catPct >= 55 ? 'bg-orange-500/40' : 'bg-red-500/35'
                      const isWeakest = cat.label === weakest.label
                      return (
                        <div key={cat.label} className={`flex flex-col gap-1.5 bg-white/4 rounded-lg px-3 py-2.5 ${isWeakest ? 'border border-red-500/18' : ''}`}>
                          <div className="flex items-center justify-between gap-1">
                            <span className="text-[9px] text-white/50 uppercase tracking-wide">{cat.label}</span>
                            {isWeakest && <span className="text-[8px] text-red-400/60">weakest</span>}
                          </div>
                          <span className={`text-lg font-black font-mono ${catColor}`}>{catPct}%</span>
                          <div className="h-1 bg-white/8 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${catBar}`} style={{ width: `${catPct}%` }} />
                          </div>
                          <span className="text-[9px] text-white/45">{cat.greens}/{cat.total > 0 ? cat.total : '—'} green</span>
                        </div>
                      )
                    })}
                  </div>

                  {/* Missed gym days */}
                  {missedGym.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10px] text-white/50 uppercase tracking-widest font-semibold">Training missed</span>
                      <div className="flex flex-wrap gap-1.5">
                        {missedGym.map(d => (
                          <span key={d} className="text-[10px] px-2.5 py-1 rounded border border-red-500/18 bg-red-500/5 text-red-400/60 font-mono">
                            {d}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })() : (
              <div className="rounded-xl border border-white/8 bg-white/3 px-4 py-5 text-center">
                <p className="text-xs text-white/50">Log workouts and nutrition to generate your weekly dashboard</p>
              </div>
            )}

          </div>
        )
      })()}

    </div>
  )
}
