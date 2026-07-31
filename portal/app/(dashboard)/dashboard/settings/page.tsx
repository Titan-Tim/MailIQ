'use client'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { KeyRound, SlidersHorizontal, Download, Upload, Check } from 'lucide-react'

export default function SettingsPage() {
  const { user, setUser } = useAuth()
  const [defaultModule, setDefaultModule] = useState<'inbound' | 'outbound'>('inbound')
  const [prefSaved, setPrefSaved] = useState(false)
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword]         = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    try { if (localStorage.getItem('mailiq_default_module') === 'outbound') setDefaultModule('outbound') } catch {}
  }, [])

  function saveDefaultModule(m: 'inbound' | 'outbound') {
    setDefaultModule(m)
    try {
      localStorage.setItem('mailiq_default_module', m)
      localStorage.setItem('mailiq_module', m) // keep the sidebar in step
    } catch {}
    setPrefSaved(true)
    setTimeout(() => setPrefSaved(false), 2500)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess(false)

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match')
      return
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters')
      return
    }

    setSaving(true)
    try {
      await apiFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword })
      })
      if (user) setUser({ ...user, mustChangePassword: false })
      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: any) {
      setError(err.message || 'Could not change password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-md mx-auto py-10 px-4">
      <h1 className="text-xl font-semibold text-gray-900 mb-6">Settings</h1>

      {/* Preferences */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <SlidersHorizontal size={18} className="text-violet-700" />
          <h2 className="font-semibold text-gray-900">Preferences</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">Which module opens when you sign in.</p>
        <div className="flex gap-2">
          {(['inbound', 'outbound'] as const).map((m) => {
            const on = defaultModule === m
            const Icon = m === 'inbound' ? Download : Upload
            return (
              <button key={m} onClick={() => saveDefaultModule(m)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium border transition-colors ${
                  on ? 'bg-violet-700 text-white border-violet-700' : 'bg-white text-gray-700 border-gray-200 hover:border-violet-300'
                }`}>
                <Icon size={15} /> {m === 'inbound' ? 'Inbound' : 'Outbound'}
              </button>
            )
          })}
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          {prefSaved
            ? <span className="text-emerald-600 inline-flex items-center gap-1"><Check size={12} /> Saved — opens the {defaultModule} module next time.</span>
            : 'Saved on this device.'}
        </p>
      </div>

      <div className="flex items-center gap-2 mb-6">
        <KeyRound size={20} className="text-violet-700" />
        <h2 className="text-lg font-semibold text-gray-900">Change Password</h2>
      </div>

      {user?.mustChangePassword && (
        <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
          You&apos;re using a temporary password. Please set a new password to continue.
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        {error && (
          <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {error}
          </div>
        )}
        {success && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
            Password changed successfully.
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
          <input
            type="password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
          <input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
          <input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        <button
          type="submit"
          disabled={saving}
          className="w-full py-2 px-4 bg-violet-700 text-white text-sm font-medium rounded-lg hover:bg-violet-800 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Saving…' : 'Change Password'}
        </button>
      </form>
    </div>
  )
}
