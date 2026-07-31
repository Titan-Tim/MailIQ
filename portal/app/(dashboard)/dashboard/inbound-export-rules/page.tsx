'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { FolderOutput, Plus, Trash2, Loader2, ArrowRight, Pencil, X } from 'lucide-react'

const DOC_TYPES = ['', 'invoice', 'statement', 'legal', 'hr', 'general']
const empty = { name: '', matchKeyword: '', matchDocumentType: '', format: '', filenameTemplate: '{ref}.pdf', exportTarget: 'default', priority: 0 }

export default function FilingRulesPage() {
  const [rules, setRules] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState<any>(empty)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const r = await apiFetch('/api/inbound/export-rules')
    setRules(r.rules)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function startEdit(r: any) {
    setForm({
      name: r.name, matchKeyword: r.matchKeyword || '', matchDocumentType: r.matchDocumentType || '',
      format: r.format || '', filenameTemplate: r.filenameTemplate || '{ref}.pdf',
      exportTarget: r.exportTarget || 'default', priority: r.priority || 0,
    })
    setEditingId(r.id); setError('')
  }
  function cancelEdit() { setForm(empty); setEditingId(null); setError('') }

  async function save() {
    if (!form.name) { setError('Give the rule a name'); return }
    if (!form.format && !form.matchKeyword && !form.matchDocumentType) { setError('Add a case-number format, or a match keyword / document type'); return }
    setBusy(true); setError('')
    try {
      if (editingId) await apiFetch(`/api/inbound/export-rules/${editingId}`, { method: 'PUT', body: JSON.stringify(form) })
      else await apiFetch('/api/inbound/export-rules', { method: 'POST', body: JSON.stringify(form) })
      cancelEdit(); await load()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  async function remove(id: string) {
    if (editingId === id) cancelEdit()
    await apiFetch(`/api/inbound/export-rules/${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center"><FolderOutput size={20} className="text-violet-700" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Filing Rules</h1>
          <p className="text-gray-500 text-sm mt-0.5">Identify a case/reference number in a document and file the correctly-named file into a watch folder (e.g. Proclaim), alongside normal routing.</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* List */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-semibold text-gray-800">{rules.length} filing rule{rules.length === 1 ? '' : 's'}</h2></div>
          {loading ? <p className="px-5 py-8 text-center text-gray-400 text-sm">Loading…</p> : rules.length === 0 ? (
            <p className="px-5 py-8 text-center text-gray-400 text-sm">No filing rules yet. Add one per client on the right.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {rules.map((r) => (
                <div key={r.id} className={`flex items-center gap-3 px-5 py-3 ${editingId === r.id ? 'bg-violet-50/60' : ''}`}>
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center shrink-0 text-xs font-bold text-gray-500">{r.priority}</div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm">{r.name}</p>
                    <p className="text-xs text-gray-400 flex items-center gap-1.5 flex-wrap">
                      {r.matchKeyword && <span className="bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded">&ldquo;{r.matchKeyword}&rdquo;</span>}
                      {r.matchDocumentType && <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded">type: {r.matchDocumentType}</span>}
                      <span className="font-mono bg-gray-50 px-1.5 py-0.5 rounded">{r.format}</span>
                      <ArrowRight size={11} className="text-gray-300" />
                      <span className="font-mono text-gray-600">{r.filenameTemplate}</span>
                      <span className="text-gray-400">→ {r.exportTarget}</span>
                    </p>
                  </div>
                  <button onClick={() => startEdit(r)} className={`transition-colors ${editingId === r.id ? 'text-violet-700' : 'text-gray-300 hover:text-violet-700'}`} title="Edit rule"><Pencil size={14} /></button>
                  <button onClick={() => remove(r.id)} className="text-gray-300 hover:text-red-600 transition-colors" title="Delete rule"><Trash2 size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add form */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 h-fit">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800">{editingId ? 'Edit filing rule' : 'Add filing rule'}</h3>
            {editingId && <button onClick={cancelEdit} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"><X size={12} /> Cancel</button>}
          </div>
          <div className="space-y-3">
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500" placeholder="Rule name (e.g. Hartwell → Proclaim)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <div>
              <label className="text-xs font-medium text-gray-600">Applies to documents matching</label>
              <input className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500" placeholder="Keyword — e.g. client name (Hartwell)" value={form.matchKeyword} onChange={(e) => setForm({ ...form, matchKeyword: e.target.value })} />
              <select className="w-full mt-2 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500" value={form.matchDocumentType} onChange={(e) => setForm({ ...form, matchDocumentType: e.target.value })}>
                {DOC_TYPES.map((t) => <option key={t} value={t}>{t ? `and type: ${t}` : 'any document type'}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Case-number format <span className="text-gray-400">(optional)</span></label>
              <input className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-violet-500" placeholder="e.g. HG/####/####" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })} />
              <p className="text-[11px] text-gray-400 mt-1"><code>#</code> = a digit, <code>#+</code> = one or more digits, else literal (e.g. <code>HC-####-######</code>). <strong>Leave blank to forward the document as-is</strong> — e.g. invoices → Invoice-IQ.</p>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">Saved filename</label>
              <input className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono outline-none focus:border-violet-500" value={form.filenameTemplate} onChange={(e) => setForm({ ...form, filenameTemplate: e.target.value })} />
              <p className="text-[11px] text-gray-400 mt-1">Tokens: <code>{'{ref}'}</code> <code>{'{date}'}</code> <code>{'{type}'}</code>. <code>/</code> in a ref becomes <code>-</code>.</p>
            </div>
            <div className="flex gap-2">
              <input className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500" placeholder="Target (e.g. proclaim)" value={form.exportTarget} onChange={(e) => setForm({ ...form, exportTarget: e.target.value })} />
              <input type="number" className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500" placeholder="Priority" value={form.priority} onChange={(e) => setForm({ ...form, priority: +e.target.value })} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button onClick={save} disabled={busy} className="w-full flex items-center justify-center gap-2 bg-violet-700 hover:bg-violet-800 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {busy ? <Loader2 size={15} className="animate-spin" /> : editingId ? <Pencil size={15} /> : <Plus size={15} />} {editingId ? 'Save changes' : 'Add filing rule'}
            </button>
            <p className="text-[11px] text-gray-400">The agent files matched documents into the folder mapped to this target (set the folder in the agent&rsquo;s setup / <code>exportFolder</code>).</p>
          </div>
        </div>
      </div>
    </div>
  )
}
