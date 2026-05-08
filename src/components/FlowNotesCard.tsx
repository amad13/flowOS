import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useUser } from './AuthGate'

// Required Supabase table (run once):
// create table flow_notes (
//   id          uuid primary key default gen_random_uuid(),
//   user_id     uuid not null references auth.users(id) on delete cascade,
//   flow        text not null,
//   content     text not null,
//   created_at  timestamptz not null default now()
// );
// create index on flow_notes (user_id, flow, created_at desc);
// alter table flow_notes enable row level security;
// create policy "own notes" on flow_notes for all using (auth.uid() = user_id);

type FlowNote = {
  id:         string
  flow:       string
  content:    string
  created_at: string
}

type FlowId = 'motion' | 'creed' | 'deen' | 'essentials'

const FLOWS: { id: FlowId; label: string }[] = [
  { id: 'motion',     label: 'Motion'     },
  { id: 'creed',      label: 'Creed'      },
  { id: 'deen',       label: 'Deen'       },
  { id: 'essentials', label: 'Essentials' },
]

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
    + ' · '
    + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function FlowNotesCard() {
  const user                           = useUser()
  const [selected, setSelected]        = useState<FlowId>('motion')
  const [notesByFlow, setNotesByFlow]  = useState<Partial<Record<FlowId, FlowNote[]>>>({})
  const [input, setInput]              = useState('')
  const [saving, setSaving]            = useState(false)
  const [loading, setLoading]          = useState(false)
  const [editingId, setEditingId]      = useState<string | null>(null)
  const tempIdRef                      = useRef(0)

  const notes = notesByFlow[selected] ?? []

  // Fetch notes for selected flow whenever it changes (cache per flow)
  useEffect(() => {
    if (!user) return
    if (notesByFlow[selected] !== undefined) return   // already loaded

    setLoading(true)
    supabase
      .from('flow_notes')
      .select('id,flow,content,created_at')
      .eq('user_id', user.id)
      .eq('flow', selected)
      .order('created_at', { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        setLoading(false)
        if (error) { console.error('[flow_notes] fetch:', error); return }
        setNotesByFlow(prev => ({ ...prev, [selected]: (data ?? []) as FlowNote[] }))
      })
  }, [user, selected]) // eslint-disable-line react-hooks/exhaustive-deps

  function setFlowNotes(flow: FlowId, updater: (prev: FlowNote[]) => FlowNote[]) {
    setNotesByFlow(prev => ({ ...prev, [flow]: updater(prev[flow] ?? []) }))
  }

  function cancelEdit() {
    setEditingId(null)
    setInput('')
  }

  async function saveNote() {
    const content = input.trim()
    if (!content || !user || saving) return

    setSaving(true)

    if (editingId !== null) {
      const id = editingId
      setFlowNotes(selected, prev =>
        prev.map(n => n.id === id ? { ...n, content } : n)
      )
      setEditingId(null)
      setInput('')
      const { error } = await supabase
        .from('flow_notes')
        .update({ content })
        .eq('id', id)
        .eq('user_id', user.id)
      setSaving(false)
      if (error) console.error('[flow_notes] update:', error)
      return
    }

    const tempId   = `__tmp_${++tempIdRef.current}`
    const tempNote: FlowNote = { id: tempId, flow: selected, content, created_at: new Date().toISOString() }
    setFlowNotes(selected, prev => [tempNote, ...prev].slice(0, 5))
    setInput('')

    const { data, error } = await supabase
      .from('flow_notes')
      .insert({ user_id: user.id, flow: selected, content })
      .select('id,flow,content,created_at')
      .single()

    setSaving(false)
    if (error) {
      console.error('[flow_notes] insert:', error)
      setFlowNotes(selected, prev => prev.filter(n => n.id !== tempId))
      return
    }
    if (data) {
      setFlowNotes(selected, prev =>
        [data as FlowNote, ...prev.filter(n => n.id !== tempId)].slice(0, 5)
      )
    }
  }

  async function deleteNote(id: string) {
    if (editingId === id) cancelEdit()
    setFlowNotes(selected, prev => prev.filter(n => n.id !== id))
    const { error } = await supabase
      .from('flow_notes').delete().eq('id', id).eq('user_id', user?.id ?? '')
    if (error) console.error('[flow_notes] delete:', error)
  }

  function startEdit(note: FlowNote) {
    setEditingId(note.id)
    setInput(note.content)
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5 flex flex-col gap-3">
      {/* Header */}
      <span className="text-xs font-semibold tracking-widest text-white/40 uppercase">Flow Notes</span>

      {/* Flow selector */}
      <div className="flex gap-1.5 flex-wrap">
        {FLOWS.map(f => (
          <button
            key={f.id}
            onClick={() => setSelected(f.id)}
            className={`px-3 py-1 rounded-lg text-[11px] font-semibold border transition-colors ${
              selected === f.id
                ? 'border-white/25 bg-white/10 text-white/70'
                : 'border-white/8 bg-transparent text-white/55 hover:text-white/50 hover:border-white/15'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex flex-col gap-2">
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void saveNote() }}
          placeholder={editingId !== null ? 'Editing note…' : `Where you left off in ${FLOWS.find(f => f.id === selected)?.label}…`}
          rows={2}
          className={`w-full bg-white/5 border rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none transition-colors resize-none ${
            editingId !== null ? 'border-white/20' : 'border-white/10 focus:border-white/20'
          }`}
        />
        <div className="flex items-center gap-2">
          <button
            onClick={() => void saveNote()}
            disabled={!input.trim() || saving}
            className={`px-4 py-2 rounded-lg text-sm font-semibold border transition-colors ${
              input.trim() && !saving
                ? 'border-white/20 text-white/55 hover:bg-white/8'
                : 'border-white/8 text-white/45 cursor-not-allowed'
            }`}
          >
            {saving ? 'Saving…' : editingId !== null ? 'Update Note' : 'Save Note'}
          </button>
          {editingId !== null && (
            <button
              onClick={cancelEdit}
              className="px-3 py-2 rounded-lg text-sm border border-white/8 text-white/40 hover:text-white/55 hover:border-white/15 transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Notes list */}
      {loading && (
        <p className="text-[10px] text-white/45 italic">Loading…</p>
      )}
      {!loading && notes.length > 0 && (
        <div className="flex flex-col gap-1.5 pt-1 border-t border-white/6">
          {notes.map(n => (
            <div
              key={n.id}
              className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border border-white/6 bg-white/3 group ${
                n.id.startsWith('__tmp_') ? 'opacity-50' : ''
              }`}
            >
              <div className="flex flex-col gap-1 flex-1 min-w-0">
                <p className="text-sm text-white/65 leading-relaxed whitespace-pre-wrap break-words">{n.content}</p>
                <span className="text-[9px] text-white/45 font-mono">{fmtDate(n.created_at)}</span>
              </div>
              {!n.id.startsWith('__tmp_') && (
                <div className="flex items-center gap-1 shrink-0 pt-0.5 sm:opacity-0 sm:group-hover:opacity-100">
                  <button
                    onClick={() => startEdit(n)}
                    className="text-white/40 hover:text-blue-400/60 transition-colors"
                    aria-label="Edit note"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => void deleteNote(n.id)}
                    className="text-white/40 hover:text-red-400/60 transition-colors"
                    aria-label="Delete note"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14H6L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4h6v2" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {!loading && notes.length === 0 && (
        <p className="text-[10px] text-white/42 italic">No notes yet for this flow.</p>
      )}
    </div>
  )
}
