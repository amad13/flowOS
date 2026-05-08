type Accent = 'emerald' | 'red' | 'blue' | 'purple'

interface Tab {
  id: string
  label: string
}

interface Props {
  tabs: Tab[]
  active: string
  onChange: (id: string) => void
  accent?: Accent
}

const ACTIVE: Record<Accent, string> = {
  emerald: 'border-emerald-500/40 text-emerald-400 bg-emerald-500/10',
  red:     'border-red-500/40 text-red-400 bg-red-500/10',
  blue:    'border-blue-500/40 text-blue-400 bg-blue-500/10',
  purple:  'border-purple-500/40 text-purple-400 bg-purple-500/10',
}

export default function FlowTabs({ tabs, active, onChange, accent = 'emerald' }: Props) {
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: 'none' }}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border whitespace-nowrap transition-colors ${
            active === tab.id
              ? ACTIVE[accent]
              : 'border-white/10 text-white/35 bg-white/5 hover:text-white/55 hover:bg-white/8'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
