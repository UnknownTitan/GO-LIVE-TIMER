import { useRef, useState, type ReactNode } from 'react';
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

const pct = (n: number, total: number) => (total === 0 ? 0 : Math.round((n / total) * 100));

/**
 * Hover/focus tooltip for chart marks. `bind(text)` returns props for a mark;
 * the tooltip follows the pointer and also appears on keyboard focus.
 */
export function useTooltip() {
  const ref = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ text: ReactNode; x: number; y: number } | null>(null);

  const place = (text: ReactNode, clientX: number, clientY: number) => {
    const box = ref.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ text, x: clientX - box.left, y: clientY - box.top });
  };

  const bind = (text: ReactNode, label: string) => ({
    tabIndex: 0,
    'aria-label': label,
    onMouseEnter: (e: React.MouseEvent) => place(text, e.clientX, e.clientY),
    onMouseMove: (e: React.MouseEvent) => place(text, e.clientX, e.clientY),
    onMouseLeave: () => setTip(null),
    onFocus: (e: React.FocusEvent<Element>) => {
      const r = e.currentTarget.getBoundingClientRect();
      place(text, r.left + r.width / 2, r.top);
    },
    onBlur: () => setTip(null),
  });

  const layer = tip && (
    <div className="tip" role="tooltip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>
  );

  return { ref, bind, layer };
}

function TipBody({ label, n, total, status }: { label: string; n: number; total: number; status?: SystemStatus }) {
  return (
    <>
      <span className="tip-head">
        {status && <span className={`swatch ${status}`} aria-hidden="true" />}
        {label}
      </span>
      <span className="tip-value">
        {n} of {total} systems ({pct(n, total)}%)
      </span>
    </>
  );
}

/** Donut of systems by status, with the total in the hole and a legend beside it. */
export function StatusDonut({ counts }: { counts: StatusCounts }) {
  const { ref, bind, layer } = useTooltip();
  const total = STATUS_ORDER.reduce((n, s) => n + counts[s], 0);
  const r = 70;
  const stroke = 22;
  const c = 2 * Math.PI * r;
  const gap = total > 0 && STATUS_ORDER.filter((s) => counts[s] > 0).length > 1 ? 2 : 0;
  let offset = 0;

  return (
    <div className="donut-wrap" ref={ref}>
      <svg viewBox="0 0 180 180" className="donut" role="img" aria-label={`Systems by status, ${total} in total`}>
        <circle cx="90" cy="90" r={r} className="donut-track" strokeWidth={stroke} fill="none" />
        {total > 0 &&
          STATUS_ORDER.map((s) => {
            const len = (counts[s] / total) * c;
            if (len === 0) return null;
            const dash = Math.max(len - gap, 0.5);
            const el = (
              <circle
                key={s}
                cx="90"
                cy="90"
                r={r}
                fill="none"
                strokeWidth={stroke}
                className={`donut-seg ${s}`}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 90 90)"
                {...bind(<TipBody label={STATUS_LABELS[s]} n={counts[s]} total={total} status={s} />, `${STATUS_LABELS[s]}: ${counts[s]} of ${total}`)}
              />
            );
            offset += len;
            return el;
          })}
        <text x="90" y="88" textAnchor="middle" className="donut-total">
          {total}
        </text>
        <text x="90" y="110" textAnchor="middle" className="donut-caption">
          systems
        </text>
      </svg>
      <ul className="legend">
        {STATUS_ORDER.map((s) => (
          <li key={s}>
            <span className={`swatch ${s}`} aria-hidden="true" />
            <span className="legend-label">{STATUS_LABELS[s]}</span>
            <span className="legend-value">
              {counts[s]} <span className="muted">({pct(counts[s], total)}%)</span>
            </span>
          </li>
        ))}
      </ul>
      {layer}
    </div>
  );
}

/** One horizontal bar split by status, with a 2px surface gap between segments. */
export function StatusBar({ counts, label }: { counts: StatusCounts; label: string }) {
  const { ref, bind, layer } = useTooltip();
  const total = STATUS_ORDER.reduce((n, s) => n + counts[s], 0);
  return (
    <div className="stack-wrap" ref={ref}>
      <div className="stack" role="group" aria-label={`${label}: ${readyPercent(counts)}% ready or live`}>
        {total === 0 ? (
          <span className="stack-empty" />
        ) : (
          STATUS_ORDER.map((s) =>
            counts[s] > 0 ? (
              <span
                key={s}
                className={`stack-seg ${s}`}
                style={{ flexGrow: counts[s] }}
                {...bind(
                  <TipBody label={`${label} · ${STATUS_LABELS[s]}`} n={counts[s]} total={total} status={s} />,
                  `${label}, ${STATUS_LABELS[s]}: ${counts[s]} of ${total}`,
                )}
              />
            ) : null,
          )
        )}
      </div>
      {layer}
    </div>
  );
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
