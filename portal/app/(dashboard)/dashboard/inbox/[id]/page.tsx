'use client'
import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { apiFetch } from '@/lib/api'
import {
  ArrowLeft, User, Search, X, Plus, Zap, Send, Printer,
  CheckCircle2, AlertCircle, Eye, Download, RefreshCw, GripVertical
} from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

const DOCUMENT_TYPES = [
  'Insurance Policy', 'Insurance Renewal', 'Medical Letter', 'Appointment Letter',
  'Invoice', 'Statement', 'Contract', 'Legal Notice', 'General Correspondence'
]

export default function ComposePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()

  const [dispatch, setDispatch]     = useState<any>(null)
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [composing, setComposing]   = useState(false)
  const [sending, setSending]       = useState(false)
  const [error, setError]           = useState('')
  const [success, setSuccess]       = useState('')

  // Recipient search
  const [recipientSearch, setRecipientSearch] = useState('')
  const [recipientResults, setRecipientResults] = useState<any[]>([])
  const [showRecipientSearch, setShowRecipientSearch] = useState(false)

  // Available inserts
  const [allInserts, setAllInserts]   = useState<any[]>([])
  const [suggestions, setSuggestions] = useState<any[]>([])

  // Edit state
  const [documentType, setDocumentType] = useState('')
  const [reference, setReference]       = useState('')
  const [notes, setNotes]               = useState('')
  const [selectedInserts, setSelectedInserts] = useState<any[]>([])
  const [deliveryOverride, setDeliveryOverride] = useState('')

  // Email send
  const [sendEmail, setSendEmail] = useState('')
  const [sendSubject, setSendSubject] = useState('')
  const [showSendForm, setShowSendForm] = useState(false)

  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : ''

  async function load() {
    try {
      const [d, ins] = await Promise.all([
        apiFetch(`/api/dispatches/${id}`),
        apiFetch('/api/inserts'),
      ])
      setDispatch(d)
      setDocumentType(d.documentType || '')
      setReference(d.reference || '')
      setNotes(d.notes || '')
      setSelectedInserts(d.inserts?.map((di: any) => ({ insertId: di.insertId, insert: di.insert, source: di.source })) || [])
      setDeliveryOverride(d.deliveryMethod || '')
      setSendEmail(d.recipient?.email || '')
      setSendSubject(`Your document${d.reference ? ' — Ref: ' + d.reference : ''}`)
      setAllInserts(ins)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [id])

  // Fetch insert suggestions when documentType changes
  useEffect(() => {
    if (!documentType) { setSuggestions([]); return }
    apiFetch(`/api/dispatches/${id}/suggest-inserts`).then(setSuggestions).catch(() => {})
  }, [documentType, id])

  // Recipient search
  useEffect(() => {
    if (recipientSearch.length < 2) { setRecipientResults([]); return }
    const t = setTimeout(async () => {
      const data = await apiFetch(`/api/recipients?search=${encodeURIComponent(recipientSearch)}&limit=8`)
      setRecipientResults(data.recipients)
    }, 300)
    return () => clearTimeout(t)
  }, [recipientSearch])

  async function saveDetails() {
    setSaving(true)
    setError('')
    try {
      await apiFetch(`/api/dispatches/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ documentType: documentType || null, reference: reference || null, notes: notes || null })
      })
      await apiFetch(`/api/dispatches/${id}/inserts`, {
        method: 'PUT',
        body: JSON.stringify({ inserts: selectedInserts.map(si => ({ insertId: si.insertId, source: si.source })) })
      })
      setSuccess('Saved')
      setTimeout(() => setSuccess(''), 2000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSaving(false)
    }
  }

  async function setRecipient(recipient: any) {
    setShowRecipientSearch(false)
    setRecipientSearch('')
    await apiFetch(`/api/dispatches/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ recipientId: recipient.id })
    })
    load()
  }

  async function clearRecipient() {
    await apiFetch(`/api/dispatches/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ recipientId: null })
    })
    load()
  }

  async function compose() {
    setComposing(true)
    setError('')
    try {
      await saveDetails()
      const updated = await apiFetch(`/api/dispatches/${id}/compose`, { method: 'POST' })
      setDispatch(updated)
      setSuccess('Composed successfully!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (e: any) {
      setError('Composition failed: ' + e.message)
    } finally {
      setComposing(false)
    }
  }

  async function sendDigital() {
    setSending(true)
    setError('')
    try {
      const updated = await apiFetch(`/api/dispatches/${id}/send-digital`, {
        method: 'POST',
        body: JSON.stringify({ email: sendEmail, subject: sendSubject })
      })
      setDispatch(updated)
      setShowSendForm(false)
      setSuccess('Sent digitally!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  async function addToPrintQueue() {
    setSending(true)
    setError('')
    try {
      const updated = await apiFetch(`/api/dispatches/${id}/add-to-batch`, { method: 'POST' })
      setDispatch(updated)
      setSuccess('Added to print queue!')
      setTimeout(() => setSuccess(''), 3000)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setSending(false)
    }
  }

  function toggleInsert(ins: any) {
    setSelectedInserts(prev => {
      const exists = prev.find(si => si.insertId === ins.id)
      if (exists) return prev.filter(si => si.insertId !== ins.id)
      return [...prev, { insertId: ins.id, insert: ins, source: 'manual' }]
    })
  }

  function applySuggestions() {
    const existing = new Set(selectedInserts.map(si => si.insertId))
    const toAdd = suggestions
      .filter(s => !existing.has(s.insert.id))
      .map(s => ({ insertId: s.insert.id, insert: s.insert, source: 'rule' }))
    setSelectedInserts(prev => [...prev, ...toAdd])
  }

  if (loading) return <div className="p-6 text-gray-400 text-sm">Loading…</div>
  if (!dispatch) return <div className="p-6 text-red-500">Dispatch not found.</div>

  const isComposed = !!dispatch.composedFileKey
  const isSent = ['SENT', 'QUEUED'].includes(dispatch.status)
  const recipient = dispatch.recipient

  const pdfSrc = `${API}/api/dispatches/${id}/file${isComposed ? '?composed=1&' : '?'}auth=${token}`

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="h-14 bg-white border-b border-gray-200 flex items-center gap-4 px-5 flex-shrink-0">
        <button onClick={() => router.push('/dashboard/inbox')} className="text-gray-400 hover:text-gray-700">
          <ArrowLeft size={18} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 text-sm truncate">{dispatch.originalFileName}</p>
          <p className="text-xs text-gray-400">{dispatch.barcodeCode}</p>
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
          dispatch.status === 'SENT'  ? 'bg-gray-100 text-gray-600' :
          dispatch.status === 'READY' ? 'bg-emerald-100 text-emerald-700' :
          dispatch.status === 'FAILED'? 'bg-red-100 text-red-700' :
          'bg-amber-100 text-amber-700'
        }`}>
          {dispatch.status}
        </span>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* PDF Preview */}
        <div className="flex-1 bg-gray-800 relative">
          <iframe
            src={pdfSrc}
            className="w-full h-full border-0"
            title="Document preview"
          />
          {isComposed && (
            <div className="absolute top-3 left-3 bg-emerald-600 text-white text-xs px-2.5 py-1 rounded-full font-medium">
              Composed version
            </div>
          )}
        </div>

        {/* Right panel */}
        <div className="w-80 bg-white border-l border-gray-200 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 space-y-5">

            {/* Status messages */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex gap-2">
                <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                <p className="text-red-700 text-xs">{error}</p>
              </div>
            )}
            {success && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 flex gap-2">
                <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
                <p className="text-emerald-700 text-xs">{success}</p>
              </div>
            )}

            {/* ── Recipient ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Recipient</h3>
                {recipient && (
                  <button onClick={clearRecipient} className="text-gray-400 hover:text-red-500">
                    <X size={13} />
                  </button>
                )}
              </div>

              {recipient ? (
                <div className="bg-violet-50 border border-violet-200 rounded-lg p-3">
                  <p className="font-semibold text-gray-900 text-sm">
                    {[recipient.title, recipient.firstName, recipient.lastName].filter(Boolean).join(' ')}
                  </p>
                  {recipient.companyName && <p className="text-xs text-gray-600">{recipient.companyName}</p>}
                  {recipient.accountNumber && <p className="text-xs text-violet-600 font-mono mt-1">Acc: {recipient.accountNumber}</p>}
                  {recipient.email && <p className="text-xs text-gray-500">{recipient.email}</p>}
                  <div className="flex items-center gap-1 mt-1.5">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      recipient.deliveryMethod === 'DIGITAL' ? 'bg-blue-100 text-blue-700' :
                      recipient.deliveryMethod === 'POST'    ? 'bg-gray-100 text-gray-600' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {recipient.deliveryMethod}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden">
                    <Search size={13} className="ml-2.5 text-gray-400 flex-shrink-0" />
                    <input
                      value={recipientSearch}
                      onChange={e => { setRecipientSearch(e.target.value); setShowRecipientSearch(true) }}
                      placeholder="Search by name, account…"
                      className="flex-1 px-2 py-2 text-sm focus:outline-none"
                    />
                  </div>
                  {showRecipientSearch && recipientResults.length > 0 && (
                    <div className="absolute z-10 top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                      {recipientResults.map(r => (
                        <button key={r.id} onClick={() => setRecipient(r)}
                          className="w-full text-left px-3 py-2 hover:bg-violet-50 text-sm border-b border-gray-100 last:border-0">
                          <p className="font-medium text-gray-900">
                            {[r.title, r.firstName, r.lastName].filter(Boolean).join(' ')}
                          </p>
                          <p className="text-xs text-gray-400">{r.accountNumber || r.email || ''}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── Document Info ── */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Document</h3>
              <div className="space-y-2">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Type</label>
                  <select value={documentType} onChange={e => setDocumentType(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
                    <option value="">— Select type —</option>
                    {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Reference / Account No.</label>
                  <input value={reference} onChange={e => setReference(e.target.value)}
                    placeholder="e.g. POL-123456"
                    className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
                </div>
              </div>
            </div>

            {/* ── Inserts ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Inserts</h3>
                {suggestions.length > 0 && (
                  <button onClick={applySuggestions}
                    className="text-xs text-violet-700 hover:underline flex items-center gap-1">
                    <Zap size={11} /> Apply rules
                  </button>
                )}
              </div>

              {/* Selected inserts */}
              {selectedInserts.length > 0 && (
                <div className="space-y-1 mb-2">
                  {selectedInserts.map(si => (
                    <div key={si.insertId} className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded px-2.5 py-1.5">
                      <span className="text-xs font-medium text-gray-800 flex-1 truncate">{si.insert.name}</span>
                      {si.source === 'rule' && <span className="text-xs bg-violet-100 text-violet-700 px-1.5 rounded">rule</span>}
                      <button onClick={() => toggleInsert(si.insert)} className="text-gray-400 hover:text-red-500">
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add from library */}
              <div className="max-h-28 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-1.5 bg-gray-50">
                {allInserts.length === 0 ? (
                  <p className="text-xs text-gray-400 px-1 py-1">No inserts in library yet</p>
                ) : allInserts.map(ins => {
                  const selected = selectedInserts.some(si => si.insertId === ins.id)
                  return (
                    <button key={ins.id} onClick={() => toggleInsert(ins)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-xs transition-colors ${
                        selected ? 'bg-violet-100 text-violet-800' : 'hover:bg-white text-gray-700'
                      }`}>
                      <div className={`w-3 h-3 rounded border flex-shrink-0 flex items-center justify-center ${
                        selected ? 'bg-violet-600 border-violet-600' : 'border-gray-400'
                      }`}>
                        {selected && <CheckCircle2 size={10} className="text-white" />}
                      </div>
                      <span className="truncate">{ins.name}</span>
                      {ins.category && <span className="text-gray-400 ml-auto">{ins.category}</span>}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* ── Delivery ── */}
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Delivery method</h3>
              {dispatch.deliveryMethod ? (
                <div className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium ${
                  dispatch.deliveryMethod === 'DIGITAL'
                    ? 'bg-blue-50 text-blue-700 border border-blue-200'
                    : 'bg-gray-50 text-gray-700 border border-gray-200'
                }`}>
                  {dispatch.deliveryMethod === 'DIGITAL' ? <Send size={14} /> : <Printer size={14} />}
                  {dispatch.deliveryMethod === 'DIGITAL' ? 'Send digitally' : 'Print and post'}
                  <span className="text-xs ml-auto opacity-70">
                    {recipient ? `(${recipient.deliveryMethod})` : 'no recipient'}
                  </span>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => apiFetch(`/api/dispatches/${id}`, { method: 'PATCH', body: JSON.stringify({ deliveryMethod: 'DIGITAL' }) }).then(load)}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-gray-300 rounded-lg px-2 py-1.5 text-xs hover:border-blue-400 hover:bg-blue-50 hover:text-blue-700 transition-colors">
                    <Send size={12} /> Digital
                  </button>
                  <button onClick={() => apiFetch(`/api/dispatches/${id}`, { method: 'PATCH', body: JSON.stringify({ deliveryMethod: 'POST' }) }).then(load)}
                    className="flex-1 flex items-center justify-center gap-1.5 border border-gray-300 rounded-lg px-2 py-1.5 text-xs hover:border-gray-500 hover:bg-gray-50 transition-colors">
                    <Printer size={12} /> Post
                  </button>
                </div>
              )}
            </div>

          </div>

          {/* Action buttons */}
          <div className="p-4 border-t border-gray-200 space-y-2">
            {!isSent && (
              <button onClick={compose} disabled={composing || !recipient}
                title={!recipient ? 'Select a recipient first' : ''}
                className="w-full flex items-center justify-center gap-2 bg-violet-700 text-white py-2 rounded-lg text-sm font-medium hover:bg-violet-800 disabled:opacity-50 transition-colors">
                <RefreshCw size={14} className={composing ? 'animate-spin' : ''} />
                {composing ? 'Composing…' : isComposed ? 'Re-compose' : 'Compose Document'}
              </button>
            )}

            {isComposed && !isSent && (
              <>
                {dispatch.deliveryMethod !== 'POST' && (
                  <button onClick={() => setShowSendForm(!showSendForm)}
                    className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2 rounded-lg text-sm font-medium hover:bg-blue-700">
                    <Send size={14} /> Send Digitally
                  </button>
                )}
                {dispatch.deliveryMethod !== 'DIGITAL' && (
                  <button onClick={addToPrintQueue} disabled={sending}
                    className="w-full flex items-center justify-center gap-2 border border-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50">
                    <Printer size={14} /> Add to Print Queue
                  </button>
                )}
              </>
            )}

            {isSent && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-center">
                <p className="text-emerald-700 text-sm font-medium">
                  {dispatch.deliveryMethod === 'DIGITAL' ? 'Sent digitally' : 'Added to print queue'}
                </p>
                {dispatch.sentAt && (
                  <p className="text-emerald-600 text-xs mt-0.5">
                    {new Date(dispatch.sentAt).toLocaleString('en-GB')}
                  </p>
                )}
                {dispatch.digitalSend?.openCount > 0 && (
                  <p className="text-emerald-600 text-xs mt-0.5">
                    Opened {dispatch.digitalSend.openCount} time{dispatch.digitalSend.openCount !== 1 ? 's' : ''}
                  </p>
                )}
              </div>
            )}

            {/* Email send form */}
            {showSendForm && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">To email</label>
                  <input value={sendEmail} onChange={e => setSendEmail(e.target.value)}
                    type="email" placeholder="recipient@example.com"
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="text-xs text-gray-600 mb-1 block">Subject</label>
                  <input value={sendSubject} onChange={e => setSendSubject(e.target.value)}
                    className="w-full border border-gray-300 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500" />
                </div>
                <button onClick={sendDigital} disabled={sending || !sendEmail}
                  className="w-full bg-blue-600 text-white py-1.5 rounded text-xs font-medium hover:bg-blue-700 disabled:opacity-50">
                  {sending ? 'Sending…' : 'Confirm & Send'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
