// ============================================================
// FlowOS Brain – computeHomeState smoke test
// ============================================================

import { computeHomeState } from './computeHomeState'
import type {
  LifeStage,
  StageRequirement,
  FlowState,
  ScheduleBlock,
  OperationalMetric,
} from '../data/types'

// --- Fixtures ---

const stages: LifeStage[] = [
  {
    id: 'stage-1',
    name: 'Stage 1 – Self Control',
    description: 'Build discipline and financial foundation',
    isActive: true,
    startedAt: '2026-01-01T00:00:00Z',
  },
]

const stageRequirements: StageRequirement[] = [
  { id: 'sr-1', flow: 'motion', title: 'Earn $3,000 revenue', target: 3000, current: 1200, unit: '$', isCompleted: false, locked: true },
  { id: 'sr-2', flow: 'creed', title: '8 weeks consistency', target: 8, current: 3, unit: 'weeks', isCompleted: false, locked: true },
  { id: 'sr-3', flow: 'deen', title: '30 days streak', target: 30, current: 12, unit: 'days', isCompleted: false, locked: true },
  { id: 'sr-4', flow: 'essentials', title: '30 days clean eating', target: 30, current: 9, unit: 'days', isCompleted: false, locked: true },
]

const flowStates: FlowState[] = [
  { flow: 'motion', priorityMode: 'dominant', status: 'behind' },
  { flow: 'creed', priorityMode: 'maintain', status: 'on_track' },
  { flow: 'deen', priorityMode: 'minimum', status: 'on_track' },
  { flow: 'essentials', priorityMode: 'required', status: 'failing' },
]

const scheduleBlocks: ScheduleBlock[] = [
  { id: 'b-1', title: 'Morning Routine', type: 'obligation', start: '2026-03-24T06:00:00Z', end: '2026-03-24T08:00:00Z' },
  { id: 'b-2', title: 'Deep Work', type: 'deep', start: '2026-03-24T09:00:00Z', end: '2026-03-24T12:00:00Z' },
  { id: 'b-3', title: 'Light Work', type: 'light', start: '2026-03-24T14:00:00Z', end: '2026-03-24T16:00:00Z' },
  { id: 'b-4', title: 'Deep Work PM', type: 'deep', start: '2026-03-24T17:00:00Z', end: '2026-03-24T19:00:00Z' },
]

const operationalMetrics: OperationalMetric[] = [
  { id: 'om-1', flow: 'motion', key: 'outreach_sent', value: 12, unit: 'messages', adjustable: true, lastUpdated: '2026-03-24T15:00:00Z' },
  { id: 'om-2', flow: 'essentials', key: 'calories', value: 2200, unit: 'kcal', adjustable: true, lastUpdated: '2026-03-24T13:00:00Z' },
]

// --- Tests ---

// Scenario 1: During deep work block (10:00)
const result1 = computeHomeState({
  stages,
  stageRequirements,
  flowStates,
  scheduleBlocks,
  operationalMetrics,
  now: '2026-03-24T10:00:00Z',
})

console.log('=== Scenario 1: Deep Work Block (10:00 UTC) ===')
console.log('Stage:', result1.currentStage.name)
console.log('Block:', result1.currentBlock.title, `(${result1.currentBlock.type})`)
console.log('Dominant Flow:', result1.dominantFlow)
console.log('Stage Status:', result1.stageStatus)
console.log('Next Action:', result1.nextAction.title)
console.log('  Reason:', result1.nextAction.reason)
console.log('  Urgency:', result1.nextAction.urgency)
console.log('  Block Type:', result1.nextAction.blockType)
console.log()

// Scenario 2: Between blocks (13:00 — gap between blocks)
const result2 = computeHomeState({
  stages,
  stageRequirements,
  flowStates,
  scheduleBlocks,
  operationalMetrics,
  now: '2026-03-24T13:00:00Z',
})

console.log('=== Scenario 2: Between Blocks (13:00 UTC) ===')
console.log('Block:', result2.currentBlock.title, `(${result2.currentBlock.type})`)
console.log('Next Action:', result2.nextAction.title)
console.log('  Urgency:', result2.nextAction.urgency)
console.log()

// Scenario 3: After all blocks (20:00)
const result3 = computeHomeState({
  stages,
  stageRequirements,
  flowStates,
  scheduleBlocks,
  operationalMetrics,
  now: '2026-03-24T20:00:00Z',
})

console.log('=== Scenario 3: After All Blocks (20:00 UTC) ===')
console.log('Block:', result3.currentBlock.title, `(${result3.currentBlock.type})`)
console.log('Next Action:', result3.nextAction.title)
