import { useEffect, useState } from 'react';
import {
  GO_LIVE_LABELS,
  STATUS_LABELS,
  type AuditEntry,
  type GoLiveDecision,
  type SystemStatus,
} from '../../shared/validation';
import { api } from '../api';
import { useAdmin } from './shared';

const ACTION_LABELS: Record<string, string> = {
  'settings.update': 'Updated countdown settings',
  'system.status': 'Changed readiness',
  'system.go_live': 'Changed go-live decision',
  'system.notes': 'Edited notes',
  // Entries written before the readiness table existed
  'system.ready': 'Marked ready for go-live',
  'system.live': 'Marked live',
  'system.not_ready': 'Moved to not ready',
};

function describeChange(entry: AuditEntry): string {
  const after = entry.after as Record<string, unknown> | null;
  const obj = (after ?? entry.before) as Record<string, unknown> | null;
  if (!obj) return '';
  if (entry.action.startsWith('system.')) {
    const systems = (after?.systems as string[] | undefined) ?? [];
    const list = systems.length > 3 ? `${systems.slice(0, 3).join('; ')} and ${systems.length - 3} more` : systems.join('; ');
    const value =
      'status' in (after ?? {}) ? STATUS_LABELS[after!.status as SystemStatus]
      : 'goLive' in (after ?? {}) ? GO_LIVE_LABELS[after!.goLive as GoLiveDecision]
      : 'notes' in (after ?? {}) ? `“${after!.notes ?? ''}”`
      : '';
    return value ? `→ ${value}: ${list}` : list;
  }
  return Object.keys(obj).join(', ');
}

export default function HistoryPage() {
  const { auditVersion: version } = useAdmin();
  const [entries, setEntries] = useState<AuditEntry[] | null>(null);

  useEffect(() => {
    api<AuditEntry[]>('/api/admin/audit').then(setEntries, () => setEntries([]));
  }, [version]);

  return (
    <>
      <header className="page-head">
        <div>
          <h1 id="audit-h">Change history</h1>
          <p className="lede">The latest 100 changes, newest first. Times are GMT.</p>
        </div>
      </header>
      <section className="panel" aria-labelledby="audit-h">
        {!entries ? (
          <p className="hint">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="hint">No changes recorded yet.</p>
        ) : (
          <ol className="audit">
            {entries.map((e) => (
              <li key={e.id}>
                <time dateTime={e.createdAt}>
                  {new Date(e.createdAt).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'UTC',
                  })}
                </time>{' '}
                <strong>{e.adminName ?? 'Unknown'}</strong> {ACTION_LABELS[e.action] ?? e.action}{' '}
                <span className="muted">{describeChange(e)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}
