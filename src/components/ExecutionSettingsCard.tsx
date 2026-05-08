import { useState } from 'react'
import type { ExecutionSettings } from '../data/types'

interface Props {
  settings: ExecutionSettings
  onSave: (updated: ExecutionSettings) => void
}

export default function ExecutionSettingsCard({ settings, onSave }: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<ExecutionSettings>(settings)

  function handleEdit() { setDraft(settings); setEditing(true) }
  function handleSave() {
    onSave({ ...draft, lastUpdated: new Date().toISOString().split('T')[0] })
    setEditing(false)
  }
  function handleCancel() { setDraft(settings); setEditing(false) }

  return (
    <div className={`rounded-xl border p-5 flex flex-col gap-4 ${
      editing ? 'border-amber-500/30 bg-amber-500/5' : 'border-white/10 bg-white/5'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-0.5">
          <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Daily Targets</span>
          <span className="text-[10px] text-white/45 leading-relaxed">
            These targets drive Overview, Deficit, and Pipeline for the current flow day.
          </span>
        </div>
        {!editing ? (
          <button onClick={handleEdit}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/12 border border-white/12 text-white/50 transition-colors shrink-0">
            Edit Targets
          </button>
        ) : (
          <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 uppercase tracking-wide shrink-0">
            Editing
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-[9px] text-white/50 uppercase tracking-widest font-semibold">Service — weekdays</span>
        <div className="grid grid-cols-2 gap-2">
          <SettingField label="Emails / day"  value={draft.emailsPerDay}  locked={!editing} onChange={v => setDraft(d => ({ ...d, emailsPerDay: v  }))} unit="emails" accent="emerald" />
          <SettingField label="Calls / day"   value={draft.callsPerDay}   locked={!editing} onChange={v => setDraft(d => ({ ...d, callsPerDay: v   }))} unit="calls"  accent="blue"    />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-[9px] text-white/50 uppercase tracking-widest font-semibold">Amazon — weekends</span>
          <SettingField label="Products / day" value={draft.productsPerDay}    locked={!editing} onChange={v => setDraft(d => ({ ...d, productsPerDay: v    }))} unit="products" accent="purple" />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-[9px] text-white/50 uppercase tracking-widest font-semibold">Shared — daily</span>
          <SettingField label="Deep Work / day" value={draft.deepWorkMinPerDay} locked={!editing} onChange={v => setDraft(d => ({ ...d, deepWorkMinPerDay: v }))} unit="min"      accent="purple" />
        </div>
      </div>

      {editing && (
        <div className="flex gap-2 pt-1 border-t border-amber-500/10">
          <button onClick={handleSave}   className="flex-1 py-2 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/30 text-emerald-400 text-sm font-semibold transition-colors">Save Targets</button>
          <button onClick={handleCancel} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/40 text-sm font-semibold transition-colors">Cancel</button>
        </div>
      )}
    </div>
  )
}

interface FieldProps {
  label: string; value: number; locked: boolean
  onChange: (v: number) => void; unit: string; accent: 'emerald' | 'blue' | 'purple'
}

const A: Record<string, { text: string; border: string; bg: string }> = {
  emerald: { text: 'text-emerald-400', border: 'border-emerald-500/30', bg: 'bg-emerald-500/10' },
  blue:    { text: 'text-blue-400',    border: 'border-blue-500/30',    bg: 'bg-blue-500/10'    },
  purple:  { text: 'text-purple-400',  border: 'border-purple-500/30',  bg: 'bg-purple-500/10'  },
}

function SettingField({ label, value, locked, onChange, unit, accent }: FieldProps) {
  const s = A[accent]
  return (
    <div className={`flex flex-col gap-2 rounded-lg border p-3 ${s.border} ${s.bg}`}>
      <span className="text-xs text-white/40">{label}</span>
      <div className="flex items-baseline gap-1.5">
        {locked
          ? <span className={`text-2xl font-bold ${s.text}`}>{value}</span>
          : <input type="number" min={1} max={999} value={value}
              onChange={e => onChange(Math.max(1, parseInt(e.target.value) || 1))}
              className={`w-full bg-transparent text-2xl font-bold ${s.text} focus:outline-none border-b ${s.border} pb-0.5`} />
        }
        <span className="text-xs text-white/55">{unit}</span>
      </div>
    </div>
  )
}
