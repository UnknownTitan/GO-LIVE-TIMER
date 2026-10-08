// Reads shared by the public endpoint, admin endpoints and the reminder job.
import type { AdminSettings, ClusterReadiness, CountdownData, PublicSystem, SystemItem } from '../shared/validation';
import { query } from './db';

interface SettingsRow {
  go_live_at: Date | null;
  headline: string;
  programme_line: string;
  holidays: string[];
  countdown_phases: string[];
  reminder_enabled: boolean;
  reminder_recipients: string[];
  reminder_final_sent: boolean;
  updated_at: Date;
  updated_by_name: string | null;
}

export async function loadSettingsRow(): Promise<SettingsRow> {
  const [row] = await query<SettingsRow>(
    `SELECT s.go_live_at, s.headline, s.programme_line, s.holidays::text[] AS holidays, s.countdown_phases,
            s.reminder_enabled, s.reminder_recipients, s.reminder_final_sent, s.updated_at,
            a.name AS updated_by_name
     FROM settings s LEFT JOIN admins a ON a.id = s.updated_by WHERE s.id = 1`,
  );
  return row;
}

export function toAdminSettings(row: SettingsRow): AdminSettings {
  return {
    goLiveAt: row.go_live_at ? row.go_live_at.toISOString() : null,
    headline: row.headline,
    programmeLine: row.programme_line,
    holidays: row.holidays,
    countdownPhases: row.countdown_phases,
    reminderEnabled: row.reminder_enabled,
    reminderRecipients: row.reminder_recipients,
    updatedAt: row.updated_at.toISOString(),
    updatedBy: row.updated_by_name,
  };
}

/**
 * SQL for "counts towards the countdown": decided "yes" (whatever its phase), or in one of
 * the countdown's phases and not decided "no".
 */
const IN_COUNTDOWN = (alias: string, phases: string) =>
  `(${alias}.go_live = 'yes' OR (${alias}.go_live <> 'no' AND ${alias}.phase = ANY(${phases})))`;
const PHASES = '(SELECT countdown_phases FROM settings WHERE id = 1)::text[]';

/** Readiness per cluster, counted from the systems board. */
export async function loadClusters(): Promise<{ clusters: ClusterReadiness[]; updatedAt: string | null }> {
  const rows = await query<ClusterReadiness>(
    `SELECT c.sort_order AS id, c.code || ' · ' || c.name AS name,
            count(*) FILTER (WHERE s.status IN ('ready', 'live'))::int AS ready, count(*)::int AS total,
            coalesce(json_agg(json_build_object('code', s.code, 'name', s.name) ORDER BY s.sort_order)
                     FILTER (WHERE s.status = 'ready'), '[]') AS "readySystems",
            coalesce(json_agg(json_build_object('code', s.code, 'name', s.name) ORDER BY s.sort_order)
                     FILTER (WHERE s.status = 'live'), '[]') AS "liveSystems"
     FROM clusters c JOIN systems s ON s.cluster_code = c.code AND ${IN_COUNTDOWN('s', PHASES)}
     GROUP BY c.code ORDER BY c.sort_order`,
  );
  const [{ updated_at }] = await query<{ updated_at: Date | null }>(
    `SELECT max(s.updated_at) AS updated_at FROM systems s WHERE ${IN_COUNTDOWN('s', PHASES)}`,
  );
  return { clusters: rows, updatedAt: updated_at ? updated_at.toISOString() : null };
}

export async function loadSystems(): Promise<SystemItem[]> {
  return query<SystemItem>(
    `SELECT s.id, s.code, s.name, s.cluster_code AS "clusterCode", c.name AS "clusterName", s.phase, s.notes,
            s.status, s.go_live AS "goLive",
            ${IN_COUNTDOWN('s', 'st.countdown_phases')} AS "inCountdown", s.updated_at AS "updatedAt", a.name AS "updatedBy"
     FROM systems s JOIN clusters c ON c.code = s.cluster_code CROSS JOIN settings st
     LEFT JOIN admins a ON a.id = s.updated_by
     ORDER BY c.sort_order, s.sort_order`,
  );
}

/** Public data only: never includes recipients or admin details. */
export async function loadCountdownData(): Promise<CountdownData> {
  const [settings, { clusters, updatedAt }, clusterNames, systems] = await Promise.all([
    loadSettingsRow(),
    loadClusters(),
    query<{ code: string; name: string }>('SELECT code, name FROM clusters ORDER BY sort_order'),
    query<PublicSystem>(
      `SELECT s.code, s.name, s.cluster_code AS "clusterCode", s.phase, s.status, s.go_live AS "goLive",
              ${IN_COUNTDOWN('s', 'st.countdown_phases')} AS "inCountdown"
       FROM systems s JOIN clusters c ON c.code = s.cluster_code CROSS JOIN settings st
       ORDER BY c.sort_order, s.sort_order`,
    ),
  ]);
  return {
    goLiveAt: settings.go_live_at ? settings.go_live_at.toISOString() : null,
    headline: settings.headline,
    programmeLine: settings.programme_line,
    holidays: settings.holidays,
    clusters,
    readinessUpdatedAt: updatedAt,
    countdownPhases: settings.countdown_phases,
    clusterNames,
    systems,
  };
}
