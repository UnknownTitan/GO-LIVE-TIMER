import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { computeCountdown, formatGoLive, formatShortDate, plural, type Countdown } from '../../shared/calc';
import { STATUS_LABELS, type SystemStatus } from '../../shared/status';
import type { CountdownData, PublicSystem } from '../../shared/validation';
import { api } from '../api';
import {
  countStatuses,
  ProgressBar,
  readyPercent,
  StatusPill,
  STATUS_ORDER,
  type StatusCounts,
} from './dashboard/charts';
import { VIcon, type ViewerIcon } from './dashboard/icons';
import './viewer.css';

const REFRESH_MS = 60_000;
const CACHE_KEY = 'golive:countdown';

/**
 * Fills in anything missing, so data saved by an older version of the page (or a
 * partial response) can't break rendering.
 */
export function normalise(raw: unknown): CountdownData | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Partial<CountdownData>;
  return {
    goLiveAt: typeof d.goLiveAt === 'string' ? d.goLiveAt : null,
    headline: d.headline ?? 'Countdown to Phase 1 Go-Live',
    programmeLine: d.programmeLine ?? '',
    holidays: Array.isArray(d.holidays) ? d.holidays : [],
    readinessUpdatedAt: d.readinessUpdatedAt ?? null,
    clusters: (Array.isArray(d.clusters) ? d.clusters : []).map((c) => ({
      ...c,
      readySystems: Array.isArray(c.readySystems) ? c.readySystems : [],
      liveSystems: Array.isArray(c.liveSystems) ? c.liveSystems : [],
    })),
    countdownPhases: Array.isArray(d.countdownPhases) ? d.countdownPhases : [],
    clusterNames: Array.isArray(d.clusterNames) ? d.clusterNames : [],
    systems: Array.isArray(d.systems) ? d.systems : [],
  };
}

function readCache(): CountdownData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? normalise(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeCache(data: CountdownData) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // Storage unavailable (private mode); the page still works from memory.
  }
}

/** Loads countdown data now and every 60 seconds; keeps the last good copy if the API is down. */
function useCountdownData() {
  const [data, setData] = useState<CountdownData | null>(readCache);
  const [stale, setStale] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const fresh = normalise(await api<unknown>('/api/countdown'));
      if (!fresh) throw new Error('Unexpected response');
      setData(fresh);
      writeCache(fresh);
      setStale(false);
    } catch {
      setStale(true);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    // Refresh straight away when a sleeping device or background tab comes back.
    const onVisible = () => document.visibilityState === 'visible' && load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  return { data, stale, loaded };
}

/** Current time, updated each second on the second boundary. */
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(Date.now());
      timer = setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    };
    tick();
    return () => clearTimeout(timer);
  }, []);
  return now;
}

const pad = (n: number) => String(n).padStart(2, '0');
const pctOf = (n: number, total: number) => (total === 0 ? 0 : Math.round((n / total) * 100));

const SECTIONS: { id: string; label: string; icon: ViewerIcon }[] = [
  { id: 'overview', label: 'Overview', icon: 'home' },
  { id: 'clusters', label: 'Clusters', icon: 'table' },
];

export function CountdownPage() {
  const { data, stale, loaded } = useCountdownData();
  const now = useNow();

  const goLiveMs = data?.goLiveAt ? Date.parse(data.goLiveAt) : null;
  const c = data && goLiveMs !== null ? computeCountdown(now, goLiveMs, data.holidays) : null;

  useEffect(() => {
    if (!c) document.title = 'CLET Go-Live Countdown';
    else if (c.isLive) document.title = `Live ${c.days} ${plural(c.days, 'day')} · CLET Go-Live`;
    else document.title = `${c.days} ${plural(c.days, 'day')} to go-live · CLET`;
  }, [c?.days, c?.isLive]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) {
    return (
      <main className="page">
        <p className="notice" role="status">
          {loaded ? 'The countdown could not be loaded. Check your connection; it will retry automatically.' : 'Loading…'}
        </p>
      </main>
    );
  }

  return (
    <div className="viewer">
      <aside className="v-side" aria-label="Sections">
        <div className="v-brand">
          <svg viewBox="0 0 32 32" width="36" height="36" aria-hidden="true">
            <circle cx="16" cy="16" r="15" fill="#BF9000" />
            <circle cx="16" cy="16" r="11" fill="none" stroke="#1F3864" strokeWidth="2.5" />
            <path d="M16 9v7l5 3" fill="none" stroke="#1F3864" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <div>
            <strong>CLET DTI</strong>
            <span>Go-live programme</span>
          </div>
        </div>
        <nav className="v-nav">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`}>
              <VIcon name={s.icon} />
              <span>{s.label}</span>
            </a>
          ))}
        </nav>
        <div className="v-mode">
          <span className="v-eye" aria-hidden="true">
            <VIcon name="eye" />
          </span>
          <div>
            <strong>Viewer</strong>
            <span>Read-only access</span>
          </div>
        </div>
      </aside>

      <main className="v-main">
        <div className="v-topbar">
          <span className={`live-pill${stale ? ' offline' : ''}`} role="status">
            <span className="pulse" aria-hidden="true" />
            {stale ? 'Offline · showing last loaded data' : 'Live · refreshes every minute'}
          </span>
          {data.readinessUpdatedAt && (
            <span className="v-updated">Readiness updated {formatShortDate(data.readinessUpdatedAt)}</span>
          )}
          <FullscreenButton />
        </div>
        {stale && (
          <p className="notice" role="status">
            Can’t reach the server. Still counting from the last loaded data; figures may be out of date.
          </p>
        )}
        <Dashboard data={data} c={c} />
        <footer className="v-foot">
          <span>
            All times GMT (Accra). Working days exclude weekends{data.holidays.length > 0 && ' and public holidays'}.
          </span>
          <span>CLET Digital Transformation Programme</span>
        </footer>
      </main>
    </div>
  );
}

interface ClusterRow {
  code: string;
  name: string;
  systems: PublicSystem[];
  counts: StatusCounts;
  goingLive: number;
}

export function Dashboard({ data, c }: { data: CountdownData; c: Countdown | null }) {
  const [openTile, setOpenTile] = useState<string | null>(null);
  const scope = useMemo(() => data.systems.filter((s) => s.inCountdown), [data.systems]);
  const counts = useMemo(() => countStatuses(scope), [scope]);
  const total = scope.length;
  const phasesLabel = data.countdownPhases.join(', ');

  const clusterRows: ClusterRow[] = useMemo(
    () =>
      data.clusterNames
        .map((cl) => {
          const systems = scope.filter((s) => s.clusterCode === cl.code);
          return {
            ...cl,
            systems,
            counts: countStatuses(systems),
            goingLive: systems.filter((s) => s.goLive === 'yes').length,
          };
        })
        .filter((r) => r.systems.length > 0),
    [data.clusterNames, scope],
  );

  const tiles: { key: string; value: number; label: string; sub: string; status?: SystemStatus; bar?: number }[] = [
    { key: 'all', value: data.systems.length, label: 'Total systems', sub: `All phases · ${data.clusterNames.length} clusters` },
    {
      key: 'scope',
      value: total,
      label: 'This go-live',
      sub: phasesLabel ? `Phases ${phasesLabel}` : 'No phases chosen',
      bar: pctOf(total, data.systems.length),
    },
    ...STATUS_ORDER.map((s) => ({
      key: s,
      value: counts[s],
      label: STATUS_LABELS[s],
      sub: `${pctOf(counts[s], total)}% of this go-live`,
      status: s,
      bar: pctOf(counts[s], total),
    })),
  ];

  return (
    <>
      <header className="v-head" id="overview">
        <div className="v-title">
          {data.programmeLine && <p className="programme">{data.programmeLine}</p>}
          <h1>{data.headline}</h1>
          <p className="lede">Readiness of every system in this go-live, by status, phase and cluster.</p>
          {data.goLiveAt && (
            <p className="v-date">
              <span className="v-date-icon" aria-hidden="true">
                <VIcon name="calendar" />
              </span>
              <span>
                <span className="label">{c?.isLive ? 'Went live' : 'Go-live date'}</span>
                <strong>{formatGoLive(data.goLiveAt)}</strong>
              </span>
            </p>
          )}
        </div>
        <CountdownHero c={c} />
      </header>

      <ul className="tiles" aria-label="Summary. Select a card to see its systems.">
        {tiles.map((t) => {
          const open = openTile === t.key;
          return (
            <li key={t.key}>
              <button
                type="button"
                className={`tile${open ? ' active' : ''}`}
                aria-haspopup="dialog"
                onClick={() => setOpenTile(t.key)}
              >
                <span className={`tile-icon ${t.status ?? t.key}`} aria-hidden="true">
                  <VIcon name={t.status ?? (t.key === 'all' ? 'layers' : 'rocket')} size={22} />
                </span>
                <span className="tile-text">
                  <span className="tile-value">{t.value}</span>
                  <span className="tile-label">{t.label}</span>
                  <span className="tile-sub">{t.sub}</span>
                </span>
                <span className="tile-chev" aria-hidden="true">
                  <VIcon name="chevron" size={16} />
                </span>
                {t.bar !== undefined && (
                  <ProgressBar value={t.bar} label={`${t.label}: ${t.bar}%`} tone={t.status ?? 'scope'} />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {openTile && (
        <TileDetail
          key={openTile}
          title={tiles.find((t) => t.key === openTile)!.label}
          subtitle={tileSubtitle(openTile, phasesLabel)}
          systems={tileSystems(openTile, data.systems, scope)}
          clusterNames={data.clusterNames}
          showStatus={openTile === 'all' || openTile === 'scope'}
          onClose={() => setOpenTile(null)}
        />
      )}

      <div className="v-grid">
        <ClusterTable rows={clusterRows} total={total} />
      </div>
    </>
  );
}

function tileSystems(key: string, all: PublicSystem[], scope: PublicSystem[]): PublicSystem[] {
  if (key === 'all') return all;
  if (key === 'scope') return scope;
  return scope.filter((s) => s.status === key);
}

function tileSubtitle(key: string, phasesLabel: string): string {
  if (key === 'all') return 'Every system in the workplan, all phases.';
  const scope = `this go-live${phasesLabel ? ` (phases ${phasesLabel}, plus any system confirmed to go live)` : ''}`;
  if (key === 'scope') return `Systems counted in ${scope}.`;
  return `${STATUS_LABELS[key as SystemStatus]} systems in ${scope}.`;
}

/**
 * Modal listing the systems behind a summary card: one table grouped by cluster, with phase
 * filters and search. Uses the native <dialog>, so Escape, focus trapping and returning focus
 * to the card are handled by the browser.
 */
export function TileDetail({
  title,
  subtitle,
  systems,
  clusterNames,
  showStatus,
  onClose,
}: {
  title: string;
  subtitle: string;
  systems: PublicSystem[];
  clusterNames: { code: string; name: string }[];
  showStatus: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // No close() here: removing the element ends the modal, and closing it would fire onClose.
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  const q = query.trim().toLowerCase();
  const shown = systems.filter(
    (s) => (!phase || s.phase === phase) && (!q || `${s.code} ${s.name}`.toLowerCase().includes(q)),
  );
  const groups = clusterNames
    .map((cl) => ({ ...cl, items: shown.filter((s) => s.clusterCode === cl.code) }))
    .filter((g) => g.items.length > 0);
  const phases = [...new Set(systems.map((s) => s.phase))]
    .sort()
    .map((p) => ({ phase: p, n: systems.filter((s) => s.phase === p).length }));
  const columns = showStatus ? 4 : 3;

  return (
    <dialog
      ref={dialogRef}
      className="td-modal"
      id="tile-detail"
      aria-labelledby="tile-detail-h"
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="td-body">
      <div className="td-head">
        <div>
          <h2 id="tile-detail-h">
            {title}
            <span className="count-pill">
              {systems.length} {plural(systems.length, 'system')}
            </span>
          </h2>
          <p className="card-sub">{subtitle}</p>
        </div>
        <button type="button" className="v-btn" onClick={onClose}>
          Close
        </button>
      </div>

      {systems.length === 0 ? (
        <p className="muted">No systems here yet.</p>
      ) : (
        <>
          <div className="td-tools">
            {phases.length > 1 ? (
              <div className="td-phases" role="group" aria-label="Filter by phase">
                <button type="button" aria-pressed={!phase} onClick={() => setPhase(null)}>
                  All <strong>{systems.length}</strong>
                </button>
                {phases.map((p) => (
                  <button
                    key={p.phase}
                    type="button"
                    aria-pressed={phase === p.phase}
                    onClick={() => setPhase(phase === p.phase ? null : p.phase)}
                  >
                    Phase {p.phase} <strong>{p.n}</strong>
                  </button>
                ))}
              </div>
            ) : (
              <span className="muted small">All in phase {phases[0]?.phase}</span>
            )}
            <label className="td-search">
              <span className="sr-only">Search these systems</span>
              <input
                type="search"
                value={query}
                placeholder="Search code or name…"
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>

          {groups.length === 0 ? (
            <p className="muted">No systems match.</p>
          ) : (
            <div className="td-scroll">
              <table className="td-table">
                <thead>
                  <tr>
                    <th className="td-code">Code</th>
                    <th>System</th>
                    <th className="td-phase">Phase</th>
                    {showStatus && <th className="td-status">Status</th>}
                  </tr>
                </thead>
                {groups.map((g) => (
                  <tbody key={g.code}>
                    <tr className="td-group">
                      <th colSpan={columns} scope="colgroup">
                        <span className="cb-code">{g.code}</span>
                        <span className="td-group-name">{g.name}</span>
                        <span className="td-group-n">{g.items.length}</span>
                      </th>
                    </tr>
                    {g.items.map((s) => (
                      <tr key={s.code}>
                        <td className="td-code">{s.code}</td>
                        <td className="td-name">{s.name}</td>
                        <td className="td-phase">{s.phase}</td>
                        {showStatus && (
                          <td className="td-status">
                            <StatusPill status={s.status} />
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                ))}
              </table>
            </div>
          )}
        </>
      )}
      </div>
    </dialog>
  );
}

function CountdownHero({ c }: { c: Countdown | null }) {
  if (!c) {
    return (
      <section className="hero" aria-label="Countdown">
        <p className="hero-title">Go-live countdown</p>
        <p className="hero-empty">The go-live date has not been set yet.</p>
      </section>
    );
  }
  const units = [
    { n: String(c.days), label: plural(c.days, 'day') },
    { n: pad(c.hours), label: plural(c.hours, 'hour') },
    { n: pad(c.minutes), label: plural(c.minutes, 'minute') },
    { n: pad(c.seconds), label: plural(c.seconds, 'second') },
  ];
  return (
    <section className="hero" aria-label={c.isLive ? 'Time since go-live' : 'Time to go-live'}>
      <p className="hero-title">
        <VIcon name="rocket" size={18} />
        {c.isLive ? 'Live for' : 'Go-live countdown'}
      </p>
      <div className="hero-units" aria-live="off">
        {units.map((u, i) => (
          <span key={i} className="hero-unit">
            <span className="hero-num">{u.n}</span>
            <span className="hero-label">{u.label}</span>
          </span>
        ))}
      </div>
      {!c.isLive && (
        <p className="hero-foot">
          {c.weeksLeft.toFixed(1)} weeks · {c.workingDaysLeft} working {plural(c.workingDaysLeft, 'day')} left
        </p>
      )}
    </section>
  );
}

function ClusterTable({ rows, total }: { rows: ClusterRow[]; total: number }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const toggle = (code: string) =>
    setOpen((o) => {
      const next = new Set(o);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });

  return (
    <section className="card-v" id="clusters" aria-labelledby="table-h">
      <div className="card-head">
        <h2 id="table-h">
          <span className="h-icon" aria-hidden="true">
            <VIcon name="table" size={18} />
          </span>
          This go-live by cluster
        </h2>
        <span className="count-pill">{total} systems</span>
      </div>
      <p className="card-sub">Select a cluster to see its systems.</p>
      {rows.length === 0 ? (
        <p className="muted">No systems are in this go-live yet.</p>
      ) : (
        <div className="v-table-wrap">
          <table className="v-table">
            <thead>
              <tr>
                <th>Cluster</th>
                <th className="num">Total</th>
                <th className="num">Going live</th>
                <th className="num">Live</th>
                <th className="num">Ready</th>
                <th className="num">In progress</th>
                <th className="num">Not ready</th>
                <th>Readiness</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = open.has(r.code);
                const value = readyPercent(r.counts);
                return (
                  <Fragment key={r.code}>
                    <tr className={isOpen ? 'open' : undefined}>
                      <th scope="row">
                        <button
                          type="button"
                          className="row-toggle"
                          aria-expanded={isOpen}
                          aria-controls={`cl-${r.code}`}
                          onClick={() => toggle(r.code)}
                        >
                          <span className="cb-code">{r.code}</span>
                          <span className="row-name">{r.name}</span>
                          <span className="chev" aria-hidden="true">
                            <VIcon name="chevron" size={18} />
                          </span>
                        </button>
                      </th>
                      <td className="num">{r.systems.length}</td>
                      <td className="num">{r.goingLive}</td>
                      <td className="num">{r.counts.live}</td>
                      <td className="num">{r.counts.ready}</td>
                      <td className="num">{r.counts.in_progress}</td>
                      <td className="num">{r.counts.not_ready}</td>
                      <td>
                        <span className="table-pct">
                          <strong>{value}%</strong>
                          <ProgressBar value={value} label={`${r.code} readiness`} />
                        </span>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr className="detail" id={`cl-${r.code}`}>
                        <td colSpan={8}>
                          <ul className="detail-list">
                            {r.systems.map((s) => (
                              <li key={s.code}>
                                <span className="sys-code">{s.code}</span>
                                <span className="sys-name">{s.name}</span>
                                <span className="muted small">Phase {s.phase}</span>
                                <StatusPill status={s.status} />
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function FullscreenButton() {
  const [isFull, setIsFull] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  if (!document.fullscreenEnabled) return null;
  const toggle = () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  return (
    <button type="button" className="v-btn" onClick={toggle}>
      <VIcon name={isFull ? 'collapse' : 'expand'} size={18} />
      {isFull ? 'Exit full screen' : 'Full screen'}
    </button>
  );
}
