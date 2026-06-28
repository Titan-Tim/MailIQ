'use client'
import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import {
  Mail, LayoutDashboard, Inbox, Users, BookOpen,
  Settings, Printer, Send, RotateCcw, LogOut, KeyRound
} from 'lucide-react'

const NAV = [
  { href: '/dashboard',           label: 'Overview',      icon: LayoutDashboard },
  { href: '/dashboard/inbox',     label: 'Inbox',         icon: Inbox },
  { href: '/dashboard/print',     label: 'Print Queue',   icon: Printer },
  { href: '/dashboard/digital',   label: 'Digital Sent',  icon: Send },
  { href: '/dashboard/recipients',label: 'Recipients',    icon: Users },
  { href: '/dashboard/library',   label: 'Insert Library',icon: BookOpen },
  { href: '/dashboard/rules',     label: 'Dispatch Rules',icon: Settings },
  { href: '/dashboard/returns',   label: 'Returns',       icon: RotateCcw },
  { href: '/dashboard/settings',  label: 'Change Password',icon: KeyRound },
]

function Sidebar() {
  const { user, logout } = useAuth()
  const pathname = usePathname()

  return (
    <aside className="fixed inset-y-0 left-0 w-56 bg-violet-900 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center gap-2.5 px-5 border-b border-violet-800">
        <div className="w-7 h-7 bg-white/15 rounded-lg flex items-center justify-center">
          <Mail size={14} className="text-white" />
        </div>
        <span className="font-bold text-white text-base">Jasmitan Mail</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
          return (
            <Link key={href} href={href}
              className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-white/15 text-white'
                  : 'text-violet-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon size={15} />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-violet-800">
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg">
          <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">
              {(user?.name || user?.email || '?').charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white text-xs font-medium truncate">{user?.name || user?.email}</p>
            <p className="text-violet-400 text-xs truncate">{user?.role}</p>
          </div>
          <button onClick={logout} className="text-violet-400 hover:text-white transition-colors" title="Sign out">
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  )
}

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login')
    } else if (!loading && user?.mustChangePassword && pathname !== '/dashboard/settings') {
      router.push('/dashboard/settings')
    }
  }, [user, loading, pathname, router])

  if (loading || !user) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-gray-400 text-sm">Loading…</div>
    </div>
  )

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 ml-56 min-h-screen bg-gray-50 overflow-auto">
        {children}
      </main>
    </div>
  )
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <AuthProvider><DashboardShell>{children}</DashboardShell></AuthProvider>
}
