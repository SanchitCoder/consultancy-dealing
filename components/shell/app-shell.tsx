'use client';
import { LogOut, Menu, Moon, Search, Star, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown';
import { Kbd } from '@/components/ui/primitives';
import { SessionProvider, type ClientSession } from '@/lib/client/session';
import { initials } from '@/lib/format/labels';
import { cn } from '@/lib/utils';
import { CommandPalette } from './command-palette';
import { DataModeBadge } from './data-mode-badge';
import { DealDrawer } from '@/components/deal/deal-drawer';
import { NAV } from './nav';

function Brand({ compact }: { compact?: boolean }) {
  return (
    <Link href="/overview" className="flex items-center gap-2.5 rounded-lg px-1 py-0.5">
      <span className="grid size-8 place-items-center rounded-lg bg-ink text-bg" aria-hidden><Star className="size-4 fill-current" /></span>
      <span className={compact ? 'hidden leading-tight sm:block' : 'leading-tight'}>
        <span className="display block text-[15px] font-semibold text-ink">Northstar</span>
        <span className="block text-[11px] text-ink-3">Deal pipeline</span>
      </span>
    </Link>
  );
}

function NavList({ session, onNavigate }: { session: ClientSession; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {NAV.filter((n) => !n.owner || session.role === 'owner').map((n) => {
        const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
        return (
          <Link key={n.href} href={n.href} onClick={onNavigate} aria-current={active ? 'page' : undefined}
            className={cn('flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13.5px] font-medium transition-colors', active ? 'bg-surface text-ink shadow-[var(--shadow-card)] ring-1 ring-border' : 'text-ink-2 hover:bg-surface-2 hover:text-ink')}>
            <n.icon className={cn('size-4', active ? 'text-accent' : 'text-ink-3')} aria-hidden />{n.label}
          </Link>
        );
      })}
    </nav>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const dark = mounted && resolvedTheme === 'dark';
  return (
    <Button variant="ghost" size="icon" aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'} onClick={() => setTheme(dark ? 'light' : 'dark')}>
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}

function UserMenu({ session }: { session: ClientSession }) {
  const router = useRouter();
  const signOut = async () => { await fetch('/api/auth/logout', { method: 'POST' }); router.replace('/login'); router.refresh(); };
  return (
    <Dropdown>
      <DropdownTrigger asChild>
        <button className="flex items-center gap-2 rounded-full border border-border bg-surface py-1 pl-1 pr-3 text-sm font-medium hover:bg-surface-2">
          <span className="grid size-7 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-soft-ink" aria-hidden>{initials(session.name)}</span>
          <span className="hidden max-w-32 truncate sm:inline">{session.name}</span>
          <span className="sr-only sm:hidden">{session.name} account menu</span>
        </button>
      </DropdownTrigger>
      <DropdownContent>
        <DropdownLabel>{session.role === 'owner' ? 'Signed in as owner' : `Consultant · ${session.email ?? ''}`}</DropdownLabel>
        <DropdownSeparator />
        <DropdownItem onSelect={signOut}><LogOut className="size-4" />Sign out</DropdownItem>
      </DropdownContent>
    </Dropdown>
  );
}

export function AppShell({ session, children }: { session: ClientSession; children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPaletteOpen((o) => !o); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <SessionProvider value={session}>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2 focus:shadow-[var(--shadow-pop)]">Skip to content</a>
      <div className="flex min-h-dvh">
        <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col justify-between border-r border-border bg-surface-2/60 p-3 lg:flex">
          <div className="space-y-5"><div className="px-1 pt-1"><Brand /></div><NavList session={session} /></div>
          <p className="px-2 pb-1 text-[11px] leading-snug text-ink-3">Times are shown in IST. Open counts are approximate: mail apps pre-load images.</p>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-border bg-bg/85 px-3 backdrop-blur sm:px-5">
            <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setNavOpen(true)}><Menu className="size-5" /></Button>
            <div className="lg:hidden"><Brand compact /></div>
            <button onClick={() => setPaletteOpen(true)} className="mx-2 hidden h-9 min-w-0 max-w-md flex-1 items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 text-left text-sm text-ink-3 transition-colors hover:border-ink-3 sm:flex" >
              <Search className="size-4" aria-hidden /><span className="flex-1 truncate">Search deals, companies, proposals…</span><Kbd>⌘K</Kbd>
            </button>
            <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
              <Button variant="ghost" size="icon" className="sm:hidden" aria-label="Search" onClick={() => setPaletteOpen(true)}><Search className="size-5" /></Button>
              <DataModeBadge />
              <ThemeToggle />
              <UserMenu session={session} />
            </div>
          </header>
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-[1400px] flex-1 px-3 py-5 outline-none sm:px-6 sm:py-7">
            <Suspense fallback={null}>{children}</Suspense>
          </main>
        </div>
      </div>
      <Dialog open={navOpen} onOpenChange={setNavOpen}>
        <DialogContent title="Menu" className="left-3 top-3 max-w-xs translate-x-0 translate-y-0" hideClose>
          <NavList session={session} onNavigate={() => setNavOpen(false)} />
        </DialogContent>
      </Dialog>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} session={session} />
      <Suspense fallback={null}><DealDrawer /></Suspense>
    </SessionProvider>
  );
}
