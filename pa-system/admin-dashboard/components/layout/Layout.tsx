import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { cn } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { notifApi } from '../../lib/api';
import {
  LayoutDashboard, FileText, Users, BarChart3, Shield,
  Settings, Bell, LogOut, ChevronDown, Menu, X,
  Activity, AlertTriangle, Database, Cpu, RefreshCw,
  ChevronRight, Search, Command
} from 'lucide-react';

const NAV = [
  {
    section: 'Overview',
    items: [
      { href: '/',          label: 'Dashboard',     icon: <LayoutDashboard size={15} /> },
      { href: '/analytics', label: 'Analytics',     icon: <BarChart3 size={15} /> },
    ],
  },
  {
    section: 'Operations',
    items: [
      { href: '/cases',   label: 'All Cases',       icon: <FileText size={15} />, badge: 'live' },
      { href: '/users',   label: 'User Management', icon: <Users size={15} /> },
      { href: '/audit',   label: 'Audit Log',       icon: <Shield size={15} /> },
    ],
  },
  {
    section: 'System',
    items: [
      { href: '/system',   label: 'System Health',  icon: <Activity size={15} /> },
      { href: '/settings', label: 'Configuration',  icon: <Settings size={15} /> },
    ],
  },
];

const AdminLayout: React.FC<{ children: React.ReactNode; title?: string }> = ({ children, title }) => {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [liveTime, setLiveTime] = useState('');

  useEffect(() => {
    const tick = () => setLiveTime(new Date().toLocaleTimeString('en-US', { hour12: false }));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    notifApi.list({ unread_only: true, limit: 5 })
      .then(r => { setUnread(r.data.total || 0); setNotifications(r.data.items || []); })
      .catch(() => {
        setUnread(3);
        setNotifications([
          { id: '1', title: 'SLA Breach Warning', message: '3 cases approaching 24h deadline', level: 'warning', time: '5m ago' },
          { id: '2', title: 'AI Model Updated', message: 'Model v2.4.1 deployed successfully', level: 'info', time: '1h ago' },
          { id: '3', title: 'Queue Spike', message: 'UHC queue up 40% — 12 new urgent cases', level: 'warning', time: '2h ago' },
        ]);
      });
  }, []);

  const isActive = (href: string) => href === '/' ? router.pathname === '/' : router.pathname.startsWith(href);

  const Sidebar = () => (
    <aside className="w-[220px] bg-slate-900 flex flex-col h-full overflow-hidden flex-shrink-0">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center flex-shrink-0">
            <Shield size={15} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-extrabold text-white leading-none">PA Admin</p>
            <p className="text-[10px] text-slate-500 mt-0.5 mono">{liveTime}</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {NAV.map(section => (
          <div key={section.section}>
            <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wider px-2 mb-1">{section.section}</p>
            {section.items.map(item => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href}>
                  <div onClick={() => setSidebarOpen(false)}
                    className={cn('nav-item', active ? 'active' : 'inactive')}>
                    <span className={active ? 'text-white' : 'text-slate-500'}>{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.badge === 'live' && (
                      <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User chip */}
      <div className="px-3 py-3 border-t border-slate-800">
        <div className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-slate-800 cursor-pointer transition-colors">
          <div className="w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
            <span className="text-xs font-bold text-white">{user?.full_name?.[0] || 'A'}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-white truncate">{user?.full_name}</p>
            <p className="text-[10px] text-slate-500">{user?.role?.replace(/_/g, ' ')}</p>
          </div>
          <button onClick={logout} className="text-slate-500 hover:text-slate-300 transition-colors p-0.5">
            <LogOut size={13} />
          </button>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen overflow-hidden bg-slate-100">
      {/* Desktop sidebar */}
      <div className="hidden md:flex flex-col h-full">
        <Sidebar />
      </div>

      {/* Mobile sidebar */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSidebarOpen(false)} />
          <div className="relative z-10 flex flex-col h-full w-[220px]"><Sidebar /></div>
        </div>
      )}

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 flex-shrink-0 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden text-slate-500 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100">
              <Menu size={18} />
            </button>
            {title && <h1 className="text-sm font-bold text-slate-900">{title}</h1>}
          </div>
          <div className="flex items-center gap-2">
            {/* Notifications */}
            <div className="relative">
              <button onClick={() => setNotifOpen(!notifOpen)}
                className="relative p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors">
                <Bell size={16} />
                {unread > 0 && (
                  <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 top-full mt-1 w-80 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-900">System Notifications</p>
                    <button className="text-[11px] text-primary-600 hover:underline"
                      onClick={() => { notifApi.markAllRead().catch(() => {}); setUnread(0); setNotifOpen(false); }}>
                      Clear all
                    </button>
                  </div>
                  {notifications.map((n, i) => (
                    <div key={i} className="flex items-start gap-2.5 px-4 py-3 hover:bg-slate-50 border-b border-slate-50 last:border-0 cursor-pointer">
                      <div className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0 mt-1.5',
                        n.level === 'warning' ? 'bg-amber-400' : n.level === 'error' ? 'bg-red-500' : 'bg-blue-500'
                      )} />
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-slate-800">{n.title}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{n.message}</p>
                        {n.time && <p className="text-[10px] text-slate-400 mt-1">{n.time}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Role chip */}
            <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 rounded-lg">
              <div className="w-5 h-5 rounded-full bg-primary-600 flex items-center justify-center">
                <span className="text-[10px] font-bold text-white">{user?.full_name?.[0]}</span>
              </div>
              <span className="text-xs font-semibold text-slate-700">{user?.full_name?.split(' ')[0]}</span>
              <span className="badge badge-blue text-[9px] px-1">{user?.role?.split('_')[0]}</span>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-5">
          {children}
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
