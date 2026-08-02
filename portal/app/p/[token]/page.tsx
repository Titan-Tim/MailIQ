'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

export default function RecipientPortal() {
  const { token } = useParams<{ token: string }>()
  const [meta, setMeta] = useState<any>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'notfound'>('loading')
  const [uploading, setUploading] = useState(false)
  const [uploads, setUploads] = useState<any[]>([])
  const [returned, setReturned] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`${API}/api/portal/${token}`)
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d) => { setMeta(d); setUploads(d.uploads || []); setReturned(d.returned); setState('ready') })
      .catch(() => setState('notfound'))
  }, [token])

  async function onUpload(file: File) {
    setUploading(true); setError('')
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch(`${API}/api/portal/${token}/upload`, { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Upload failed — please try again')
      const d = await res.json()
      setUploads(d.uploads || []); setReturned(true)
    } catch (e: any) { setError(e.message) } finally { setUploading(false) }
  }

  if (state === 'loading') return <Centered><p className="text-gray-400 text-sm">Loading…</p></Centered>
  if (state === 'notfound') return <Centered><div className="text-center"><p className="text-gray-800 font-medium">Link not found</p><p className="text-gray-500 text-sm mt-1">This link may have expired or is incorrect.</p></div></Centered>

  const brand = meta.org?.brandColor || '#7c3aed'

  return (
    <Centered>
      <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
        <div style={{ background: brand }} className="px-6 py-5">
          <p className="text-white/90 text-sm">{meta.org?.name}</p>
          <h1 className="text-white text-lg font-bold mt-0.5">{meta.subject || 'Your document'}</h1>
        </div>
        <div className="p-6 space-y-5">
          <p className="text-gray-700 text-sm">Hello {meta.recipientName}, your document is ready{meta.campaign ? ` (${meta.campaign})` : ''}.</p>

          <a href={`${API}/api/portal/${token}/document`} target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full text-white text-sm font-medium px-4 py-3 rounded-lg" style={{ background: brand }}>
            View &amp; download your document
          </a>
          {meta.reference && <p className="text-xs text-gray-400 text-center">Reference: {meta.reference}</p>}

          <div className="border-t border-gray-100 pt-5">
            {returned ? (
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-2">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                </div>
                <p className="font-medium text-gray-800">Thank you — we&rsquo;ve received your response.</p>
                {uploads.length > 0 && <p className="text-xs text-gray-500 mt-1">{uploads.map((u) => u.fileName).join(', ')}</p>}
                <button onClick={() => { setReturned(false) }} className="text-xs text-gray-400 hover:text-gray-600 mt-3 underline">Upload another file</button>
              </div>
            ) : (
              <div className="text-center">
                <p className="text-sm font-medium text-gray-800 mb-1">Respond</p>
                <p className="text-xs text-gray-500 mb-3">When you&rsquo;ve completed the document, upload it back here.</p>
                <button onClick={() => fileRef.current?.click()} disabled={uploading}
                  className="inline-flex items-center gap-2 border border-gray-300 hover:border-violet-400 text-gray-700 text-sm font-medium px-5 py-2.5 rounded-lg disabled:opacity-60">
                  {uploading ? 'Uploading…' : 'Upload your completed document'}
                </button>
                <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f) }} />
                {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
              </div>
            )}
          </div>
        </div>
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-100">
          <p className="text-[11px] text-gray-400 text-center">Secure document portal · This link is unique to you.</p>
        </div>
      </div>
    </Centered>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">{children}</div>
}
