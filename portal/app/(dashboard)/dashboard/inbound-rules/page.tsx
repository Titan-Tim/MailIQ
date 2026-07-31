'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { Route, Plus, Trash2, Loader2, ArrowRight, Pencil, X } from 'lucide-react'

const DOC_TYPES = ['', 'invoice', 'statement', 'legal', 'hr', 'general']
const empty = { name: '', priority: 0, matchType: 'ANY', documentType: '', keyword: '', targetMailboxId: '' }

export default function InboundRulesPage() {
  const [rules, setRules] = useState<any[]>([])
  const [mailboxes, setMailboxes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<any>(empty)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const [r, m] = await Promise.all([
      apiFetch('/api/inbound/rules'),
      apiFetch('/api/inbound/mailboxes'),
    ])
    setRules(r.rules)
    setMailboxes(m.mailboxes)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function startEdit(r: any) {
    setForm({
      name: r.name, priority: r.priority || 0, matchType: r.matchType || 'ANY',
      documentType: r.documentType || '', keyword: r.keyword || '',
      targetMailboxId: r.targetMailboxId || r.targetMailbox?.id || '',
    })
    setEditingId(r.id); setError('')
  }
  function cancelEdit() { setForm(empty); setEditingId(null); setError('') }

  async function save() {
    if (!form.name) { setError('Name is required'); return }
    if (!form.documentType && !form.keyword) { setError('Set a document type and/or a keyword to match'); return }
    if (!form.targetMailboxId) { setError('Choose a target mailbox'); return }
    setBusy(true); setError('')
    try {
      if (editingId) await apiFetch(`/api/inbound/rules/${editingId}`, { method: 'PUT', body: JSON.stringify(form) })
      else await apiFetch('/api/inbound/rules', { method: 'POST', body: JSON.stringify(form) })
      cancelEdit()
      await load()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  async function remove(id: string) {
    if (editingId === id) cancelEdit()
    await apiFetch(`/api/inbound/rules/${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Routing Rules</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Route inbound post to a mailbox by document type and/or keyword. Higher priority wins.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* List */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">{rules.length} rule{rules.length === 1 ? '' : 's'}</h2>
          </div>
          {loading ? (
            <p className="px-5 py-8 text-center text-gray-400 text-sm">Loading…</p>
          ) : rules.length === 0 ? (
            <p className="px-5 py-8 text-center text-gray-400 text-sm">
              No rules yet. Unmatched post falls back to keyword matching, then the default mailbox, then triage.
            </p>
          ) : (
            <div className="divide-y divide-gray-100">
              {rules.map((r) => (
                <div key={r.id} className={`flex items-center gap-3 px-5 py-3 ${editingId === r.id ? 'bg-violet-50/60' : ''}`}>
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-xs font-bold text-gray-500">
                    {r.priority}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{r.name}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                      {r.documentType && <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">type: {r.documentType}</span>}
                      {r.documentType && r.keyword && <span className="text-gray-300">{r.matchType}</span>}
                      {r.keyword && <span className="bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded">&ldquo;{r.keyword}&rdquo;</span>}
                      <ArrowRight size={11} className="text-gray-300" />
                      <span className="font-medium text-gray-600">{r.targetMailbox?.name || '— no mailbox'}</span>
                    </p>
                  </div>
                  <button onClick={() => startEdit(r)} className={`transition-colors ${editingId === r.id ? 'text-violet-700' : 'text-gray-300 hover:text-violet-700'}`} title="Edit rule">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => remove(r.id)} className="text-gray-300 hover:text-red-600 transition-colors" title="Delete rule">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add form */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 h-fit">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">{editingId ? 'Edit rule' : 'Add rule'}</h3>
            {editingId && <button onClick={cancelEdit} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"><X size={12} /> Cancel</button>}
          </div>
          <div className="space-y-3">
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500"
              placeholder="Rule name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div className="flex gap-2">
              <select className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500"
                value={form.documentType} onChange={(e) => setForm({ ...form, documentType: e.target.value })}>
                {DOC_TYPES.map((t) => <option key={t} value={t}>{t || 'any type'}</option>)}
              </select>
              <select className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500"
                value={form.matchType} onChange={(e) => setForm({ ...form, matchType: e.target.value })}>
                <option value="ANY">ANY</option>
                <option value="ALL">ALL</option>
              </select>
            </div>
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500"
              placeholder="Keyword (optional)" value={form.keyword} onChange={(e) => setForm({ ...form, keyword: e.target.value })} />
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500"
              value={form.targetMailboxId} onChange={(e) => setForm({ ...form, targetMailboxId: e.target.value })}>
              <option value="">Route to mailbox…</option>
              {mailboxes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <input type="number" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500"
              placeholder="Priority (higher wins)" value={form.priority} onChange={(e) => setForm({ ...form, priority: +e.target.value })} />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button onClick={save} disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-violet-700 hover:bg-violet-800 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {busy ? <Loader2 size={15} className="animate-spin" /> : editingId ? <Pencil size={15} /> : <Plus size={15} />} {editingId ? 'Save changes' : 'Add rule'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
