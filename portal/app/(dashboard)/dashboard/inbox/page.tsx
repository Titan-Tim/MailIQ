'use client'
import { useEffect, useState, useRef, DragEvent } from 'react'
import { useRouter } from 'next/navigation'
import { apiFetch, apiUpload } from '@/lib/api'
import { Upload, CloudUpload, FileText, ChevronRight, Clock, CheckCircle2, Zap, Send, Printer, AlertCircle, Trash2 } from 'lucide-react'

const STATUS_STYLE: Record<string, string> = {
  PENDING:   'bg-amber-100 text-amber-700',
  COMPOSING: 'bg-blue-100 text-blue-700',
  READY:     'bg-emerald-100 text-emerald-700',
  QUEUED:    'bg-violet-100 text-violet-700',
  SENT:      'bg-gray-100 text-gray-600',
  RETURNED:  'bg-red-100 text-red-700',
  FAILED:    'bg-red-100 text-red-800',
}

const STATUS_ICON: Record<string, any> = {
  PENDING:  Clock,
  READY:    CheckCircle2,
  SENT:     Send,
  QUEUED:   Printer,
  FAILED:   AlertCircle,
}

export default function InboxPage() {
  const router = useRouter()
  const [dispatches, setDispatches] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (search) params.set('search', search)
      if (statusFilter) params.set('status', statusFilter)
      const data = await apiFetch(`/api/dispatches?${params}`)
      setDispatches(data.dispatches)
      setTotal(data.total)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [search, statusFilter])

  async function uploadFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      alert('Only PDF files are accepted')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const dispatch = await apiUpload('/api/dispatches/ingest', fd)
      router.push(`/dashboard/inbox/${dispatch.id}`)
    } catch (e: any) {
      alert('Upload failed: ' + e.message)
      setUploading(false)
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }

  async function deleteDispatch(e: React.MouseEvent, id: string) {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this dispatch? This cannot be undone.')) return
    await apiFetch(`/api/dispatches/${id}`, { method: 'DELETE' })
    load()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inbox</h1>
          <p className="text-gray-500 text-sm mt-0.5">{total} document{total !== 1 ? 's' : ''} in system</p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-2 bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-800"
        >
          <Upload size={15} /> Upload PDF
        </button>
        <input ref={fileInputRef} type="file" accept=".pdf" className="hidden"
          onChange={e => e.target.files?.[0] && uploadFile(e.target.files[0])} />
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 mb-6 flex flex-col items-center justify-center gap-3 cursor-pointer transition-colors ${
          dragOver
            ? 'border-violet-500 bg-violet-50'
            : 'border-gray-300 bg-white hover:border-violet-400 hover:bg-violet-50/50'
        }`}
      >
        <CloudUpload size={32} className={dragOver ? 'text-violet-600' : 'text-gray-400'} />
        <div className="text-center">
          <p className="font-medium text-gray-700">
            {uploading ? 'Uploading…' : dragOver ? 'Drop to upload' : 'Drag & drop a PDF here'}
          </p>
          <p className="text-sm text-gray-400 mt-0.5">or click to browse · PDF files only · max 50 MB</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by filename, recipient, reference…"
          className="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="READY">Ready</option>
          <option value="QUEUED">Queued</option>
          <option value="SENT">Sent</option>
          <option value="RETURNED">Returned</option>
          <option value="FAILED">Failed</option>
        </select>
      </div>

      {/* Dispatch list */}
      {loading ? (
        <p className="text-gray-400 text-sm text-center py-12">Loading…</p>
      ) : dispatches.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 flex flex-col items-center gap-3">
          <FileText size={36} className="text-gray-300" />
          <p className="text-gray-500 font-medium">No documents yet</p>
          <p className="text-gray-400 text-sm">Upload a PDF above to get started</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {dispatches.map(d => {
            const StatusIcon = STATUS_ICON[d.status] || FileText
            return (
              <a key={d.id} href={`/dashboard/inbox/${d.id}`}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors group">
                <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                  <FileText size={15} className="text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{d.originalFileName}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-gray-400">
                      {d.recipient
                        ? `${d.recipient.firstName || ''} ${d.recipient.lastName}`.trim()
                        : 'No recipient'}
                    </span>
                    {d.reference && (
                      <span className="text-xs text-gray-400">· Ref: {d.reference}</span>
                    )}
                    {d._count?.inserts > 0 && (
                      <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                        +{d._count.inserts} inserts
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {d.digitalSend?.firstOpenedAt && (
                    <span className="text-xs text-emerald-600 font-medium">Opened</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[d.status] || ''}`}>
                    {d.status}
                  </span>
                  <span className="text-xs text-gray-400 w-20 text-right">
                    {new Date(d.uploadedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                  <button
                    onClick={e => deleteDispatch(e, d.id)}
                    className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 transition-all"
                  >
                    <Trash2 size={13} />
                  </button>
                  <ChevronRight size={14} className="text-gray-300" />
                </div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
