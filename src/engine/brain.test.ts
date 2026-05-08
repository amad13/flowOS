// ============================================================
// FlowOS Brain – brain.ts smoke tests
// ============================================================

import { computeHomeState } from './brain'
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
  { id: 'b-2', title: 'Deep Work AM', type: 'deep', start: '2026-03-24T09:00:00Z', end: '2026-03-24T12:00:00Z' },
  { id: 'b-3', title: 'Light Work', type: 'light', start: '2026-03-24T14:00:00Z', end: '2026-03-24T16:00:00Z' },
  { id: 'b-4', title: 'Deep Work PM', type: 'deep', start: '2026-03-24T17:00:00Z', end: '2026-03-24T19:00:00Z' },
]

const operationalMetrics: OperationalMetric[] = [
  { id: 'om-1', flow: 'motion', key: 'outreach_sent', value: 12, unit: 'messages', adjustable: true },
]

function log(label: string, result: ReturnType<typeof computeHomeState>) {
  console.log(`\n=== ${label} ===`)
  console.log('Stage       :', result.currentStage.name)
  console.log('Block       :', result.currentBlock.title, `(${result.currentBlock.type})`)
  console.log('Dominant    :', result.dominantFlow)
  console.log('Stage Status:', result.stageStatus)
  console.log('Action      :', result.nextAction.title)
  console.log('  Reason    :', result.nextAction.reason)
  console.log('  Urgency   :', result.nextAction.urgency)
  console.log('  Block Type:', result.nextAction.blockType)
}

// --- Test 1: Deep work block (10:00) ---
log('Test 1 — Deep Work Block', computeHomeState({
  stages, stageRequirements, flowStates, scheduleBlocks, operationalMetrics,
  now: '2026-03-24T10:00:00Z',
}))

// --- Test 2: Light block (15:00) ---
log('Test 2 — Light Block', computeHomeState({
  stages, stageRequirements, flowStates, scheduleBlocks, operationalMetrics,
  now: '2026-03-24T15:00:00Z',
}))

// --- Test 3: Obligation block (07:00) ---
log('Test 3 — Obligation Block', computeHomeState({
  stages, stageRequirements, flowStates, scheduleBlocks, operationalMetrics,
  now: '2026-03-24T07:00:00Z',
}))

// --- Test 4: Between blocks → Unscheduled fallback (13:00) ---
log('Test 4 — Unscheduled (gap)', computeHomeState({
  stages, stageRequirements, flowStates, scheduleBlocks, operationalMetrics,
  now: '2026-03-24T13:00:00Z',
}))

// --- Test 5: After all blocks (22:00) ---
log('Test 5 — After all blocks', computeHomeState({
  stages, stageRequirements, flowStates, scheduleBlocks, operationalMetrics,
  now: '2026-03-24T22:00:00Z',
}))

// --- Test 6: No active stage → should throw ---
console.log('\n=== Test 6 — No active stage (expect error) ===')
try {
  computeHomeState({
    stages: [{ id: 's', name: 'X', isActive: false }],
    stageRequirements, flowStates, scheduleBlocks, operationalMetrics,
    now: '2026-03-24T10:00:00Z',
  })
  console.log('ERROR: did not throw')
} catch (e: unknown) {
  console.log('Correctly threw:', (e as Error).message)
}

// --- Test 7: All requirements completed → on_track ---
const completedReqs: StageRequirement[] = stageRequirements.map(r => ({
  ...r,
  current: r.target,
  isCompleted: true,
}))
const result7 = computeHomeState({
  stages, stageRequirements: completedReqs, flowStates, scheduleBlocks, operationalMetrics,
  now: '2026-03-24T10:00:00Z',
})
console.log('\n=== Test 7 — All requirements completed ===')
console.log('Stage Status:', result7.stageStatus)
console.log('Urgency     :', result7.nextAction.urgency)

// --- Test 8: No dominant flow → fallback to motion ---
const noDominantFlows: FlowState[] = flowStates.map(f => ({
  ...f,
  priorityMode: 'maintain' as const,
}))
const result8 = computeHomeState({
  stages, stageRequirements, flowStates: noDominantFlows, scheduleBlocks, operationalMetrics,
  now: '2026-03-24T10:00:00Z',
})
console.log('\n=== Test 8 — No dominant flow (fallback) ===')
console.log('Dominant    :', result8.dominantFlow)
