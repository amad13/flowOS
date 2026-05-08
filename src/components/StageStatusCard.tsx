import type { StageStatus } from '../data/types'
import { stageStatusDisplay } from '../data/flowColors'

interface Props {
  status: StageStatus
}

export default function StageStatusCard({ status }: Props) {
  const isOk = status === 'on_track'
  const isFailing = status === 'failing'

  return (
    <div className={`rounded-xl border p-4 flex items-center justify-between ${
      isOk
        ? 'border-emerald-500/30 bg-emerald-500/10'
        : isFailing
          ? 'border-red-500/30 bg-red-500/10'
          : 'border-amber-500/30 bg-amber-500/10'
    }`}>
      <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Stage Status</span>
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${
          isOk ? 'bg-emerald-500' : isFailing ? 'bg-red-500' : 'bg-amber-400'
        }`} />
        <span className={`text-sm font-bold ${
          isOk ? 'text-emerald-400' : isFailing ? 'text-red-400' : 'text-amber-400'
        }`}>
          {stageStatusDisplay[status]}
        </span>
      </div>
    </div>
  )
}
