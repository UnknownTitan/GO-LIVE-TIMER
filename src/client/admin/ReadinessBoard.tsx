import { useState, type DragEvent } from 'react';
import { STATUS_LABELS, SYSTEM_STATUSES, type SystemItem, type SystemStatus } from '../../shared/validation';
import { useAdmin } from './shared';

const DRAG_TYPE = 'application/x-golive-systems';

const EMPTY: Record<SystemStatus, string> = {
  not_ready: 'Nothing here.',
  in_progress: 'Drag systems here when work starts.',
  ready: 'Drag systems here when they are ready.',
  live: 'Drag systems here once they are live.',
};

/**
 * Columns per readiness status. Drag cards between columns, or use the arrow buttons,
 * which also work by keyboard and on touch screens.
 */
export function ReadinessBoard({ systems }: { systems: SystemItem[] }) {
  const { updateSystems, pending } = useAdmin();
  const [dropTarget, setDropTarget] = useState<SystemStatus | null>(null);

  function onDrop(e: DragEvent, status: SystemStatus) {
    e.preventDefault();
    setDropTarget(null);
    const raw = e.dataTransfer.getData(DRAG_TYPE);
    if (!raw) return;
    const ids = (JSON.parse(raw) as number[]).filter((id) => systems.find((s) => s.id === id)?.status !== status);
    if (ids.length) updateSystems(ids, { status });
  }

  return (
    <div className="board-cols">
      {SYSTEM_STATUSES.map((status, index) => {
        const items = systems.filter((s) => s.status === status);
        const prev = SYSTEM_STATUSES[index - 1];
        const next = SYSTEM_STATUSES[index + 1];
        return (
          <div
            key={status}
            className={`board-col st-${status}${dropTarget === status ? ' drop' : ''}`}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (dropTarget !== status) setDropTarget(status);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropTarget(null);
            }}
            onDrop={(e) => onDrop(e, status)}
            role="region"
            aria-labelledby={`col-${status}`}
          >
            <div className="board-col-head">
              <h3 id={`col-${status}`}>
                <span className={`dot ${status}`} aria-hidden="true" /> {STATUS_LABELS[status]}{' '}
                <span className="badge">{items.length}</span>
              </h3>
            </div>
            {items.length === 0 ? (
              <p className="board-empty">{EMPTY[status]}</p>
            ) : (
              <ul className="board-list">
                {items.map((s) => (
                  <li
                    key={s.id}
                    className={`sys-card${pending.has(s.id) ? ' saving' : ''}${s.goLive === 'no' ? ' excluded' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData(DRAG_TYPE, JSON.stringify([s.id]));
                      e.dataTransfer.setData('text/plain', `${s.code} ${s.name}`);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                  >
                    <div className="sys-main">
                      <span className="sys-code">
                        {s.code} · {s.clusterCode} · {s.phase}
                        {s.goLive === 'no' && ' · not going live'}
                      </span>
                      <span className="sys-name">{s.name}</span>
                      {s.notes && <span className="sys-meta">{s.notes}</span>}
                    </div>
                    <div className="sys-actions">
                      {prev && (
                        <button
                          type="button"
                          className="icon-btn small"
                          onClick={() => updateSystems([s.id], { status: prev })}
                          aria-label={`Move ${s.code} ${s.name} to ${STATUS_LABELS[prev]}`}
                        >
                          ←
                        </button>
                      )}
                      {next && (
                        <button
                          type="button"
                          className="icon-btn small"
                          onClick={() => updateSystems([s.id], { status: next })}
                          aria-label={`Move ${s.code} ${s.name} to ${STATUS_LABELS[next]}`}
                        >
                          →
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
