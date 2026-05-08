// ============================================================
// FlowOS Brain – computeHomeState (V1)
// Deterministic decision engine for the Home screen.
// ============================================================

import type {
  LifeStage,
  StageRequirement,
  FlowState,
  FlowStatus,
  FlowType,
  ScheduleBlock,
  OperationalMetric,
  HomeState,
  StageStatus,
  NextAction,
  BlockType,
  Urgency,
} from '../data/types'

// --- Input contract ---

export interface ComputeHomeStateParams {
  stages: LifeStage[]
  stageRequirements: StageRequirement[]
  flowStates: FlowState[]
  scheduleBlocks: ScheduleBlock[]
  operationalMetrics: OperationalMetric[]
  now: string // ISO 8601 datetime
}

// --- Constants ---

const FLOW_PRIORITY_ORDER: FlowType[] = ['motion', 'creed', 'deen', 'essentials']

const STATUS_SEVERITY: Record<FlowStatus, number> = {
  on_track: 0,
  behind: 1,
  failing: 2,
}

const BLOCK_ACTION_MAP: Record<BlockType, { suffix: string; fallback: string }> = {
  deep: { suffix: 'deep execution', fallback: 'Execute highest-priority deep work' },
  light: { suffix: 'light tasks', fallback: 'Handle follow-ups and admin' },
  obligation: { suffix: 'obligations', fallback: 'Complete scheduled obligations' },
}

// --- Helpers ---

/** Return the active life stage, or the first stage as fallback. */
function resolveCurrentStage(stages: LifeStage[]): LifeStage {
  return stages.find(s => s.isActive) ?? stages[0]
}

/** Return the schedule block that contains `now`, or the nearest upcoming block. */
function resolveCurrentBlock(blocks: ScheduleBlock[], now: Date): ScheduleBlock {
  // Exact match: now falls within a block
  const active = blocks.find(b => {
    const start = new Date(b.start)
    const end = new Date(b.end)
    return now >= start && now < end
  })
  if (active) return active

  // Next upcoming block
  const upcoming = blocks
    .filter(b => new Date(b.start) > now)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
  if (upcoming.length > 0) return upcoming[0]

  // Fallback: last block of the day
  return blocks[blocks.length - 1]
}

/** Identify the dominant flow from flowStates. */
function resolveDominantFlow(flowStates: FlowState[]): FlowType {
  const dominant = flowStates.find(f => f.priorityMode === 'dominant')
  if (dominant) return dominant.flow

  // Fallback: pick the flow with the worst status (needs most attention)
  const sorted = [...flowStates].sort(
    (a, b) => STATUS_SEVERITY[b.status] - STATUS_SEVERITY[a.status]
  )
  return sorted[0]?.flow ?? 'motion'
}

/**
 * Compute overall stage status from flow statuses + stage requirement progress.
 *
 * Rules:
 *   - Any flow failing        → "failing"
 *   - Any flow behind         → "behind"
 *   - All incomplete reqs < 50% avg progress → "behind"
 *   - Otherwise               → "on_track"
 */
function resolveStageStatus(
  flowStates: FlowState[],
  stageRequirements: StageRequirement[]
): StageStatus {
  const worst = flowStates.reduce<FlowStatus>(
    (acc, f) => (STATUS_SEVERITY[f.status] > STATUS_SEVERITY[acc] ? f.status : acc),
    'on_track'
  )
  if (worst === 'failing') return 'failing'
  if (worst === 'behind') return 'behind'

  // Check aggregate requirement progress
  const incomplete = stageRequirements.filter(r => !r.isCompleted)
  if (incomplete.length > 0) {
    const avgProgress =
      incomplete.reduce((sum, r) => sum + (r.target > 0 ? r.current / r.target : 0), 0) /
      incomplete.length
    if (avgProgress < 0.5) return 'behind'
  }

  return 'on_track'
}

/**
 * Determine urgency for an action based on flow status + stage requirement gap.
 */
function resolveUrgency(
  flowStatus: FlowStatus,
  requirement: StageRequirement | undefined
): Urgency {
  if (flowStatus === 'failing') return 'critical'
  if (flowStatus === 'behind') return 'high'

  if (requirement && !requirement.isCompleted) {
    const progress = requirement.target > 0 ? requirement.current / requirement.target : 1
    if (progress < 0.25) return 'high'
    if (progress < 0.6) return 'medium'
  }

  return 'low'
}

/**
 * Build the next action the user should execute right now.
 *
 * Priority logic:
 *   1. Failing flows first (critical)
 *   2. Behind flows next
 *   3. Dominant flow
 *   4. First flow in canonical order with incomplete requirements
 *
 * Action is shaped by the current block type.
 */
function resolveNextAction(
  flowStates: FlowState[],
  stageRequirements: StageRequirement[],
  operationalMetrics: OperationalMetric[],
  currentBlock: ScheduleBlock,
  _dominantFlow: FlowType
): NextAction {
  // Sort flows by severity (failing > behind > on_track), then by canonical order
  const ranked = [...flowStates].sort((a, b) => {
    const sevDiff = STATUS_SEVERITY[b.status] - STATUS_SEVERITY[a.status]
    if (sevDiff !== 0) return sevDiff
    return FLOW_PRIORITY_ORDER.indexOf(a.flow) - FLOW_PRIORITY_ORDER.indexOf(b.flow)
  })

  // Pick the target flow
  const targetFlowState = ranked[0]
  const targetFlow = targetFlowState.flow

  // Find the most incomplete requirement for this flow
  const flowReqs = stageRequirements
    .filter(r => r.flow === targetFlow && !r.isCompleted)
    .sort((a, b) => {
      const pctA = a.target > 0 ? a.current / a.target : 1
      const pctB = b.target > 0 ? b.current / b.target : 1
      return pctA - pctB // least complete first
    })

  const topReq = flowReqs[0]
  const urgency = resolveUrgency(targetFlowState.status, topReq)
  const blockInfo = BLOCK_ACTION_MAP[currentBlock.type]

  // Build action title and reason
  let title: string
  let reason: string

  if (topReq) {
    const remaining = topReq.target - topReq.current
    const pct = Math.round((topReq.current / topReq.target) * 100)
    title = `${topReq.title} — ${blockInfo.suffix}`
    reason = `${remaining} ${topReq.unit} remaining (${pct}% done). Flow "${targetFlow}" is ${targetFlowState.status.replace('_', ' ')}.`
  } else {
    // No incomplete requirements — use operational metrics or generic fallback
    const flowMetric = operationalMetrics.find(m => m.flow === targetFlow)
    if (flowMetric) {
      title = `${flowMetric.key} — ${blockInfo.suffix}`
      reason = `Operational priority for "${targetFlow}" during ${currentBlock.type} block.`
    } else {
      title = blockInfo.fallback
      reason = `Default action for "${targetFlow}" — no pending requirements.`
    }
  }

  return {
    flow: targetFlow,
    title,
    reason,
    blockType: currentBlock.type,
    urgency,
  }
}

// --- Main function ---

export function computeHomeState(params: ComputeHomeStateParams): HomeState {
  const {
    stages,
    stageRequirements,
    flowStates,
    scheduleBlocks,
    operationalMetrics,
    now,
  } = params

  const nowDate = new Date(now)

  const currentStage = resolveCurrentStage(stages)
  const currentBlock = resolveCurrentBlock(scheduleBlocks, nowDate)
  const dominantFlow = resolveDominantFlow(flowStates)
  const stageStatus = resolveStageStatus(flowStates, stageRequirements)
  const nextAction = resolveNextAction(
    flowStates,
    stageRequirements,
    operationalMetrics,
    currentBlock,
    dominantFlow
  )

  return {
    currentStage,
    currentBlock,
    dominantFlow,
    stageStatus,
    nextAction,
  }
}
