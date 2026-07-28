'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { ClipboardList, Send, Ban, Loader2 } from 'lucide-react'

export default function TriagePage() {
  const [items, setItems] = useState<any[]>([])
  const [mailboxes, setMailboxes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState('')
  const [choice, setChoice] = useState<Record<string, string>>({})

  async function load() {
    const [i, m] = await Promise.all([
      apiFetch('/api/inbound/items?status=TRIAGE&limit=100'),
      apiFetch('/api/inbound/mailboxes'),
    ])
    setItems(i.items)
    setMailboxes(m.mailboxes)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function reroute(id: string) {
    const mailboxId = choice[id]
    if (!mailboxId) return
    setBusyId(id)
    try {
      await apiFetch(`/api/inbound/items/${id}/reroute`, {
        method: 'POST',
        body: JSON.stringify({ mailboxId }),
      })
      await load()
    } finally { setBusyId('') }
  }

  async function reject(id: string) {
    setBusyId(id)
    try {
      await apiFetch(`/api/inbound/items/${id}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Junk / not actionable' }),
      })
      await load()
    } finally { setBusyId('') }
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Triage Queue</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Items the router couldn&rsquo;t place confidently. Assign a mailbox to deliver, or reject as junk.
        </p>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : items.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-12 text-center">
          <ClipboardList size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-gray-500 text-sm">Nothing in triage — everything routed cleanly.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <div key={it.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900">{it.fileName}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Type <strong>{it.documentType || 'general'}</strong>
                    {it.extractedName && <> · addressed to <strong>{it.extractedName}</strong></>}
                    {' · '}confidence {Math.round((it.confidence || 0) * 100)}%
                  </p>
                  {it.routingReason && <p className="text-xs text-amber-700 mt-1">{it.routingReason}</p>}
                </div>
                <span className="text-xs text-gray-400 shrink-0">
                  {new Date(it.receivedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className="flex items-center gap-2 mt-4">
                <select
                  value={choice[it.id] || ''}
                  onChange={(e) => setChoice({ ...choice, [it.id]: e.target.value })}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500"
                >
                  <option value="">Choose a mailbox…</option>
                  {mailboxes.map((m) => (
                    <option key={m.id} value={m.id}>{m.name} — {m.email}</option>
                  ))}
                </select>
                <button
                  onClick={() => reroute(it.id)}
                  disabled={!choice[it.id] || busyId === it.id}
                  className="flex items-center gap-1.5 bg-violet-700 hover:bg-violet-800 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 rounded-lg"
                >
                  {busyId === it.id ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  Route &amp; deliver
                </button>
                <button
                  onClick={() => reject(it.id)}
                  disabled={busyId === it.id}
                  className="flex items-center gap-1.5 border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm font-medium px-3 py-2 rounded-lg"
                  title="Reject as junk"
                >
                  <Ban size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
