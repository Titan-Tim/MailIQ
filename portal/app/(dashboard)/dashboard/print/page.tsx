'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { Printer, Download, CheckCircle2, Package, ChevronDown, ChevronRight, FileText } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

const BATCH_STATUS_STYLE: Record<string, string> = {
  OPEN:    'bg-amber-100 text-amber-700',
  READY:   'bg-blue-100 text-blue-700',
  PRINTED: 'bg-emerald-100 text-emerald-700',
  POSTED:  'bg-gray-100 text-gray-600',
}

export default function PrintQueuePage() {
  const [batches, setBatches] = useState<any[]>([])
  const [expanded, setExpanded] = useState<Record<string, any>>({})
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState<string | null>(null)
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : ''

  async function load() {
    const data = await apiFetch('/api/batches')
    setBatches(data)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function expandBatch(id: string) {
    if (expanded[id]) { setExpanded(p => { const n = { ...p }; delete n[id]; return n }); return }
    const data = await apiFetch(`/api/batches/${id}`)
    setExpanded(p => ({ ...p, [id]: data }))
  }

  async function generatePdf(id: string) {
    setGenerating(id)
    try {
      await apiFetch(`/api/batches/${id}/generate`, { method: 'POST' })
      load()
      const data = await apiFetch(`/api/batches/${id}`)
      setExpanded(p => ({ ...p, [id]: data }))
    } finally {
      setGenerating(null)
    }
  }

  async function markPrinted(id: string) {
    await apiFetch(`/api/batches/${id}/mark-printed`, { method: 'POST' })
    load()
  }

  async function markPosted(id: string) {
    await apiFetch(`/api/batches/${id}/mark-posted`, { method: 'POST' })
    load()
  }

  const openBatches  = batches.filter(b => b.status === 'OPEN' || b.status === 'READY')
  const closedBatches = batches.filter(b => b.status === 'PRINTED' || b.status === 'POSTED')

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Print Queue</h1>
        <p className="text-gray-500 text-sm mt-0.5">
          {openBatches.reduce((s, b) => s + b.itemCount, 0)} document{openBatches.reduce((s, b) => s + b.itemCount, 0) !== 1 ? 's' : ''} awaiting printing
        </p>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm text-center py-12">Loading…</p>
      ) : batches.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 flex flex-col items-center gap-3">
          <Printer size={36} className="text-gray-300" />
          <p className="text-gray-500 font-medium">Print queue is empty</p>
          <p className="text-gray-400 text-sm">Compose documents in the Inbox and add them to the print queue</p>
        </div>
      ) : (
        <div className="space-y-4">
          {openBatches.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Active Batches</h2>
              <div className="space-y-2">
                {openBatches.map(batch => (
                  <div key={batch.id} className="bg-white rounded-xl border border-gray-200">
                    <div className="flex items-center gap-4 px-5 py-4">
                      <button onClick={() => expandBatch(batch.id)} className="text-gray-400">
                        {expanded[batch.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm">{batch.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {batch.itemCount} document{batch.itemCount !== 1 ? 's' : ''}
                          · {new Date(batch.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${BATCH_STATUS_STYLE[batch.status]}`}>
                        {batch.status}
                      </span>
                      <div className="flex items-center gap-2">
                        {batch.status === 'OPEN' && (
                          <button onClick={() => generatePdf(batch.id)} disabled={generating === batch.id}
                            className="flex items-center gap-1.5 text-sm font-medium text-violet-700 border border-violet-300 rounded-lg px-3 py-1.5 hover:bg-violet-50 disabled:opacity-50">
                            <Package size={13} />
                            {generating === batch.id ? 'Generating…' : 'Generate PDF'}
                          </button>
                        )}
                        {batch.status === 'READY' && (
                          <>
                            <a href={`${API}/api/batches/${batch.id}/download?auth=${token}`}
                              target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-sm font-medium text-blue-700 border border-blue-300 rounded-lg px-3 py-1.5 hover:bg-blue-50">
                              <Download size={13} /> Download PDF
                            </a>
                            <button onClick={() => markPrinted(batch.id)}
                              className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 border border-emerald-300 rounded-lg px-3 py-1.5 hover:bg-emerald-50">
                              <CheckCircle2 size={13} /> Mark Printed
                            </button>
                          </>
                        )}
                        {batch.status === 'PRINTED' && (
                          <button onClick={() => markPosted(batch.id)}
                            className="flex items-center gap-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg px-3 py-1.5 hover:bg-gray-50">
                            <Package size={13} /> Mark Posted
                          </button>
                        )}
                      </div>
                    </div>

                    {expanded[batch.id] && (
                      <div className="border-t border-gray-100 bg-gray-50 px-5 py-3">
                        <div className="space-y-1.5">
                          {(expanded[batch.id].items || []).map((item: any) => (
                            <div key={item.id} className="flex items-center gap-3 text-sm">
                              <FileText size={13} className="text-gray-400 flex-shrink-0" />
                              <span className="flex-1 text-gray-800 truncate">{item.dispatch.originalFileName}</span>
                              {item.dispatch.recipient && (
                                <span className="text-xs text-gray-500">
                                  {[item.dispatch.recipient.firstName, item.dispatch.recipient.lastName].filter(Boolean).join(' ')}
                                </span>
                              )}
                              {item.dispatch.recipient?.postcode && (
                                <span className="text-xs font-mono text-gray-400">{item.dispatch.recipient.postcode}</span>
                              )}
                              <span className="text-xs text-gray-400">{item.pageCount}pp</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {closedBatches.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-6">Completed</h2>
              <div className="space-y-2">
                {closedBatches.map(batch => (
                  <div key={batch.id} className="bg-white rounded-xl border border-gray-100 px-5 py-4 flex items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-600 text-sm">{batch.name}</p>
                      <p className="text-xs text-gray-400">{batch.itemCount} documents</p>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${BATCH_STATUS_STYLE[batch.status]}`}>
                      {batch.status}
                    </span>
                    {batch.printedAt && (
                      <span className="text-xs text-gray-400">
                        Printed {new Date(batch.printedAt).toLocaleDateString('en-GB')}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
