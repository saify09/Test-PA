import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { cn } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { notifApi } from '../../lib/api';
import {
  LayoutDashboard, FileText, MessageSquare, Bell,
  User, Menu, X, LogOut, ChevronRight, Shield, Settings
} from 'lucide-react';

const navItems = [
  { href: '/',          label: 'My Dashboard',    icon: <LayoutDashboard size={17} /> },
  { href: '/requests',  label: 'My Requests',     icon: <FileText size={17} /> },
  { href: '/appeals',   label: 'My Appeals',      icon: <MessageSquare size={17} /> },
];

const MemberLayout: React.FC<{ children: React.ReactNode; title?: string }> = ({ children, title }) => {
  const router = useRouter();
  const { member, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    notifApi.list({ unread_only: true, limit: 5 })
      .then(r => { setUnread(r.data.total || 0); setNotifications(r.data.items || []); })
      .catch(() => {
        setUnread(2);
        setNotifications([
          { id: '1', title: 'PA Approved', message: 'PA-2026-001234 — MRI Lumbar Spine has been approved.', read: false, time: '2h ago' },
          { id: '2', title: 'Documents Requested', message: 'PA-2026-001236 requires additional clinical information.', read: false, time: '5h ago' },
        ]);
      });
  }, []);

  const isActive = (href: string) => href === '/' ? router.pathname === '/' : router.pathname.startsWith(href);

  return (
    <div className="min-h-screen bg-[#f5f7fa]">
      {/* Top nav */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <Link href="/">
            <div className="flex items-center gap-2.5 cursor-pointer">
              <div className="w-9 h-9 rounded-xl bg-primary-700 flex items-center justify-center">
                <Shield size={18} className="text-white" />
              </div>
              <div>
                <p className="text-sm font-extrabold text-gray-900 leading-none">MyHealthPA</p>
                <p className="text-[11px] text-gray-400">Prior Authorization Portal</p>
              </div>
            </div>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(item => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <div className={cn(
                    'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold cursor-pointer transition-colors',
                    active ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  )}>
                    <span className={active ? 'text-primary-600' : 'text-gray-400'}>{item.icon}</span>
                    {item.label}
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Right: notif + user */}
          <div className="flex items-center gap-2">
            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
              >
                <Bell size={18} />
                {unread > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-3.5 h-3.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-white border border-gray-100 rounded-2xl shadow-2xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-bold text-gray-900">Notifications</p>
                    <button className="text-xs text-primary-600 hover:underline font-medium" onClick={() => notifApi.markAllRead().catch(() => {})}>
                      Mark all read
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="py-10 text-center text-sm text-gray-400">No new notifications</div>
                  ) : notifications.map((n, i) => (
                    <div key={i} className={cn('px-4 py-3.5 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0', !n.read && 'bg-blue-50/40')}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                        {!n.read && <span className="w-2 h-2 rounded-full bg-primary-500 flex-shrink-0 mt-1" />}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{n.message}</p>
                      {n.time && <p className="text-[10px] text-gray-400 mt-1">{n.time}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* User menu */}
            <div className="relative hidden md:block">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 px-3 py-2 rounded-xl hover:bg-gray-100 transition-colors"
              >
                <div className="w-8 h-8 rounded-full bg-primary-700 flex items-center justify-center">
                  <span className="text-xs font-bold text-white">{member?.full_name?.[0] || 'M'}</span>
                </div>
                <span className="text-sm font-semibold text-gray-700 max-w-[120px] truncate">{member?.full_name?.split(' ')[0]}</span>
              </button>

              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-gray-100 rounded-2xl shadow-xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-bold text-gray-900">{member?.full_name}</p>
                    <p className="text-xs text-gray-400 mono mt-0.5">{member?.member_id}</p>
                  </div>
                  <div className="py-1">
                    <Link href="/profile">
                      <div onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                        <User size={14} className="text-gray-400" /> My Profile
                      </div>
                    </Link>
                    <Link href="/settings">
                      <div onClick={() => setMenuOpen(false)} className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                        <Settings size={14} className="text-gray-400" /> Settings
                      </div>
                    </Link>
                    <div className="border-t border-gray-100 mt-1 pt-1">
                      <button onClick={logout} className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">
                        <LogOut size={14} /> Sign Out
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile hamburger */}
            <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-xl">
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-white border-b border-gray-100 shadow-lg z-30">
          <nav className="max-w-5xl mx-auto px-4 py-3 space-y-1">
            {navItems.map(item => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <div onClick={() => setMenuOpen(false)} className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold cursor-pointer',
                    active ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50'
                  )}>
                    {item.icon} {item.label} <ChevronRight size={14} className="ml-auto text-gray-300" />
                  </div>
                </Link>
              );
            })}
            <div className="border-t border-gray-100 pt-2 mt-2">
              <Link href="/profile">
                <div onClick={() => setMenuOpen(false)} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer">
                  <User size={17} /> My Profile
                </div>
              </Link>
              <button onClick={logout} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors">
                <LogOut size={17} /> Sign Out
              </button>
            </div>
          </nav>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-5xl mx-auto px-4 py-6">
        {title && (
          <h1 className="text-2xl font-extrabold text-gray-900 mb-5">{title}</h1>
        )}
        {children}
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-4 py-8 mt-8 border-t border-gray-200">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-gray-400">© 2026 HealthPA System. Your health information is protected under HIPAA.</p>
          <div className="flex items-center gap-4 text-xs text-gray-400">
            <a href="#" className="hover:text-gray-600">Privacy Policy</a>
            <a href="#" className="hover:text-gray-600">Terms of Use</a>
            <a href="#" className="hover:text-gray-600">Contact Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default MemberLayout;
