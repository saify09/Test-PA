import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { cn } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { notificationApi } from '../../lib/api';
import {
  LayoutDashboard, FilePlus2, FileText, Bell, LogOut, Menu, X,
  ChevronRight, User, Settings, HelpCircle, Shield, Activity,
  CheckSquare, Clock, AlertTriangle, ChevronDown
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  badge?: number | string;
  badgeColor?: string;
  children?: { href: string; label: string }[];
}

const navItems: NavItem[] = [
  {
    href: '/',
    label: 'Dashboard',
    icon: <LayoutDashboard size={18} />,
  },
  {
    href: '/submit',
    label: 'Submit New PA',
    icon: <FilePlus2 size={18} />,
  },
  {
    href: '/requests',
    label: 'My PA Requests',
    icon: <FileText size={18} />,
    children: [
      { href: '/requests?status=SUBMITTED', label: 'Submitted' },
      { href: '/requests?status=IN_REVIEW', label: 'In Review' },
      { href: '/requests?status=PENDING_INFO', label: 'Pending Info' },
      { href: '/requests?status=APPROVED', label: 'Approved' },
      { href: '/requests?status=DENIED', label: 'Denied' },
    ],
  },
  {
    href: '/appeals',
    label: 'Appeals',
    icon: <AlertTriangle size={18} />,
  },
  {
    href: '/tracking',
    label: 'Quick Status Check',
    icon: <Activity size={18} />,
  },
];

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
}

const Layout: React.FC<LayoutProps> = ({ children, title }) => {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [expandedNav, setExpandedNav] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    notificationApi.list({ unread_only: true, limit: 5 })
      .then((r) => { setUnreadCount(r.data.total || 0); setNotifications(r.data.items || []); })
      .catch(() => {});
  }, []);

  const isActive = (href: string) => {
    if (href === '/') return router.pathname === '/';
    return router.pathname.startsWith(href.split('?')[0]);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-100 shadow-lg z-40',
        'flex flex-col transition-transform duration-200',
        'lg:translate-x-0 lg:static lg:shadow-none',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        {/* Logo */}
        <div className="flex items-center justify-between px-5 h-16 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary-500 flex items-center justify-center">
              <Shield size={16} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 leading-none">PriorAuth</p>
              <p className="text-[10px] text-gray-400 font-medium">Provider Portal</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {navItems.map((item) => {
            const active = isActive(item.href);
            const hasChildren = item.children && item.children.length > 0;
            const expanded = expandedNav === item.href;

            return (
              <div key={item.href}>
                <div
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors',
                    active
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                  onClick={() => {
                    if (hasChildren) {
                      setExpandedNav(expanded ? null : item.href);
                    } else {
                      router.push(item.href);
                      setSidebarOpen(false);
                    }
                  }}
                >
                  <span className={cn(active ? 'text-primary-600' : 'text-gray-400')}>
                    {item.icon}
                  </span>
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-semibold',
                      item.badgeColor || 'bg-primary-100 text-primary-700'
                    )}>
                      {item.badge}
                    </span>
                  )}
                  {hasChildren && (
                    <ChevronDown size={14} className={cn('transition-transform', expanded && 'rotate-180')} />
                  )}
                </div>
                {hasChildren && expanded && (
                  <div className="ml-9 mt-1 space-y-0.5">
                    {item.children!.map((child) => (
                      <Link key={child.href} href={child.href}>
                        <div className={cn(
                          'px-3 py-2 rounded-lg text-xs font-medium cursor-pointer transition-colors',
                          router.asPath === child.href
                            ? 'text-primary-700 bg-primary-50'
                            : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        )}>
                          {child.label}
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-gray-100 p-3 space-y-1">
          <Link href="/settings">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 cursor-pointer transition-colors">
              <Settings size={16} /> Settings
            </div>
          </Link>
          <Link href="/help">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 cursor-pointer transition-colors">
              <HelpCircle size={16} /> Help & Support
            </div>
          </Link>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-500 hover:bg-red-50 transition-colors"
          >
            <LogOut size={16} /> Sign Out
          </button>
          <div className="px-3 pt-2">
            <div className="flex items-center gap-2 py-2 border-t border-gray-100">
              <div className="w-7 h-7 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                <User size={14} className="text-primary-600" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-800 truncate">{user?.full_name || 'Provider'}</p>
                <p className="text-[10px] text-gray-400 truncate">{user?.organization || 'Healthcare Provider'}</p>
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-gray-100 flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-gray-500 hover:text-gray-700"
            >
              <Menu size={20} />
            </button>
            {title && <h1 className="text-base font-semibold text-gray-900">{title}</h1>}
          </div>

          <div className="flex items-center gap-2">
            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <Bell size={18} />
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-gray-100 rounded-xl shadow-xl z-50 animate-fade-in">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-semibold text-gray-900">Notifications</p>
                    <button className="text-xs text-primary-600 hover:underline">Mark all read</button>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center text-sm text-gray-400">No new notifications</div>
                  ) : (
                    <div className="divide-y divide-gray-50">
                      {notifications.map((n, i) => (
                        <div key={i} className={cn('px-4 py-3 hover:bg-gray-50 cursor-pointer', !n.read && 'bg-blue-50/40')}>
                          <p className="text-sm font-medium text-gray-800">{n.title}</p>
                          <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                          <p className="text-[10px] text-gray-400 mt-1">{n.created_at}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="px-4 py-3 border-t border-gray-100">
                    <Link href="/notifications">
                      <p className="text-xs text-center text-primary-600 hover:underline cursor-pointer">View all notifications</p>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* User chip */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
              <div className="w-6 h-6 rounded-full bg-primary-100 flex items-center justify-center">
                <User size={12} className="text-primary-600" />
              </div>
              <span className="text-sm font-medium text-gray-700">{user?.full_name?.split(' ')[0] || 'Provider'}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
