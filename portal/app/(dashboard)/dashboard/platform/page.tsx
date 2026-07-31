'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Building2, Plus, Loader2, Power, PowerOff, CalendarPlus, ShieldAlert, Copy, Check } from 'lucide-react'

const empty = { name: '', adminName: '', adminEmail: '', licenceMonths: 12, enabledModules: ['inbound', 'outbound'] as string[] }
const ALL_MODULES = ['inbound', 'outbound'] as const

// Preset, customer-appropriate suspension reasons (shown on the tenant's login).
// No free-text entry — prevents anything unprofessional reaching the customer.
const SUSPEND_REASONS = [
  { value: '', label: 'No specific reason (generic message)' },
  { value: 'Paused pending payment of an outstanding invoice.', label: 'Outstanding payment' },
  { value: 'Paused pending contract renewal.', label: 'Contract renewal' },
  { value: 'Paused at your organisation’s request.', label: 'At customer’s request' },
  { value: 'Temporarily paused for scheduled maintenance.', label: 'Scheduled maintenance' },
  { value: 'Your account is under review.', label: 'Account under review' },
]

function licenceState(iso: string | null) {
  if (!iso) return { label: 'no licence', cls: 'bg-gray-100 text-gray-500' }
  const d = new Date(iso), now = new Date()
  const days = Math.round((d.getTime() - now.getTime()) / 86400000)
  if (days < 0) return { label: `expired ${new Date(iso).toLocaleDateString('en-GB')}`, cls: 'bg-red-100 text-red-700' }
  if (days < 30) return { label: `expires ${new Date(iso).toLocaleDateString('en-GB')}`, cls: 'bg-amber-100 text-amber-700' }
  return { label: `licensed to ${new Date(iso).toLocaleDateString('en-GB')}`, cls: 'bg-emerald-100 text-emerald-700' }
}

export default function PlatformPage() {
  const { user } = useAuth()
  const [tenants, setTenants] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<any>(null)
  const [copied, setCopied] = useState(false)
  const [suspendTarget, setSuspendTarget] = useState<any>(null)
  const [suspendReason, setSuspendReason] = useState('')

  async function load() {
    const d = await apiFetch('/api/platform/tenants')
    setTenants(d.tenants)
    setLoading(false)
  }
  useEffect(() => { if (user?.isPlatformAdmin) load(); else setLoading(false) }, [user])

  if (user && !user.isPlatformAdmin) {
    return (
      <div className="p-6">
        <div className="bg-white rounded-xl border border-gray-200 px-5 py-12 text-center max-w-lg mx-auto">
          <ShieldAlert size={28} className="mx-auto text-gray-300 mb-2" />
          <p className="text-gray-700 font-medium">Provider access only</p>
          <p className="text-gray-500 text-sm mt-1">The platform area is for the Mail-IQ provider.</p>
        </div>
      </div>
    )
  }

  async function provision() {
    if (!form.name || !form.adminEmail) { setError('Organisation name and admin email are required'); return }
    setBusy(true); setError(''); setResult(null)
    try {
      const r = await apiFetch('/api/platform/tenants', { method: 'POST', body: JSON.stringify(form) })
      setResult(r); setForm(empty); await load()
    } catch (e: any) { setError(e.message) } finally { setBusy(false) }
  }
  async function activate(id: string) {
    await apiFetch(`/api/platform/tenants/${id}/activate`, { method: 'POST' })
    await load()
  }
  async function confirmSuspend() {
    await apiFetch(`/api/platform/tenants/${suspendTarget.id}/suspend`, { method: 'POST', body: JSON.stringify({ reason: suspendReason || undefined }) })
    setSuspendTarget(null)
    await load()
  }
  async function extend(id: string) {
    await apiFetch(`/api/platform/tenants/${id}/licence`, { method: 'PUT', body: JSON.stringify({ extendMonths: 12 }) })
    await load()
  }
  async function toggleModule(t: any, mod: string) {
    const cur = new Set<string>(t.enabledModules?.length ? t.enabledModules : ['inbound', 'outbound'])
    cur.has(mod) ? cur.delete(mod) : cur.add(mod)
    await apiFetch(`/api/platform/tenants/${t.id}/modules`, { method: 'PUT', body: JSON.stringify({ enabledModules: Array.from(cur) }) })
    await load()
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center"><Building2 size={20} className="text-violet-700" /></div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Platform</h1>
          <p className="text-gray-500 text-sm mt-0.5">Provision subscriber tenancies, manage licences, and switch accounts on or off.</p>
        </div>
      </div>

      {result && (
        <div className="mb-5 bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-900">
          <p className="font-medium mb-1">Provisioned {result.tenant.name}.</p>
          {result.emailSent
            ? <p>The admin invite was emailed to <strong>{result.adminEmail}</strong>.</p>
            : <div className="flex items-center gap-2">
                <span>Email isn&rsquo;t configured — share these with <strong>{result.adminEmail}</strong>:</span>
                <code className="bg-white border border-emerald-200 rounded px-2 py-1 font-mono">{result.tempPassword}</code>
                <button onClick={() => { navigator.clipboard.writeText(result.tempPassword); setCopied(true); setTimeout(() => setCopied(false), 1500) }} className="text-emerald-700 hover:text-emerald-900">{copied ? <Check size={14} /> : <Copy size={14} />}</button>
              </div>}
        </div>
      )}

      <div className="grid grid-cols-3 gap-6">
        {/* Tenant list */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200">
          <div className="px-5 py-4 border-b border-gray-100"><h2 className="font-semibold text-gray-800">{tenants.length} tenanc{tenants.length === 1 ? 'y' : 'ies'}</h2></div>
          {loading ? <p className="px-5 py-8 text-center text-gray-400 text-sm">Loading…</p> : (
            <div className="divide-y divide-gray-100">
              {tenants.map((t) => {
                const lic = licenceState(t.licenceExpiresAt)
                const suspended = t.status === 'SUSPENDED'
                return (
                  <div key={t.id} className={`px-5 py-3.5 ${suspended ? 'bg-red-50/40' : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm flex items-center gap-2">
                          {t.name}
                          {suspended && <span className="text-[10px] font-semibold text-red-700 bg-red-100 px-1.5 py-0.5 rounded-full">SUSPENDED</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">/{t.slug} · {t.users || 0} user{t.users === 1 ? '' : 's'} · {t.inboundItems || 0} inbound</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="text-[10px] text-gray-400">modules:</span>
                          {ALL_MODULES.map((m) => {
                            const on = (t.enabledModules?.length ? t.enabledModules : ['inbound', 'outbound']).includes(m)
                            return (
                              <button key={m} onClick={() => toggleModule(t, m)}
                                title={on ? `Licensed — click to remove ${m}` : `Not licensed — click to enable ${m}`}
                                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium capitalize transition-colors ${on ? 'bg-violet-100 text-violet-700 hover:bg-violet-200' : 'bg-gray-100 text-gray-400 hover:bg-gray-200 line-through'}`}>
                                {m}
                              </button>
                            )
                          })}
                        </div>
                      </div>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${lic.cls}`}>{lic.label}</span>
                      <button onClick={() => extend(t.id)} title="Extend licence 12 months" className="text-gray-400 hover:text-violet-700 p-1"><CalendarPlus size={16} /></button>
                      {suspended
                        ? <button onClick={() => activate(t.id)} title="Switch on" className="text-gray-400 hover:text-emerald-600 p-1"><Power size={16} /></button>
                        : <button onClick={() => { setSuspendTarget(t); setSuspendReason('') }} title="Switch off" className="text-gray-400 hover:text-red-600 p-1"><PowerOff size={16} /></button>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Provision form */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 h-fit">
          <h3 className="font-semibold text-gray-800 mb-4">New tenancy</h3>
          <div className="space-y-3">
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500" placeholder="Organisation name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500" placeholder="Admin email" value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} />
            <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500" placeholder="Admin name (optional)" value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} />
            <div>
              <span className="block text-xs text-gray-500 mb-1">Licensed modules</span>
              <div className="flex gap-4">
                {ALL_MODULES.map((m) => (
                  <label key={m} className="flex items-center gap-1.5 text-sm text-gray-700 capitalize cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-violet-600" checked={form.enabledModules.includes(m)}
                      onChange={() => { const cur = new Set(form.enabledModules); cur.has(m) ? cur.delete(m) : cur.add(m); setForm({ ...form, enabledModules: Array.from(cur) }) }} />
                    {m}
                  </label>
                ))}
              </div>
            </div>
            <label className="block text-xs text-gray-500">Licence length
              <select className="w-full mt-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-violet-500" value={form.licenceMonths} onChange={(e) => setForm({ ...form, licenceMonths: +e.target.value })}>
                <option value={12}>12 months</option>
                <option value={1}>1 month (trial)</option>
                <option value={3}>3 months</option>
                <option value={24}>24 months</option>
              </select>
            </label>
            <p className="text-xs text-gray-400">Creates a clean portal + a SUPER_ADMIN login. They&rsquo;re emailed an invite (or you share the temp password).</p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button onClick={provision} disabled={busy} className="w-full flex items-center justify-center gap-2 bg-violet-700 hover:bg-violet-800 disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Provision tenancy
            </button>
          </div>
        </div>
      </div>

      {/* Suspend modal — preset reasons only */}
      {suspendTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setSuspendTarget(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-gray-800 mb-1">Switch off {suspendTarget.name}?</h3>
            <p className="text-xs text-gray-500 mb-4">Their users won&rsquo;t be able to log in. Choose the message shown on their login screen.</p>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason (shown to the customer)</label>
            <select value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-4 outline-none focus:border-violet-500">
              {SUSPEND_REASONS.map((r) => <option key={r.label} value={r.value}>{r.label}</option>)}
            </select>
            <div className="flex justify-end gap-2">
              <button onClick={() => setSuspendTarget(null)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
              <button onClick={confirmSuspend} className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-lg">
                <PowerOff size={15} /> Switch off
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
