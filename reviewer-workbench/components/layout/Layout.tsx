import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { cn } from '../../lib/utils';
import { useAuth } from '../../lib/auth';
import { notifApi } from '../../lib/api';
import {
  LayoutDashboard, ListFilter, BookOpen, BarChart2,
  Bell, LogOut, Menu, X, User, Settings, Stethoscope, Clock
} from 'lucide-react';

const navItems = [
  { href: '/',          label: 'Dashboard',    icon: <LayoutDashboard size={17} /> },
  { href: '/queue',     label: 'Review Queue', icon: <ListFilter size={17} />, badge: true },
  { href: '/metrics',   label: 'My Metrics',   icon: <BarChart2 size={17} /> },
  { href: '/guidelines',label: 'Guidelines',   icon: <BookOpen size={17} /> },
];

const Layout: React.FC<{ children: React.ReactNode; title?: string }> = ({ children, title }) => {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    notifApi.list({ unread_only: true, limit: 5 })
      .then(r => { setUnread(r.data.total || 0); setNotifications(r.data.items || []); })
      .catch(() => {});
  }, []);

  const isActive = (href: string) => href === '/' ? router.pathname === '/' : router.pathname.startsWith(href);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />}

      <aside className={cn(
        'fixed top-0 left-0 h-full w-60 bg-slate-900 z-40 flex flex-col transition-transform duration-200 lg:translate-x-0 lg:static',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      )}>
        <div className="flex items-center justify-between px-4 h-14 border-b border-slate-700">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-blue-500 flex items-center justify-center">
              <Stethoscope size={14} className="text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-white leading-none">Clinical Review</p>
              <p className="text-[10px] text-slate-400">Workbench</p>
            </div>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-400"><X size={16} /></button>
        </div>

        <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
          {navItems.map(item => {
            const active = isActive(item.href);
            return (
              <Link key={item.href} href={item.href}>
                <div onClick={() => setSidebarOpen(false)} className={cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium cursor-pointer transition-colors',
                  active ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                )}>
                  <span className={active ? 'text-white' : 'text-slate-400'}>{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {item.badge && unread > 0 && (
                    <span className="bg-orange-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{unread}</span>
                  )}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-slate-700 p-3 space-y-1">
          <button onClick={logout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-slate-800 transition-colors">
            <LogOut size={15} /> Sign Out
          </button>
          <div className="px-3 pt-2 border-t border-slate-700 flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
              <User size={13} className="text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.full_name || 'Reviewer'}</p>
              <p className="text-[10px] text-slate-400">{user?.role || 'RN REVIEWER'}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 bg-white border-b border-gray-100 flex items-center justify-between px-4 lg:px-5 sticky top-0 z-20 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-gray-500"><Menu size={18} /></button>
            {title && <h1 className="text-sm font-bold text-gray-900">{title}</h1>}
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button onClick={() => setNotifOpen(!notifOpen)} className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
                <Bell size={17} />
                {unread > 0 && <span className="absolute top-1 right-1 w-3.5 h-3.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">{unread > 9 ? '9+' : unread}</span>}
              </button>
              {notifOpen && (
                <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-100 rounded-xl shadow-xl z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                    <p className="text-sm font-semibold">Notifications</p>
                    <button className="text-xs text-blue-600 hover:underline">Mark all read</button>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="py-8 text-center text-sm text-gray-400">No new notifications</div>
                  ) : notifications.map((n, i) => (
                    <div key={i} className="px-4 py-3 border-b border-gray-50 hover:bg-gray-50 cursor-pointer">
                      <p className="text-sm font-medium text-gray-800">{n.title}</p>
                      <p className="text-xs text-gray-500">{n.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
              <div className="w-5 h-5 rounded-full bg-blue-600 flex items-center justify-center">
                <User size={11} className="text-white" />
              </div>
              <span className="text-sm font-medium text-gray-700">{user?.full_name?.split(' ')[0] || 'Reviewer'}</span>
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-auto p-4 lg:p-5">{children}</main>
      </div>
    </div>
  );
};

export default Layout;
