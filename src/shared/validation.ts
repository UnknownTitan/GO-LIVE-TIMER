// Validation rules from section 4, shared by the admin forms and the API.
import { z } from 'zod';
import type { Cluster } from './calc';

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Holidays must be valid dates (YYYY-MM-DD)')
  .refine((s) => {
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
  }, 'Holidays must be valid dates');

export const settingsSchema = z.object({
  goLiveAt: z
    .string()
    .datetime({ offset: true, message: 'Go-live must be a valid date and time' })
    .nullable(),
  headline: z.string().trim().min(1, 'Headline is required').max(90, 'Headline must be at most 90 characters'),
  programmeLine: z.string().trim().max(140, 'Programme line must be at most 140 characters'),
  holidays: z.array(isoDateString).max(366),
  countdownPhases: z
    .array(z.string().regex(/^[1-9][A-Z]?$/, 'Unknown phase'))
    .min(1, 'Choose at least one phase for the countdown')
    .max(20),
  reminderEnabled: z.boolean(),
  reminderRecipients: z.array(z.string().trim().email('Each recipient must be a valid email address')).max(50),
});
export type SettingsInput = z.infer<typeof settingsSchema>;

export {
  GO_LIVE_DECISIONS,
  GO_LIVE_LABELS,
  STATUS_LABELS,
  SYSTEM_STATUSES,
  type GoLiveDecision,
  type SystemStatus,
} from './status';
import { GO_LIVE_DECISIONS, SYSTEM_STATUSES, type GoLiveDecision, type SystemStatus } from './status';

/** Changes one field on one or more systems. Notes can only be set on one system at a time. */
export const systemsUpdateSchema = z
  .object({
    ids: z.array(z.number().int().positive()).min(1, 'Choose at least one system').max(300),
    status: z.enum(SYSTEM_STATUSES, { message: 'Unknown readiness status' }).optional(),
    goLive: z.enum(GO_LIVE_DECISIONS, { message: 'Go live must be yes, no or TBD' }).optional(),
    notes: z.string().trim().max(500, 'Notes must be at most 500 characters').nullable().optional(),
  })
  .refine((u) => [u.status, u.goLive, u.notes].filter((v) => v !== undefined).length === 1, {
    message: 'Change one thing at a time: status, go live or notes',
  })
  .refine((u) => u.notes === undefined || u.ids.length === 1, { message: 'Notes can be edited on one system at a time' });
export type SystemsUpdateInput = z.infer<typeof systemsUpdateSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

/** First validation message, for showing in a form or API error. */
export function firstError(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input';
}

export interface SystemRef {
  code: string;
  name: string;
}

/**
 * A cluster's readiness. `ready` counts systems that are ready or already live;
 * the two lists name them separately.
 */
export interface ClusterReadiness extends Cluster {
  readySystems: SystemRef[];
  liveSystems: SystemRef[];
}

/** Shape of GET /api/countdown. */
export interface CountdownData {
  goLiveAt: string | null;
  headline: string;
  programmeLine: string;
  holidays: string[];
  clusters: ClusterReadiness[];
  readinessUpdatedAt: string | null;
  /** Phases this countdown covers, e.g. ["1A", "1B"]. */
  countdownPhases: string[];
  /** Cluster codes and names, in display order. */
  clusterNames: { code: string; name: string }[];
  /** Every system in the workplan, without notes or admin details. */
  systems: PublicSystem[];
}

export interface PublicSystem {
  code: string;
  name: string;
  clusterCode: string;
  phase: string;
  status: SystemStatus;
  goLive: GoLiveDecision;
  inCountdown: boolean;
}

/** Shape of GET /api/admin/settings. */
export interface AdminSettings extends SettingsInput {
  updatedAt: string | null;
  updatedBy: string | null;
}

/** One system on the go-live readiness board. */
export interface SystemItem {
  id: number;
  code: string;
  name: string;
  clusterCode: string;
  clusterName: string;
  phase: string;
  notes: string | null;
  status: SystemStatus;
  goLive: GoLiveDecision;
  /** Counts towards the countdown: decided "yes", or in a countdown phase and not decided "no". */
  inCountdown: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface AuditEntry {
  id: number;
  adminName: string;
  adminEmail: string;
  action: string;
  before: unknown;
  after: unknown;
  createdAt: string;
}
