'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Users, Plus, Loader2, Mail, Ban, RotateCcw, Copy, Check, ShieldAlert } from 'lucide-react'

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: 'Admin',
  OPERATOR: 'Operator',
  VIEWER: 'Viewer',
}
const ROLES = ['SUPER_ADMIN', 'OPERATOR', 'VIEWER']
const emptyForm = { email: '', name: '', role: 'OPERATOR' }

export default function TeamPage() {
  const { user } = useAuth()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [invite, setInvite] = useState<{ email: string; tempPassword?: string; emailSent: boolean } | null>(null)
  const [copied, setCopied] = useState(false)

  async function load() {
    const d = await apiFetch('/api/users')
    setUsers(d.users)
    setLoading(false)
  }
  useEffect(() => {
    if (user?.role === 'SUPER_ADMIN') load()
    else setLoading(false)
  }, [user])

  // Direct-URL guard — the nav hides this, but block non-admins here too.
  if (user && user.role !== 'SUPER_ADMIN') {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-12 text-center max-w-lg mx-auto">
          <ShieldAlert size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-gray-700 font-medium">Admins only</p>
          <p className="text-gray-500 text-sm mt-1">You need the Admin role to manage team members.</p>
        </div>
      </div>
    )
  }

  async function inviteUser() {
    if (!form.email) { setError('Email is required'); return }
    setBusy(true); setError(''); setInvite(null)
    try {
      const res = await apiFetch('/api/users', { method: 'POST', body: JSON.stringify(form) })
      setInvite({ email: res.user.email, tempPassword: res.tempPassword, emailSent: res.emailSent })
      setForm(emptyForm)
      await load()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }

  async function changeRole(id: string, role: string) {
    await apiFetch(`/api/users/${id}`, { method: 'PUT', body: JSON.stringify({ role }) })
    await load()
  }
  async function setActive(id: string, active: boolean) {
    await apiFetch(`/api/users/${id}/${active ? 'reactivate' : 'deactivate'}`, { method: 'POST' })
    await load()
  }
  async function resend(id: string) {
    const res = await apiFetch(`/api/users/${id}/resend-invite`, { method: 'POST' })
    const u = users.find((x) => x.id === id)
    setInvite({ email: u?.email, tempPassword: res.tempPassword, emailSent: res.emailSent })
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Team</h1>
        <p className="text-gray-500 text-sm mt-0.5">Invite people to {user?.tenant?.name || 'your organisation'} and manage their access.</p>
      </div>

      {/* Invite result banner (esp. useful when email isn't configured yet) */}
      {invite && (
        <div className="mb-5 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          {invite.emailSent ? (
            <p className="text-sm text-emerald-800 flex items-center gap-2">
              <Mail size={15} /> Invite emailed to <strong>{invite.email}</strong>.
            </p>
          ) : (
            <div className="text-sm text-emerald-900">
              <p className="flex items-center gap-2 mb-2"><Mail size={15} /> Email isn&rsquo;t configured yet — share this temporary password with <strong>{invite.email}</strong> manually:</p>
              <div className="flex items-center gap-2">
                <code className="bg-white border border-emerald-200 rounded px-3 py-1.5 font-mono text-sm">{invite.tempPassword}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(invite.tempPassword || ''); setCopied(true); setTimeout(() => setCopied(false), 1500) }}
                  className="flex items-center gap-1 text-emerald-700 hover:text-emerald-900 text-xs font-medium"
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <p className="text-xs text-emerald-700 mt-2">They&rsquo;ll be asked to set their own password on first login.</p>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* User list */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-800">{users.length} member{users.length === 1 ? '' : 's'}</h2>
          </div>
          {loading ? (
            <p className="px-5 py-8 text-center text-gray-400 text-sm">Loading…</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {users.map((u) => {
                const self = u.id === user?.id
                return (
                  <div key={u.id} className={`flex items-center gap-3 px-5 py-3 ${!u.isActive ? 'opacity-60' : ''}`}>
                    <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center shrink-0">
                      <span className="text-sm font-bold text-violet-700">{(u.name || u.email).charAt(0).toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">
                        {u.name || u.email}{self && <span className="text-gray-400 font-normal"> (you)</span>}
                      </p>
                      <p className="text-xs text-gray-400 truncate">
                        {u.email}
                        {!u.isActive && ' · deactivated'}
                        {u.isActive && u.mustChangePassword && ' · invite pending'}
                      </p>
                    </div>

                    {/* Role */}
                    <select
                      value={u.role}
                      disabled={self}
                      onChange={(e) => changeRole(u.id, e.target.value)}
                      title={self ? "You can't change your own role" : 'Change role'}
                      className="border border-gray-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-violet-500 disabled:bg-gray-50 disabled:text-gray-400"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>

                    {/* Actions */}
                    {u.isActive && u.mustChangePassword && (
                      <button onClick={() => resend(u.id)} className="text-gray-400 hover:text-violet-700" title="Resend invite">
                        <Mail size={15} />
                      </button>
                    )}
                    {!self && (u.isActive ? (
                      <button onClick={() => setActive(u.id, false)} className="text-gray-300 hover:text-red-600" title="Deactivate">
                        <Ban size={15} />
                      </button>
                    ) : (
                      <button onClick={() => setActive(u.id, true)} className="text-gray-300 hover:text-emerald-600" title="Reactivate">
                        <RotateCcw size={15} />
                      </button>
                    ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Invite form */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 h-fit">
          <h3 className="font-semibold text-gray-800 mb-4">Invite a member</h3>
          <div className="space-y-3">
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500"
              placeholder="Email address" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500"
              placeholder="Name (optional)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <select className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500"
              value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <p className="text-xs text-gray-400">
              Admin manages users &amp; everything; Operator runs day-to-day mail; Viewer is read-only.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button onClick={inviteUser} disabled={busy}
              className="w-full flex items-center justify-center gap-2 bg-violet-700 hover:bg-violet-800 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Send invite
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
