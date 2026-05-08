import type { NextAction } from '../data/types'
import { flowBadge, flowDisplayName } from '../data/flowColors'

// ─── Duration by block type ───────────────────────────────────────────────────
const BLOCK_DURATION: Record<string, string> = {
  deep:       '45 min',
  light:      '30 min',
  obligation: 'Variable',
}

const URGENCY_BORDER: Record<string, string> = {
  critical: 'border-red-500/25 bg-red-500/4',
  high:     'border-amber-500/22 bg-amber-500/4',
  medium:   'border-white/10 bg-white/5',
  low:      'border-white/8 bg-white/4',
}
const URGENCY_COLOR: Record<string, string> = {
  critical: 'text-red-400',
  high:     'text-amber-400',
  medium:   'text-blue-400',
  low:      'text-white/35',
}

interface Props {
  action:       NextAction
  dailyTarget?: { label: string; target: number; completed: number }
  why?:         string
  blockStatus:  'idle' | 'running' | 'done' | 'failed'
  onDone?:      () => void
  onStart?:     () => void
  onFail?:      () => void
}

export default function NextActionCard({
  action, dailyTarget, why, blockStatus, onDone, onStart, onFail,
}: Props) {
  // map external blockStatus to local display names
  const status: 'idle' | 'active' | 'done' | 'failed' =
    blockStatus === 'running' ? 'active' : blockStatus

  const duration  = BLOCK_DURATION[action.blockType] ?? '—'
  const remaining = dailyTarget ? dailyTarget.target - dailyTarget.completed : null
  const pct       = dailyTarget && dailyTarget.target > 0
    ? Math.min(100, Math.round((dailyTarget.completed / dailyTarget.target) * 100))
    : null

  function handleStart() { onStart?.() }
  function handleDone()  { onDone?.()  }
  function handleFail()  { onFail?.()  }

  const border  = URGENCY_BORDER[action.urgency] ?? URGENCY_BORDER.medium
  const uColor  = URGENCY_COLOR[action.urgency]  ?? URGENCY_COLOR.medium
  const progBar = pct === null ? '' : pct >= 80 ? 'bg-emerald-500/60' : pct >= 50 ? 'bg-amber-400/55' : 'bg-red-500/50'

  return (
    <div className={`rounded-xl border ${border} p-5 flex flex-col gap-4 ring-1 ring-white/5 shadow-lg`}>

      {/* Header: EXECUTE NOW + urgency */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/55">Execute Now</span>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-black uppercase tracking-widest ${uColor}`}>
            {action.urgency}
          </span>
          {status !== 'idle' && (
            <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full ${
              status === 'active' ? 'bg-blue-500/20 text-blue-400'
              : status === 'done' ? 'bg-emerald-500/20 text-emerald-400'
              : 'bg-red-500/20 text-red-400'
            }`}>
              {status === 'active' ? 'In Progress' : status === 'done' ? 'Done ✓' : 'Failed ✗'}
            </span>
          )}
        </div>
      </div>

      {/* Action title + flow + duration + remaining */}
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-black text-white leading-tight">{action.title}</h2>
        <div className="flex items-center gap-2.5 flex-wrap">
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${flowBadge[action.flow]}`}>
            {flowDisplayName[action.flow]}
          </span>
          <span className="text-xs text-white/35 font-mono">{duration}</span>
          {remaining !== null && remaining > 0 && (
            <span className={`text-xs font-bold ${
              remaining > (dailyTarget?.target ?? 1) * 0.5 ? 'text-red-400/70' : 'text-amber-400/70'
            }`}>{remaining} remaining</span>
          )}
          {remaining !== null && remaining <= 0 && (
            <span className="text-xs font-bold text-emerald-400/70">Target met</span>
          )}
        </div>
      </div>

      {/* Output target progress */}
      {dailyTarget && pct !== null && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <span className="text-[10px] text-white/52">
              {dailyTarget.completed} / {dailyTarget.target} {dailyTarget.label}
            </span>
            <span className={`text-[11px] font-black font-mono tabular-nums ${
              pct >= 80 ? 'text-emerald-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400'
            }`}>{pct}%</span>
          </div>
          <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${progBar}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* WHY — deficit explanation */}
      {why && (
        <div className="flex flex-col gap-1 px-3 py-2.5 rounded-lg border border-white/6 bg-white/3">
          <span className="text-[8px] text-white/42 uppercase tracking-widest font-black">Why this now</span>
          <p className="text-[11px] text-white/52 leading-relaxed">{why}</p>
        </div>
      )}

      {/* Buttons: Start / Done / Fail */}
      <div className="flex gap-2 mt-1">
        <button
          onClick={handleStart}
          disabled={status === 'active' || status === 'done' || status === 'failed'}
          className={`flex-1 py-2.5 rounded-lg text-sm font-black border transition-all ${
            status === 'active'
              ? 'border-blue-500/30 bg-blue-500/15 text-blue-400'
              : status === 'done' || status === 'failed'
              ? 'border-white/5 text-white/40 cursor-not-allowed'
              : 'border-white/15 bg-white/6 text-white/65 hover:bg-white/10 hover:text-white'
          }`}
        >
          {status === 'active' ? '● Running' : 'Start'}
        </button>
        <button
          onClick={handleDone}
          disabled={status === 'done' || status === 'failed'}
          className={`flex-1 py-2.5 rounded-lg text-sm font-black border transition-all ${
            status === 'done'
              ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
              : status === 'failed'
              ? 'border-white/5 text-white/40 cursor-not-allowed'
              : 'border-emerald-500/25 bg-emerald-500/8 text-emerald-400 hover:bg-emerald-500/20'
          }`}
        >
          {status === 'done' ? 'Done ✓' : 'Done'}
        </button>
        <button
          onClick={handleFail}
          disabled={status === 'done' || status === 'failed'}
          className={`flex-1 py-2.5 rounded-lg text-sm font-black border transition-all ${
            status === 'failed'
              ? 'border-red-500/40 bg-red-500/15 text-red-400'
              : status === 'done'
              ? 'border-white/5 text-white/40 cursor-not-allowed'
              : 'border-red-500/15 bg-red-500/5 text-red-400/60 hover:bg-red-500/12 hover:text-red-400'
          }`}
        >
          {status === 'failed' ? 'Failed ✗' : 'Fail'}
        </button>
      </div>
    </div>
  )
}
