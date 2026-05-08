import { useEffect, useState } from 'react'
import type { FlowType } from '../data/types'
import { flowDisplayName, flowText } from '../data/flowColors'

interface Props {
  flow:      FlowType
  duration:  number   // target minutes
  startedAt: number   // Date.now() timestamp
  onDone:    () => void
  onClose:   () => void
}

export default function FocusTimer({ flow, duration, startedAt, onDone, onClose }: Props) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    }, 1000)
    return () => clearInterval(id)
  }, [startedAt])

  const targetSec     = duration * 60
  const timeRemaining = Math.max(0, targetSec - elapsed)
  const pct           = Math.min(100, Math.round((elapsed / targetSec) * 100))
  const isOver        = elapsed >= targetSec

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

  return (
    <div className="fixed inset-0 z-[100] bg-[#050508] flex flex-col items-center justify-center select-none">

      {/* Top-right exit */}
      <button
        onClick={onClose}
        className="absolute top-6 right-6 text-[11px] font-bold uppercase tracking-widest text-white/50 hover:text-white/55 transition-colors px-3 py-1.5 rounded-lg border border-white/8 hover:border-white/15"
      >
        Exit
      </button>

      {/* Flow label */}
      <span className={`text-[11px] font-black uppercase tracking-[0.2em] mb-8 ${flowText[flow]}`}>
        {flowDisplayName[flow]}
      </span>

      {/* Big timer */}
      <div className={`text-[80px] sm:text-[112px] font-mono font-black tabular-nums leading-none transition-colors ${
        isOver ? 'text-emerald-300' : 'text-white'
      }`}>
        {fmt(elapsed)}
      </div>

      {/* Remaining */}
      <span className={`mt-5 text-xl font-mono tabular-nums transition-colors ${
        isOver ? 'text-emerald-400/60' : 'text-white/50'
      }`}>
        {isOver ? 'Target reached' : `${fmt(timeRemaining)} left`}
      </span>

      {/* Progress bar */}
      <div className="mt-10 w-56 sm:w-80 h-[3px] bg-white/8 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${
            pct >= 100 ? 'bg-emerald-500/80' : pct >= 80 ? 'bg-emerald-500/60' : 'bg-blue-500/55'
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="mt-2 text-[10px] font-mono text-white/42">{pct}%</span>

      {/* Done CTA */}
      <button
        onClick={onDone}
        className={`mt-14 px-10 py-3.5 rounded-2xl font-black text-sm tracking-wide transition-all ${
          isOver
            ? 'border border-emerald-500/50 bg-emerald-500/18 text-emerald-300 hover:bg-emerald-500/30'
            : 'border border-white/12 bg-white/6 text-white/55 hover:bg-white/10 hover:text-white/80'
        }`}
      >
        Mark Done
      </button>
    </div>
  )
}
