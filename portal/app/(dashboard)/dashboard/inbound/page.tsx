'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch, apiUpload } from '@/lib/api'
import { Inbox, ClipboardList, CheckCircle2, Ban, Plus, X, Loader2, Upload, Trash2 } from 'lucide-react'

const STATUS_COLOR: Record<string, string> = {
  RECEIVED:   'bg-amber-100 text-amber-700',
  PROCESSING: 'bg-blue-100 text-blue-700',
  CLASSIFIED: 'bg-blue-100 text-blue-700',
  TRIAGE:     'bg-red-100 text-red-700',
  DELIVERED:  'bg-emerald-100 text-emerald-700',
  REJECTED:   'bg-gray-100 text-gray-500',
}

const DOC_TYPES = ['', 'invoice', 'statement', 'legal', 'hr', 'general']

function StatCard({ icon: Icon, label, value, color }: any) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
          <Icon size={16} className="text-white" />
        </div>
        <p className="text-sm font-medium text-gray-600">{label}</p>
      </div>
      <p className="text-3xl font-bold text-gray-900">{value}</p>
    </div>
  )
}

export default function InboundTrayPage() {
  const [items, setItems] = useState<any[]>([])
  const [stats, setStats] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showIntake, setShowIntake] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkBusy, setBulkBusy] = useState(false)

  async function load() {
    const [i, s] = await Promise.all([
      apiFetch('/api/inbound/items?limit=50'),
      apiFetch('/api/inbound/stats'),
    ])
    setItems(i.items)
    setStats(s)
    setSelected(new Set())
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  function toggle(id: string) {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function toggleAll() {
    setSelected((prev) => (prev.size === items.length ? new Set() : new Set(items.map((i) => i.id))))
  }
  const allSelected = items.length > 0 && selected.size === items.length
  const someSelected = selected.size > 0

  async function deleteItem(e: React.MouseEvent, id: string) {
    e.preventDefault(); e.stopPropagation()
    if (!confirm('Delete this item? The document and its history are removed permanently.')) return
    await apiFetch(`/api/inbound/items/${id}`, { method: 'DELETE' })
    await load()
  }

  async function deleteSelected() {
    if (selected.size === 0) return
    if (!confirm(`Delete ${selected.size} item${selected.size === 1 ? '' : 's'}? The documents and their history are removed permanently.`)) return
    setBulkBusy(true)
    try { await Promise.all(Array.from(selected).map((id) => apiFetch(`/api/inbound/items/${id}`, { method: 'DELETE' }))) }
    finally { setBulkBusy(false) }
    await load()
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inbound Tray</h1>
          <p className="text-gray-500 text-sm mt-0.5">Scanned post, OCR&rsquo;d, classified and routed to a mailbox.</p>
        </div>
        <button onClick={() => setShowIntake(true)}
          className="flex items-center gap-2 bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <Plus size={16} /> Log incoming post
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard icon={Inbox}         label="Received"  value={stats.received}  color="bg-amber-500" />
          <StatCard icon={ClipboardList} label="In triage" value={stats.triage}    color="bg-red-500" />
          <StatCard icon={CheckCircle2}  label="Delivered" value={stats.delivered} color="bg-emerald-500" />
          <StatCard icon={Ban}           label="Rejected"  value={stats.rejected}  color="bg-gray-400" />
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
          {items.length > 0 && (
            <input type="checkbox" aria-label="Select all"
              checked={allSelected}
              ref={(el) => { if (el) el.indeterminate = someSelected && !allSelected }}
              onChange={toggleAll}
              className="w-4 h-4 accent-violet-600 cursor-pointer" />
          )}
          <h2 className="font-semibold text-gray-800">All inbound items</h2>
          {someSelected && (
            <button onClick={deleteSelected} disabled={bulkBusy}
              className="ml-auto flex items-center gap-1.5 text-sm font-medium text-red-600 hover:text-red-700 border border-red-200 hover:bg-red-50 px-3 py-1.5 rounded-lg disabled:opacity-60 transition-colors">
              {bulkBusy ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Delete selected ({selected.size})
            </button>
          )}
        </div>
        {loading ? (
          <p className="px-5 py-8 text-center text-gray-400 text-sm">Loading…</p>
        ) : items.length === 0 ? (
          <p className="px-5 py-8 text-center text-gray-400 text-sm">
            No inbound post yet. Click &ldquo;Log incoming post&rdquo; to run a piece through the pipeline.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {items.map((it) => (
              <div key={it.id}
                className={`flex items-center gap-3 px-5 py-3 transition-colors ${selected.has(it.id) ? 'bg-violet-50/50' : 'hover:bg-gray-50'}`}>
                <input type="checkbox" aria-label={`Select ${it.fileName}`}
                  checked={selected.has(it.id)} onChange={() => toggle(it.id)}
                  className="w-4 h-4 accent-violet-600 cursor-pointer shrink-0" />
                <Link href={`/dashboard/inbound/${it.id}`}
                  className="flex items-center gap-4 flex-1 min-w-0 group">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{it.fileName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {it.documentType || 'general'}
                      {it.extractedName && ` · to ${it.extractedName}`}
                      {it.matchedMailbox && ` · → ${it.matchedMailbox.name}`}
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">{Math.round((it.confidence || 0) * 100)}%</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[it.status] || 'bg-gray-100 text-gray-600'}`}>
                    {it.status}
                  </span>
                  <span className="text-xs text-gray-400 w-14 text-right">
                    {new Date(it.receivedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </Link>
                <button onClick={(e) => deleteItem(e, it.id)} title="Delete"
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors shrink-0">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {showIntake && <IntakeModal onClose={() => setShowIntake(false)} onDone={() => { setShowIntake(false); load() }} />}
    </div>
  )
}

function IntakeModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [fileName, setFileName] = useState('')
  const [extractedName, setExtractedName] = useState('')
  const [documentType, setDocumentType] = useState('')
  const [ocrText, setOcrText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')

  async function submit() {
    if (!file && !fileName) { setError('Upload a file or enter a file name'); return }
    setBusy(true); setError('')
    try {
      let item
      if (file) {
        // Real file upload (multipart) — the backend stores the scan.
        const fd = new FormData()
        fd.append('file', file)
        fd.append('source', 'upload')
        if (extractedName) fd.append('extractedName', extractedName)
        if (documentType) fd.append('documentType', documentType)
        if (ocrText) fd.append('ocrText', ocrText)
        item = await apiUpload('/api/inbound/items', fd)
      } else {
        // Manual log — no file, just the details a scanner would extract.
        item = await apiFetch('/api/inbound/items', {
          method: 'POST',
          body: JSON.stringify({
            fileName: fileName || 'scan.pdf',
            extractedName: extractedName || undefined,
            documentType: documentType || undefined,
            ocrText: ocrText || undefined,
            source: 'manual',
          }),
        })
      }
      setResult(item)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Log incoming post</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {!result ? (
          <div className="p-5 space-y-4">
            <p className="text-xs text-gray-500">
              Upload a scanned document, or just type the details a scanner would extract. Either way the pipeline
              classifies and routes it live. (The stub OCR routes on the file name and any details you add — a real OCR
              engine will read the file contents automatically.)
            </p>
            <Field label="Upload document (PDF or image)">
              <label className="flex items-center gap-3 border border-dashed border-gray-300 rounded-lg px-4 py-3 cursor-pointer hover:border-violet-400 transition-colors">
                <Upload size={18} className="text-violet-600 shrink-0" />
                <span className={`text-sm truncate ${file ? 'text-gray-800' : 'text-gray-500'}`}>
                  {file ? file.name : 'Choose a scanned file…'}
                </span>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.tif,.tiff,image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); if (f) setFileName(f.name) }} />
              </label>
            </Field>
            <Field label="File name">
              <input value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="e.g. acme-invoice-2291.pdf"
                className="input" />
            </Field>
            <Field label="Addressed to (optional)">
              <input value={extractedName} onChange={(e) => setExtractedName(e.target.value)} placeholder="e.g. Accounts Dept"
                className="input" />
            </Field>
            <Field label="Document type (optional — leave blank to let it classify)">
              <select value={documentType} onChange={(e) => setDocumentType(e.target.value)} className="input">
                {DOC_TYPES.map((t) => <option key={t} value={t}>{t || '(auto-detect)'}</option>)}
              </select>
            </Field>
            <Field label="Extracted text (optional)">
              <textarea value={ocrText} onChange={(e) => setOcrText(e.target.value)} rows={3}
                placeholder="Paste or type any body text — used for keyword routing."
                className="input resize-none" />
            </Field>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={submit} disabled={busy}
                className="flex items-center gap-2 bg-violet-700 hover:bg-violet-800 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg">
                {busy && <Loader2 size={15} className="animate-spin" />} Run pipeline
              </button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-700">
              <CheckCircle2 size={18} />
              <span className="font-medium">Processed — status {result.status}</span>
            </div>
            <dl className="text-sm bg-gray-50 rounded-lg p-4 space-y-1.5">
              <Row k="Type" v={result.documentType || 'general'} />
              <Row k="Confidence" v={`${Math.round((result.confidence || 0) * 100)}%`} />
              <Row k="Routed to" v={result.matchedMailbox ? `${result.matchedMailbox.name} (${result.matchedMailbox.email})` : '— needs triage'} />
              <Row k="Reason" v={result.routingReason || '—'} />
            </dl>
            <div className="flex justify-end">
              <button onClick={onDone} className="bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium px-4 py-2 rounded-lg">Done</button>
            </div>
          </div>
        )}
      </div>
      <style jsx global>{`
        .input { width:100%; border:1px solid #e2e8f0; border-radius:8px; padding:8px 12px; font-size:14px; outline:none; }
        .input:focus { border-color:#7c3aed; box-shadow:0 0 0 2px rgba(124,58,237,.15); }
      `}</style>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-gray-600 mb-1 block">{label}</span>
      {children}
    </label>
  )
}
function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex gap-3"><dt className="text-gray-500 w-24 shrink-0">{k}</dt><dd className="text-gray-900">{v}</dd></div>
}
