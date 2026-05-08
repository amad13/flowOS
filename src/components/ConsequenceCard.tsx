interface Props {
  consequences: string[]
}

export default function ConsequenceCard({ consequences }: Props) {
  return (
    <div className="rounded-xl border border-red-500/15 bg-red-500/5 p-4 flex flex-col gap-2">
      <span className="text-xs font-semibold tracking-widest text-red-400/60 uppercase">If you stop now</span>
      <ul className="flex flex-col gap-1.5">
        {consequences.map((c, i) => (
          <li key={i} className="flex items-start gap-2 text-sm text-red-300/70">
            <span className="text-red-500/50 mt-0.5 shrink-0">—</span>
            {c}
          </li>
        ))}
      </ul>
    </div>
  )
}
