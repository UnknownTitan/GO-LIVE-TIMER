// Composes the daily 18:00 status message (FR6). Pure, so it can be unit-tested.
import {
  computeCountdown,
  formatGoLive,
  formatShortDate,
  laggingClusters,
  overallReadiness,
  percent,
  plural,
  type Cluster,
} from '../shared/calc';

export interface ReminderInput {
  now: Date;
  goLiveAt: Date | null;
  holidays: string[];
  clusters: Cluster[];
  readinessUpdatedAt: string | null;
  appUrl?: string;
}

export interface ReminderMessage {
  kind: 'status' | 'live' | 'no-date';
  subject: string;
  text: string;
}

export function composeReminder(input: ReminderInput): ReminderMessage {
  const { now, goLiveAt, appUrl } = input;
  const footer = appUrl ? `\n\nCountdown: ${appUrl}` : '';

  if (!goLiveAt) {
    return {
      kind: 'no-date',
      subject: 'CLET go-live countdown: no go-live date set',
      text:
        'The daily go-live reminder could not be sent because no go-live date is set.\n\n' +
        'Sign in to the countdown admin page and set the go-live date and time.' +
        footer,
    };
  }

  const c = computeCountdown(now, goLiveAt, input.holidays);

  if (c.isLive) {
    return {
      kind: 'live',
      subject: 'CLET Phase 1 is live',
      text:
        `Phase 1 of the CLET ecosystem went live on ${formatGoLive(goLiveAt)}.\n\n` +
        `${readinessLines(input)}\n\n` +
        'This is the final daily reminder; no further messages will be sent.' +
        footer,
    };
  }

  const lines = [
    `Go-live: ${formatGoLive(goLiveAt)}`,
    '',
    `Days left: ${c.days}`,
    '',
    readinessLines(input),
  ];

  return {
    kind: 'status',
    subject: `CLET go-live: ${c.days} ${plural(c.days, 'day')} to go`,
    text: lines.join('\n') + footer,
  };
}

function readinessLines(input: ReminderInput): string {
  if (input.clusters.length === 0) return 'Readiness: no clusters entered yet.';
  const overall = overallReadiness(input.clusters);
  const lines = [`Readiness: ${overall.ready} of ${overall.total} systems ready (${overall.percent}%)`];
  const lagging = laggingClusters(input.clusters);
  if (lagging.length > 0) {
    lines.push('', 'Clusters needing attention:');
    for (const cl of lagging) {
      lines.push(`  - ${cl.name}: ${cl.ready} of ${cl.total} (${percent(cl.ready, cl.total)}%)`);
    }
  }
  if (input.readinessUpdatedAt) {
    lines.push('', `Figures last updated ${formatShortDate(input.readinessUpdatedAt)}.`);
  }
  return lines.join('\n');
}
