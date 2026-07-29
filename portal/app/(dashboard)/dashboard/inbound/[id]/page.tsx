'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { apiFetch, inboundFileUrl } from '@/lib/api'
import { ArrowLeft, Send, Ban, Loader2, FileText, Trash2 } from 'lucide-react'

const STATUS_COLOR: Record<string, string> = {
  RECEIVED:   'bg-amber-100 text-amber-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  CLASSIFIED: 'bg-blue-100 text-blue-700',
  TRIAGE:     'bg-red-100 text-red-700',
  DELIVERED:  'bg-emerald-100 text-emerald-700',
  REJECTED:   'bg-gray-100 text-gray-500',
}

const IMG_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'tif', 'tiff']

export default function InboundItemPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string
  const [item, setItem] = useState<any>(null)
  const [mailboxes, setMailboxes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [choice, setChoice] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    const [it, mb] = await Promise.all([
      apiFetch(`/api/inbound/items/${id}`),
      apiFetch('/api/inbound/mailboxes'),
    ])
    setItem(it)
    setMailboxes(mb.mailboxes)
    if (it.matchedMailbox) setChoice(it.matchedMailbox.id)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function reroute() {
    if (!choice) return
    setBusy(true)
    try {
      await apiFetch(`/api/inbound/items/${id}/reroute`, { method: 'POST', body: JSON.stringify({ mailboxId: choice }) })
      await load()
    } finally { setBusy(false) }
  }
  async function reject() {
    setBusy(true)
    try {
      await apiFetch(`/api/inbound/items/${id}/reject`, { method: 'POST', body: JSON.stringify({ reason: 'Junk / not actionable' }) })
      await load()
    } finally { setBusy(false) }
  }
  async function deleteItem() {
    if (!confirm('Delete this item? The document and its history are removed permanently.')) return
    setBusy(true)
    try {
      await apiFetch(`/api/inbound/items/${id}`, { method: 'DELETE' })
      router.push('/dashboard/inbound')
    } finally { setBusy(false) }
  }

  if (loading) return <div className="p-6 text-gray-400 text-sm">Loading…</div>
  if (!item) return <div className="p-6 text-red-500">Item not found.</div>

  const ext = (item.fileName.split('.').pop() || '').toLowerCase()
  const isImg = IMG_EXT.includes(ext)

  return (
    <div className="p-6">
      <Link href="/dashboard/inbound" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={15} /> Back to Inbound Tray
      </Link>

      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 truncate">{item.fileName}</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {item.documentType || 'general'} · {Math.round((item.confidence || 0) * 100)}% confidence · received{' '}
            {new Date(item.receivedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <span className={`shrink-0 text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_COLOR[item.status] || 'bg-gray-100 text-gray-600'}`}>
          {item.status}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* File preview */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 overflow-hidden">
          {item.fileKey ? (
            isImg ? (
              <img src={inboundFileUrl(id)} alt={item.fileName} className="w-full h-auto" />
            ) : (
              <iframe src={inboundFileUrl(id)} title={item.fileName} className="w-full" style={{ height: 640, border: 0 }} />
            )
          ) : (
            <div className="p-8 text-center">
              <FileText size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-gray-500 text-sm">Logged manually — no file attached.</p>
              {item.ocrText && (
                <pre className="text-left text-xs text-gray-600 bg-gray-50 rounded-lg p-3 mt-4 whitespace-pre-wrap">{item.ocrText}</pre>
              )}
            </div>
          )}
        </div>

        {/* Details + actions */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-3 text-sm">Routing</h2>
            <dl className="text-sm space-y-1.5">
              <Row k="Type" v={item.documentType || 'general'} />
              <Row k="Addressed to" v={item.extractedName || '—'} />
              <Row k="Routed to" v={item.matchedMailbox?.name || '—'} />
              <Row k="Delivered to" v={item.deliveredEmail || '—'} />
              <Row k="Reason" v={item.routingReason || '—'} />
            </dl>
          </div>

          {item.status !== 'REJECTED' && (
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-800 mb-3 text-sm">
                {item.status === 'TRIAGE' ? 'Assign a mailbox' : 'Re-route'}
              </h2>
              <select value={choice} onChange={(e) => setChoice(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 outline-none focus:border-violet-500">
                <option value="">Choose a mailbox…</option>
                {mailboxes.map((m) => <option key={m.id} value={m.id}>{m.name} — {m.email}</option>)}
              </select>
              <div className="flex gap-2">
                <button onClick={reroute} disabled={!choice || busy}
                  className="flex-1 flex items-center justify-center gap-1.5 bg-violet-700 hover:bg-violet-800 disabled:opacity-50 text-white text-sm font-medium px-3 py-2 rounded-lg">
                  {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Route &amp; deliver
                </button>
                <button onClick={reject} disabled={busy}
                  className="border border-gray-200 hover:bg-gray-50 text-gray-600 px-3 py-2 rounded-lg" title="Reject as junk">
                  <Ban size={15} />
                </button>
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-semibold text-gray-800 mb-3 text-sm">Audit trail</h2>
            <ol className="space-y-2.5">
              {item.events?.length ? item.events.map((e: any) => (
                <li key={e.id} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-700">{e.type}</span>
                    <span className="text-gray-400">
                      {new Date(e.createdAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {e.detail && <p className="text-gray-500 mt-0.5">{e.detail}</p>}
                  {e.actor && <p className="text-gray-400">{e.actor}</p>}
                </li>
              )) : <li className="text-xs text-gray-400">No events.</li>}
            </ol>
          </div>

          <button onClick={deleteItem} disabled={busy}
            className="w-full flex items-center justify-center gap-1.5 border border-gray-200 hover:border-red-300 hover:bg-red-50 text-gray-500 hover:text-red-600 text-sm font-medium px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
            <Trash2 size={15} /> Delete item
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-3">
      <dt className="text-gray-500 w-24 shrink-0">{k}</dt>
      <dd className="text-gray-900 break-words min-w-0">{v}</dd>
    </div>
  )
}
