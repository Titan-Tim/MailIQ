'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { RotateCcw, Search, ScanLine, CheckCircle2, AlertCircle } from 'lucide-react'

export default function ReturnsPage() {
  const [returns, setReturns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [scanCode, setScanCode] = useState('')
  const [scanReason, setScanReason] = useState('')
  const [scanResult, setScanResult] = useState<any>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [showResolved, setShowResolved] = useState(false)

  async function load() {
    const data = await apiFetch(`/api/returns${showResolved ? '' : '?resolved=false'}`)
    setReturns(data)
    setLoading(false)
  }
  useEffect(() => { load() }, [showResolved])

  async function scanBarcode(e: React.FormEvent) {
    e.preventDefault()
    if (!scanCode.trim()) return
    setScanning(true)
    setScanError('')
    setScanResult(null)
    try {
      const result = await apiFetch('/api/returns/scan', {
        method: 'POST',
        body: JSON.stringify({ barcodeCode: scanCode.toUpperCase(), returnReason: scanReason || null })
      })
      setScanResult(result)
      setScanCode('')
      setScanReason('')
      load()
    } catch (e: any) {
      setScanError(e.message)
    } finally {
      setScanning(false)
    }
  }

  async function resolveReturn(id: string) {
    await apiFetch(`/api/returns/${id}/resolve`, { method: 'POST' })
    load()
  }

  const REASONS = ['Gone away', 'Not known at address', 'Refused', 'Insufficient address', 'Deceased', 'Other']

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Return Mail</h1>
        <p className="text-gray-500 text-sm mt-0.5">Scan barcodes from returned letters to log and reconcile them</p>
      </div>

      {/* Scan form */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h2 className="font-semibold text-gray-800 mb-3 flex items-center gap-2">
          <ScanLine size={16} className="text-violet-600" />
          Scan Returned Letter
        </h2>
        <form onSubmit={scanBarcode} className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs text-gray-600 mb-1 block">Barcode (scan or type)</label>
            <input
              value={scanCode}
              onChange={e => setScanCode(e.target.value)}
              placeholder="MQ-XXXXXXXX"
              autoFocus
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-violet-500"
            />
          </div>
          <div className="w-52">
            <label className="text-xs text-gray-600 mb-1 block">Return reason</label>
            <select value={scanReason} onChange={e => setScanReason(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500">
              <option value="">Select reason…</option>
              {REASONS.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <button type="submit" disabled={scanning || !scanCode.trim()}
            className="flex items-center gap-2 bg-violet-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-violet-800 disabled:opacity-50">
            <ScanLine size={14} />
            {scanning ? 'Logging…' : 'Log Return'}
          </button>
        </form>

        {scanError && (
          <div className="mt-3 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 flex gap-2">
            <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-red-700 text-sm">{scanError}</p>
          </div>
        )}

        {scanResult && (
          <div className="mt-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
            <p className="text-emerald-700 text-sm font-medium flex items-center gap-2">
              <CheckCircle2 size={14} /> Return logged successfully
            </p>
            {scanResult.dispatch?.recipient && (
              <p className="text-emerald-600 text-xs mt-1">
                {scanResult.dispatch.recipient.name} · Acc: {scanResult.dispatch.recipient.accountNumber || '—'}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Returns list */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-gray-800">Return Log</h2>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)}
            className="rounded border-gray-300 text-violet-600 focus:ring-violet-500" />
          Show resolved
        </label>
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm text-center py-8">Loading…</p>
      ) : returns.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-12 flex flex-col items-center gap-3">
          <RotateCcw size={32} className="text-gray-300" />
          <p className="text-gray-500 font-medium">No returns logged</p>
          <p className="text-gray-400 text-sm">Use the scanner above when you receive undelivered mail</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
          {returns.map(r => (
            <div key={r.id} className="flex items-center gap-4 px-5 py-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-gray-900 text-sm font-mono text-xs">{r.scannedCode}</p>
                  {r.returnReason && (
                    <span className="text-xs bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded">
                      {r.returnReason}
                    </span>
                  )}
                </div>
                {r.dispatch?.recipient && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {[r.dispatch.recipient.firstName, r.dispatch.recipient.lastName].filter(Boolean).join(' ')}
                    {r.dispatch.recipient.email && ` · ${r.dispatch.recipient.email}`}
                    {r.dispatch.recipient.accountNumber && ` · Acc: ${r.dispatch.recipient.accountNumber}`}
                  </p>
                )}
                <p className="text-xs text-gray-400 mt-0.5">
                  Scanned {new Date(r.scannedAt).toLocaleString('en-GB')}
                </p>
              </div>
              {r.resolvedAt ? (
                <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                  <CheckCircle2 size={12} /> Resolved
                </span>
              ) : (
                <button onClick={() => resolveReturn(r.id)}
                  className="text-xs font-medium text-violet-700 border border-violet-300 rounded-lg px-3 py-1.5 hover:bg-violet-50">
                  Resolve
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
