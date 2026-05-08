import type { FlowState, PriorityMode } from '../data/types'
import { flowText, flowDisplayName, priorityModeDisplay } from '../data/flowColors'

const statusStyle: Record<PriorityMode, string> = {
  dominant: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  maintain: 'bg-white/10 text-white/60 border-white/10',
  minimum: 'bg-white/5 text-white/40 border-white/5',
  required: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
}

interface Props {
  flowStates: FlowState[]
}

export default function FlowPriorityCard({ flowStates }: Props) {
  const dominant = flowStates.find(f => f.priorityMode === 'dominant')
  const others = flowStates.filter(f => f.priorityMode !== 'dominant')

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
      <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Flow Priority</span>

      {dominant && (
        <div className="flex items-center gap-3">
          <span className="text-xs text-white/40">Dominant</span>
          <span className={`text-lg font-bold ${flowText[dominant.flow]}`}>
            {flowDisplayName[dominant.flow]}
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2">
        {others.map(({ flow, priorityMode }) => (
          <div key={flow} className="flex items-center justify-between">
            <span className={`text-sm font-medium ${flowText[flow]}`}>
              {flowDisplayName[flow]}
            </span>
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${statusStyle[priorityMode]}`}>
              {priorityModeDisplay[priorityMode]}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
