'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import { ArrowLeft, AtSign, Lock, Inbox } from 'lucide-react'

const STATUS_COLOR: Record<string, string> = {
  RECEIVED:   'bg-amber-100 text-amber-700',
  CLASSIFIED: 'bg-blue-100 text-blue-700',
  TRIAGE:     'bg-red-100 text-red-700',
  DELIVERED:  'bg-emerald-100 text-emerald-700',
  REJECTED:   'bg-gray-100 text-gray-500',
}

export default function MailboxDetailPage() {
  const params = useParams()
  const id = params.id as string
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [privateBox, setPrivateBox] = useState(false)

  useEffect(() => {
    apiFetch(`/api/inbound/mailboxes/${id}/items`)
      .then((d) => setData(d))
      .catch((e) => { if ((e.message || '').includes('private')) setPrivateBox(true) })
      .finally(() => setLoading(false))
  }, [id])

  if (loading) return <div className="p-6 text-gray-400 text-sm">Loading…</div>

  return (
    <div className="p-6">
      <Link href="/dashboard/mailboxes" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-4">
        <ArrowLeft size={15} /> Back to Mailboxes
      </Link>

      {privateBox ? (
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-12 text-center max-w-lg mx-auto">
          <Lock size={26} className="mx-auto text-gray-300 mb-2" />
          <p className="text-gray-700 font-medium">Private inbox</p>
          <p className="text-gray-500 text-sm mt-1">This is a personal inbox — its contents are only visible to its owner.</p>
        </div>
      ) : data ? (
        <>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center">
              <AtSign size={18} className="text-violet-700" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{data.mailbox.name}</h1>
              <p className="text-gray-500 text-sm">
                {data.mailbox.email} · {String(data.mailbox.kind).toLowerCase()} inbox · {data.items.length} item{data.items.length === 1 ? '' : 's'}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200">
            {data.items.length === 0 ? (
              <div className="px-5 py-12 text-center">
                <Inbox size={26} className="mx-auto text-gray-300 mb-2" />
                <p className="text-gray-500 text-sm">No post in this mailbox yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {data.items.map((it: any) => (
                  <Link key={it.id} href={`/dashboard/inbound/${it.id}`}
                    className="flex items-center gap-4 px-5 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{it.fileName}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {it.documentType || 'general'}{it.extractedName && ` · to ${it.extractedName}`}
                      </p>
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[it.status] || 'bg-gray-100 text-gray-600'}`}>
                      {it.status}
                    </span>
                    <span className="text-xs text-gray-400 w-14 text-right">
                      {new Date(it.receivedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="text-gray-400 text-sm">Mailbox not found.</div>
      )}
    </div>
  )
}
