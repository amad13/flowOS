// ============================================================
// FlowOS Brain – brain.ts (V1)
// Deterministic decision engine for the Home screen.
// No AI. No guessing. Pure logic.
// ============================================================

import type {
  LifeStage,
  StageRequirement,
  FlowState,
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

// --- Action table ---
// Deterministic mapping: flow × block type → action title

const ACTION_TABLE: Record<FlowType, Record<BlockType, string>> = {
  motion: {
    deep: 'Execute outreach batch',
    light: 'Do follow-ups',
    obligation: 'Handle essential obligations first',
  },
  creed: {
    deep: 'Complete training session',
    light: 'Log calories and bodyweight',
    obligation: 'Handle essential obligations first',
  },
  deen: {
    deep: 'Study Qur\'an / Arabic',
    light: 'Do dhikr and review',
    obligation: 'Handle essential obligations first',
  },
  essentials: {
    deep: 'Complete priority obligation',
    light: 'Do maintenance tasks',
    obligation: 'Continue required obligations',
  },
}

// --- Helpers ---

function resolveCurrentStage(stages: LifeStage[]): LifeStage {
  const active = stages.find(s => s.isActive)
  if (!active) {
    throw new Error('FlowOS: No active stage found. At least one stage must have isActive === true.')
  }
  return active
}

function resolveCurrentBlock(blocks: ScheduleBlock[], now: Date): ScheduleBlock {
  const nowMs = now.getTime()

  // Find the block that contains `now`
  const active = blocks.find(b => {
    return nowMs >= new Date(b.start).getTime() && nowMs < new Date(b.end).getTime()
  })
  if (active) return active

  // No block matches → unscheduled fallback
  const nowISO = now.toISOString()
  return {
    id: 'default',
    title: 'Unscheduled',
    type: 'light',
    start: nowISO,
    end: nowISO,
  }
}

function resolveDominantFlow(flowStates: FlowState[]): FlowType {
  const dominant = flowStates.find(f => f.priorityMode === 'dominant')
  if (dominant) return dominant.flow
  return 'motion'
}

/**
 * Stage status from stage requirements.
 *
 * Per requirement:
 *   current >= target           → healthy
 *   current / target < 0.5      → failing
 *   otherwise                   → behind
 *
 * Global:
 *   any failing                 → "failing"
 *   all healthy                 → "on_track"
 *   otherwise                   → "behind"
 */
function resolveStageStatus(requirements: StageRequirement[]): StageStatus {
  let hasFailing = false
  let allHealthy = true

  for (const req of requirements) {
    if (req.current >= req.target) {
      // healthy — no change to allHealthy
      continue
    }

    // Not completed
    allHealthy = false

    const ratio = req.target > 0 ? req.current / req.target : 0
    if (ratio < 0.5) {
      hasFailing = true
    }
  }

  if (hasFailing) return 'failing'
  if (allHealthy) return 'on_track'
  return 'behind'
}

function resolveUrgency(stageStatus: StageStatus): Urgency {
  if (stageStatus === 'failing') return 'critical'
  if (stageStatus === 'behind') return 'high'
  return 'medium'
}

function buildReason(dominantFlow: FlowType, blockType: BlockType): string {
  const flowLabel = dominantFlow.charAt(0).toUpperCase() + dominantFlow.slice(1)
  const blockLabel =
    blockType === 'deep' ? 'a deep work block'
      : blockType === 'light' ? 'a light block'
        : 'an obligation block'

  if (blockType === 'obligation' && dominantFlow !== 'essentials') {
    return 'Essentials must take priority during obligation blocks.'
  }

  return `${flowLabel} is dominant and this is ${blockLabel}.`
}

function resolveNextAction(
  dominantFlow: FlowType,
  currentBlock: ScheduleBlock,
  stageStatus: StageStatus
): NextAction {
  const blockType = currentBlock.type
  const title = ACTION_TABLE[dominantFlow][blockType]
  const urgency = resolveUrgency(stageStatus)
  const reason = buildReason(dominantFlow, blockType)

  return {
    flow: dominantFlow,
    title,
    reason,
    blockType,
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
    now,
  } = params

  const nowDate = new Date(now)

  const currentStage = resolveCurrentStage(stages)
  const currentBlock = resolveCurrentBlock(scheduleBlocks, nowDate)
  const dominantFlow = resolveDominantFlow(flowStates)
  const stageStatus = resolveStageStatus(stageRequirements)
  const nextAction = resolveNextAction(dominantFlow, currentBlock, stageStatus)

  return {
    currentStage,
    currentBlock,
    dominantFlow,
    stageStatus,
    nextAction,
  }
}
