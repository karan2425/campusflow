'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth, useRoleFlags } from '@/lib/auth';
import { ROLE_LABEL } from '@/lib/format';
import type { Role } from '@/lib/types';
import {
  IconBook,
  IconBriefcase,
  IconBuilding,
  IconCalendar,
  IconChart,
  IconDashboard,
  IconGraduation,
  IconLogout,
  IconMenu,
  IconSparkles,
  IconTarget,
  IconUsers,
  IconX,
} from '../ui/Icons';
import { Avatar, Button, Spinner } from '../ui/Primitives';
import { AiStatusPill } from './AiStatus';
import { NotificationsMenu } from './NotificationsMenu';
import { Copilot } from './Copilot';

interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  roles: Role[];
  badge?: 'applications' | 'pipeline';
}

const NAV_SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { href: '/dashboard', label: 'Dashboard', icon: <IconDashboard />, roles: ['ADMIN', 'PLACEMENT_OFFICER', 'FACULTY', 'STUDENT'] },
      { href: '/analytics', label: 'Analytics', icon: <IconChart />, roles: ['ADMIN', 'PLACEMENT_OFFICER'] },
      { href: '/profile', label: 'My profile', icon: <IconTarget />, roles: ['STUDENT', 'FACULTY', 'ADMIN', 'PLACEMENT_OFFICER'] },
    ],
  },
  {
    title: 'Placements',
    items: [
      { href: '/placements', label: 'Job postings', icon: <IconBriefcase />, roles: ['ADMIN', 'PLACEMENT_OFFICER', 'FACULTY', 'STUDENT'] },
      { href: '/applications', label: 'Applications', icon: <IconTarget />, roles: ['ADMIN', 'PLACEMENT_OFFICER', 'FACULTY', 'STUDENT'], badge: 'applications' },
      { href: '/companies', label: 'Companies', icon: <IconBuilding />, roles: ['ADMIN', 'PLACEMENT_OFFICER', 'FACULTY', 'STUDENT'] },
      { href: '/pipeline', label: 'Hiring pipeline', icon: <IconChart />, roles: ['ADMIN', 'PLACEMENT_OFFICER', 'FACULTY'], badge: 'pipeline' },
    ],
  },
  {
    title: 'Academics',
    items: [
      { href: '/students', label: 'Students', icon: <IconUsers />, roles: ['ADMIN', 'PLACEMENT_OFFICER', 'FACULTY'] },
      { href: '/courses', label: 'Courses', icon: <IconBook />, roles: ['ADMIN', 'PLACEMENT_OFFICER', 'FACULTY', 'STUDENT'] },
      { href: '/attendance', label: 'Attendance', icon: <IconCalendar />, roles: ['ADMIN', 'PLACEMENT_OFFICER', 'FACULTY', 'STUDENT'] },
    ],
  },
  {
    title: 'Intelligence',
    items: [
      { href: '/ai-studio', label: 'AI studio', icon: <IconSparkles />, roles: ['ADMIN', 'PLACEMENT_OFFICER', 'FACULTY', 'STUDENT'] },
    ],
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { role } = useRoleFlags();
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);

  // Unauthenticated visitors are bounced to the login screen.
  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 text-sm text-ink-500">
        <Spinner size={18} /> Loading CampusFlow…
      </div>
    );
  }

  if (!user) return null;

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !role || item.roles.includes(role)),
  })).filter((section) => section.items.length);

  const SidebarContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-violet-600 text-white shadow-sm">
          <IconGraduation width={19} height={19} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-white">CampusFlow</p>
          <p className="truncate text-[11px] text-ink-400">Placement & academics</p>
        </div>
      </div>

      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {sections.map((section) => (
          <div key={section.title}>
            <p className="px-2 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-ink-500">{section.title}</p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors ${
                        active ? 'bg-brand-600 text-white shadow-sm' : 'text-ink-300 hover:bg-ink-800 hover:text-white'
                      }`}
                      aria-current={active ? 'page' : undefined}
                    >
                      <span className={active ? 'text-white' : 'text-ink-400'}>{item.icon}</span>
                      <span className="truncate">{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-ink-800 p-3">
        <button
          onClick={() => setCopilotOpen(true)}
          className="mb-2 flex w-full items-center gap-2.5 rounded-lg bg-gradient-to-r from-brand-600 to-violet-600 px-3 py-2.5 text-left text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          <IconSparkles width={16} height={16} />
          Ask AI copilot
        </button>

        <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
          <Avatar name={user.name} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">{user.name}</p>
            <p className="truncate text-[11px] text-ink-400">{role ? ROLE_LABEL[role] : ''}</p>
          </div>
          <button onClick={logout} className="rounded-md p-1.5 text-ink-400 hover:bg-ink-800 hover:text-white" aria-label="Sign out">
            <IconLogout width={15} height={15} />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-ink-50 lg:flex">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 bg-ink-900 lg:block">{SidebarContent}</aside>

      {/* Mobile sidebar */}
      {sidebarOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink-900/50" onClick={() => setSidebarOpen(false)} />
          <aside className="animate-fade-in relative h-full w-64 bg-ink-900">
            <button
              onClick={() => setSidebarOpen(false)}
              className="absolute right-2 top-3 rounded-md p-1.5 text-ink-400 hover:bg-ink-800 hover:text-white"
              aria-label="Close navigation"
            >
              <IconX width={16} height={16} />
            </button>
            {SidebarContent}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex items-center gap-3 border-b border-ink-200 bg-white/85 px-4 py-2.5 backdrop-blur-md">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-ink-500 hover:bg-ink-100 lg:hidden"
            aria-label="Open navigation"
          >
            <IconMenu width={18} height={18} />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink-800">
              {pathname === '/dashboard' ? 'Dashboard' : pathname.split('/').filter(Boolean).map(titleOf).join(' · ')}
            </p>
          </div>

          <div className="hidden sm:block">
            <AiStatusPill />
          </div>
          <div className="sm:hidden">
            <AiStatusPill compact />
          </div>

          <Button size="sm" variant="secondary" className="hidden sm:inline-flex" onClick={() => setCopilotOpen(true)} icon={<IconSparkles width={14} height={14} />}>
            Copilot
          </Button>

          <NotificationsMenu onNavigate={(link) => router.push(link)} />
        </header>

        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6">{children}</main>
      </div>

      <Copilot open={copilotOpen} onClose={() => setCopilotOpen(false)} />
    </div>
  );
}

function titleOf(segment: string) {
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
