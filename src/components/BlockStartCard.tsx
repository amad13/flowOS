import { useState } from 'react'
import type { FlowType } from '../data/types'
import { flowBadge, flowDisplayName, flowText } from '../data/flowColors'

const DURATIONS: number[] = [15, 30, 45, 60, 90]

const FLOWS: FlowType[] = ['motion', 'creed', 'deen', 'essentials']

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
  selectedFlow:     FlowType
  selectedDuration: number
  why?:             string
  urgency:          string
  blockStatus:      'idle' | 'running' | 'done' | 'failed'
  onSelectFlow:     (f: FlowType) => void
  onSelectDuration: (d: number) => void
  onStart:          () => void
  onDone:           () => void
}

export default function BlockStartCard({
  selectedFlow, selectedDuration, why, urgency, blockStatus,
  onSelectFlow, onSelectDuration, onStart, onDone,
}: Props) {
  const isIdle    = blockStatus === 'idle'
  const isRunning = blockStatus === 'running'
  const isDone    = blockStatus === 'done'

  const [customInput, setCustomInput] = useState('')

  function handlePreset(d: number) {
    setCustomInput('')
    onSelectDuration(d)
  }

  function handleCustomChange(val: string) {
    setCustomInput(val)
    const parsed = parseInt(val, 10)
    if (!isNaN(parsed) && parsed > 0 && parsed <= 480) {
      onSelectDuration(parsed)
    }
  }

  const border = URGENCY_BORDER[urgency] ?? URGENCY_BORDER.medium
  const uColor = URGENCY_COLOR[urgency]  ?? URGENCY_COLOR.medium

  return (
    <div className={`rounded-xl border ${border} p-5 flex flex-col gap-4 ring-1 ring-white/5 shadow-lg`}>

      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-black uppercase tracking-widest text-white/55">Start Block</span>
        <span className={`text-[10px] font-black uppercase tracking-widest ${uColor}`}>{urgency}</span>
      </div>

      {/* Selectors — only shown when idle */}
      {isIdle && (
        <>
          {/* Flow selector */}
          <div className="flex flex-col gap-2">
            <span className="text-[9px] text-white/47 uppercase tracking-widest font-semibold">Select flow</span>
            <div className="grid grid-cols-2 gap-2">
              {FLOWS.map(f => (
                <button
                  key={f}
                  onClick={() => onSelectFlow(f)}
                  className={`py-2.5 rounded-lg text-xs font-bold border transition-all ${
                    selectedFlow === f
                      ? `${flowBadge[f]} ring-1 ring-white/15`
                      : 'border-white/8 bg-white/3 text-white/35 hover:bg-white/6 hover:text-white/55'
                  }`}
                >
                  {flowDisplayName[f]}
                </button>
              ))}
            </div>
          </div>

          {/* Duration selector */}
          <div className="flex flex-col gap-2">
            <span className="text-[9px] text-white/47 uppercase tracking-widest font-semibold">Duration</span>
            <div className="flex gap-2 flex-wrap">
              {DURATIONS.map(d => (
                <button
                  key={d}
                  onClick={() => handlePreset(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold border transition-all ${
                    selectedDuration === d && customInput === ''
                      ? 'border-white/30 bg-white/12 text-white'
                      : 'border-white/8 bg-white/3 text-white/55 hover:bg-white/6 hover:text-white/50'
                  }`}
                >
                  {d}m
                </button>
              ))}
              <input
                type="number"
                min="1"
                max="480"
                value={customInput}
                onChange={e => handleCustomChange(e.target.value)}
                placeholder="custom"
                className={`w-20 px-2 py-1.5 rounded-lg text-xs font-mono border bg-white/3 text-white/55 placeholder:text-white/42 outline-none transition-all ${
                  customInput !== ''
                    ? 'border-white/30 bg-white/12 text-white'
                    : 'border-white/8 hover:border-white/15'
                }`}
              />
            </div>
          </div>
        </>
      )}

      {/* Active block summary — shown when running */}
      {isRunning && (
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-blue-500/15 bg-blue-500/5">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
          <div className="flex flex-col gap-0.5">
            <span className={`text-xs font-bold ${flowText[selectedFlow]}`}>
              {flowDisplayName[selectedFlow]}
            </span>
            <span className="text-[10px] text-white/55 font-mono">{selectedDuration} min block</span>
          </div>
        </div>
      )}

      {/* WHY THIS NOW */}
      {why && (
        <div className="flex flex-col gap-1 px-3 py-2.5 rounded-lg border border-white/6 bg-white/3">
          <span className="text-[8px] text-white/42 uppercase tracking-widest font-black">Why this now</span>
          <p className="text-[11px] text-white/52 leading-relaxed">{why}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 mt-1">
        {isIdle && (
          <button
            onClick={onStart}
            className="flex-1 py-2.5 rounded-lg text-sm font-black border border-white/15 bg-white/6 text-white/65 hover:bg-white/10 hover:text-white transition-all"
          >
            Start
          </button>
        )}
        {isRunning && (
          <>
            <button
              disabled
              className="flex-1 py-2.5 rounded-lg text-sm font-black border border-blue-500/30 bg-blue-500/15 text-blue-400 cursor-not-allowed"
            >
              ● Running
            </button>
            <button
              onClick={onDone}
              className="flex-1 py-2.5 rounded-lg text-sm font-black border border-emerald-500/25 bg-emerald-500/8 text-emerald-400 hover:bg-emerald-500/20 transition-all"
            >
              Done
            </button>
          </>
        )}
        {isDone && (
          <button
            disabled
            className="flex-1 py-2.5 rounded-lg text-sm font-black border border-emerald-500/40 bg-emerald-500/15 text-emerald-400 cursor-not-allowed"
          >
            Done ✓
          </button>
        )}
      </div>
    </div>
  )
}
