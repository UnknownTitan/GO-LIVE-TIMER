import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  GO_LIVE_DECISIONS,
  GO_LIVE_LABELS,
  STATUS_LABELS,
  SYSTEM_STATUSES,
  type GoLiveDecision,
  type SystemItem,
  type SystemStatus,
} from '../../shared/validation';
import { ReadinessBoard } from './ReadinessBoard';
import { Icon, inScope, useAdmin, type IconName } from './shared';
import { SystemsTable } from './SystemsTable';

const FILTER_KEYS = ['q', 'cluster', 'status', 'golive', 'phase', 'scope'] as const;

export default function ReadinessPage() {
  const { systems, systemsError, updateSystems } = useAdmin();
  const [params, setParams] = useSearchParams();
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const q = params.get('q') ?? '';
  const cluster = params.get('cluster') ?? '';
  const status = params.get('status') ?? '';
  const golive = params.get('golive') ?? '';
  const phase = params.get('phase') ?? '';
  const scope = params.get('scope') === 'golive';
  const view = params.get('view') === 'board' ? 'board' : 'table';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  };
  const clearFilters = () => {
    const next = new URLSearchParams(params);
    FILTER_KEYS.forEach((k) => next.delete(k));
    setParams(next, { replace: true });
  };

  const phases = useMemo(() => [...new Set(systems?.map((s) => s.phase))].sort(), [systems]);

  const clusters = useMemo(() => {
    const map = new Map<string, string>();
    systems?.forEach((s) => map.set(s.clusterCode, s.clusterName));
    return [...map];
  }, [systems]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (systems ?? []).filter(
      (s) =>
        (!cluster || s.clusterCode === cluster) &&
        (!status || s.status === status) &&
        (!golive || s.goLive === golive) &&
        (!phase || s.phase === phase) &&
        (!scope || s.inCountdown) &&
        (!needle || `${s.code} ${s.name} ${s.notes ?? ''}`.toLowerCase().includes(needle)),
    );
  }, [systems, q, cluster, status, golive, phase, scope]);

  if (!systems) {
    return systemsError ? (
      <p className="error" role="alert">
        {systemsError}
      </p>
    ) : (
      <p className="hint">Loading systems…</p>
    );
  }

  const scoped = systems.filter(inScope);
  const countStatus = (st: SystemStatus) => scoped.filter((s) => s.status === st).length;
  const filtersActive = FILTER_KEYS.some((k) => params.get(k));
  const selectedIds = [...selected].filter((id) => visible.some((s) => s.id === id));

  const stats: { key: string; value: number; label: string; sub: string; icon: IconName; tone: string; filter?: SystemStatus }[] = [
    {
      key: 'total',
      value: scoped.length,
      label: 'In this go-live',
      sub: `Phases ${[...new Set(scoped.map((s) => s.phase))].sort().join(', ') || '–'}`,
      icon: 'layers',
      tone: 'total',
    },
    { key: 'live', value: countStatus('live'), label: 'Live', sub: 'Already in use', icon: 'live', tone: 'live', filter: 'live' },
    { key: 'ready', value: countStatus('ready'), label: 'Ready for go-live', sub: 'Meets readiness criteria', icon: 'check', tone: 'ready', filter: 'ready' },
    { key: 'progress', value: countStatus('in_progress'), label: 'In progress', sub: 'Work under way', icon: 'clock', tone: 'in_progress', filter: 'in_progress' },
    { key: 'not', value: countStatus('not_ready'), label: 'Not ready', sub: 'Needs attention', icon: 'alert', tone: 'not_ready', filter: 'not_ready' },
  ];

  async function bulk(change: { status: SystemStatus } | { goLive: GoLiveDecision }) {
    if (selectedIds.length === 0) return;
    if (await updateSystems(selectedIds, change)) setSelected(new Set());
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>
            Go-live readiness <span className="pill-count">{systems.length} systems</span>
          </h1>
          <p className="lede">
            All systems in the workplan, phases {phases[0]} to {phases[phases.length - 1]}. Set whether each goes live,
            track its readiness, and mark it live once it is in use. The figures below cover this go-live (the phases
            chosen in Settings); changes reach the countdown within a minute.
          </p>
        </div>
      </header>

      <ul className="stats" aria-label="Summary">
        {stats.map((s) => {
          const active = s.filter && status === s.filter;
          const body = (
            <>
              <span className={`stat-icon ${s.tone}`}>
                <Icon name={s.icon} size={22} />
              </span>
              <span className="stat-text">
                <span className="stat-value">{s.value}</span>
                <span className="stat-label">{s.label}</span>
                <span className="stat-sub">{s.sub}</span>
              </span>
            </>
          );
          return (
            <li key={s.key}>
              {s.filter ? (
                <button
                  type="button"
                  className={`stat${active ? ' active' : ''}`}
                  aria-pressed={active}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    if (active) next.delete('status');
                    else {
                      next.set('status', s.filter!);
                      next.set('scope', 'golive');
                    }
                    setParams(next, { replace: true });
                  }}
                >
                  {body}
                </button>
              ) : (
                <button
                  type="button"
                  className={`stat${scope && !status ? ' active' : ''}`}
                  aria-pressed={scope && !status}
                  onClick={() => {
                    const next = new URLSearchParams(params);
                    next.delete('status');
                    if (scope && !status) next.delete('scope');
                    else next.set('scope', 'golive');
                    setParams(next, { replace: true });
                  }}
                >
                  {body}
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <section className="panel" aria-labelledby="systems-h">
        <div className="panel-head">
          <div>
            <h2 id="systems-h">Systems</h2>
            <p className="hint">Grouped by cluster. {visible.length === systems.length ? `${systems.length} systems` : `Showing ${visible.length} of ${systems.length}`}.</p>
          </div>
          <div className="view-toggle" role="group" aria-label="View">
            <button type="button" aria-pressed={view === 'table'} onClick={() => setParam('view', '')}>
              <Icon name="table" size={18} /> Table
            </button>
            <button type="button" aria-pressed={view === 'board'} onClick={() => setParam('view', 'board')}>
              <Icon name="board" size={18} /> Board
            </button>
          </div>
        </div>

        <div className="toolbar">
          <label className="search">
            <Icon name="search" size={18} />
            <span className="sr-only">Search systems</span>
            <input type="search" value={q} placeholder="Search systems or codes…" onChange={(e) => setParam('q', e.target.value)} />
          </label>
          <label>
            <span className="sr-only">Cluster</span>
            <select value={cluster} onChange={(e) => setParam('cluster', e.target.value)}>
              <option value="">All clusters</option>
              {clusters.map(([code, name]) => (
                <option key={code} value={code}>
                  {code} · {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Phase</span>
            <select value={phase} onChange={(e) => setParam('phase', e.target.value)}>
              <option value="">All phases</option>
              {phases.map((p) => (
                <option key={p} value={p}>
                  Phase {p}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Readiness</span>
            <select value={status} onChange={(e) => setParam('status', e.target.value)}>
              <option value="">All statuses</option>
              {SYSTEM_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {STATUS_LABELS[st]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Go live?</span>
            <select value={golive} onChange={(e) => setParam('golive', e.target.value)}>
              <option value="">Go live: any</option>
              {GO_LIVE_DECISIONS.map((d) => (
                <option key={d} value={d}>
                  Go live: {GO_LIVE_LABELS[d]}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn" onClick={() => exportCsv(visible)}>
            <Icon name="download" size={18} /> Export
          </button>
        </div>

        {filtersActive && (
          <p className="hint filters-note">
            {scope && <>This go-live only. </>}
            <button type="button" className="link" onClick={clearFilters}>
              Clear filters
            </button>
          </p>
        )}

        {selectedIds.length > 0 && (
          <div className="bulkbar" role="region" aria-label="Bulk actions">
            <strong>{selectedIds.length} selected</strong>
            <label>
              Set readiness
              <select value="" onChange={(e) => e.target.value && bulk({ status: e.target.value as SystemStatus })}>
                <option value="">Choose…</option>
                {SYSTEM_STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {STATUS_LABELS[st]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Go live?
              <select value="" onChange={(e) => e.target.value && bulk({ goLive: e.target.value as GoLiveDecision })}>
                <option value="">Choose…</option>
                {GO_LIVE_DECISIONS.map((d) => (
                  <option key={d} value={d}>
                    {GO_LIVE_LABELS[d]}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="link" onClick={() => setSelected(new Set())}>
              Clear selection
            </button>
          </div>
        )}

        {systemsError && (
          <p className="error" role="alert">
            {systemsError}
          </p>
        )}

        {visible.length === 0 ? (
          <p className="empty">No systems match these filters.</p>
        ) : view === 'board' ? (
          <ReadinessBoard systems={visible} />
        ) : (
          <SystemsTable systems={visible} selected={selected} setSelected={setSelected} />
        )}
      </section>
    </>
  );
}

function exportCsv(systems: SystemItem[]) {
  const header = ['Code', 'System', 'Cluster', 'Phase', 'Go live?', 'Readiness', 'Notes', 'Last updated (GMT)', 'Updated by'];
  const rows = systems.map((s) => [
    s.code,
    s.name,
    `${s.clusterCode} · ${s.clusterName}`,
    s.phase,
    GO_LIVE_LABELS[s.goLive],
    STATUS_LABELS[s.status],
    s.notes ?? '',
    s.updatedAt ? new Date(s.updatedAt).toISOString().slice(0, 16).replace('T', ' ') : '',
    s.updatedBy ?? '',
  ]);
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  // Leading BOM so Excel opens the file as UTF-8 (cluster names use "·" and "—").
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `go-live-readiness-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
