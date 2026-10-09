import { useEffect, useState, type FormEvent } from 'react';
import { formatGoLive } from '../../shared/calc';
import { firstError, settingsSchema, type AdminSettings } from '../../shared/validation';
import { api } from '../api';
import { StatusLine, useAdmin, type Status } from './shared';

export default function SettingsPage() {
  const { me, bumpAudit, reloadSystems, systems } = useAdmin();
  const phases = [...new Set((systems ?? []).map((s) => s.phase))].sort();
  return (
    <>
      <header className="page-head">
        <div>
          <h1>Settings &amp; reminder</h1>
          <p className="lede">The countdown's go-live date and texts, the phases it covers, and the daily 6:00pm reminder.</p>
        </div>
      </header>
      <div className="settings-grid">
        <SettingsForm
          onSaved={() => {
            bumpAudit();
            reloadSystems();
          }}
          phases={phases}
        />
        <TestReminder email={me.email} />
      </div>
    </>
  );
}

// Go-live is stored in UTC and entered in GMT, which is the same clock in Accra.
const toDateInput = (iso: string | null) => (iso ? iso.slice(0, 10) : '');
const toTimeInput = (iso: string | null) => (iso ? iso.slice(11, 16) : '10:00');

function SettingsForm({ onSaved, phases }: { onSaved: () => void; phases: string[] }) {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('10:00');
  const [recipients, setRecipients] = useState('');
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  function load(s: AdminSettings) {
    setSettings(s);
    setDate(toDateInput(s.goLiveAt));
    setTime(toTimeInput(s.goLiveAt));
    setRecipients(s.reminderRecipients.join('\n'));
  }

  useEffect(() => {
    api<AdminSettings>('/api/admin/settings').then(load, (err) => setStatus({ kind: 'error', text: err.message }));
  }, []);

  if (!settings) return <section className="card">{status ? <StatusLine status={status} /> : 'Loading…'}</section>;

  const set = <K extends keyof AdminSettings>(key: K, value: AdminSettings[K]) =>
    setSettings({ ...settings, [key]: value });

  async function save(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (date && !time) return setStatus({ kind: 'error', text: 'Enter a go-live time' });
    const body = {
      goLiveAt: date ? `${date}T${time}:00Z` : null,
      headline: settings!.headline,
      programmeLine: settings!.programmeLine,
      holidays: settings!.holidays,
      countdownPhases: settings!.countdownPhases,
      reminderEnabled: settings!.reminderEnabled,
      reminderRecipients: recipients
        .split(/[\s,;]+/)
        .map((r) => r.trim())
        .filter(Boolean),
    };
    const parsed = settingsSchema.safeParse(body);
    if (!parsed.success) return setStatus({ kind: 'error', text: firstError(parsed.error) });
    setBusy(true);
    try {
      load(await api<AdminSettings>('/api/admin/settings', { method: 'PUT', body: parsed.data }));
      setStatus({ kind: 'ok', text: 'Saved. Open countdown pages will update within a minute.' });
      onSaved();
    } catch (err) {
      setStatus({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="panel form" onSubmit={save} noValidate aria-labelledby="settings-h">
      <h2 id="settings-h">Countdown</h2>

      <label>
        Headline
        <input value={settings.headline} maxLength={90} required onChange={(e) => set('headline', e.target.value)} />
      </label>
      <label>
        Programme line
        <input value={settings.programmeLine} maxLength={140} onChange={(e) => set('programmeLine', e.target.value)} />
      </label>

      <fieldset>
        <legend>Go-live (GMT)</legend>
        <div className="row">
          <label>
            Date
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label>
            Time
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
        </div>
        <p className="hint">
          {date && time ? formatGoLive(`${date}T${time}:00Z`) : 'No go-live date set. Clear the date to unset it.'}
        </p>
      </fieldset>

      <fieldset>
        <legend>Phases in this go-live</legend>
        <p className="hint">
          The countdown's readiness figures and the daily reminder count systems in these phases (unless set to “No”), plus any system set to “Go live: Yes” in another phase.
        </p>
        <div className="phase-checks">
          {phases.map((p) => (
            <label key={p} className="check">
              <input
                type="checkbox"
                checked={settings.countdownPhases.includes(p)}
                onChange={(e) =>
                  set(
                    'countdownPhases',
                    e.target.checked
                      ? [...settings.countdownPhases, p].sort()
                      : settings.countdownPhases.filter((x) => x !== p),
                  )
                }
              />
              Phase {p}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Daily 6:00pm reminder</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.reminderEnabled}
            onChange={(e) => set('reminderEnabled', e.target.checked)}
          />
          Send the reminder at 18:00 Accra time each day until go-live
        </label>
        <label>
          Recipients (one email address per line)
          <textarea rows={3} value={recipients} onChange={(e) => setRecipients(e.target.value)} />
        </label>
      </fieldset>

      <StatusLine status={status} />
      <div className="actions">
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save countdown settings'}
        </button>
        {settings.updatedBy && (
          <span className="hint">
            Last saved by {settings.updatedBy}{' '}
            {settings.updatedAt && new Date(settings.updatedAt).toLocaleString('en-GB', { timeZone: 'UTC' })} GMT
          </span>
        )}
      </div>
    </form>
  );
}

function TestReminder({ email }: { email: string }) {
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setStatus(null);
    try {
      await api('/api/admin/reminder/test', { method: 'POST' });
      setStatus({ kind: 'ok', text: `Test reminder sent to ${email}.` });
    } catch (err) {
      setStatus({ kind: 'error', text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="test-h">
      <h2 id="test-h">Reminder</h2>
      <p className="hint">Sends today’s 6:00pm message to you only ({email}).</p>
      <StatusLine status={status} />
      <button type="button" className="btn" onClick={send} disabled={busy}>
        {busy ? 'Sending…' : 'Send me a test reminder'}
      </button>
    </section>
  );
}

