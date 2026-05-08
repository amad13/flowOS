export type Flow = 'Motion' | 'Creed' | 'Deen' | 'Essentials'
export type FlowState = 'red' | 'yellow' | 'green'
export type Momentum = 'LOW' | 'MEDIUM' | 'HIGH'
export type BlockType = 'Deep Work' | 'Light Work' | 'Obligations' | 'Recovery'
export type FlowStatus = 'Dominant' | 'Maintain' | 'Minimum' | 'Required'

export interface DailyTarget {
  label: string
  target: number
  completed: number
}

export interface NextAction {
  title: string
  flow: Flow
  block: string
  blockTime: string
  dailyTarget: DailyTarget
}

export interface WeeklyOutcome {
  flow: Flow
  result: 'PASS' | 'FAIL'
}

export interface CurrentBlock {
  blockType: BlockType
  timeRemaining: string
  focusLabel: string
}

export interface FlowIndicator {
  flow: Flow
  state: FlowState
}

export interface AvatarData {
  statusLabel: string
  lastEvolution: string
  flowIndicators: FlowIndicator[]
}

export interface FlowProgress {
  flow: Flow
  current: number | string
  target: number | string
  unit: string
}

export interface StageData {
  stageName: string
  flowProgress: FlowProgress[]
}

export interface FlowPriority {
  flow: Flow
  status: FlowStatus
}

export interface MockData {
  nextAction: NextAction
  currentBlock: CurrentBlock
  avatar: AvatarData
  stage: StageData
  flowPriorities: FlowPriority[]
  stageStatus: 'On track' | 'Behind pace'
  disciplineScore: number
  momentum: Momentum
  weeklyOutcomes: WeeklyOutcome[]
  consequences: string[]
}

export const mockData: MockData = {
  nextAction: {
    title: 'Send 25 outreach messages',
    flow: 'Motion',
    block: 'Deep Work',
    blockTime: '17:00–19:00',
    dailyTarget: {
      label: 'Outreach messages',
      target: 25,
      completed: 12,
    },
  },
  currentBlock: {
    blockType: 'Deep Work',
    timeRemaining: '1h 23m',
    focusLabel: 'Execution Mode',
  },
  avatar: {
    statusLabel: 'Week in progress',
    lastEvolution: 'Last evolution: Saturday 16:00',
    flowIndicators: [
      { flow: 'Creed', state: 'green' },
      { flow: 'Motion', state: 'yellow' },
      { flow: 'Deen', state: 'green' },
      { flow: 'Essentials', state: 'red' },
    ],
  },
  stage: {
    stageName: 'Stage 1 – Self Control',
    flowProgress: [
      { flow: 'Motion', current: 1200, target: 3000, unit: '$' },
      { flow: 'Creed', current: 3, target: 8, unit: 'weeks' },
      { flow: 'Deen', current: 12, target: 30, unit: 'days' },
      { flow: 'Essentials', current: 9, target: 30, unit: 'days' },
    ],
  },
  flowPriorities: [
    { flow: 'Motion', status: 'Dominant' },
    { flow: 'Creed', status: 'Maintain' },
    { flow: 'Deen', status: 'Minimum' },
    { flow: 'Essentials', status: 'Required' },
  ],
  stageStatus: 'Behind pace',
  disciplineScore: 67,
  momentum: 'MEDIUM',
  weeklyOutcomes: [
    { flow: 'Motion', result: 'FAIL' },
    { flow: 'Creed', result: 'PASS' },
    { flow: 'Deen', result: 'PASS' },
    { flow: 'Essentials', result: 'FAIL' },
  ],
  consequences: [
    'Motion target delayed by 3 days',
    'Stage 1 duration extended',
    'Outreach deficit increases to 38',
  ],
}
