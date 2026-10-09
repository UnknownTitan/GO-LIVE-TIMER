import { useEffect, useState } from 'react';

export type ThemeChoice = 'system' | 'light' | 'dark';

// Keep in step with the inline script in index.html, which applies the saved choice before first paint.
const STORAGE_KEY = 'golive:theme';

function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function applyChoice(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Storage blocked: the choice still applies for this visit.
  }
}

const OPTIONS: { value: ThemeChoice; label: string; icon: string }[] = [
  {
    value: 'light',
    label: 'Light',
    icon: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 1v2m0 18v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M1 12h2m18 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  },
  { value: 'dark', label: 'Dark', icon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z' },
  { value: 'system', label: 'System', icon: 'M3 5h18v11H3V5Zm5 15h8m-4-4v4' },
];

/** Light / Dark / System switch, remembered in this browser. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice);

  useEffect(() => applyChoice(choice), [choice]);

  return (
    <div className={`theme-toggle ${className}`} role="group" aria-label="Colour theme">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={choice === o.value}
          title={`${o.label} theme`}
          onClick={() => setChoice(o.value)}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d={o.icon} />
          </svg>
          <span className="theme-label">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
