// Shared page header for all flow pages

export type FlowBadge = 'dominant' | 'maintain' | 'minimum' | 'required'

const badgeStyle: Record<FlowBadge, string> = {
  dominant: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  maintain: 'bg-white/10 text-white/60 border-white/10',
  minimum: 'bg-white/5 text-white/40 border-white/5',
  required: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
}

interface Props {
  title: string
  subtitle: string
  badge: FlowBadge
}

export default function FlowPageHeader({ title, subtitle, badge }: Props) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-lg font-bold text-white">{title}</h1>
        <p className="text-xs text-white/40 mt-0.5">{subtitle}</p>
      </div>
      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border capitalize ${badgeStyle[badge]}`}>
        {badge}
      </span>
    </div>
  )
}
