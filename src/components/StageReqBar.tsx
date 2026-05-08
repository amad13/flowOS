// Shared stage requirement progress bar for all flow pages

import type { Accent } from './DailyMetric'

const barColor: Record<Accent, string> = {
  emerald: 'bg-emerald-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
}

const textColor: Record<Accent, string> = {
  emerald: 'text-emerald-400',
  red: 'text-red-400',
  blue: 'text-blue-400',
  purple: 'text-purple-400',
}

interface Props {
  title: string
  current: number
  target: number
  unit: string
  accent: Accent
  /** prefix like '$' to prepend to numbers */
  prefix?: string
}

export default function StageReqBar({ title, current, target, unit, accent, prefix = '' }: Props) {
  const pct = Math.min(100, Math.round((current / target) * 100))
  const remaining = target - current

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3">
      <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">
        Stage Requirement
      </span>
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/60">{title}</span>
        <span className="text-sm font-semibold text-white">
          {prefix}{current.toLocaleString()}
          <span className="text-white/55"> / {prefix}{target.toLocaleString()} {unit}</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${barColor[accent]}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/50">{pct}% of stage target</span>
        <span className={`${textColor[accent]}/70`}>
          {prefix}{remaining.toLocaleString()} {unit} remaining
        </span>
      </div>
    </div>
  )
}
