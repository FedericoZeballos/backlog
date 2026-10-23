import {
  CalendarDays,
  FolderTree,
  Inbox,
  LayoutDashboard,
  Layers,
  Lock,
  LogOut,
  Menu,
  Network,
  NotebookPen,
  Plus,
  Search,
  Settings,
  Shield,
  Sun,
  Target,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router';
import { useLogout, useMe, useNodes } from '../api/hooks';
import { DetailPanel } from './detail/DetailPanel';
import { Modal, useToast } from './feedback';
import { QuickCapture } from './QuickCapture';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV: NavItem[][] = [
  [
    { to: '/', label: 'Inicio', icon: LayoutDashboard },
    { to: '/inbox', label: 'Bandeja de entrada', icon: Inbox },
  ],
  [
    { to: '/today', label: 'Hoy', icon: Sun },
    { to: '/upcoming', label: 'Próximas', icon: CalendarDays },
    { to: '/blocked', label: 'Bloqueadas', icon: Lock },
    { to: '/backlog', label: 'Backlog', icon: Layers },
  ],
  [
    { to: '/projects', label: 'Proyectos', icon: FolderTree },
    { to: '/goals', label: 'Objetivos', icon: Target },
    { to: '/graph', label: 'Grafo', icon: Network },
    { to: '/notes', label: 'Notas y decisiones', icon: NotebookPen },
  ],
  [
    { to: '/trash', label: 'Papelera', icon: Trash2 },
    { to: '/settings', label: 'Configuración', icon: Settings },
  ],
];

const isTyping = (el: Element | null) =>
  !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable);

export function Layout() {
  const { data: me } = useMe();
  const [menuOpen, setMenuOpen] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const location = useLocation();
  const [params] = useSearchParams();
  const inbox = useNodes({ processed: false, limit: 1 });

  // Keep the selected node when switching views.
  const nodeParam = params.get('node');
  const keep = nodeParam ? `?node=${nodeParam}` : '';
  const fullBleed = location.pathname === '/graph';

  useEffect(() => setMenuOpen(false), [location.pathname]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(document.activeElement)) {
        e.preventDefault();
        setCapturing(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const nav = [...NAV];
  if (me?.role === 'ADMIN') nav.push([{ to: '/admin', label: 'Administración', icon: Shield }]);

  return (
    <div className="min-h-dvh md:flex">
      <aside
        className={`fixed inset-y-0 left-0 z-20 w-64 flex-col border-r border-line bg-surface md:sticky md:top-0 md:flex md:h-dvh ${
          menuOpen ? 'flex' : 'hidden'
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <span className="text-[15px] font-semibold tracking-tight">Backlog</span>
          <button className="btn btn-ghost px-1.5 md:hidden" onClick={() => setMenuOpen(false)}>
            <X className="size-4" aria-hidden />
            <span className="sr-only">Cerrar menú</span>
          </button>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-2" aria-label="Principal">
          {nav.map((group, i) => (
            <ul key={i} className="space-y-0.5">
              {group.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={{ pathname: item.to, search: keep }}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm ${
                        isActive ? 'bg-accent/10 font-medium text-accent' : 'text-fg hover:bg-subtle'
                      }`
                    }
                  >
                    <item.icon className="size-4 shrink-0" aria-hidden />
                    <span className="flex-1">{item.label}</span>
                    {item.to === '/inbox' && !!inbox.data?.total && (
                      <span className="rounded-full bg-subtle px-1.5 text-xs text-muted">{inbox.data.total}</span>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          ))}
        </nav>
        <UserFooter />
      </aside>
      {menuOpen && <div className="fixed inset-0 z-10 bg-black/30 md:hidden" onClick={() => setMenuOpen(false)} />}

      {/* On wide screens the content makes room for the detail panel instead of hiding under it. */}
      <div className={`min-w-0 flex-1 ${nodeParam ? 'lg:pr-[480px]' : ''}`}>
        <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-bg/90 px-4 py-2.5 backdrop-blur">
          <button className="btn btn-ghost px-1.5 md:hidden" onClick={() => setMenuOpen(true)}>
            <Menu className="size-5" aria-hidden />
            <span className="sr-only">Abrir menú</span>
          </button>
          <GlobalSearch />
          <button className="btn btn-primary shrink-0" onClick={() => setCapturing(true)} title="Capturar (N)">
            <Plus className="size-4" aria-hidden />
            <span className="hidden sm:inline">Capturar</span>
          </button>
        </header>
        {/* The graph uses the full area below the header; other pages are a readable column. */}
        <main className={fullBleed ? 'h-[calc(100dvh-57px)]' : 'mx-auto max-w-4xl px-4 py-6 md:px-8'}>
          <Outlet />
        </main>
      </div>

      <DetailPanel />
      {capturing && <CaptureModal onClose={() => setCapturing(false)} />}
    </div>
  );
}

function GlobalSearch() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const location = useLocation();
  const [q, setQ] = useState(location.pathname === '/search' ? (params.get('q') ?? '') : '');

  function submit(e: FormEvent) {
    e.preventDefault();
    if (q.trim()) navigate(`/search?q=${encodeURIComponent(q.trim())}`);
  }

  return (
    <form onSubmit={submit} className="relative max-w-md flex-1" role="search">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input className="input pl-8" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en todo…" aria-label="Buscar" />
    </form>
  );
}

function CaptureModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  return (
    <Modal onClose={onClose} labelledBy="capture-title" wide>
      <h2 id="capture-title" className="mb-1 text-base font-semibold">
        Captura rápida
      </h2>
      <p className="mb-3 text-sm text-muted">Va a la bandeja de entrada sin clasificar. Lo ordenás después.</p>
      <QuickCapture
        autoFocus
        onCreated={() => {
          toast({ message: 'Guardado en la bandeja' });
          onClose();
        }}
      />
    </Modal>
  );
}

function UserFooter() {
  const { data: me } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();
  if (!me) return null;
  return (
    <div className="flex items-center gap-2 border-t border-line px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{me.name}</p>
        <p className="truncate text-xs text-muted">{me.email}</p>
      </div>
      <button
        className="btn btn-ghost px-1.5"
        title="Cerrar sesión"
        onClick={() => logout.mutate(undefined, { onSettled: () => navigate('/login') })}
      >
        <LogOut className="size-4" aria-hidden />
        <span className="sr-only">Cerrar sesión</span>
      </button>
    </div>
  );
}
