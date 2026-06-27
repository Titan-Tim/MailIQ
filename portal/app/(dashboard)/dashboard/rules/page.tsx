'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { Settings, Plus, Trash2, X, Zap, GripVertical } from 'lucide-react'

export default function RulesPage() {
  const [rules, setRules] = useState<any[]>([])
  const [inserts, setInserts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', documentType: '', priority: '0', deliveryOverride: '', insertIds: [] as string[] })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const [r, i] = await Promise.all([apiFetch('/api/rules'), apiFetch('/api/inserts')])
    setRules(r)
    setInserts(i)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function startEdit(rule: any) {
    setEditId(rule.id)
    setForm({
      name: rule.name,
      documentType: rule.documentType || '',
      priority: String(rule.priority),
      deliveryOverride: rule.deliveryOverride || '',
      insertIds: rule.inserts.map((ri: any) => ri.insertId),
    })
    setShowAdd(true)
  }

  function resetForm() {
    setShowAdd(false)
    setEditId(null)
    setForm({ name: '', documentType: '', priority: '0', deliveryOverride: '', insertIds: [] })
    setError('')
  }

  async function saveRule(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      const body = {
        name: form.name,
        documentType: form.documentType || null,
        priority: parseInt(form.priority) || 0,
        deliveryOverride: form.deliveryOverride || null,
        insertIds: form.insertIds,
      }
      if (editId) {
        await apiFetch(`/api/rules/${editId}`, { method: 'PUT', body: JSON.stringify(body) })
      } else {
        await apiFetch('/api/rules', { method: 'POST', body: JSON.stringify(body) })
      }
      resetForm()
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteRule(id: string) {
    if (!confirm('Delete this rule?')) return
    await apiFetch(`/api/rules/${id}`, { method: 'DELETE' })
    load()
  }

  async function toggleActive(rule: any) {
    await apiFetch(`/api/rules/${rule.id}`, { method: 'PUT', body: JSON.stringify({ isActive: !rule.isActive }) })
    load()
  }

  function toggleInsertId(id: string) {
    setForm(p => ({
      ...p,
      insertIds: p.insertIds.includes(id)
        ? p.insertIds.filter(i => i !== id)
        : [...p.insertIds, id]
    }))
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dispatch Rules</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            Automatically apply inserts and delivery methods based on document type
          </p>
        </div>
        <button onClick={() => { resetForm(); setShowAdd(true) }}
          className="flex items-center gap-2 bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-800">
          <Plus size={14} /> New Rule
        </button>
      </div>

      {showAdd && (
        <form onSubmit={saveRule} className="bg-white border border-violet-200 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">{editId ? 'Edit Rule' : 'New Rule'}</h2>
            <button type="button" onClick={resetForm}><X size={16} className="text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="col-span-2">
              <label className="text-xs text-gray-600 mb-1 block">Rule Name *</label>
              <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Insurance Policy — Standard Package" className={inp} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Document Type (exact match)</label>
              <input value={form.documentType} onChange={e => setForm(p => ({ ...p, documentType: e.target.value }))}
                placeholder="e.g. Insurance Policy" className={inp} />
              <p className="text-xs text-gray-400 mt-0.5">Leave blank to apply to all document types</p>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Delivery Override</label>
              <select value={form.deliveryOverride} onChange={e => setForm(p => ({ ...p, deliveryOverride: e.target.value }))} className={inp}>
                <option value="">Use recipient preference</option>
                <option value="DIGITAL">Always digital</option>
                <option value="POST">Always post</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-gray-600 mb-2 block uppercase tracking-wide">
              Auto-attach inserts
            </label>
            <div className="grid grid-cols-2 gap-1.5 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2 bg-gray-50">
              {inserts.length === 0 ? (
                <p className="text-xs text-gray-400 col-span-2 py-2 px-1">No inserts in library yet</p>
              ) : inserts.map(ins => {
                const selected = form.insertIds.includes(ins.id)
                return (
                  <button key={ins.id} type="button" onClick={() => toggleInsertId(ins.id)}
                    className={`flex items-center gap-2 rounded px-2.5 py-1.5 text-xs text-left transition-colors ${
                      selected ? 'bg-violet-100 text-violet-800 font-medium' : 'text-gray-700 hover:bg-white'
                    }`}>
                    <div className={`w-3.5 h-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                      selected ? 'bg-violet-600 border-violet-600' : 'border-gray-400'
                    }`}>
                      {selected && <span className="text-white text-xs">✓</span>}
                    </div>
                    <span className="truncate">{ins.name}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={resetForm} className="px-4 py-1.5 text-sm text-gray-600">Cancel</button>
            <button type="submit" disabled={saving}
              className="px-4 py-1.5 bg-violet-700 text-white text-sm rounded-lg hover:bg-violet-800 disabled:opacity-50">
              {saving ? 'Saving…' : editId ? 'Update Rule' : 'Create Rule'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm text-center py-12">Loading…</p>
      ) : rules.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 flex flex-col items-center gap-3">
          <Settings size={36} className="text-gray-300" />
          <p className="text-gray-500 font-medium">No rules yet</p>
          <p className="text-gray-400 text-sm">Create rules to automatically apply inserts and delivery methods</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rules.map(rule => (
            <div key={rule.id} className={`bg-white rounded-xl border p-4 ${rule.isActive ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 text-sm">{rule.name}</p>
                    {!rule.isActive && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Inactive</span>}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                    {rule.documentType
                      ? <span className="bg-violet-100 text-violet-700 px-2 py-0.5 rounded font-medium">{rule.documentType}</span>
                      : <span className="text-gray-400">All document types</span>}
                    {rule.deliveryOverride && (
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">
                        Force {rule.deliveryOverride.toLowerCase()}
                      </span>
                    )}
                    <span className="text-gray-400">Priority: {rule.priority}</span>
                  </div>
                  {rule.inserts.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      <Zap size={11} className="text-amber-500 mt-0.5" />
                      {rule.inserts.map((ri: any) => (
                        <span key={ri.id} className="text-xs bg-amber-50 text-amber-700 px-2 py-0.5 rounded border border-amber-200">
                          {ri.insert.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => toggleActive(rule)}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                      rule.isActive
                        ? 'border-gray-300 text-gray-600 hover:bg-gray-50'
                        : 'border-violet-300 text-violet-700 hover:bg-violet-50'
                    }`}>
                    {rule.isActive ? 'Disable' : 'Enable'}
                  </button>
                  <button onClick={() => startEdit(rule)}
                    className="p-1.5 text-gray-400 hover:text-violet-600 hover:bg-violet-50 rounded-lg transition-colors">
                    <Settings size={13} />
                  </button>
                  <button onClick={() => deleteRule(rule.id)}
                    className="p-1.5 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
