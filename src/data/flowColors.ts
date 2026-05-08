import type { FlowType, BlockType, StageStatus, PriorityMode } from './types'

/**
 * Canonical flow color mapping:
 *   motion     → Green
 *   creed      → Red
 *   deen       → Blue
 *   essentials → Purple
 */

export const flowText: Record<FlowType, string> = {
  motion: 'text-emerald-400',
  creed: 'text-red-400',
  deen: 'text-blue-400',
  essentials: 'text-purple-400',
}

export const flowDot: Record<FlowType, string> = {
  motion: 'bg-emerald-500',
  creed: 'bg-red-500',
  deen: 'bg-blue-500',
  essentials: 'bg-purple-500',
}

export const flowAccent: Record<FlowType, string> = {
  motion: 'bg-emerald-500',
  creed: 'bg-red-500',
  deen: 'bg-blue-500',
  essentials: 'bg-purple-500',
}

export const flowBadge: Record<FlowType, string> = {
  motion: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  creed: 'bg-red-500/20 text-red-400 border-red-500/30',
  deen: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  essentials: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
}

// --- Display name helpers ---

export const flowDisplayName: Record<FlowType, string> = {
  motion: 'Motion',
  creed: 'Creed',
  deen: 'Deen',
  essentials: 'Essentials',
}

export const blockDisplayName: Record<BlockType, string> = {
  deep: 'Deep Work',
  light: 'Light Work',
  obligation: 'Obligations',
}

export const stageStatusDisplay: Record<StageStatus, string> = {
  on_track: 'On track',
  behind: 'Behind pace',
  failing: 'Failing',
}

export const priorityModeDisplay: Record<PriorityMode, string> = {
  dominant: 'Dominant',
  maintain: 'Maintain',
  minimum: 'Minimum',
  required: 'Required',
}
