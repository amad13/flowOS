import type { StageRequirement } from '../data/types'
import { flowAccent, flowText, flowDisplayName } from '../data/flowColors'

interface Props {
  stageName: string
  requirements: StageRequirement[]
}

export default function StageProgressCard({ stageName, requirements }: Props) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Stage Progress</span>
        <span className="text-xs font-semibold text-white/60">{stageName}</span>
      </div>

      <div className="flex flex-col gap-3">
        {requirements.map(({ id, flow, current, target, unit }) => {
          const pct = Math.min(100, Math.round((current / target) * 100))
          const label = unit === '$'
            ? `$${current.toLocaleString()} / $${target.toLocaleString()}`
            : `${current} / ${target} ${unit}`

          return (
            <div key={id} className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className={`text-xs font-semibold ${flowText[flow]}`}>
                  {flowDisplayName[flow]}
                </span>
                <span className="text-xs text-white/50">{label}</span>
              </div>
              <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full ${flowAccent[flow]} transition-all`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
