import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  GO_LIVE_DECISIONS,
  GO_LIVE_LABELS,
  STATUS_LABELS,
  SYSTEM_STATUSES,
  type GoLiveDecision,
  type SystemItem,
  type SystemStatus,
} from '../../shared/validation';
import { Icon, useAdmin } from './shared';

interface Props {
  systems: SystemItem[];
  selected: Set<number>;
  setSelected: Dispatch<SetStateAction<Set<number>>>;
}

/** Systems grouped by cluster, each group collapsible, with inline editing. */
export function SystemsTable({ systems, selected, setSelected }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<number | null>(null);

  const groups = new Map<string, SystemItem[]>();
  for (const s of systems) groups.set(s.clusterCode, [...(groups.get(s.clusterCode) ?? []), s]);

  const toggle = <T,>(set: Set<T>, value: T) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  return (
    <div className="groups">
      {[...groups].map(([code, items]) => {
        const isOpen = !collapsed.has(code);
        const count = (st: SystemStatus) => items.filter((s) => s.status === st).length;
        const allSelected = items.every((s) => selected.has(s.id));
        const someSelected = !allSelected && items.some((s) => selected.has(s.id));
        const bodyId = `group-${code}`;
        return (
          <section key={code} className="group" aria-labelledby={`${bodyId}-h`}>
            <header className="group-head">
              <button
                type="button"
                className="group-toggle"
                aria-expanded={isOpen}
                aria-controls={bodyId}
                onClick={() => setCollapsed((c) => toggle(c, code))}
              >
                <span className="cluster-badge">{code}</span>
                <span className="group-title" id={`${bodyId}-h`}>
                  {items[0]!.clusterName}
                </span>
                <span className="pill-count">
                  {items.length} {items.length === 1 ? 'system' : 'systems'}
                </span>
              </button>
              <span className="group-counts">
                {(['live', 'ready', 'in_progress', 'not_ready'] as const).map((st) =>
                  count(st) > 0 ? (
                    <span key={st} className="count-chip">
                      <span className={`dot ${st}`} aria-hidden="true" />
                      {count(st)} {STATUS_LABELS[st].toLowerCase()}
                    </span>
                  ) : null,
                )}
              </span>
              <button
                type="button"
                className={`icon-btn chevron${isOpen ? ' open' : ''}`}
                aria-label={isOpen ? `Collapse ${code}` : `Expand ${code}`}
                aria-expanded={isOpen}
                aria-controls={bodyId}
                onClick={() => setCollapsed((c) => toggle(c, code))}
              >
                <Icon name="chevron" />
              </button>
            </header>

            {isOpen && (
              <div className="table-wrap" id={bodyId}>
                <table className="systems">
                  <thead>
                    <tr>
                      <th className="col-check">
                        <input
                          type="checkbox"
                          aria-label={`Select all in ${code}`}
                          checked={allSelected}
                          ref={(el) => {
                            if (el) el.indeterminate = someSelected;
                          }}
                          onChange={() =>
                            setSelected((sel) => {
                              const next = new Set(sel);
                              items.forEach((s) => (allSelected ? next.delete(s.id) : next.add(s.id)));
                              return next;
                            })
                          }
                        />
                      </th>
                      <th className="col-code">Code</th>
                      <th>System name</th>
                      <th>Notes</th>
                      <th className="col-select">Go live?</th>
                      <th className="col-select">Readiness</th>
                      <th className="col-phase">Phase</th>
                      <th className="col-actions">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((s) => (
                      <Row
                        key={s.id}
                        system={s}
                        checked={selected.has(s.id)}
                        onCheck={() => setSelected((sel) => toggle(sel, s.id))}
                        editing={editing === s.id}
                        setEditing={(on) => setEditing(on ? s.id : null)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}

function Row({
  system: s,
  checked,
  onCheck,
  editing,
  setEditing,
}: {
  system: SystemItem;
  checked: boolean;
  onCheck: () => void;
  editing: boolean;
  setEditing: (on: boolean) => void;
}) {
  const { updateSystems, pending } = useAdmin();
  const [draft, setDraft] = useState(s.notes ?? '');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const label = `${s.code} ${s.name}`;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !menuRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [menuOpen]);

  const menuAction = (fn: () => void) => () => {
    setMenuOpen(false);
    fn();
  };

  async function saveNotes() {
    if (await updateSystems([s.id], { notes: draft.trim() || null })) setEditing(false);
  }

  return (
    <tr className={`${checked ? 'selected' : ''}${pending.has(s.id) ? ' saving' : ''}${s.goLive === 'no' ? ' excluded' : ''}`}>
      <td className="col-check">
        <input type="checkbox" aria-label={`Select ${label}`} checked={checked} onChange={onCheck} />
      </td>
      <td className="col-code">{s.code}</td>
      <td className="sys-name">{s.name}</td>
      <td className="notes">
        {editing ? (
          <form
            className="notes-edit"
            onSubmit={(e) => {
              e.preventDefault();
              saveNotes();
            }}
          >
            <label className="sr-only" htmlFor={`notes-${s.id}`}>
              Notes for {label}
            </label>
            <input
              id={`notes-${s.id}`}
              value={draft}
              maxLength={500}
              autoFocus
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
            />
            <button type="submit" className="btn small primary">
              Save
            </button>
            <button type="button" className="btn small ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </form>
        ) : (
          s.notes ?? <span className="muted">—</span>
        )}
      </td>
      <td className="col-select">
        <select
          className={`pill-select go-${s.goLive}`}
          aria-label={`Go live? ${label}`}
          value={s.goLive}
          onChange={(e) => updateSystems([s.id], { goLive: e.target.value as GoLiveDecision })}
        >
          {GO_LIVE_DECISIONS.map((d) => (
            <option key={d} value={d}>
              {GO_LIVE_LABELS[d]}
            </option>
          ))}
        </select>
      </td>
      <td className="col-select">
        <select
          className={`pill-select st-${s.status}`}
          aria-label={`Readiness of ${label}`}
          value={s.status}
          onChange={(e) => updateSystems([s.id], { status: e.target.value as SystemStatus })}
        >
          {SYSTEM_STATUSES.map((st) => (
            <option key={st} value={st}>
              {STATUS_LABELS[st]}
            </option>
          ))}
        </select>
      </td>
      <td className="col-phase">
        <span className="phase-badge">{s.phase}</span>
      </td>
      <td className="col-actions">
        <div className="menu-wrap" ref={menuRef}>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Actions for ${label}`}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((o) => !o)}
          >
            <Icon name="dots" />
          </button>
          {menuOpen && (
            <ul className="menu" role="menu">
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  autoFocus
                  onClick={menuAction(() => {
                    setDraft(s.notes ?? '');
                    setEditing(true);
                  })}
                >
                  Edit notes
                </button>
              </li>
              {s.status !== 'live' && (
                <li role="none">
                  <button type="button" role="menuitem" onClick={menuAction(() => updateSystems([s.id], { status: 'live' }))}>
                    Mark live
                  </button>
                </li>
              )}
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  onClick={menuAction(() => updateSystems([s.id], { goLive: s.goLive === 'no' ? 'tbd' : 'no' }))}
                >
                  {s.goLive === 'no' ? 'Include in this go-live' : 'Exclude from this go-live'}
                </button>
              </li>
              {s.updatedBy && s.updatedAt && (
                <li role="none" className="menu-meta">
                  Last changed by {s.updatedBy},{' '}
                  {new Date(s.updatedAt).toLocaleString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZone: 'UTC',
                  })}{' '}
                  GMT
                </li>
              )}
            </ul>
          )}
        </div>
      </td>
    </tr>
  );
}
