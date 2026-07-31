'use client'
import { useEffect, useState } from 'react'
import { apiFetch, separatorSheetUrl } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { FolderInput, KeyRound, Copy, Check, RefreshCw, FileDown, ShieldAlert, Loader2 } from 'lucide-react'

export default function ScanSetupPage() {
  const { user } = useAuth()
  const [key, setKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reveal, setReveal] = useState(false)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') { setLoading(false); return }
    apiFetch('/api/inbound/ingest-key').then((d) => setKey(d.ingestKey)).finally(() => setLoading(false))
  }, [user])

  async function regenerate() {
    if (!confirm('Generate a new key? The old one stops working immediately — any agent using it must be updated.')) return
    setBusy(true)
    try { const d = await apiFetch('/api/inbound/ingest-key/regenerate', { method: 'POST' }); setKey(d.ingestKey); setReveal(true) }
    finally { setBusy(false) }
  }

  if (user && user.role !== 'SUPER_ADMIN') {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-12 text-center max-w-lg mx-auto">
          <ShieldAlert size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-gray-700 font-medium">Admins only</p>
          <p className="text-gray-500 text-sm mt-1">Scan-folder setup is managed by an admin.</p>
        </div>
      </div>
    )
  }

  const masked = key ? key.slice(0, 8) + '•'.repeat(Math.max(0, key.length - 12)) + key.slice(-4) : ''

  return (
    <div className="p-6 max-w-3xl">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center"><FolderInput size={20} className="text-violet-700" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scan Folder</h1>
          <p className="text-gray-500 text-sm mt-0.5">Let mailroom staff scan into a hot folder — batches are split at separator sheets and routed automatically.</p>
        </div>
      </div>

      {/* Ingest key */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-1"><KeyRound size={16} className="text-violet-700" /> Ingest key</h2>
        <p className="text-xs text-gray-500 mb-3">The scan-folder agent uses this key to send documents to your account. Keep it private.</p>
        {loading ? <p className="text-gray-400 text-sm">Loading…</p> : (
          <div className="flex items-center gap-2">
            <code className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-mono text-sm truncate">
              {key ? (reveal ? key : masked) : 'No key yet — generate one below.'}
            </code>
            {key && (
              <>
                <button onClick={() => setReveal(!reveal)} className="text-xs text-violet-700 font-medium px-2 py-2 hover:underline">{reveal ? 'Hide' : 'Reveal'}</button>
                <button onClick={() => { navigator.clipboard.writeText(key); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                  className="flex items-center gap-1 border border-gray-200 hover:bg-gray-50 text-gray-600 text-sm px-3 py-2 rounded-lg">
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
                </button>
              </>
            )}
            <button onClick={regenerate} disabled={busy}
              className="flex items-center gap-1.5 bg-violet-700 hover:bg-violet-800 disabled:opacity-60 text-white text-sm font-medium px-3 py-2 rounded-lg">
              {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {key ? 'Regenerate' : 'Generate key'}
            </button>
          </div>
        )}
      </div>

      {/* Separator sheet */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-4">
        <h2 className="font-semibold text-gray-800 mb-1">Separator sheet</h2>
        <p className="text-xs text-gray-500 mb-3">Print a stack and place one <strong>between each document</strong> when scanning a batch. Mail-IQ splits the batch at each sheet and discards the separator page.</p>
        <a href={separatorSheetUrl()} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 text-sm font-medium px-4 py-2 rounded-lg">
          <FileDown size={16} /> Download separator sheet (PDF)
        </a>
      </div>

      {/* Setup steps */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="font-semibold text-gray-800 mb-3">Set up the scan-folder agent</h2>
        <ol className="text-sm text-gray-600 space-y-2 list-decimal pl-5">
          <li>Install the Mail-IQ scan-folder agent on an office PC (provided separately), and run <code className="bg-gray-50 px-1 rounded">npm install</code>.</li>
          <li>Run <code className="bg-gray-50 px-1 rounded">npm run setup</code> — a short wizard asks for your Mail-IQ address, the <strong>ingest key</strong> above (copy it), and your scan-folder path, then runs a live connection test.</li>
          <li>Run <code className="bg-gray-50 px-1 rounded">npm start</code> to begin watching.</li>
          <li>Scan a batch (documents separated by the sheet above) into the hot folder — each document is split out, classified, and routed to the right mailbox.</li>
        </ol>
      </div>
    </div>
  )
}
