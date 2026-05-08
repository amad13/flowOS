import { useEffect, useState } from 'react'
import type { ScheduleBlock } from '../data/types'
import { flowDisplayName } from '../data/flowColors'

interface Props {
  block:          ScheduleBlock
  blockStatus:    'idle' | 'running' | 'done' | 'failed'
  blockStartedAt: number | null
  commandFlow?:   string
  duration?:      number   // target duration in minutes
}

export default function CurrentBlockCard({
  block: _block, blockStatus, blockStartedAt, commandFlow, duration,
}: Props) {
  const [elapsed, setElapsed] = useState(0)

  // Tick elapsed seconds only while running
  useEffect(() => {
    if (blockStatus !== 'running' || blockStartedAt === null) {
      setElapsed(0)
      return
    }
    setElapsed(Math.floor((Date.now() - blockStartedAt) / 1000))
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - blockStartedAt) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [blockStatus, blockStartedAt])

  const mm = String(Math.floor(elapsed / 60)).padStart(2, '0')
  const ss = String(elapsed % 60).padStart(2, '0')
  const elapsedStr = `${mm}:${ss}`

  // ── Idle state ──────────────────────────────────────────────────────────────
  if (blockStatus === 'idle') {
    return (
      <div className="rounded-xl border border-white/8 bg-white/3 p-5 flex flex-col gap-3">
        <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Current Block</span>
        <div className="flex flex-col gap-1.5 py-3 items-center justify-center text-center">
          <div className="w-2 h-2 rounded-full bg-white/15" />
          <span className="text-sm font-semibold text-white/50">Not started</span>
          <span className="text-[10px] text-white/42">
            Press <span className="font-mono text-white/55">Start</span> on the command block to begin
          </span>
        </div>
      </div>
    )
  }

  // ── Done state ──────────────────────────────────────────────────────────────
  if (blockStatus === 'done') {
    return (
      <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-5 flex flex-col gap-3">
        <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Current Block</span>
        <div className="flex flex-col gap-1.5 py-3 items-center justify-center text-center">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-sm font-bold text-emerald-300">Block Complete ✓</span>
          <span className="text-[10px] font-mono text-white/55">{elapsedStr} elapsed</span>
        </div>
      </div>
    )
  }

  // ── Failed state ─────────────────────────────────────────────────────────────
  if (blockStatus === 'failed') {
    return (
      <div className="rounded-xl border border-red-500/22 bg-red-500/4 p-5 flex flex-col gap-3">
        <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Current Block</span>
        <div className="flex flex-col gap-1.5 py-3 items-center justify-center text-center">
          <div className="w-2 h-2 rounded-full bg-red-500" />
          <span className="text-sm font-bold text-red-400">Block Failed ✗</span>
          <span className="text-[10px] font-mono text-white/55">{elapsedStr} elapsed</span>
        </div>
      </div>
    )
  }

  // ── Running state ────────────────────────────────────────────────────────────
  const targetSeconds = (duration ?? 30) * 60
  const timePct       = Math.min(100, Math.round((elapsed / targetSeconds) * 100))
  const timeRemaining = Math.max(0, targetSeconds - elapsed)
  const remMm         = String(Math.floor(timeRemaining / 60)).padStart(2, '0')
  const remSs         = String(timeRemaining % 60).padStart(2, '0')

  return (
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/4 p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Current Block</span>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">Running</span>
        </div>
      </div>

      {/* Flow + duration label */}
      <div className="flex flex-col gap-1">
        {commandFlow && (
          <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400/70">
            {flowDisplayName[commandFlow as keyof typeof flowDisplayName] ?? commandFlow}
          </span>
        )}
        <p className="text-base font-black text-white leading-tight">
          {duration ?? 30} min block
        </p>
      </div>

      {/* Timers: elapsed + remaining */}
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-[9px] text-white/50 uppercase tracking-widest">Elapsed</span>
          <span className="text-2xl font-mono font-bold text-blue-300 tabular-nums">{elapsedStr}</span>
        </div>
        <div className="flex flex-col gap-0.5 items-end">
          <span className="text-[9px] text-white/50 uppercase tracking-widest">Remaining</span>
          <span className="text-sm font-mono font-bold text-white/40 tabular-nums">{remMm}:{remSs}</span>
        </div>
      </div>

      {/* Duration progress bar */}
      <div className="flex flex-col gap-1.5 pt-2 border-t border-white/6">
        <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              timePct >= 80 ? 'bg-emerald-500/60' : 'bg-blue-500/55'
            }`}
            style={{ width: `${timePct}%` }}
          />
        </div>
        <span className="text-[9px] text-white/45 text-right font-mono">{timePct}%</span>
      </div>
    </div>
  )
}
