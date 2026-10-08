import { STATUS_LABELS, type SystemStatus } from '../../../shared/status';

/** Stack order for every readiness chart: furthest along first. */
export const STATUS_ORDER: SystemStatus[] = ['live', 'ready', 'in_progress', 'not_ready'];

export type StatusCounts = Record<SystemStatus, number>;

export const emptyCounts = (): StatusCounts => ({ live: 0, ready: 0, in_progress: 0, not_ready: 0 });

export function countStatuses(items: { status: SystemStatus }[]): StatusCounts {
  const c = emptyCounts();
  for (const s of items) c[s.status]++;
  return c;
}

/** Ready or live, as a whole percentage of the total. */
export function readyPercent(c: StatusCounts): number {
  const total = c.live + c.ready + c.in_progress + c.not_ready;
  return total === 0 ? 0 : Math.round(((c.live + c.ready) / total) * 100);
}

/** Single-value progress bar (one series, so no legend). */
export function ProgressBar({ value, label, tone = 'ready' }: { value: number; label: string; tone?: string }) {
  return (
    <span
      className="progress"
      role="progressbar"
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${value}%`}
    >
      <span className={`progress-fill ${tone}`} style={{ width: `${Math.min(100, value)}%` }} />
    </span>
  );
}

export function StatusPill({ status }: { status: SystemStatus }) {
  return (
    <span className={`status-pill ${status}`}>
      <span className="pill-dot" aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
