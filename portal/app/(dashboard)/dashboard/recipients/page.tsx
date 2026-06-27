'use client'
import { useEffect, useState, useRef } from 'react'
import { apiFetch, apiUpload } from '@/lib/api'
import { UserPlus, Search, Upload, Trash2, Mail, MapPin, Phone, Edit2, X, Check } from 'lucide-react'

const DELIVERY_STYLE: Record<string, string> = {
  DIGITAL: 'bg-blue-100 text-blue-700',
  POST:    'bg-gray-100 text-gray-600',
  AUTO:    'bg-amber-100 text-amber-700',
}

const EMPTY_FORM = {
  title: '', firstName: '', lastName: '', companyName: '',
  accountNumber: '', reference: '', email: '',
  addressLine1: '', addressLine2: '', city: '', county: '', postcode: '',
  deliveryMethod: 'AUTO',
}

export default function RecipientsPage() {
  const [recipients, setRecipients] = useState<any[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<any>(null)
  const csvRef = useRef<HTMLInputElement>(null)

  async function load() {
    const params = new URLSearchParams({ limit: '100' })
    if (search) params.set('search', search)
    const data = await apiFetch(`/api/recipients?${params}`)
    setRecipients(data.recipients)
    setTotal(data.total)
    setLoading(false)
  }

  useEffect(() => { load() }, [search])

  function f(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [field]: e.target.value }))
  }

  async function addRecipient(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await apiFetch('/api/recipients', { method: 'POST', body: JSON.stringify(form) })
      setShowAdd(false)
      setForm(EMPTY_FORM)
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function deleteRecipient(id: string) {
    if (!confirm('Remove this recipient? Their dispatch history is preserved.')) return
    await apiFetch(`/api/recipients/${id}`, { method: 'DELETE' })
    load()
  }

  async function importCsv(file: File) {
    setImporting(true)
    setImportResult(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const result = await apiUpload('/api/recipients/import', fd)
      setImportResult(result)
      load()
    } catch (e: any) {
      setImportResult({ error: e.message })
    } finally {
      setImporting(false)
    }
  }

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recipients</h1>
          <p className="text-gray-500 text-sm mt-0.5">{total} recipient{total !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => csvRef.current?.click()} disabled={importing}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50">
            <Upload size={14} /> {importing ? 'Importing…' : 'Import CSV'}
          </button>
          <input ref={csvRef} type="file" accept=".csv" className="hidden"
            onChange={e => e.target.files?.[0] && importCsv(e.target.files[0])} />
          <button onClick={() => setShowAdd(!showAdd)}
            className="flex items-center gap-2 bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-800">
            <UserPlus size={14} /> Add Recipient
          </button>
        </div>
      </div>

      {importResult && (
        <div className={`rounded-lg px-4 py-3 mb-4 text-sm ${importResult.error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'}`}>
          {importResult.error
            ? `Import failed: ${importResult.error}`
            : `Imported: ${importResult.created} created, ${importResult.updated} updated${importResult.errors?.length ? `, ${importResult.errors.length} errors` : ''}`
          }
        </div>
      )}

      {showAdd && (
        <form onSubmit={addRecipient} className="bg-white border border-violet-200 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">New Recipient</h2>
            <button type="button" onClick={() => setShowAdd(false)}><X size={16} className="text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs text-gray-600 mb-1 block">Title</label>
              <input value={form.title} onChange={f('title')} placeholder="Mr / Mrs / Dr" className={inp} /></div>
            <div><label className="text-xs text-gray-600 mb-1 block">First name</label>
              <input value={form.firstName} onChange={f('firstName')} className={inp} /></div>
            <div><label className="text-xs text-gray-600 mb-1 block">Last name *</label>
              <input required value={form.lastName} onChange={f('lastName')} className={inp} /></div>
            <div className="col-span-2"><label className="text-xs text-gray-600 mb-1 block">Company</label>
              <input value={form.companyName} onChange={f('companyName')} className={inp} /></div>
            <div><label className="text-xs text-gray-600 mb-1 block">Account No.</label>
              <input value={form.accountNumber} onChange={f('accountNumber')} className={inp} /></div>
            <div className="col-span-2"><label className="text-xs text-gray-600 mb-1 block">Email</label>
              <input type="email" value={form.email} onChange={f('email')} className={inp} /></div>
            <div><label className="text-xs text-gray-600 mb-1 block">Delivery</label>
              <select value={form.deliveryMethod} onChange={f('deliveryMethod')} className={inp}>
                <option value="AUTO">Auto</option>
                <option value="DIGITAL">Always digital</option>
                <option value="POST">Always post</option>
              </select></div>
            <div className="col-span-3"><label className="text-xs text-gray-600 mb-1 block">Address line 1</label>
              <input value={form.addressLine1} onChange={f('addressLine1')} className={inp} /></div>
            <div className="col-span-2"><label className="text-xs text-gray-600 mb-1 block">Address line 2</label>
              <input value={form.addressLine2} onChange={f('addressLine2')} className={inp} /></div>
            <div><label className="text-xs text-gray-600 mb-1 block">City</label>
              <input value={form.city} onChange={f('city')} className={inp} /></div>
            <div><label className="text-xs text-gray-600 mb-1 block">County</label>
              <input value={form.county} onChange={f('county')} className={inp} /></div>
            <div><label className="text-xs text-gray-600 mb-1 block">Postcode</label>
              <input value={form.postcode} onChange={f('postcode')} className={inp} /></div>
          </div>
          {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setShowAdd(false)} className="px-4 py-1.5 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-1.5 bg-violet-700 text-white text-sm rounded-lg hover:bg-violet-800 disabled:opacity-50">
              {saving ? 'Saving…' : 'Add Recipient'}
            </button>
          </div>
        </form>
      )}

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, email, account number…"
            className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500" />
        </div>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm text-center py-12">Loading…</p>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {recipients.length === 0 ? (
            <p className="py-12 text-center text-gray-400 text-sm">No recipients found.</p>
          ) : recipients.map(r => (
            <div key={r.id} className="flex items-center gap-4 px-5 py-3.5 group">
              <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-violet-700">
                  {r.lastName.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 text-sm">
                  {[r.title, r.firstName, r.lastName].filter(Boolean).join(' ')}
                  {r.companyName && <span className="text-gray-500 font-normal ml-2 text-xs">{r.companyName}</span>}
                </p>
                <div className="flex items-center gap-3 mt-0.5">
                  {r.accountNumber && <span className="text-xs text-violet-600 font-mono">{r.accountNumber}</span>}
                  {r.email && <span className="text-xs text-gray-400 flex items-center gap-1"><Mail size={10} />{r.email}</span>}
                  {r.postcode && <span className="text-xs text-gray-400 flex items-center gap-1"><MapPin size={10} />{r.postcode}</span>}
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${DELIVERY_STYLE[r.deliveryMethod] || ''}`}>
                {r.deliveryMethod}
              </span>
              <span className="text-xs text-gray-400">{r._count?.dispatches || 0} docs</span>
              <button onClick={() => deleteRecipient(r.id)}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-red-500 transition-all">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
