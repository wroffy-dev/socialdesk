'use client';

import { useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { THEME_KEY as KEY } from '@/lib/theme-script';

export type ThemeChoice = 'light' | 'dark' | 'system';

function apply(choice: ThemeChoice) {
  const dark = choice === 'dark' || (choice === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const root = document.documentElement;
  root.classList.toggle('dark', dark);
  root.dataset.theme = choice;
}

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>('system');
  useEffect(() => {
    setChoice(read());
    // Follow the OS while the choice is "system".
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => read() === 'system' && apply('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  const set = (next: ThemeChoice) => {
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* private mode: the choice lasts for this page only */
    }
    apply(next);
    setChoice(next);
  };
  return { choice, set };
}

const OPTIONS: { value: ThemeChoice; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

/** Three-way segmented control: Light / Dark / System. */
export function ThemeSwitch({ className }: { className?: string }) {
  const { choice, set } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className={cn('inline-flex items-center gap-0.5 rounded-full border border-line bg-surface p-0.5', className)}>
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={choice === o.value}
          aria-label={o.label}
          title={o.label}
          onClick={() => set(o.value)}
          className={cn('flex size-7 items-center justify-center rounded-full text-muted transition-colors hover:text-fg', choice === o.value && 'bg-hover text-fg')}
        >
          <o.icon className="size-3.5" />
        </button>
      ))}
    </div>
  );
}
