// Shared deficit display – shows what's missing today

interface DeficitItem {
  label: string
  value: number | string
  urgent: boolean
}

interface Props {
  items: DeficitItem[]
}

export default function DeficitCard({ items }: Props) {
  const allClear = items.every(i => !i.urgent)

  return (
    <div className={`rounded-xl border p-4 flex flex-col gap-3 ${
      allClear ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-red-500/15 bg-red-500/5'
    }`}>
      <span className={`text-xs font-semibold tracking-widest uppercase ${
        allClear ? 'text-emerald-400/60' : 'text-red-400/60'
      }`}>
        {allClear ? 'No deficit today' : 'Deficit'}
      </span>

      {allClear ? (
        <p className="text-sm text-emerald-400/70">You are on track. Keep executing.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-center justify-between text-sm">
              <span className={item.urgent ? 'text-red-300/80' : 'text-white/40'}>
                {item.label}
              </span>
              <span className={`font-semibold font-mono ${
                item.urgent ? 'text-red-400' : 'text-white/55'
              }`}>
                {item.value}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
