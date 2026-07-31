'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { AuthProvider, useAuth } from '@/lib/auth-context'
import {
  Mail, LayoutDashboard, Inbox, Users, BookOpen,
  Settings, Printer, Send, RotateCcw, LogOut, KeyRound,
  Download, Upload, ClipboardList, Route, AtSign, FolderInput, Building2, FolderOutput
} from 'lucide-react'

// The app is split into two modules the user switches between. Outbound = the
// existing dispatch flow; Inbound = the digital mailroom. Account items are
// global and pinned at the bottom regardless of the active module.
type ModuleKey = 'outbound' | 'inbound'

const MODULES: Record<ModuleKey, { label: string; icon: any; home: string; items: any[] }> = {
  outbound: {
    label: 'Outbound',
    icon: Upload,
    home: '/dashboard',
    items: [
      { href: '/dashboard',           label: 'Overview',       icon: LayoutDashboard },
      { href: '/dashboard/inbox',     label: 'Outbox',         icon: Inbox },
      { href: '/dashboard/print',     label: 'Print Queue',    icon: Printer },
      { href: '/dashboard/digital',   label: 'Digital Sent',   icon: Send },
      { href: '/dashboard/recipients',label: 'Recipients',     icon: Users },
      { href: '/dashboard/library',   label: 'Insert Library', icon: BookOpen },
      { href: '/dashboard/rules',     label: 'Send Rules',     icon: Settings },
      { href: '/dashboard/returns',   label: 'Returns',        icon: RotateCcw },
    ],
  },
  inbound: {
    label: 'Inbound',
    icon: Download,
    home: '/dashboard/inbound',
    items: [
      { href: '/dashboard/inbound',        label: 'Inbound Tray',  icon: Inbox },
      { href: '/dashboard/inbound/triage', label: 'Triage Queue',  icon: ClipboardList },
      { href: '/dashboard/mailboxes',      label: 'Mailboxes',     icon: AtSign },
      { href: '/dashboard/inbound-rules',  label: 'Routing Rules', icon: Route },
      { href: '/dashboard/inbound-export-rules', label: 'Filing Rules', icon: FolderOutput },
      { href: '/dashboard/inbound/scan-setup', label: 'Scan Folder', icon: FolderInput, superAdminOnly: true },
    ],
  },
}

const ACCOUNT_ITEMS = [
  { href: '/dashboard/platform', label: 'Platform',        icon: Building2, platformAdminOnly: true },
  { href: '/dashboard/team',     label: 'Team',            icon: Users, superAdminOnly: true },
  { href: '/dashboard/settings', label: 'Settings', icon: Settings },
]

// Which module a given path belongs to. Account pages (team/settings) belong to
// neither — they keep whatever module was last active.
function moduleForPath(p: string): ModuleKey | null {
  if (
    p.startsWith('/dashboard/inbound') ||
    p.startsWith('/dashboard/mailboxes') ||
    p.startsWith('/dashboard/inbound-rules')
  ) return 'inbound'
  if (p === '/dashboard/team' || p === '/dashboard/settings') return null
  return 'outbound'
}

function Sidebar() {
  const { user, logout } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const [module, setModule] = useState<ModuleKey>('outbound')

  // Keep the active module in sync with the current route, and remember it so a
  // direct link (or an account page) shows the right module's tabs.
  useEffect(() => {
    const m = moduleForPath(pathname)
    if (m) {
      setModule(m)
      try { localStorage.setItem('mailiq_module', m) } catch {}
    } else {
      try {
        const saved = localStorage.getItem('mailiq_module')
        if (saved === 'inbound' || saved === 'outbound') setModule(saved)
      } catch {}
    }
  }, [pathname])

  function switchModule(m: ModuleKey) {
    if (m === module) return
    setModule(m)
    try { localStorage.setItem('mailiq_module', m) } catch {}
    router.push(MODULES[m].home)
  }

  const isActive = (href: string) => {
    if (href === '/dashboard') return pathname === '/dashboard'
    if (href === '/dashboard/inbound') return pathname === '/dashboard/inbound'
    return pathname === href || pathname.startsWith(href + '/')
  }

  const NavLink = ({ href, label, icon: Icon }: any) => (
    <Link href={href}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
        isActive(href)
          ? 'bg-white/15 text-white'
          : 'text-violet-300 hover:bg-white/10 hover:text-white'
      }`}
    >
      <Icon size={15} />
      {label}
    </Link>
  )

  const accountItems = ACCOUNT_ITEMS.filter((it: any) =>
    (!it.superAdminOnly || user?.role === 'SUPER_ADMIN') &&
    (!it.platformAdminOnly || user?.isPlatformAdmin)
  )

  return (
    <aside className="fixed inset-y-0 left-0 w-56 bg-violet-900 flex flex-col">
      {/* Logo */}
      <div className="h-16 flex items-center gap-2.5 px-5 border-b border-violet-800">
        <div className="w-7 h-7 bg-white/15 rounded-lg flex items-center justify-center">
          <Mail size={14} className="text-white" />
        </div>
        <span className="font-bold text-white text-base">Mail-IQ</span>
      </div>

      {/* Module switcher */}
      <div className="px-3 pt-3">
        <div className="flex bg-black/20 rounded-lg p-1">
          {(Object.keys(MODULES) as ModuleKey[]).map((key) => {
            const M = MODULES[key]
            const on = module === key
            return (
              <button key={key} onClick={() => switchModule(key)}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold py-1.5 rounded-md transition-colors ${
                  on ? 'bg-white/15 text-white' : 'text-violet-300 hover:text-white'
                }`}
              >
                <M.icon size={13} /> {M.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Active module's tabs */}
      <nav className="flex-1 py-3 px-3 space-y-0.5 overflow-y-auto">
        {MODULES[module].items
          .filter((it: any) => !it.superAdminOnly || user?.role === 'SUPER_ADMIN')
          .map((item) => <NavLink key={item.href} {...item} />)}
      </nav>

      {/* Account — pinned, shown in both modules */}
      {accountItems.length > 0 && (
        <div className="px-3 py-2 border-t border-violet-800 space-y-0.5">
          {accountItems.map((item) => <NavLink key={item.href} {...item} />)}
        </div>
      )}

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
