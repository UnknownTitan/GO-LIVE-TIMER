import { useOutletContext } from 'react-router-dom';
import type { GoLiveDecision, SystemItem, SystemStatus } from '../../shared/validation';

export interface Admin {
  id: number;
  email: string;
  name: string;
}

export type SystemChange = { status: SystemStatus } | { goLive: GoLiveDecision } | { notes: string | null };

export interface AdminContext {
  me: Admin;
  systems: SystemItem[] | null;
  systemsError: string;
  /** Saves a change to one or more systems; resolves false (and shows the error) if it failed. */
  updateSystems: (ids: number[], change: SystemChange) => Promise<boolean>;
  pending: Set<number>;
  auditVersion: number;
  bumpAudit: () => void;
  /** Re-fetches systems, e.g. after the countdown's phases change. */
  reloadSystems: () => void;
}

export const useAdmin = () => useOutletContext<AdminContext>();

export type Status = { kind: 'ok' | 'error'; text: string } | null;

export function StatusLine({ status }: { status: Status }) {
  if (!status) return null;
  return (
    <p className={status.kind === 'ok' ? 'success' : 'error'} role={status.kind === 'ok' ? 'status' : 'alert'}>
      {status.text}
    </p>
  );
}

/** Systems that count towards the countdown: decided "yes", or in a countdown phase and not "no". */
export const inScope = (s: SystemItem) => s.inCountdown;

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

const ICONS = {
  readiness: 'M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2m-3-3 4 4m-4-4 3-6c2-4 6-6 10-6 0 4-2 8-6 10l-6 3m6-8a1.5 1.5 0 1 0 0-.01',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 3h-4l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2Z',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l3 2',
  external: 'M14 4h6v6m0-6-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  layers: 'm12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5',
  check: 'M20 6 9 17l-5-5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v4l3 2',
  alert: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5m0 3.5v.01',
  live: 'M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Zm-4.2 3.2a6 6 0 0 1 0-8.4m8.4 0a6 6 0 0 1 0 8.4M5 19a10 10 0 0 1 0-14m14 0a10 10 0 0 1 0 14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-4-4',
  download: 'M12 4v11m0 0-4-4m4 4 4-4M5 19h14',
  chevron: 'm6 9 6 6 6-6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  table: 'M4 5h16v14H4V5Zm0 5h16M4 15h16M10 5v14',
  board: 'M4 5h4v14H4V5Zm6 0h4v9h-4V5Zm6 0h4v12h-4V5Z',
  close: 'M6 6l12 12M18 6 6 18',
  signout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 16l4-4-4-4m4 4H4',
} as const;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={ICONS[name]} />
    </svg>
  );
}
