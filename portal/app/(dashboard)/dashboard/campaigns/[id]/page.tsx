'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { apiFetch } from '@/lib/api'
import { ArrowLeft, Megaphone, Send, Printer, MailOpen } from 'lucide-react'

const STATUS = {
  SENT: 'bg-emerald-100 text-emerald-700', QUEUED: 'bg-violet-100 text-violet-700',
  READY: 'bg-blue-100 text-blue-700', FAILED: 'bg-red-100 text-red-800', PENDING: 'bg-amber-100 text-amber-700',
} as Record<string, string>

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>()
  const [c, setC] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => { apiFetch(`/api/campaigns/${id}`).then((d) => { setC(d); setLoading(false) }).catch(() => setLoading(false)) }, [id])

  if (loading) return <div className="p-6 text-gray-400 text-sm">Loading…</div>
  if (!c) return <div className="p-6 text-gray-500 text-sm">Campaign not found.</div>

  const items = c.dispatches || []
  const digital = items.filter((d: any) => d.deliveryMethod === 'DIGITAL').length
  const post = items.filter((d: any) => d.deliveryMethod === 'POST').length
  const opened = items.filter((d: any) => d.digitalSend?.firstOpenedAt).length

  return (
    <div className="p-6">
      <Link href="/dashboard/campaigns" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4"><ArrowLeft size={15} /> Campaigns</Link>

      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center"><Megaphone size={20} className="text-violet-700" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{c.name}</h1>
          <p className="text-gray-500 text-sm mt-0.5">{c.baseFileName} · {new Date(c.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}{c.addQr ? ' · return QR' : ''}</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <Stat label="Recipients" value={items.length} />
        <Stat label="Emailed" value={digital} icon={Send} color="text-emerald-600" />
        <Stat label="To print" value={post} icon={Printer} color="text-violet-600" />
        <Stat label="Opened" value={opened} icon={MailOpen} color="text-blue-600" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-semibold text-gray-800">Recipients</h2></div>
        <div className="divide-y divide-gray-100">
          {items.map((d: any) => (
            <Link key={d.id} href={`/dashboard/inbox/${d.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{[d.recipient?.firstName, d.recipient?.lastName].filter(Boolean).join(' ') || d.recipient?.email || '— no recipient'}</p>
                <p className="text-xs text-gray-400">{d.recipient?.accountNumber || d.recipient?.email || ''} · {d.barcodeCode}</p>
              </div>
              {d.digitalSend?.firstOpenedAt && <span className="text-xs text-blue-600 font-medium">opened</span>}
              <span className="text-xs text-gray-500 flex items-center gap-1">{d.deliveryMethod === 'DIGITAL' ? <><Send size={11} /> email</> : <><Printer size={11} /> post</>}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS[d.status] || 'bg-gray-100 text-gray-600'}`}>{d.status}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, icon: Icon, color }: any) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-1">{Icon && <Icon size={14} className={color} />}<p className="text-xs font-medium text-gray-500">{label}</p></div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  )
}
