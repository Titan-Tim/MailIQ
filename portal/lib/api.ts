const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002'

export async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((opts.headers as Record<string, string>) || {}),
    },
  })
  if (res.status === 401) {
    // Try refresh
    const refresh = typeof window !== 'undefined' ? localStorage.getItem('refreshToken') : null
    if (refresh) {
      const rr = await fetch(`${API}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      })
      if (rr.ok) {
        const data = await rr.json()
        localStorage.setItem('accessToken',  data.accessToken)
        localStorage.setItem('refreshToken', data.refreshToken)
        return apiFetch(path, opts)
      }
    }
    localStorage.clear()
    window.location.href = '/mail/login'
    throw new Error('Session expired')
  }
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { const d = await res.json(); msg = d.error || msg } catch {}
    throw new Error(msg)
  }
  return res.json()
}

/** Upload a file (multipart). Returns JSON. */
export async function apiUpload(path: string, formData: FormData) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { const d = await res.json(); msg = d.error || msg } catch {}
    throw new Error(msg)
  }
  return res.json()
}

export function fileUrl(dispatchId: string, composed = false) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : ''
  return `${API}/api/dispatches/${dispatchId}/file${composed ? '?composed=1' : ''}` +
    (token ? `${composed ? '&' : '?'}auth=${token}` : '')
}

export function insertFileUrl(insertId: string) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : ''
  return `${API}/api/inserts/${insertId}/file${token ? `?auth=${token}` : ''}`
}

export async function forgotPassword(email: string) {
  const res = await fetch(`${API}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Request failed')
  }
  return res.json()
}
