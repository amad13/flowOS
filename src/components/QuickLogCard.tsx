import { useState } from 'react'

const placeholders = [
  'I ate 2800 calories',
  'Sent 12 contacts',
  'Completed workout: 45min',
  'Read 20 pages',
]

export default function QuickLogCard() {
  const [input, setInput] = useState('')
  const [logs, setLogs] = useState<{ text: string; time: string }[]>([])
  const [placeholder] = useState(() => placeholders[Math.floor(Math.random() * placeholders.length)])

  function handleLog() {
    if (!input.trim()) return
    const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    setLogs(prev => [{ text: input.trim(), time: now }, ...prev].slice(0, 5))
    setInput('')
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3">
      <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Quick Log</span>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleLog()}
          placeholder={placeholder}
          className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20 transition-colors"
        />
        <button
          onClick={handleLog}
          className="px-4 py-2 bg-white/10 hover:bg-white/15 border border-white/10 rounded-lg text-sm font-semibold text-white transition-colors"
        >
          Log
        </button>
      </div>

      {logs.length > 0 && (
        <div className="flex flex-col gap-1 mt-1">
          {logs.map((log, i) => (
            <div key={i} className="flex items-center justify-between text-xs text-white/40">
              <span className="truncate">{log.text}</span>
              <span className="ml-2 shrink-0 font-mono">{log.time}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
