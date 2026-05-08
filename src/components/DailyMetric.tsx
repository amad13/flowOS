// Shared DailyMetric – used across all flow pages

export type Accent = 'emerald' | 'red' | 'blue' | 'purple'

const accentBar: Record<Accent, string> = {
  emerald: 'bg-emerald-500',
  red: 'bg-red-500',
  blue: 'bg-blue-500',
  purple: 'bg-purple-500',
}
const accentText: Record<Accent, string> = {
  emerald: 'text-emerald-400',
  red: 'text-red-400',
  blue: 'text-blue-400',
  purple: 'text-purple-400',
}

export interface DailyMetricProps {
  label: string
  unit: string
  done: number
  target: number
  accent: Accent
  onIncrement: () => void
  /** If true, shows ✓/✗ toggle instead of +1 counter */
  boolean?: boolean
}

export default function DailyMetric({ label, unit, done, target, accent, onIncrement, boolean: isBool }: DailyMetricProps) {
  const remaining = Math.max(0, target - done)
  const pct = Math.min(100, Math.round((done / target) * 100))
  const complete = remaining === 0

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-semibold ${accentText[accent]}`}>{label}</span>
          <span className="text-xs text-white/55">{unit}</span>
        </div>
        <div className="flex items-center gap-3">
          {!isBool && (
            <span className="text-sm font-semibold text-white">
              {done}<span className="text-white/55"> / {target}</span>
            </span>
          )}
          <button
            onClick={onIncrement}
            disabled={complete}
            className={`text-xs font-bold rounded-lg border transition-colors ${
              isBool
                ? complete
                  ? 'px-3 h-7 border-emerald-500/30 text-emerald-400 bg-emerald-500/10 cursor-default'
                  : 'px-3 h-7 border-white/10 hover:border-white/20 text-white/50 hover:text-white/80 bg-white/5 hover:bg-white/10'
                : complete
                  ? 'w-8 h-7 border-emerald-500/20 text-emerald-500/40 cursor-default'
                  : 'w-8 h-7 border-white/10 hover:border-white/20 text-white/40 hover:text-white/70 bg-white/5 hover:bg-white/10'
            }`}
          >
            {isBool ? (complete ? '✓ Done' : 'Log') : (complete ? '✓' : '+1')}
          </button>
        </div>
      </div>

      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className={`h-full rounded-full ${accentBar[accent]}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-white/50">{pct}%</span>
        {complete
          ? <span className={`font-semibold ${accentText[accent]}`}>Complete</span>
          : <span className="text-amber-400/70">{remaining} remaining</span>
        }
      </div>
    </div>
  )
}
