import type { FlowType, FlowStatus } from '../data/types'
import { flowText, flowDot, flowDisplayName } from '../data/flowColors'

type AvatarLevel = 'LOW' | 'MID' | 'HIGH'

const avatarImages: Record<AvatarLevel, string> = {
  LOW: '/avatars/low.svg',
  MID: '/avatars/mid.svg',
  HIGH: '/avatars/high.svg',
}

const levelStyle: Record<AvatarLevel, { border: string; label: string; glow: string; opacity: string }> = {
  LOW: {
    border: 'border-red-500/60',
    label: 'text-red-400',
    glow: '',
    opacity: 'opacity-60',
  },
  MID: {
    border: 'border-amber-400/60',
    label: 'text-amber-400',
    glow: '',
    opacity: '',
  },
  HIGH: {
    border: 'border-emerald-500',
    label: 'text-emerald-400',
    glow: 'shadow-[0_0_24px_rgba(16,185,129,0.35)]',
    opacity: '',
  },
}

interface FlowIndicator {
  flow: FlowType
  state: FlowStatus
}

interface WeeklyOutcome {
  flow: FlowType
  result: 'PASS' | 'FAIL'
}

function computeAvatarLevel(disciplineScore: number, outcomes: WeeklyOutcome[]): AvatarLevel {
  const hasFailingFlow = outcomes.some(o => o.result === 'FAIL')

  let base: AvatarLevel
  if (disciplineScore > 80 && !hasFailingFlow) {
    base = 'HIGH'
  } else if (disciplineScore >= 50) {
    base = 'MID'
  } else {
    base = 'LOW'
  }

  if (hasFailingFlow) {
    if (base === 'HIGH') return 'MID'
    if (base === 'MID') return 'LOW'
  }

  return base
}

interface Props {
  statusLabel: string
  lastEvolution: string
  flowIndicators: FlowIndicator[]
  disciplineScore: number
  weeklyOutcomes: WeeklyOutcome[]
}

export default function AvatarCard({ statusLabel, lastEvolution, flowIndicators, disciplineScore, weeklyOutcomes }: Props) {
  const level = computeAvatarLevel(disciplineScore, weeklyOutcomes)
  const style = levelStyle[level]

  return (
    <div className={`rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col items-center gap-4 ${style.opacity}`}>
      <div className="flex items-center justify-between w-full">
        <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Amadou 2.0</span>
        <span className={`text-xs font-bold tracking-wider ${style.label}`}>{level}</span>
      </div>

      <div className={`w-24 h-24 rounded-full border-2 ${style.border} bg-white/5 overflow-hidden flex items-center justify-center ${style.glow}`}>
        <img
          src={avatarImages[level]}
          alt={`Avatar – ${level}`}
          className="w-full h-full object-cover"
        />
      </div>

      <div className="text-center">
        <p className="text-sm font-semibold text-white">{statusLabel}</p>
        <p className="text-xs text-white/40 mt-0.5">{lastEvolution}</p>
      </div>

      <div className="grid grid-cols-4 gap-3 w-full">
        {flowIndicators.map(({ flow }) => (
          <div key={flow} className="flex flex-col items-center gap-1.5">
            <div className={`w-2.5 h-2.5 rounded-full ${flowDot[flow]}`} />
            <span className={`text-xs font-medium ${flowText[flow]}`}>
              {flowDisplayName[flow]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
