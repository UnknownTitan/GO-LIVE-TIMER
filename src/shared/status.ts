// Readiness statuses and go-live decisions. Kept free of zod so the viewer page stays small.

export const SYSTEM_STATUSES = ['not_ready', 'in_progress', 'ready', 'live'] as const;
export type SystemStatus = (typeof SYSTEM_STATUSES)[number];
export const STATUS_LABELS: Record<SystemStatus, string> = {
  not_ready: 'Not ready',
  in_progress: 'In progress',
  ready: 'Ready',
  live: 'Live',
};

export const GO_LIVE_DECISIONS = ['yes', 'no', 'tbd'] as const;
export type GoLiveDecision = (typeof GO_LIVE_DECISIONS)[number];
export const GO_LIVE_LABELS: Record<GoLiveDecision, string> = {
  yes: 'Yes (go live)',
  no: 'No (not this go-live)',
  tbd: 'TBD',
};
