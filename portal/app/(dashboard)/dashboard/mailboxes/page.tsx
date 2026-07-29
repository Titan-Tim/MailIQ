'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { AtSign, Plus, Trash2, Star, Loader2 } from 'lucide-react'

const empty = { name: '', department: '', email: '', keywords: '', isDefault: false }

const KIND_BADGE: Record<string, string> = {
  PERSONAL: 'bg-blue-100 text-blue-700',
  TEAM:     'bg-violet-100 text-violet-700',
  GENERAL:  'bg-gray-100 text-gray-600',
}

export default function MailboxesPage() {
  const [mailboxes, setMailboxes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    const m = await apiFetch('/api/inbound/mailboxes')
    setMailboxes(m.mailboxes)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function add() {
    if (!form.name || !form.email) { setError('Name and email are required'); return }
    setBusy(true); setError('')
    try {
      await apiFetch('/api/inbound/mailboxes', { method: 'POST', body: JSON.stringify(form) })
      setForm(empty)
      await load()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  async function remove(id: string) {
    await apiFetch(`/api/inbound/mailboxes/${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mailboxes</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Internal destinations inbound post gets routed to. Set one as the default catch-all.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* List */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">{mailboxes.length} mailbox{mailboxes.length === 1 ? '' : 'es'}</h2>
          </div>
          {loading ? (
            <p className="px-5 py-8 text-center text-gray-400 text-sm">Loading…</p>
          ) : mailboxes.length === 0 ? (
            <p className="px-5 py-8 text-center text-gray-400 text-sm">No mailboxes yet — add one on the right.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {mailboxes.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                  <Link href={`/dashboard/mailboxes/${m.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                      <AtSign size={15} className="text-violet-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm flex items-center gap-1.5">
                        {m.name}
                        {m.kind && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${KIND_BADGE[m.kind] || ''}`}>{m.kind}</span>}
                        {m.isDefault && <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full"><Star size={9} /> DEFAULT</span>}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {m.ownerUser ? `${m.ownerUser.name || m.ownerUser.email}` : m.team ? `Team: ${m.team.name}` : m.email}
                        {m.keywords && ` · keywords: ${m.keywords}`}
                      </p>
                    </div>
                  </Link>
                  <span className="text-xs text-gray-400">{m._count?.items ?? 0} routed</span>
                  <button onClick={() => remove(m.id)} className="text-gray-300 hover:text-red-600 transition-colors" title="Deactivate">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add form */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 h-fit">
          <h3 className="font-semibold text-gray-800 mb-4">Add mailbox</h3>
          <div className="space-y-3">
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500"
              placeholder="Name (e.g. Accounts)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500"
              placeholder="Destination email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500"
              placeholder="Department (optional)" value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} />
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500"
              placeholder="Match keywords, comma-separated" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
              Default catch-all mailbox
            </label>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button onClick={add} disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-violet-700 hover:bg-violet-800 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Add mailbox
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
