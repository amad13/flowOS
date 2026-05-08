// ============================================================
// FlowOS – Mock state for brain integration (V1)
// Brain-compatible data → computeHomeState() → UI
// ============================================================

import type {
  LifeStage,
  StageRequirement,
  FlowState,
  FlowType,
  ScheduleBlock,
  OperationalMetric,
} from './types'
import { computeHomeState } from '../engine/brain'

// --- Brain inputs ---

export const stages: LifeStage[] = [
  {
    id: 'stage-1',
    name: 'Stage 1 – Self Control',
    description: 'Build discipline and financial foundation',
    isActive: true,
    startedAt: '2026-01-01T00:00:00Z',
  },
]

export const stageRequirements: StageRequirement[] = [
  { id: 'sr-1', flow: 'motion',     title: 'Earn $3,000 revenue',  target: 3000, current: 0, unit: '$',     isCompleted: false, locked: true },
  { id: 'sr-2', flow: 'creed',      title: '8 weeks consistency',  target: 8,    current: 0, unit: 'weeks', isCompleted: false, locked: true },
  { id: 'sr-3', flow: 'deen',       title: '30 days streak',       target: 30,   current: 0, unit: 'days',  isCompleted: false, locked: true },
  { id: 'sr-4', flow: 'essentials', title: '30 days clean',        target: 30,   current: 0, unit: 'days',  isCompleted: false, locked: true },
]

export const flowStates: FlowState[] = [
  { flow: 'motion',     priorityMode: 'dominant',  status: 'on_track' },
  { flow: 'creed',      priorityMode: 'maintain',  status: 'on_track' },
  { flow: 'deen',       priorityMode: 'minimum',   status: 'on_track' },
  { flow: 'essentials', priorityMode: 'required',  status: 'on_track' },
]

export const scheduleBlocks: ScheduleBlock[] = [
  { id: 'b-1', title: 'Morning Routine', type: 'obligation', start: '2026-03-24T06:00:00Z', end: '2026-03-24T08:00:00Z' },
  { id: 'b-2', title: 'Deep Work AM', type: 'deep', start: '2026-03-24T09:00:00Z', end: '2026-03-24T12:00:00Z' },
  { id: 'b-3', title: 'Light Work', type: 'light', start: '2026-03-24T14:00:00Z', end: '2026-03-24T16:00:00Z' },
  { id: 'b-4', title: 'Deep Work PM', type: 'deep', start: '2026-03-24T17:00:00Z', end: '2026-03-24T19:00:00Z' },
]

export const operationalMetrics: OperationalMetric[] = [
  { id: 'om-1', flow: 'motion', key: 'outreach_sent',   value: 0,  unit: 'messages', adjustable: true },
  { id: 'om-2', flow: 'motion', key: 'outreach_target', value: 25, unit: 'messages', adjustable: true },
  { id: 'om-3', flow: 'creed',  key: 'calories',        value: 0,  unit: 'kcal',     adjustable: true },
  { id: 'om-4', flow: 'deen',   key: 'quran_pages',     value: 0,  unit: 'pages',    adjustable: true },
]

// Use a fixed "now" that falls inside the Deep Work PM block for a meaningful demo
export const now = '2026-03-24T17:30:00Z'

// --- Compute home state ---

export const homeState = computeHomeState({
  stages,
  stageRequirements,
  flowStates,
  scheduleBlocks,
  operationalMetrics,
  now,
})

// --- Supplementary UI data (not computed by brain yet) ---

export const disciplineScore = 0

export const momentum: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW'

export const dailyTarget = {
  label: 'Outreach messages',
  target: 25,
  completed: 0,
}

export const weeklyOutcomes: { flow: FlowType; result: 'PASS' | 'FAIL' }[] = [
  { flow: 'motion',     result: 'FAIL' },
  { flow: 'creed',      result: 'FAIL' },
  { flow: 'deen',       result: 'FAIL' },
  { flow: 'essentials', result: 'FAIL' },
]

export const consequences: string[] = []

export const avatarData = {
  statusLabel: 'Not started',
  lastEvolution: '—',
  flowIndicators: flowStates.map(fs => ({
    flow: fs.flow,
    state: fs.status,
  })),
}
