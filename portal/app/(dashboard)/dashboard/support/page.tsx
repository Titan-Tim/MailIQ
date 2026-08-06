'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { LifeBuoy, Mail, Send, Loader2, CheckCircle2 } from 'lucide-react'

export default function SupportPage() {
  const { user } = useAuth()
  const [supportEmail, setSupportEmail] = useState('support@sol-iq.co.uk')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { apiFetch('/api/support').then((d) => d.supportEmail && setSupportEmail(d.supportEmail)).catch(() => {}) }, [])

  async function submit() {
    if (!message.trim()) { setError('Please describe how we can help'); return }
    setBusy(true); setError('')
    try {
      await apiFetch('/api/support', { method: 'POST', body: JSON.stringify({ subject, message }) })
      setSent(true)
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center"><LifeBuoy size={20} className="text-violet-700" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Support</h1>
          <p className="text-gray-500 text-sm mt-0.5">We&rsquo;re here to help. Send us a message and we&rsquo;ll get back to you.</p>
        </div>
      </div>

      {sent ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3"><CheckCircle2 size={24} className="text-emerald-600" /></div>
          <p className="font-semibold text-gray-900">Thanks — your message is on its way.</p>
          <p className="text-sm text-gray-500 mt-1">We&rsquo;ll reply to <strong>{user?.email}</strong> as soon as we can.</p>
          <button onClick={() => { setSent(false); setSubject(''); setMessage('') }} className="mt-4 text-sm text-violet-700 hover:text-violet-800 font-medium">Send another message</button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-gray-600">Subject</label>
              <input className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500" placeholder="What&rsquo;s it about?" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600">How can we help?</label>
              <textarea rows={7} className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500 resize-none" placeholder="Describe the issue or question — include any details that would help us." value={message} onChange={(e) => setMessage(e.target.value)} />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-400">Sent as {user?.name || user?.email}{user?.tenant?.name ? ` · ${user.tenant.name}` : ''}</p>
              <button onClick={submit} disabled={busy} className="flex items-center gap-2 bg-violet-700 hover:bg-violet-800 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Send message
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2 text-sm text-gray-500">
        <Mail size={15} className="text-gray-400" />
        Prefer email? Reach us directly at <a href={`mailto:${supportEmail}`} className="text-violet-700 hover:text-violet-800 font-medium">{supportEmail}</a>
      </div>
    </div>
  )
}
