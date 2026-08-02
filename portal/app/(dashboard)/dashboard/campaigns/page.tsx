'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { apiFetch, apiUpload } from '@/lib/api'
import { Megaphone, Plus, X, Loader2, Upload, Trash2, Send, Printer, CheckCircle2, QrCode, FileText, PenLine, Smartphone } from 'lucide-react'

const STATUS = { DRAFT: 'bg-gray-100 text-gray-600', SENDING: 'bg-blue-100 text-blue-700', SENT: 'bg-emerald-100 text-emerald-700' } as Record<string, string>

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showNew, setShowNew] = useState(false)

  async function load() {
    const d = await apiFetch('/api/campaigns')
    setCampaigns(d.campaigns)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function remove(e: React.MouseEvent, id: string) {
    e.preventDefault(); e.stopPropagation()
    if (!confirm('Delete this campaign and all the copies it generated? This cannot be undone.')) return
    await apiFetch(`/api/campaigns/${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center"><Megaphone size={20} className="text-violet-700" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Campaigns</h1>
            <p className="text-gray-500 text-sm mt-0.5">Send one document to many recipients &mdash; personalised, with a unique return QR, routed by each recipient&rsquo;s preference.</p>
          </div>
        </div>
        <button onClick={() => setShowNew(true)} className="flex items-center gap-2 bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors">
          <Plus size={16} /> New campaign
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-semibold text-gray-800">{campaigns.length} campaign{campaigns.length === 1 ? '' : 's'}</h2></div>
        {loading ? <p className="px-5 py-8 text-center text-gray-400 text-sm">Loading&hellip;</p> : campaigns.length === 0 ? (
          <p className="px-5 py-10 text-center text-gray-400 text-sm">No campaigns yet. Click &ldquo;New campaign&rdquo; to send a document to your recipients.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {campaigns.map((c) => (
              <Link key={c.id} href={`/dashboard/campaigns/${c.id}`} className="flex items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center shrink-0"><Megaphone size={15} className="text-violet-600" /></div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm truncate">{c.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{c.baseFileName} · {c.count || 0} recipient{c.count === 1 ? '' : 's'}{c.addQr ? ' · QR' : ''}{c.returned ? ` · ${c.returned} returned` : ''}</p>
                </div>
                <span className="text-xs text-gray-400">{new Date(c.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS[c.status] || ''}`}>{c.status}</span>
                <button onClick={(e) => remove(e, c.id)} className="p-1 text-gray-300 hover:text-red-500 transition-colors" title="Delete campaign"><Trash2 size={15} /></button>
              </Link>
            ))}
          </div>
        )}
      </div>

      {showNew && <NewCampaign onClose={() => setShowNew(false)} onDone={() => { setShowNew(false); load() }} />}
    </div>
  )
}

function NewCampaign({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [mode, setMode] = useState<'upload' | 'letter'>('upload')
  const [file, setFile] = useState<File | null>(null)
  const [body, setBody] = useState('')
  const [heading, setHeading] = useState('')
  const [signOff, setSignOff] = useState('')
  const [name, setName] = useState('')
  const [subject, setSubject] = useState('')
  const [addQr, setAddQr] = useState(true)
  const [inserts, setInserts] = useState<any[]>([])
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [recipientCount, setRecipientCount] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [summary, setSummary] = useState<any>(null)

  useEffect(() => {
    apiFetch('/api/inserts').then((d) => setInserts((d.inserts || d || []).filter((i: any) => i.isActive !== false))).catch(() => {})
    apiFetch('/api/recipients').then((d) => {
      const list = d.recipients || d || []
      setRecipientCount(list.filter((r: any) => r.isActive !== false).length)
    }).catch(() => {})
  }, [])

  function toggleInsert(id: string) {
    setChosen((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  async function createAndSend() {
    if (mode === 'upload' && !file) { setError('Choose the base document (PDF)'); return }
    if (mode === 'letter' && !body.trim()) { setError('Write the letter body'); return }
    setBusy(true); setError('')
    try {
      const fd = new FormData()
      if (mode === 'upload') { fd.append('file', file as File) }
      else { fd.append('bodyTemplate', body); if (heading) fd.append('heading', heading); if (signOff) fd.append('signOff', signOff) }
      if (name) fd.append('name', name)
      if (subject) fd.append('subject', subject)
      fd.append('addQr', String(addQr))
      const campaign = await apiUpload('/api/campaigns', fd)
      const res = await apiFetch(`/api/campaigns/${campaign.id}/generate`, { method: 'POST', body: JSON.stringify({ insertIds: Array.from(chosen) }) })
      setSummary(res.summary)
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">New campaign</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        {summary ? (
          <div className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-emerald-700"><CheckCircle2 size={18} /><span className="font-medium">Campaign sent</span></div>
            <div className="grid grid-cols-4 gap-2 text-center">
              <div className="bg-emerald-50 rounded-lg p-3"><p className="text-2xl font-bold text-emerald-700">{summary.digital}</p><p className="text-[11px] text-gray-500 flex items-center justify-center gap-1"><Send size={11} /> emailed</p></div>
              <div className="bg-sky-50 rounded-lg p-3"><p className="text-2xl font-bold text-sky-700">{summary.sms || 0}</p><p className="text-[11px] text-gray-500 flex items-center justify-center gap-1"><Smartphone size={11} /> texted</p></div>
              <div className="bg-violet-50 rounded-lg p-3"><p className="text-2xl font-bold text-violet-700">{summary.post}</p><p className="text-[11px] text-gray-500 flex items-center justify-center gap-1"><Printer size={11} /> to print</p></div>
              <div className="bg-gray-50 rounded-lg p-3"><p className={`text-2xl font-bold ${summary.failed ? 'text-red-600' : 'text-gray-400'}`}>{summary.failed}</p><p className="text-[11px] text-gray-500">failed</p></div>
            </div>
            <p className="text-xs text-gray-500">Postal copies are waiting in the <strong>Print Queue</strong>; emailed copies are in <strong>Digital Sent</strong>.</p>
            <div className="flex justify-end"><button onClick={onDone} className="bg-violet-700 hover:bg-violet-800 text-white text-sm font-medium px-4 py-2 rounded-lg">Done</button></div>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              <button onClick={() => setMode('upload')} className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-md transition-colors ${mode === 'upload' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><FileText size={13} /> Upload a PDF</button>
              <button onClick={() => setMode('letter')} className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-md transition-colors ${mode === 'letter' ? 'bg-white text-violet-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><PenLine size={13} /> Compose a letter</button>
            </div>

            {mode === 'upload' ? (
              <label className="flex items-center gap-3 border border-dashed border-gray-300 rounded-lg px-4 py-3 cursor-pointer hover:border-violet-400 transition-colors">
                <Upload size={18} className="text-violet-600 shrink-0" />
                <span className={`text-sm truncate ${file ? 'text-gray-800' : 'text-gray-500'}`}>{file ? file.name : 'Choose the base document (PDF)&hellip;'}</span>
                <input type="file" accept=".pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0] || null; setFile(f); if (f && !name) setName(f.name.replace(/\.pdf$/i, '')) }} />
              </label>
            ) : (
              <div className="space-y-3">
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500" placeholder="Heading (optional) — e.g. We&rsquo;re opening a new branch!" value={heading} onChange={(e) => setHeading(e.target.value)} />
                <div>
                  <textarea className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500 resize-none font-[inherit]" rows={7}
                    placeholder={"Write the letter body. Use {firstName}, {lastName}, {company}, {account}, {postcode}, {date} to personalise each copy.\n\ne.g. Thank you for banking with us, {firstName}. Your account {account} is due for review."}
                    value={body} onChange={(e) => setBody(e.target.value)} />
                  <p className="text-[11px] text-gray-400 mt-1">A salutation (<code>Dear {'{firstName}'},</code>) and sign-off are added automatically. Tokens: <code>{'{firstName}'}</code> <code>{'{lastName}'}</code> <code>{'{company}'}</code> <code>{'{account}'}</code> <code>{'{postcode}'}</code> <code>{'{date}'}</code>.</p>
                </div>
                <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500" placeholder="Sign-off (optional) — e.g. Sam Rivera, Store Manager" value={signOff} onChange={(e) => setSignOff(e.target.value)} />
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-gray-600">Campaign name</label>
              <input className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500" placeholder="e.g. New branch opening" value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600">Email subject <span className="text-gray-400">(for recipients who get it digitally)</span></label>
              <input className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500" placeholder="e.g. Our new branch is opening" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>

            <label className="flex items-start gap-2 text-sm text-gray-700">
              <input type="checkbox" className="mt-0.5 w-4 h-4 accent-violet-600" checked={addQr} onChange={(e) => setAddQr(e.target.checked)} />
              <span><span className="flex items-center gap-1 font-medium"><QrCode size={13} /> Add a unique return QR to each copy</span><span className="text-xs text-gray-400">So returned documents can be matched back through the mailroom scanner (e.g. ballots).</span></span>
            </label>

            {inserts.length > 0 && (
              <div>
                <label className="text-xs font-medium text-gray-600">Attach documents (optional)</label>
                <div className="mt-1 border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-36 overflow-auto">
                  {inserts.map((i) => (
                    <label key={i.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-gray-50">
                      <input type="checkbox" className="w-4 h-4 accent-violet-600" checked={chosen.has(i.id)} onChange={() => toggleInsert(i.id)} />
                      <span className="text-gray-800">{i.name}</span>
                      {i.category && <span className="text-[10px] text-gray-400">{i.category}</span>}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="text-sm text-gray-600 bg-violet-50 border border-violet-100 rounded-lg px-3 py-2">
              {recipientCount === null ? 'Counting recipients…' : <>Will send to <strong>{recipientCount}</strong> active recipient{recipientCount === 1 ? '' : 's'}, each by their delivery preference (email or post).</>}
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={createAndSend} disabled={busy || !recipientCount} className="flex items-center gap-2 bg-violet-700 hover:bg-violet-800 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Create &amp; send
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
