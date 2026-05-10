import { useState, useEffect, useCallback, useMemo, memo } from 'react'
import ReactFlow, {
  useNodesState,
  useEdgesState,
  Background,
  BackgroundVariant,
  MiniMap,
  Controls,
  Handle,
  Position,
  MarkerType,
  type NodeProps,
  type Node,
  type Edge,
  type NodeDragHandler,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { supabase } from '../lib/supabaseClient'
import { useUser } from './AuthGate'

// ── Types ─────────────────────────────────────────────────────────────────────
type NodeStatus = 'done' | 'active' | 'locked' | 'micro' | 'abandoned'
type FlowKey    = 'motion' | 'creed' | 'deen' | 'essentials'
type FilterKey  = 'all' | FlowKey

interface DBNode {
  id: string
  title: string
  status: NodeStatus
  flow: FlowKey
  note: string
  deadline: string | null
  date_done: string | null
  is_micro_action: boolean
  position_x: number
  position_y: number
  order_index: number
}
interface DBEdge {
  id: string
  source_id: string
  target_id: string
}
type NodeData = DBNode

// ── Colours ───────────────────────────────────────────────────────────────────
const FLOW_COLOR: Record<FlowKey, string> = {
  motion: '#8B5CF6', creed: '#F43F5E', deen: '#60A5FA', essentials: '#F59E0B',
}
const FLOW_LABEL: Record<FlowKey, string> = {
  motion: 'MOT', creed: 'CRD', deen: 'DEN', essentials: 'ESS',
}
const FILTER_META: { key: FilterKey; label: string; color: string }[] = [
  { key: 'all',        label: 'All',  color: 'rgba(255,255,255,0.60)' },
  { key: 'motion',     label: 'MOT',  color: '#8B5CF6' },
  { key: 'creed',      label: 'CRD',  color: '#F43F5E' },
  { key: 'deen',       label: 'DEN',  color: '#60A5FA' },
  { key: 'essentials', label: 'ESS',  color: '#F59E0B' },
]

// ── Node visual helpers ───────────────────────────────────────────────────────
function nodeBg(s: NodeStatus) {
  if (s === 'done')      return 'rgba(124,58,237,0.15)'
  if (s === 'active')    return 'rgba(245,158,11,0.10)'
  if (s === 'micro')     return 'rgba(245,158,11,0.10)'
  if (s === 'abandoned') return 'rgba(239,68,68,0.05)'
  return 'rgba(255,255,255,0.03)'
}
function nodeBorder(s: NodeStatus, selected: boolean) {
  if (selected)          return '1.5px solid rgba(167,139,250,0.75)'
  if (s === 'done')      return '1px solid rgba(167,139,250,0.35)'
  if (s === 'active')    return '1.5px solid rgba(245,158,11,0.40)'
  if (s === 'micro')     return '1.5px solid rgba(245,158,11,0.40)'
  if (s === 'abandoned') return '1px solid rgba(239,68,68,0.15)'
  return '1px solid rgba(255,255,255,0.10)'
}
function nodeTitleColor(s: NodeStatus) {
  if (s === 'done')      return '#C4B5FD'
  if (s === 'active')    return 'rgba(245,158,11,0.9)'
  if (s === 'micro')     return 'rgba(245,158,11,0.9)'
  if (s === 'abandoned') return 'rgba(239,68,68,0.35)'
  return 'rgba(255,255,255,0.20)'
}

// ── Custom card node ──────────────────────────────────────────────────────────
const MomentumCard = memo(function MomentumCard({ data, selected }: NodeProps<NodeData>) {
  const isMicro = data.status === 'micro' || (data.status === 'active' && data.is_micro_action)
  return (
    <div style={{
      width: 180, minHeight: 70,
      background: nodeBg(data.status),
      border: nodeBorder(data.status, selected),
      borderRadius: 10,
      padding: '10px 12px',
      cursor: 'pointer',
      boxShadow: selected ? '0 0 0 3px rgba(167,139,250,0.12)' : undefined,
      transition: 'box-shadow 0.15s',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
    }}>
      <Handle type="target" position={Position.Left}
        style={{ background: 'rgba(167,139,250,0.5)', border: 'none', width: 6, height: 6 }} />
      <Handle type="source" position={Position.Right}
        style={{ background: 'rgba(167,139,250,0.5)', border: 'none', width: 6, height: 6 }} />

      {/* Badge row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
          padding: '1px 5px', borderRadius: 4,
          background: 'rgba(255,255,255,0.07)',
          color: FLOW_COLOR[data.flow],
        }}>
          {FLOW_LABEL[data.flow]}
        </span>
        <span>
          {data.status === 'done'      && <span style={{ color: 'rgba(167,139,250,0.7)',  fontSize: 11 }}>✓</span>}
          {data.status === 'locked'    && <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>🔒</span>}
          {data.status === 'abandoned' && <span style={{ color: 'rgba(239,68,68,0.35)',  fontSize: 11 }}>×</span>}
          {data.status === 'active' && !isMicro && (
            <span style={{
              display: 'inline-block', width: 7, height: 7, borderRadius: '50%',
              background: 'rgba(245,158,11,0.9)', boxShadow: '0 0 6px rgba(245,158,11,0.5)',
            }} className="animate-pulse" />
          )}
          {isMicro && <span style={{ fontSize: 11 }}>⚡</span>}
        </span>
      </div>

      {/* Title */}
      <div style={{
        color: nodeTitleColor(data.status),
        fontSize: 11.5, fontWeight: 600, lineHeight: 1.35,
        textDecoration: data.status === 'abandoned' ? 'line-through' : 'none',
      }}>
        {data.title}
      </div>

      {/* Meta */}
      {data.date_done && (
        <div style={{ color: 'rgba(167,139,250,0.55)', fontSize: 9.5, marginTop: 5 }}>
          Done {data.date_done}
        </div>
      )}
      {data.deadline && !data.date_done && (
        <div style={{ color: 'rgba(245,158,11,0.60)', fontSize: 9.5, marginTop: 5 }}>
          Due {data.deadline}
        </div>
      )}
      {data.note && (
        <div style={{ color: 'rgba(255,255,255,0.32)', fontSize: 9.5, marginTop: 5, lineHeight: 1.4 }}>
          {data.note.length > 65 ? data.note.slice(0, 65) + '…' : data.note}
        </div>
      )}
    </div>
  )
})

const nodeTypes = { momentum: MomentumCard }

// ── Edge helpers ──────────────────────────────────────────────────────────────
function edgeForStatus(s: NodeStatus): Pick<Edge, 'style' | 'markerEnd'> {
  if (s === 'done') return {
    style:     { stroke: 'rgba(167,139,250,0.40)', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(167,139,250,0.40)' },
  }
  if (s === 'active' || s === 'micro') return {
    style:     { stroke: 'rgba(245,158,11,0.35)', strokeWidth: 1.5, strokeDasharray: '5 4' },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(245,158,11,0.35)' },
  }
  return {
    style:     { stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'rgba(255,255,255,0.08)' },
  }
}

function toRFNode(n: DBNode): Node<NodeData> {
  return { id: n.id, type: 'momentum', position: { x: n.position_x, y: n.position_y }, data: n }
}
function toRFEdge(e: DBEdge, srcStatus: NodeStatus): Edge {
  return { id: e.id, source: e.source_id, target: e.target_id, ...edgeForStatus(srcStatus) }
}

// ── Seed data ─────────────────────────────────────────────────────────────────
const SEED_NODES: Omit<DBNode, 'id'>[] = [
  { title: 'Niche lock — Isolation QC inbound', flow: 'motion', status: 'done',   order_index: 1, note: 'Locked Apr 28. Loi 72 angle confirmed.',    position_x: 100, position_y: 200, deadline: null,         date_done: '2026-04-28', is_micro_action: false },
  { title: 'CRM pivot — Supabase + Lovable',    flow: 'motion', status: 'done',   order_index: 2, note: 'Built and delivered Apr 29 - May 2.',         position_x: 320, position_y: 200, deadline: null,         date_done: '2026-05-02', is_micro_action: false },
  { title: '100 prospects sourced',              flow: 'motion', status: 'done',   order_index: 3, note: 'QC insulation companies list complete.',       position_x: 540, position_y: 120, deadline: null,         date_done: '2026-05-04', is_micro_action: false },
  { title: 'Loom demo + Decision page',          flow: 'motion', status: 'active', order_index: 4, note: 'CI-1 deadline May 12. Record today.',          position_x: 540, position_y: 280, deadline: '2026-05-12', date_done: null,         is_micro_action: true  },
  { title: 'First outreach — 700 contacts',      flow: 'motion', status: 'locked', order_index: 5, note: 'Unlocks after Loom demo is live.',             position_x: 760, position_y: 120, deadline: null,         date_done: null,         is_micro_action: false },
  { title: 'First serious conversation',         flow: 'motion', status: 'locked', order_index: 6, note: '',                                             position_x: 760, position_y: 280, deadline: null,         date_done: null,         is_micro_action: false },
  { title: 'Client signed — $1,500 setup',      flow: 'motion', status: 'locked', order_index: 7, note: '',                                             position_x: 980, position_y: 200, deadline: null,         date_done: null,         is_micro_action: false },
]
const SEED_EDGE_PAIRS: [number, number][] = [[0,1],[1,2],[1,3],[2,4],[3,4],[4,5],[5,6]]

async function seedData(userId: string): Promise<{ nodes: DBNode[]; edges: DBEdge[] }> {
  const { data: inserted, error } = await supabase
    .from('momentum_nodes')
    .insert(SEED_NODES.map(n => ({ ...n, user_id: userId })))
    .select('id,title,status,flow,note,deadline,date_done,is_micro_action,position_x,position_y,order_index')
  if (error || !inserted) { console.error('[momentum] seed nodes:', error); return { nodes: [], edges: [] } }
  const nodes = inserted as DBNode[]
  const edgeRows = SEED_EDGE_PAIRS.map(([si, ti]) => ({
    user_id: userId, source_id: nodes[si].id, target_id: nodes[ti].id,
  }))
  const { data: edgesData, error: ee } = await supabase
    .from('momentum_edges').insert(edgeRows).select('id,source_id,target_id')
  if (ee) console.error('[momentum] seed edges:', ee)
  return { nodes, edges: (edgesData ?? []) as DBEdge[] }
}

// ── Sub-components ────────────────────────────────────────────────────────────
function FilterBar({ filter, setFilter }: { filter: FilterKey; setFilter: (f: FilterKey) => void }) {
  return (
    <div className="flex items-center gap-1 flex-wrap">
      {FILTER_META.map(f => (
        <button key={f.key} onClick={() => setFilter(f.key)}
          style={{
            color:       filter === f.key ? f.color : 'rgba(255,255,255,0.28)',
            borderColor: filter === f.key ? f.color : 'rgba(255,255,255,0.10)',
            background:  filter === f.key ? `${f.color}18` : 'transparent',
          }}
          className="text-[10px] font-bold px-2.5 py-1 rounded-lg border transition-colors">
          {f.label}
        </button>
      ))}
    </div>
  )
}

interface Stats { done: number; active: number; locked: number; total: number; pct: number }
function StatsBar({ stats }: { stats: Stats }) {
  return (
    <div className="flex items-center gap-5 px-1">
      <span className="text-[11px] font-semibold text-violet-400">{stats.done} done</span>
      <span className="text-[11px] font-semibold text-amber-400">{stats.active} active</span>
      <span className="text-[11px] font-semibold text-white/30">{stats.locked} locked</span>
      <div className="flex-1 h-px rounded-full bg-white/8 overflow-hidden">
        <div className="h-full rounded-full bg-violet-500/50 transition-all duration-500" style={{ width: `${stats.pct}%` }} />
      </div>
      <span className="text-[11px] font-mono text-white/40">{stats.pct}% complete</span>
    </div>
  )
}

interface SidePanelProps {
  node: DBNode
  childNodes: DBNode[]
  onUpdateStatus: (id: string, s: NodeStatus) => Promise<void>
  onUpdateField: (id: string, f: 'title' | 'note', v: string) => void
  onSaveField: (id: string, f: 'title' | 'note', v: string) => Promise<void>
  onDelete: () => void
  onClose: () => void
  deleteConfirm: boolean
  setDeleteConfirm: (v: boolean) => void
  onConfirmDelete: () => Promise<void>
}

function SidePanel({ node, childNodes, onUpdateStatus, onUpdateField, onSaveField, onDelete, onClose, deleteConfirm, setDeleteConfirm, onConfirmDelete }: SidePanelProps) {
  const fc = FLOW_COLOR[node.flow]
  const STATUS_BTNS: { s: NodeStatus; label: string; cls: string }[] = [
    { s: 'done',      label: 'Mark Done',  cls: 'border-violet-500/30 text-violet-400 hover:bg-violet-500/15' },
    { s: 'active',    label: 'Set Active', cls: 'border-amber-500/30  text-amber-400  hover:bg-amber-500/15'  },
    { s: 'locked',    label: 'Lock',       cls: 'border-white/12      text-white/40   hover:bg-white/8'        },
    { s: 'abandoned', label: 'Abandon',    cls: 'border-red-500/25    text-red-400/60 hover:bg-red-500/10'    },
  ]

  return (
    <div className="fixed right-0 top-0 h-full w-80 z-40 flex flex-col overflow-y-auto"
      style={{ background: '#0D0D12', borderLeft: '1px solid rgba(255,255,255,0.08)' }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/6">
        <span style={{ color: fc, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          background: 'rgba(255,255,255,0.07)', padding: '2px 7px', borderRadius: 5 }}>
          {FLOW_LABEL[node.flow]}
        </span>
        <button onClick={onClose} className="text-white/30 hover:text-white/60 transition-colors text-lg leading-none">×</button>
      </div>

      <div className="flex flex-col gap-5 px-4 py-4">
        {/* Title (editable) */}
        <div className="flex flex-col gap-1">
          <span className="text-[9px] font-semibold tracking-widest text-white/35 uppercase">Title</span>
          <input
            value={node.title}
            onChange={e => onUpdateField(node.id, 'title', e.target.value)}
            onBlur={e => onSaveField(node.id, 'title', e.target.value)}
            className="bg-transparent text-white/80 text-sm font-semibold focus:outline-none border-b border-white/10 focus:border-violet-500/40 pb-1 transition-colors"
          />
        </div>

        {/* Status */}
        <div className="flex flex-col gap-2">
          <span className="text-[9px] font-semibold tracking-widest text-white/35 uppercase">Status</span>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_BTNS.map(b => (
              <button key={b.s}
                onClick={() => onUpdateStatus(node.id, b.s)}
                disabled={node.status === b.s}
                className={`text-[10px] font-semibold px-2.5 py-1 rounded-lg border transition-colors disabled:opacity-40 ${b.cls}`}>
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* Note (editable) */}
        <div className="flex flex-col gap-1">
          <span className="text-[9px] font-semibold tracking-widest text-white/35 uppercase">Note</span>
          <textarea
            value={node.note}
            maxLength={200}
            rows={3}
            onChange={e => onUpdateField(node.id, 'note', e.target.value)}
            onBlur={e => onSaveField(node.id, 'note', e.target.value)}
            placeholder="Add context…"
            className="bg-white/3 text-white/60 text-xs rounded-lg border border-white/8 focus:border-violet-500/30 focus:outline-none p-2.5 resize-none transition-colors placeholder:text-white/20"
          />
        </div>

        {/* Deadline / date_done */}
        {node.deadline && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-semibold tracking-widest text-white/35 uppercase">Deadline</span>
            <span className="text-xs text-amber-400/70">{node.deadline}</span>
          </div>
        )}
        {node.date_done && (
          <div className="flex flex-col gap-0.5">
            <span className="text-[9px] font-semibold tracking-widest text-white/35 uppercase">Completed</span>
            <span className="text-xs text-violet-400/70">{node.date_done}</span>
          </div>
        )}
        {node.is_micro_action && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs">⚡</span>
            <span className="text-xs text-amber-400/70 font-medium">Micro-action</span>
          </div>
        )}

        {/* Unlocks */}
        {childNodes.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-[9px] font-semibold tracking-widest text-white/35 uppercase">This unlocks…</span>
            {childNodes.map(c => (
              <div key={c.id} className="flex items-center gap-2 text-xs text-white/45">
                <span style={{ color: FLOW_COLOR[c.flow], fontSize: 9, fontWeight: 700 }}>{FLOW_LABEL[c.flow]}</span>
                <span className="truncate">{c.title}</span>
              </div>
            ))}
          </div>
        )}

        {/* Delete */}
        <div className="pt-2 border-t border-white/6">
          {!deleteConfirm ? (
            <button onClick={onDelete}
              className="text-[10px] font-semibold text-red-400/50 hover:text-red-400 transition-colors">
              Delete node
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] text-white/50">Are you sure? This removes all connections too.</span>
              <div className="flex gap-2">
                <button onClick={onConfirmDelete}
                  className="flex-1 py-1.5 text-[10px] font-semibold rounded-lg bg-red-500/15 border border-red-500/25 text-red-400 hover:bg-red-500/25 transition-colors">
                  Delete
                </button>
                <button onClick={() => setDeleteConfirm(false)}
                  className="px-3 py-1.5 text-[10px] font-semibold rounded-lg bg-white/5 border border-white/10 text-white/40 hover:bg-white/8 transition-colors">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface AddNodeForm {
  title: string; flow: FlowKey; status: NodeStatus
  note: string; deadline: string; is_micro_action: boolean; parent_ids: string[]
}
interface AddNodeModalProps {
  existingNodes: DBNode[]
  onSave: (f: AddNodeForm) => Promise<void>
  onClose: () => void
}

function AddNodeModal({ existingNodes, onSave, onClose }: AddNodeModalProps) {
  const [form, setForm] = useState<AddNodeForm>({
    title: '', flow: 'motion', status: 'active', note: '', deadline: '', is_micro_action: false, parent_ids: [],
  })
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof AddNodeForm>(k: K, v: AddNodeForm[K]) => setForm(f => ({ ...f, [k]: v }))

  async function handleSave() {
    if (!form.title.trim()) return
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  function toggleParent(id: string) {
    set('parent_ids', form.parent_ids.includes(id)
      ? form.parent_ids.filter(p => p !== id)
      : [...form.parent_ids, id])
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0D0D14] flex flex-col gap-5 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="text-white/80 font-semibold text-sm">Add Node</span>
          <button onClick={onClose} className="text-white/30 hover:text-white/60 text-lg leading-none">×</button>
        </div>

        {/* Title */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] font-semibold tracking-widest text-white/35 uppercase">Title *</label>
          <input value={form.title} onChange={e => set('title', e.target.value)}
            placeholder="What's the action?"
            className="bg-white/4 text-white/80 text-sm rounded-lg border border-white/10 focus:border-violet-500/40 focus:outline-none px-3 py-2 placeholder:text-white/20" />
        </div>

        {/* Flow + Status */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-semibold tracking-widest text-white/35 uppercase">Flow *</label>
            <select value={form.flow} onChange={e => set('flow', e.target.value as FlowKey)}
              className="bg-white/4 text-white/70 text-xs rounded-lg border border-white/10 focus:outline-none px-2.5 py-2">
              <option value="motion">Motion</option>
              <option value="creed">Creed</option>
              <option value="deen">Deen</option>
              <option value="essentials">Essentials</option>
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-semibold tracking-widest text-white/35 uppercase">Status *</label>
            <select value={form.status} onChange={e => set('status', e.target.value as NodeStatus)}
              className="bg-white/4 text-white/70 text-xs rounded-lg border border-white/10 focus:outline-none px-2.5 py-2">
              <option value="active">Active</option>
              <option value="done">Done</option>
              <option value="locked">Locked</option>
              <option value="micro">Micro</option>
              <option value="abandoned">Abandoned</option>
            </select>
          </div>
        </div>

        {/* Note */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[9px] font-semibold tracking-widest text-white/35 uppercase">Note (optional)</label>
          <textarea value={form.note} maxLength={200} rows={2}
            onChange={e => set('note', e.target.value)}
            placeholder="Short context…"
            className="bg-white/4 text-white/60 text-xs rounded-lg border border-white/10 focus:border-violet-500/30 focus:outline-none px-3 py-2 resize-none placeholder:text-white/20" />
        </div>

        {/* Deadline + Micro */}
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[9px] font-semibold tracking-widest text-white/35 uppercase">Deadline</label>
            <input type="date" value={form.deadline} onChange={e => set('deadline', e.target.value)}
              className="bg-white/4 text-white/50 text-xs rounded-lg border border-white/10 focus:outline-none px-2.5 py-2" />
          </div>
          <div className="flex flex-col gap-1.5 justify-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <div onClick={() => set('is_micro_action', !form.is_micro_action)}
                className={`w-8 h-4 rounded-full transition-colors flex items-center ${form.is_micro_action ? 'bg-amber-500/60' : 'bg-white/10'}`}>
                <div className={`w-3 h-3 rounded-full bg-white transition-transform mx-0.5 ${form.is_micro_action ? 'translate-x-4' : ''}`} />
              </div>
              <span className="text-[10px] text-white/45">⚡ Micro-action</span>
            </label>
          </div>
        </div>

        {/* Connects from */}
        {existingNodes.length > 0 && (
          <div className="flex flex-col gap-2">
            <label className="text-[9px] font-semibold tracking-widest text-white/35 uppercase">Connects from (parents)</label>
            <div className="flex flex-col gap-1 max-h-28 overflow-y-auto">
              {existingNodes.map(n => (
                <label key={n.id} className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.parent_ids.includes(n.id)}
                    onChange={() => toggleParent(n.id)}
                    className="accent-violet-500" />
                  <span style={{ color: FLOW_COLOR[n.flow], fontSize: 9, fontWeight: 700 }}>{FLOW_LABEL[n.flow]}</span>
                  <span className="text-xs text-white/50 truncate">{n.title}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1 border-t border-white/6">
          <button onClick={handleSave} disabled={!form.title.trim() || saving}
            className="flex-1 py-2 rounded-lg bg-violet-600/20 hover:bg-violet-600/35 border border-violet-500/30 text-violet-400 text-xs font-semibold transition-colors disabled:opacity-40">
            {saving ? 'Saving…' : 'Add Node'}
          </button>
          <button onClick={onClose}
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/40 text-xs font-semibold hover:bg-white/8 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}

function BackOnTrackOverlay({ node, onMarkDone, onDismiss }: { node: DBNode | null; onMarkDone: () => Promise<void>; onDismiss: () => void }) {
  const [marking, setMarking] = useState(false)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm rounded-2xl border border-amber-500/20 bg-[#0D0D14] flex flex-col gap-4 p-6 shadow-2xl">
        <div className="flex items-center gap-2">
          <span className="text-lg">⚡</span>
          <span className="text-white/70 font-semibold text-sm">Back on track</span>
        </div>

        {node ? (
          <>
            <div className="flex flex-col gap-2">
              <span style={{ color: FLOW_COLOR[node.flow], fontSize: 9, fontWeight: 700,
                background: 'rgba(255,255,255,0.07)', padding: '2px 7px', borderRadius: 5,
                display: 'inline-block', alignSelf: 'flex-start' }}>
                {FLOW_LABEL[node.flow]}
              </span>
              <div className="text-white/85 font-bold text-base leading-snug">{node.title}</div>
              {node.note && <div className="text-white/45 text-sm">{node.note}</div>}
              {node.deadline && <div className="text-amber-400/60 text-xs">Due {node.deadline}</div>}
            </div>
            <div className="flex gap-2 pt-2 border-t border-white/6">
              <button onClick={async () => { setMarking(true); await onMarkDone(); setMarking(false) }}
                disabled={marking}
                className="flex-1 py-2 rounded-lg bg-violet-600/20 hover:bg-violet-600/35 border border-violet-500/30 text-violet-400 text-xs font-semibold transition-colors disabled:opacity-40">
                {marking ? 'Marking…' : 'Mark Done'}
              </button>
              <button onClick={onDismiss}
                className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/40 text-xs font-semibold hover:bg-white/8 transition-colors">
                Dismiss
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-white/45 text-sm leading-relaxed">
              No micro-action set. Add a node and mark it as micro-action to use this feature.
            </p>
            <button onClick={onDismiss}
              className="self-start px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-white/40 text-xs font-semibold hover:bg-white/8 transition-colors">
              Dismiss
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────
export default function MomentumGraph() {
  const user = useUser()

  const [dbNodes,  setDbNodes]  = useState<DBNode[]>([])
  const [dbEdges,  setDbEdges]  = useState<DBEdge[]>([])
  const [loading,  setLoading]  = useState(true)
  const [filter,   setFilter]   = useState<FilterKey>('all')
  const [selectedId,    setSelectedId]    = useState<string | null>(null)
  const [showAdd,       setShowAdd]       = useState(false)
  const [showBOT,       setShowBOT]       = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [isMobile,      setIsMobile]      = useState(typeof window !== 'undefined' && window.innerWidth < 768)

  const [rfNodes, setRfNodes, onNodesChange] = useNodesState<NodeData>([])
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([])

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // ── Load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    let cancelled = false
    async function load() {
      setLoading(true)
      const [{ data: nd, error: ne }, { data: ed, error: ee }] = await Promise.all([
        supabase.from('momentum_nodes')
          .select('id,title,status,flow,note,deadline,date_done,is_micro_action,position_x,position_y,order_index')
          .eq('user_id', user.id).order('order_index'),
        supabase.from('momentum_edges')
          .select('id,source_id,target_id').eq('user_id', user.id),
      ])
      if (ne) console.error('[momentum] nodes:', ne)
      if (ee) console.error('[momentum] edges:', ee)
      if (cancelled) return
      const nodes: DBNode[] = (nd ?? []) as DBNode[]
      const edges: DBEdge[] = (ed ?? []) as DBEdge[]
      if (nodes.length === 0) {
        const seeded = await seedData(user.id)
        if (!cancelled) { setDbNodes(seeded.nodes); setDbEdges(seeded.edges) }
      } else {
        setDbNodes(nodes); setDbEdges(edges)
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [user])

  // ── Sync DB → RF (with filter opacity) ───────────────────────────────────
  useEffect(() => {
    const nodeMap = new Map(dbNodes.map(n => [n.id, n]))
    setRfNodes(dbNodes.map(n => ({
      ...toRFNode(n),
      style: { opacity: filter === 'all' || n.flow === filter ? 1 : 0.10, transition: 'opacity 0.2s' },
    })))
    setRfEdges(dbEdges.map(e => {
      const src = nodeMap.get(e.source_id)
      const tgt = nodeMap.get(e.target_id)
      const sm = filter === 'all' || src?.flow === filter
      const tm = filter === 'all' || tgt?.flow === filter
      const opacity = sm && tm ? 1 : (sm || tm) ? 0.20 : 0.06
      const base = edgeForStatus(src?.status ?? 'locked')
      return { ...toRFEdge(e, src?.status ?? 'locked'), style: { ...base.style, opacity } }
    }))
  }, [dbNodes, dbEdges, filter, setRfNodes, setRfEdges])

  // ── Drag stop → save position ─────────────────────────────────────────────
  const onDragStop: NodeDragHandler = useCallback((_evt, node) => {
    if (!user) return
    const { x, y } = node.position
    setDbNodes(prev => prev.map(n => n.id === node.id ? { ...n, position_x: x, position_y: y } : n))
    supabase.from('momentum_nodes')
      .update({ position_x: x, position_y: y })
      .eq('id', node.id).eq('user_id', user.id)
      .then(({ error }) => { if (error) console.error('[momentum] drag save:', error) })
  }, [user])

  // ── Selected node ─────────────────────────────────────────────────────────
  const selectedNode = useMemo(() => dbNodes.find(n => n.id === selectedId) ?? null, [dbNodes, selectedId])

  const childNodes = useMemo(() =>
    dbEdges
      .filter(e => e.source_id === selectedId)
      .map(e => dbNodes.find(n => n.id === e.target_id))
      .filter((n): n is DBNode => Boolean(n)),
    [dbEdges, selectedId, dbNodes],
  )

  // ── Stats ─────────────────────────────────────────────────────────────────
  const stats = useMemo<Stats>(() => {
    const done   = dbNodes.filter(n => n.status === 'done').length
    const active = dbNodes.filter(n => n.status === 'active' || n.status === 'micro').length
    const locked = dbNodes.filter(n => n.status === 'locked').length
    const total  = dbNodes.length
    return { done, active, locked, total, pct: total > 0 ? Math.round(done / total * 100) : 0 }
  }, [dbNodes])

  // ── Back on track node ────────────────────────────────────────────────────
  const botNode = useMemo(() =>
    dbNodes
      .filter(n => n.is_micro_action && (n.status === 'active' || n.status === 'micro'))
      .sort((a, b) => a.order_index - b.order_index)[0] ?? null,
    [dbNodes],
  )

  // ── Status update ─────────────────────────────────────────────────────────
  async function updateStatus(id: string, status: NodeStatus) {
    if (!user) return
    const patch: Partial<DBNode> = { status }
    if (status === 'done') patch.date_done = new Date().toISOString().slice(0, 10)
    setDbNodes(prev => prev.map(n => n.id === id ? { ...n, ...patch } : n))
    const { error } = await supabase.from('momentum_nodes')
      .update(patch).eq('id', id).eq('user_id', user.id)
    if (error) console.error('[momentum] update status:', error)
  }

  // ── Inline field edit ─────────────────────────────────────────────────────
  function updateField(id: string, field: 'title' | 'note', value: string) {
    setDbNodes(prev => prev.map(n => n.id === id ? { ...n, [field]: value } : n))
  }
  async function saveField(id: string, field: 'title' | 'note', value: string) {
    if (!user) return
    const { error } = await supabase.from('momentum_nodes')
      .update({ [field]: value }).eq('id', id).eq('user_id', user.id)
    if (error) console.error('[momentum] save field:', error)
  }

  // ── Delete node ───────────────────────────────────────────────────────────
  async function deleteNode(id: string) {
    if (!user) return
    setDbNodes(prev => prev.filter(n => n.id !== id))
    setDbEdges(prev => prev.filter(e => e.source_id !== id && e.target_id !== id))
    setSelectedId(null); setDeleteConfirm(false)
    await supabase.from('momentum_nodes').delete().eq('id', id).eq('user_id', user.id)
  }

  // ── Add node ──────────────────────────────────────────────────────────────
  async function addNode(form: {
    title: string; flow: FlowKey; status: NodeStatus
    note: string; deadline: string; is_micro_action: boolean; parent_ids: string[]
  }) {
    if (!user) return
    const parents   = dbNodes.filter(n => form.parent_ids.includes(n.id))
    const px = parents.length > 0 ? Math.max(...parents.map(p => p.position_x)) + 220 : 100
    const py = parents.length > 0 ? parents.reduce((s, p) => s + p.position_y, 0) / parents.length : 200
    const maxOrder  = Math.max(0, ...dbNodes.map(n => n.order_index))

    const { data, error } = await supabase.from('momentum_nodes')
      .insert({
        user_id: user.id, title: form.title, flow: form.flow, status: form.status,
        note: form.note, deadline: form.deadline || null, is_micro_action: form.is_micro_action,
        position_x: px, position_y: py, order_index: maxOrder + 1,
        date_done: form.status === 'done' ? new Date().toISOString().slice(0, 10) : null,
      })
      .select('id,title,status,flow,note,deadline,date_done,is_micro_action,position_x,position_y,order_index')
      .single()
    if (error || !data) { console.error('[momentum] add node:', error); return }
    const newNode = data as DBNode
    setDbNodes(prev => [...prev, newNode])

    if (form.parent_ids.length > 0) {
      const rows = form.parent_ids.map(pid => ({ user_id: user.id, source_id: pid, target_id: newNode.id }))
      const { data: ed, error: ee } = await supabase.from('momentum_edges').insert(rows).select('id,source_id,target_id')
      if (ee) console.error('[momentum] add edges:', ee)
      if (ed) setDbEdges(prev => [...prev, ...(ed as DBEdge[])])
    }
    setShowAdd(false)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-white/25 text-sm">
        Loading momentum graph…
      </div>
    )
  }

  // Mobile: list view
  if (isMobile) {
    const filtered = filter === 'all' ? dbNodes : dbNodes.filter(n => n.flow === filter)
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <FilterBar filter={filter} setFilter={setFilter} />
          <button onClick={() => setShowAdd(true)}
            className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-violet-500/30 bg-violet-500/10 text-violet-400">
            + Add
          </button>
        </div>
        <div className="flex flex-col gap-2">
          {filtered.map(n => (
            <div key={n.id} onClick={() => setSelectedId(selectedId === n.id ? null : n.id)}
              className="rounded-xl border p-3 cursor-pointer"
              style={{ background: nodeBg(n.status), border: nodeBorder(n.status, selectedId === n.id) }}>
              <div className="flex items-center gap-2 mb-1.5">
                <span style={{ color: FLOW_COLOR[n.flow], fontSize: 9, fontWeight: 700 }}>{FLOW_LABEL[n.flow]}</span>
                {n.is_micro_action && <span className="text-xs">⚡</span>}
              </div>
              <div style={{ color: nodeTitleColor(n.status), fontSize: 13, fontWeight: 600,
                textDecoration: n.status === 'abandoned' ? 'line-through' : 'none' }}>
                {n.title}
              </div>
              {n.note && <div className="text-white/35 text-xs mt-1">{n.note}</div>}
            </div>
          ))}
        </div>
        <StatsBar stats={stats} />
        {selectedId && selectedNode && (
          <SidePanel node={selectedNode} childNodes={childNodes}
            onUpdateStatus={updateStatus} onUpdateField={updateField} onSaveField={saveField}
            onDelete={() => setDeleteConfirm(true)} onClose={() => setSelectedId(null)}
            deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm}
            onConfirmDelete={() => deleteNode(selectedId)} />
        )}
        {showAdd && <AddNodeModal existingNodes={dbNodes} onSave={addNode} onClose={() => setShowAdd(false)} />}
        {showBOT && <BackOnTrackOverlay node={botNode}
          onMarkDone={async () => { if (botNode) await updateStatus(botNode.id, 'done'); setShowBOT(false) }}
          onDismiss={() => setShowBOT(false)} />}
      </div>
    )
  }

  // Desktop: canvas view
  return (
    <div className="flex flex-col gap-3">
      {/* Top bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <span className="text-white/75 font-semibold text-sm tracking-wide">Momentum Graph</span>
          <FilterBar filter={filter} setFilter={setFilter} />
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowBOT(true)}
            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border border-amber-500/30 bg-amber-500/8 text-amber-400 hover:bg-amber-500/18 transition-colors">
            ⚡ Back on track
          </button>
          <button onClick={() => setShowAdd(true)}
            className="text-[10px] font-bold px-3 py-1.5 rounded-lg border border-violet-500/30 bg-violet-500/8 text-violet-400 hover:bg-violet-500/18 transition-colors">
            + Add Node
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="rounded-xl overflow-hidden border border-white/8" style={{ height: 580, background: '#0F0F14' }}>
        <ReactFlow
          nodes={rfNodes} edges={rfEdges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onNodeDragStop={onDragStop}
          onNodeClick={(_e, node) => {
            setSelectedId(prev => prev === node.id ? null : node.id)
            setDeleteConfirm(false)
          }}
          onPaneClick={() => setSelectedId(null)}
          nodeTypes={nodeTypes}
          fitView fitViewOptions={{ padding: 0.18 }}
          style={{ background: '#0F0F14' }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="rgba(255,255,255,0.035)" gap={28} size={1} variant={BackgroundVariant.Dots} />
          <MiniMap
            style={{ background: '#0A0A10', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8 }}
            nodeColor={n => FLOW_COLOR[(n.data as NodeData).flow] ?? '#555'}
            maskColor="rgba(0,0,0,0.65)"
          />
          <Controls style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
          }} />
        </ReactFlow>
      </div>

      {/* Stats */}
      <StatsBar stats={stats} />

      {/* Side panel overlay */}
      {selectedId && selectedNode && (
        <SidePanel node={selectedNode} childNodes={childNodes}
          onUpdateStatus={updateStatus} onUpdateField={updateField} onSaveField={saveField}
          onDelete={() => setDeleteConfirm(true)} onClose={() => setSelectedId(null)}
          deleteConfirm={deleteConfirm} setDeleteConfirm={setDeleteConfirm}
          onConfirmDelete={() => deleteNode(selectedId)} />
      )}

      {/* Modals */}
      {showAdd && <AddNodeModal existingNodes={dbNodes} onSave={addNode} onClose={() => setShowAdd(false)} />}
      {showBOT && (
        <BackOnTrackOverlay node={botNode}
          onMarkDone={async () => { if (botNode) await updateStatus(botNode.id, 'done'); setShowBOT(false) }}
          onDismiss={() => setShowBOT(false)} />
      )}
    </div>
  )
}
