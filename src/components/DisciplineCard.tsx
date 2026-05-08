type Momentum = 'LOW' | 'MEDIUM' | 'HIGH'

const momentumStyle: Record<Momentum, { label: string; text: string }> = {
  LOW: { label: 'LOW', text: 'text-red-400' },
  MEDIUM: { label: 'MEDIUM', text: 'text-amber-400' },
  HIGH: { label: 'HIGH', text: 'text-emerald-400' },
}

interface Props {
  score: number
  momentum: Momentum
}

export default function DisciplineCard({ score, momentum }: Props) {
  const m = momentumStyle[momentum]
  const scoreColor = score >= 80 ? 'text-emerald-400' : score >= 50 ? 'text-amber-400' : 'text-red-400'

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-4">
      <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Discipline & Momentum</span>

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col gap-1 flex-1">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-white/50">Discipline Score</span>
            <span className={`text-xl font-bold ${scoreColor}`}>{score}%</span>
          </div>
          <div className="h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-400' : 'bg-red-500'
              }`}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col items-center gap-1">
          <span className="text-xs text-white/40">Momentum</span>
          <div className="flex gap-1 items-end h-6">
            {(['LOW', 'MEDIUM', 'HIGH'] as Momentum[]).map((lvl, i) => (
              <div
                key={lvl}
                className={`w-2 rounded-sm transition-all ${
                  momentum === 'LOW' && i === 0 ? 'bg-red-500' :
                  momentum === 'MEDIUM' && i <= 1 ? 'bg-amber-400' :
                  momentum === 'HIGH' ? 'bg-emerald-500' :
                  'bg-white/10'
                }`}
                style={{ height: `${(i + 1) * 8}px` }}
              />
            ))}
          </div>
          <span className={`text-xs font-bold ${m.text}`}>{m.label}</span>
        </div>
      </div>
    </div>
  )
}
