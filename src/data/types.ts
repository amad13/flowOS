// ============================================================
// FlowOS Brain – Core Data Model (V1)
// ============================================================

// --- Enums / Unions ---

export type FlowType = 'motion' | 'creed' | 'deen' | 'essentials'

export type PriorityMode = 'dominant' | 'maintain' | 'minimum' | 'required'

export type FlowStatus = 'on_track' | 'behind' | 'failing'

export type StageStatus = 'on_track' | 'behind' | 'failing'

export type BlockType = 'deep' | 'light' | 'obligation'

export type Urgency = 'low' | 'medium' | 'high' | 'critical'

// --- Life Stages ---

export interface LifeStage {
  id: string
  name: string
  description?: string
  isActive: boolean
  startedAt?: string
}

// --- Metrics ---

/** Sacred metrics – locked targets required to complete a stage */
export interface StageRequirement {
  id: string
  flow: FlowType
  title: string
  target: number
  current: number
  unit: string
  isCompleted: boolean
  locked: true
}

/** Operational metrics – adaptive, adjustable tracking values */
export interface OperationalMetric {
  id: string
  flow: FlowType
  key: string
  value: number | string
  unit?: string
  adjustable: boolean
  lastUpdated?: string
}

// --- Flows ---

export interface FlowState {
  flow: FlowType
  priorityMode: PriorityMode
  status: FlowStatus
}

// --- Schedule ---

export interface ScheduleBlock {
  id: string
  title: string
  type: BlockType
  start: string
  end: string
}

// --- Execution ---

export interface NextAction {
  flow: FlowType
  title: string
  reason: string
  blockType: BlockType
  urgency: Urgency
}

// --- Execution Settings (Motion – locked between weekly reviews) ---

export interface ExecutionSettings {
  // Service (weekday targets)
  emailsPerDay:      number
  callsPerDay:       number
  // Amazon (weekend targets)
  productsPerDay:    number
  // Shared
  deepWorkMinPerDay: number
  lastUpdated:       string
}

// --- Home State (root view model) ---

export interface HomeState {
  currentStage: LifeStage
  currentBlock: ScheduleBlock
  dominantFlow: FlowType
  stageStatus: StageStatus
  nextAction: NextAction
}
