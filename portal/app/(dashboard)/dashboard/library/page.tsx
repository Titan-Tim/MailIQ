'use client'
import { useEffect, useState, useRef } from 'react'
import { apiFetch, apiUpload } from '@/lib/api'
import { BookOpen, Upload, Trash2, FileText, Tag, X, Eye } from 'lucide-react'

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

const CATEGORIES = ['insurance', 'medical', 'legal', 'financial', 'general']

export default function LibraryPage() {
  const [inserts, setInserts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', category: '' })
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : ''

  async function load() {
    const data = await apiFetch('/api/inserts')
    setInserts(data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function uploadInsert(e: React.FormEvent) {
    e.preventDefault()
    if (!file) { setError('Please select a PDF file'); return }
    setUploading(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('name', form.name)
      if (form.description) fd.append('description', form.description)
      if (form.category) fd.append('category', form.category)
      await apiUpload('/api/inserts', fd)
      setShowForm(false)
      setForm({ name: '', description: '', category: '' })
      setFile(null)
      load()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  async function deleteInsert(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return
    await apiFetch(`/api/inserts/${id}`, { method: 'DELETE' })
    load()
  }

  const grouped = CATEGORIES.reduce((acc, cat) => {
    acc[cat] = inserts.filter(i => i.category === cat)
    return acc
  }, {} as Record<string, any[]>)
  const uncategorised = inserts.filter(i => !i.category)

  const inp = 'w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Insert Library</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {inserts.length} document{inserts.length !== 1 ? 's' : ''} available to attach to dispatches
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-800">
          <Upload size={14} /> Upload Insert
        </button>
      </div>

      {showForm && (
        <form onSubmit={uploadInsert} className="bg-white border border-violet-200 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">New Insert Document</h2>
            <button type="button" onClick={() => setShowForm(false)}><X size={16} className="text-gray-400" /></button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-gray-600 mb-1 block">Document Name *</label>
              <input required value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                placeholder="e.g. Travel Abroad Guide" className={inp} />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Category</label>
              <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className={inp}>
                <option value="">No category</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">PDF File *</label>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => fileRef.current?.click()}
                  className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                  Choose file
                </button>
                <span className="text-sm text-gray-500 truncate">{file?.name || 'No file selected'}</span>
                <input ref={fileRef} type="file" accept=".pdf" className="hidden"
                  onChange={e => setFile(e.target.files?.[0] || null)} />
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-gray-600 mb-1 block">Description</label>
              <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Brief description of this insert" className={inp} />
            </div>
          </div>
          {error && <p className="text-red-600 text-sm mt-3">{error}</p>}
          <div className="flex justify-end gap-2 mt-4">
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-1.5 text-sm text-gray-600">Cancel</button>
            <button type="submit" disabled={uploading}
              className="px-4 py-1.5 bg-violet-700 text-white text-sm rounded-lg hover:bg-violet-800 disabled:opacity-50">
              {uploading ? 'Uploading…' : 'Upload Insert'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm text-center py-12">Loading…</p>
      ) : inserts.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 flex flex-col items-center gap-3">
          <BookOpen size={36} className="text-gray-300" />
          <p className="text-gray-500 font-medium">No inserts yet</p>
          <p className="text-gray-400 text-sm">Upload PDF documents to add them to the library</p>
        </div>
      ) : (
        <div className="space-y-4">
          {[...CATEGORIES.filter(c => grouped[c]?.length > 0), uncategorised.length > 0 ? 'uncategorised' : null]
            .filter(Boolean).map(cat => {
              const items = cat === 'uncategorised' ? uncategorised : grouped[cat!]
              if (!items?.length) return null
              return (
                <div key={cat} className="bg-white rounded-xl border border-gray-200">
                  <div className="px-5 py-3 border-b border-gray-100">
                    <h3 className="font-semibold text-gray-700 text-sm capitalize flex items-center gap-2">
                      <Tag size={13} className="text-violet-500" />
                      {cat}
                      <span className="text-gray-400 font-normal">({items.length})</span>
                    </h3>
                  </div>
                  <div className="divide-y divide-gray-100">
                    {items.map((ins: any) => (
                      <div key={ins.id} className="flex items-center gap-4 px-5 py-3.5 group">
                        <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center flex-shrink-0">
                          <FileText size={16} className="text-violet-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-gray-900 text-sm">{ins.name}</p>
                          {ins.description && <p className="text-xs text-gray-400 mt-0.5">{ins.description}</p>}
                          <p className="text-xs text-gray-400 mt-0.5">
                            {ins.fileName} · {(ins.fileSizeBytes / 1024).toFixed(0)} KB
                            · used in {ins._count?.dispatchInserts || 0} dispatch{ins._count?.dispatchInserts !== 1 ? 'es' : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <a href={`${API}/api/inserts/${ins.id}/file?auth=${token}`}
                            target="_blank" rel="noopener noreferrer"
                            className="p-1.5 text-gray-400 hover:text-violet-600 rounded-lg hover:bg-violet-50 transition-colors"
                            title="Preview">
                            <Eye size={14} />
                          </a>
                          <button onClick={() => deleteInsert(ins.id, ins.name)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-300 hover:text-red-500 transition-all">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )
          })}
        </div>
      )}
    </div>
  )
}
