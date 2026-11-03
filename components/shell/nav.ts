import { CalendarClock, FileText, KanbanSquare, LayoutDashboard, Settings2, TrendingUp, Users, Package } from 'lucide-react';

export const NAV = [
  { href: '/overview', label: 'Overview', icon: LayoutDashboard, owner: false },
  { href: '/pipeline', label: 'Pipeline', icon: KanbanSquare, owner: false },
  { href: '/calls', label: 'Calls & Briefs', icon: CalendarClock, owner: false },
  { href: '/proposals', label: 'Proposals', icon: FileText, owner: false },
  { href: '/winrate', label: 'Win rate & deal size', icon: TrendingUp, owner: false },
  { href: '/services', label: 'Services', icon: Package, owner: true },
  { href: '/consultants', label: 'Consultants', icon: Users, owner: true },
  { href: '/system', label: 'System', icon: Settings2, owner: true },
] as const;
