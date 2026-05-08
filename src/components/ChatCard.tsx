import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'system'
  text: string
}

// ─── Deterministic system decisions — no suggestions, direct commands ─────────
const DECISIONS: Record<string, string> = {
  default:
    'Motion is in deficit. Execute outreach — 13 contacts remaining. Do not leave this block without progress.',
  help:
    'Dominant flow: Motion. Deep Work block active. Execute outreach now. No delays.',
  creed:
    'Creed: 3/8 weeks complete. On track. Maintain training output — no change required.',
  deen:
    'Deen: 12/30 days streak. On track. Protect the streak — do not miss tonight.',
  essentials:
    'Essentials: 9/30 days. FAILING. Required habits incomplete. Fix tonight or Stage 1 slips.',
  motion:
    'Motion: $1,200 / $3,000. BEHIND. $1,800 deficit. This block is not optional.',
}

function getDecision(input: string): string {
  const l = input.toLowerCase()
  if (l.includes('creed'))      return DECISIONS.creed
  if (l.includes('deen'))       return DECISIONS.deen
  if (l.includes('essentials')) return DECISIONS.essentials
  if (l.includes('motion'))     return DECISIONS.motion
  if (l.includes('help'))       return DECISIONS.help
  return DECISIONS.default
}

const initialMessages: Message[] = [
  { role: 'system', text: DECISIONS.default },
]

export default function ChatCard() {
  const [messages, setMessages] = useState<Message[]>(initialMessages)
  const [input, setInput]       = useState('')
  const bottomRef    = useRef<HTMLDivElement>(null)
  const isFirstRender = useRef(true)

  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function handleSend() {
    if (!input.trim()) return
    const userMsg:   Message = { role: 'user',   text: input.trim() }
    const systemMsg: Message = { role: 'system', text: getDecision(input) }
    setMessages(prev => [...prev, userMsg, systemMsg])
    setInput('')
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 flex flex-col" style={{ height: '280px' }}>
      <div className="px-5 pt-4 pb-2 border-b border-white/5">
        <span className="text-xs font-black tracking-widest text-white/40 uppercase">System Decision</span>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[90%] rounded-lg px-3 py-2 text-sm ${
              msg.role === 'user'
                ? 'bg-white/8 text-white/50 border border-white/8'
                : 'bg-white/5 text-white/78 border border-white/10 font-semibold'
            }`}>
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <div className="px-4 pb-4 pt-2 border-t border-white/5">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Query system..."
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/20 transition-colors"
          />
          <button
            onClick={handleSend}
            className="px-3 py-2 bg-white/8 hover:bg-white/12 border border-white/12 rounded-lg text-white/50 text-sm transition-colors"
          >
            →
          </button>
        </div>
      </div>
    </div>
  )
}
