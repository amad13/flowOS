// Shared metrics overview card

import type { Accent } from './DailyMetric'

const valColor: Record<Accent, string> = {
  emerald: 'text-emerald-400',
  red: 'text-red-400',
  blue: 'text-blue-400',
  purple: 'text-purple-400',
}

export interface MetricItem {
  label: string
  value: number | string
  unit?: string
}

interface Props {
  metrics: MetricItem[]
  accent: Accent
}

export default function MetricsCard({ metrics, accent }: Props) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
      <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Metrics</span>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {metrics.map(({ label, value, unit }) => (
          <div key={label} className="flex flex-col gap-1">
            <span className="text-xs text-white/40">{label}</span>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl font-bold ${valColor[accent]}`}>{value}</span>
              {unit && <span className="text-xs text-white/55">{unit}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
