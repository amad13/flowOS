import type { FlowType } from '../data/types'
import { flowText, flowDisplayName } from '../data/flowColors'

interface WeeklyOutcome {
  flow: FlowType
  result: 'PASS' | 'FAIL'
}

interface Props {
  outcomes: WeeklyOutcome[]
}

export default function WeeklyOutcomeCard({ outcomes }: Props) {
  const failCount = outcomes.filter(o => o.result === 'FAIL').length

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">If week ends now</span>
        {failCount > 0 && (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400 border border-red-500/20">
            {failCount} failing
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {outcomes.map(({ flow, result }) => (
          <div
            key={flow}
            className={`flex items-center justify-between rounded-lg px-3 py-2 border ${
              result === 'PASS'
                ? 'bg-emerald-500/5 border-emerald-500/15'
                : 'bg-red-500/5 border-red-500/15'
            }`}
          >
            <span className={`text-sm font-medium ${flowText[flow]}`}>
              {flowDisplayName[flow]}
            </span>
            <span className={`text-xs font-bold ${
              result === 'PASS' ? 'text-emerald-400' : 'text-red-400'
            }`}>
              {result}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
