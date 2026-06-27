'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { Send, Eye, Download, Clock, CheckCircle2, XCircle, Mail } from 'lucide-react'

export default function DigitalPage() {
  const [dispatches, setDispatches] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    // Load SENT digital dispatches and QUEUED (sent but email may not have been delivered)
    const data = await apiFetch('/api/dispatches?limit=100')
    const digital = data.dispatches.filter((d: any) =>
      d.deliveryMethod === 'DIGITAL' && ['SENT', 'QUEUED'].includes(d.status)
    )
    setDispatches(digital)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const totalSent   = dispatches.length
  const totalOpened = dispatches.filter(d => d.digitalSend?.firstOpenedAt).length
  const openRate    = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Digital Sent</h1>
        <p className="text-gray-500 text-sm mt-0.5">Track documents sent digitally and monitor opens</p>
      </div>

      {!loading && dispatches.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">Total sent</p>
            <p className="text-3xl font-bold text-gray-900">{totalSent}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">Opened</p>
            <p className="text-3xl font-bold text-emerald-600">{totalOpened}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm text-gray-500 mb-1">Open rate</p>
            <p className="text-3xl font-bold text-violet-700">{openRate}%</p>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm text-center py-12">Loading…</p>
      ) : dispatches.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 flex flex-col items-center gap-3">
          <Send size={36} className="text-gray-300" />
          <p className="text-gray-500 font-medium">No digital sends yet</p>
          <p className="text-gray-400 text-sm">Compose and send documents digitally from the Inbox</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          <div className="grid grid-cols-[1fr_160px_100px_100px_100px] gap-4 px-5 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">
            <span>Document</span>
            <span>Recipient</span>
            <span>Sent</span>
            <span>Opens</span>
            <span>Status</span>
          </div>
          {dispatches.map(d => {
            const ds = d.digitalSend
            const opened = ds?.openCount > 0
            return (
              <a key={d.id} href={`/dashboard/inbox/${d.id}`}
                className="grid grid-cols-[1fr_160px_100px_100px_100px] gap-4 px-5 py-3.5 items-center hover:bg-gray-50 transition-colors">
                <div className="min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{d.originalFileName}</p>
                  {d.reference && <p className="text-xs text-gray-400 mt-0.5">Ref: {d.reference}</p>}
                </div>
                <div className="min-w-0">
                  {d.recipient ? (
                    <p className="text-sm text-gray-700 truncate">
                      {[d.recipient.firstName, d.recipient.lastName].filter(Boolean).join(' ')}
                    </p>
                  ) : (
                    <p className="text-sm text-gray-400">{ds?.toEmail || '—'}</p>
                  )}
                </div>
                <span className="text-xs text-gray-400">
                  {ds?.emailSentAt
                    ? new Date(ds.emailSentAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                    : '—'}
                </span>
                <div className="flex items-center gap-1.5">
                  {opened ? (
                    <span className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                      <Eye size={12} /> {ds.openCount}
                    </span>
                  ) : (
                    <span className="text-gray-400 text-xs flex items-center gap-1">
                      <Clock size={12} /> Unseen
                    </span>
                  )}
                </div>
                <div>
                  {ds?.emailSent ? (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${opened ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
                      {opened ? 'Opened' : 'Delivered'}
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                      Pending
                    </span>
                  )}
                </div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
