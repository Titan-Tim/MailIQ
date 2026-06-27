'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Inbox, Printer, Send, RotateCcw, TrendingUp, Clock, CheckCircle2, AlertCircle } from 'lucide-react'

interface Stats {
  pending: number; ready: number; queued: number
  sentToday: number; digitalSentToday: number; printQueuedToday: number
  openedToday: number; returned: number
}

function StatCard({ icon: Icon, label, value, sub, color }: any) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={16} className="text-white" />
        </div>
        <p className="text-sm font-medium text-gray-600">{label}</p>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [stats, setStats] = useState<Stats | null>(null)
  const [recent, setRecent] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [d1, d2, d3] = await Promise.all([
          apiFetch('/api/dispatches?status=PENDING&limit=1'),
          apiFetch('/api/dispatches?status=READY&limit=1'),
          apiFetch('/api/dispatches?limit=10'),
        ])
        const today = new Date().toDateString()
        const todaySent = d3.dispatches.filter((d: any) =>
          d.sentAt && new Date(d.sentAt).toDateString() === today
        )
        setStats({
          pending:          d1.total,
          ready:            d2.total,
          queued:           0,
          sentToday:        todaySent.length,
          digitalSentToday: todaySent.filter((d: any) => d.deliveryMethod === 'DIGITAL').length,
          printQueuedToday: todaySent.filter((d: any) => d.deliveryMethod === 'POST').length,
          openedToday:      0,
          returned:         0,
        })
        setRecent(d3.dispatches.slice(0, 8))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const statusColor: Record<string, string> = {
    PENDING:   'bg-amber-100 text-amber-700',
    COMPOSING: 'bg-blue-100 text-blue-700',
    READY:     'bg-emerald-100 text-emerald-700',
    QUEUED:    'bg-violet-100 text-violet-700',
    SENT:      'bg-gray-100 text-gray-600',
    RETURNED:  'bg-red-100 text-red-700',
    FAILED:    'bg-red-100 text-red-800',
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Overview</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          Welcome back, {user?.name || user?.email}
        </p>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading…</p>
      ) : stats ? (
        <>
          <div className="grid grid-cols-4 gap-4 mb-8">
            <StatCard icon={Inbox}       label="Awaiting action"  value={stats.pending + stats.ready}
              sub={`${stats.pending} pending · ${stats.ready} ready to send`}
              color="bg-amber-500" />
            <StatCard icon={Send}        label="Sent today"       value={stats.sentToday}
              sub={`${stats.digitalSentToday} digital · ${stats.printQueuedToday} posted`}
              color="bg-violet-600" />
            <StatCard icon={CheckCircle2} label="Opened (digital)" value={stats.openedToday}
              sub="documents viewed by recipients"
              color="bg-emerald-500" />
            <StatCard icon={RotateCcw}   label="Returned"         value={stats.returned}
              sub="unresolved return mail items"
              color="bg-red-500" />
          </div>

          {/* Recent dispatches */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="font-semibold text-gray-800">Recent dispatches</h2>
              <a href="/dashboard/inbox" className="text-violet-700 text-sm font-medium hover:underline">View all</a>
            </div>
            <div className="divide-y divide-gray-100">
              {recent.length === 0 ? (
                <p className="px-5 py-8 text-center text-gray-400 text-sm">No dispatches yet. Upload a document from the Inbox.</p>
              ) : recent.map((d: any) => (
                <a key={d.id} href={`/dashboard/inbox/${d.id}`}
                  className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{d.originalFileName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {d.recipient
                        ? `${d.recipient.firstName || ''} ${d.recipient.lastName}`.trim()
                        : 'No recipient matched'}
                      {d.reference && ` · Ref: ${d.reference}`}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[d.status] || 'bg-gray-100 text-gray-600'}`}>
                    {d.status}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(d.uploadedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </a>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  )
}
