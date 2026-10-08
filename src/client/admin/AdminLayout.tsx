import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import type { SystemItem } from '../../shared/validation';
import { api, ApiError } from '../api';
import './admin.css';
import { Icon, inScope, initials, type Admin, type AdminContext, type IconName, type SystemChange } from './shared';

const NAV: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/admin', label: 'Go-live readiness', icon: 'readiness', end: true },
  { to: '/admin/settings', label: 'Settings & reminder', icon: 'settings' },
  { to: '/admin/history', label: 'Change history', icon: 'history' },
];

const PAGE_TITLES: Record<string, string> = {
  '/admin': 'Go-live readiness',
  '/admin/settings': 'Settings & reminder',
  '/admin/history': 'Change history',
};

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [me, setMe] = useState<Admin | null>(null);
  const [systems, setSystems] = useState<SystemItem[] | null>(null);
  const [systemsError, setSystemsError] = useState('');
  const [pending, setPending] = useState<Set<number>>(new Set());
  const [auditVersion, setAuditVersion] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const systemsRef = useRef(systems);
  systemsRef.current = systems;

  useEffect(() => {
    api<{ admin: Admin }>('/api/admin/me')
      .then((r) => {
        setMe(r.admin);
        return api<SystemItem[]>('/api/admin/systems').then(setSystems);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) navigate('/admin/login', { replace: true });
        else setSystemsError(err.message);
      });
  }, [navigate]);

  // Close the mobile menu after navigating.
  useEffect(() => setNavOpen(false), [location.pathname, location.search]);

  const updateSystems = useCallback(async (ids: number[], change: SystemChange) => {
    // Apply the change straight away; roll back if the save fails.
    const previous = systemsRef.current;
    setSystems(previous?.map((s) => (ids.includes(s.id) ? { ...s, ...change } : s)) ?? previous);
    setPending((p) => new Set([...p, ...ids]));
    setSystemsError('');
    try {
      const res = await api<{ systems: SystemItem[] }>('/api/admin/systems', {
        method: 'PATCH',
        body: { ids, ...change },
      });
      setSystems(res.systems);
      setAuditVersion((v) => v + 1);
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) navigate('/admin/login', { replace: true });
      setSystems(previous);
      setSystemsError(`Not saved: ${(err as Error).message}`);
      return false;
    } finally {
      setPending((p) => new Set([...p].filter((id) => !ids.includes(id))));
    }
  }, [navigate]);

  async function signOut() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    navigate('/admin/login', { replace: true });
  }

  if (!me) {
    return (
      <main className="page" aria-busy="true">
        {systemsError && <p className="error">{systemsError}</p>}
      </main>
    );
  }

  const context: AdminContext = {
    me,
    systems,
    systemsError,
    updateSystems,
    pending,
    auditVersion,
    bumpAudit: () => setAuditVersion((v) => v + 1),
    reloadSystems: () => {
      api<SystemItem[]>('/api/admin/systems').then(setSystems, (err) => setSystemsError(err.message));
    },
  };

  const all = systems ?? [];
  const phases = [...new Set(all.map((s) => s.phase))].sort();
  const byStatus = (st: string) => all.filter((s) => s.status === st).length;
  const quickFilters: { label: string; search: string; count: number; dot?: string }[] = [
    { label: 'All systems', search: '', count: all.length },
    { label: 'This go-live', search: '?scope=golive', count: all.filter(inScope).length },
    ...phases.map((p) => ({
      label: `Phase ${p}`,
      search: `?phase=${p}`,
      count: all.filter((s) => s.phase === p).length,
    })),
    { label: 'Not ready', search: '?status=not_ready', count: byStatus('not_ready'), dot: 'not_ready' },
    { label: 'In progress', search: '?status=in_progress', count: byStatus('in_progress'), dot: 'in_progress' },
    { label: 'Ready', search: '?status=ready', count: byStatus('ready'), dot: 'ready' },
    { label: 'Live', search: '?status=live', count: byStatus('live'), dot: 'live' },
    { label: 'Not going live', search: '?golive=no', count: all.filter((s) => s.goLive === 'no').length, dot: 'no' },
  ];
  const onReadiness = location.pathname === '/admin';

  return (
    <div className={`shell${navOpen ? ' nav-open' : ''}`}>
      <aside className="sidebar" aria-label="Admin">
        <div className="brand">
          <svg viewBox="0 0 32 32" width="36" height="36" aria-hidden="true">
            <circle cx="16" cy="16" r="15" fill="#BF9000" />
            <circle cx="16" cy="16" r="11" fill="none" stroke="#1F3864" strokeWidth="2.5" />
            <path d="M16 9v7l5 3" fill="none" stroke="#1F3864" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <div>
            <strong>CLET DTI</strong>
            <span>Go-live programme</span>
          </div>
          <button type="button" className="icon-btn nav-close" onClick={() => setNavOpen(false)} aria-label="Close menu">
            <Icon name="close" />
          </button>
        </div>

        <nav className="side-nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'active' : undefined)}>
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
          <a href="/" target="_blank" rel="noopener">
            <Icon name="external" />
            View countdown
          </a>
        </nav>

        <div className="quick">
          <p className="quick-title">Quick filters</p>
          <ul>
            {quickFilters.map((f) => {
              const active = onReadiness && location.search === f.search;
              return (
                <li key={f.label}>
                  <Link to={`/admin${f.search}`} className={active ? 'active' : undefined} aria-current={active ? 'true' : undefined}>
                    {f.dot && <span className={`dot ${f.dot}`} aria-hidden="true" />}
                    <span className="q-label">{f.label}</span>
                    <span className="q-count">{systems ? f.count : '–'}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
      <div className="scrim" onClick={() => setNavOpen(false)} aria-hidden="true" />

      <div className="main">
        <header className="topbar">
          <button type="button" className="icon-btn nav-toggle" onClick={() => setNavOpen(true)} aria-label="Open menu">
            <Icon name="menu" />
          </button>
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link to="/admin">Admin</Link>
            <span aria-hidden="true">›</span>
            <span aria-current="page">{PAGE_TITLES[location.pathname] ?? 'Admin'}</span>
          </nav>
          <div className="user">
            <span className="avatar" aria-hidden="true">
              {initials(me.name)}
            </span>
            <span className="user-name">{me.name}</span>
            <button type="button" className="icon-btn" onClick={signOut} aria-label="Sign out" title="Sign out">
              <Icon name="signout" />
            </button>
          </div>
        </header>
        <main className="content">
          <Outlet context={context} />
        </main>
      </div>
    </div>
  );
}
