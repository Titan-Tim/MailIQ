'use client'
import { useState, FormEvent } from 'react'
import Link from 'next/link'
import { Mail } from 'lucide-react'
import { forgotPassword } from '@/lib/api'

export default function ForgotPasswordPage() {
  const [email, setEmail]       = useState('')
  const [error, setError]       = useState('')
  const [loading, setLoading]   = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await forgotPassword(email)
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-900 via-violet-800 to-purple-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center backdrop-blur-sm">
            <Mail size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Jasmitan Mail</h1>
            <p className="text-violet-300 text-sm">Document Dispatch Management</p>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-8">
          {submitted ? (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Check your inbox</h2>
              <p className="text-gray-500 text-sm mb-6">
                If an account exists for that email, we&apos;ve sent a temporary password. Sign in with it
                and you&apos;ll be asked to set a new one straight away.
              </p>
              <Link href="/login" className="block text-center w-full bg-violet-700 text-white py-2 rounded-lg font-medium text-sm hover:bg-violet-800 transition-colors">
                Back to sign in
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Forgot password?</h2>
              <p className="text-gray-500 text-sm mb-6">Enter your email and we&apos;ll send you a temporary password.</p>

              <form onSubmit={submit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                  <input
                    type="email" required value={email}
                    onChange={e => setEmail(e.target.value)}
                    autoComplete="email"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    placeholder="you@example.com"
                  />
                </div>
                {error && (
                  <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2">
                    <p className="text-red-700 text-sm">{error}</p>
                  </div>
                )}
                <button
                  type="submit" disabled={loading}
                  className="w-full bg-violet-700 text-white py-2 rounded-lg font-medium text-sm hover:bg-violet-800 disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Sending…' : 'Send temporary password'}
                </button>
                <Link href="/login" className="block text-center text-sm text-gray-500 hover:text-gray-700">
                  ← Back to sign in
                </Link>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
