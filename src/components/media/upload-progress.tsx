'use client';

import { X } from 'lucide-react';
import type { UploadItem } from './use-upload';

export function UploadProgress({ items, onDismiss }: { items: UploadItem[]; onDismiss: (key: string) => void }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((i) => (
        <li key={i.key} className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-[13px]">
          <span className="min-w-0 flex-1 truncate">{i.name}</span>
          {i.error ? (
            <>
              <span className="truncate text-xs text-danger">{i.error}</span>
              <button onClick={() => onDismiss(i.key)} aria-label="Dismiss" className="text-muted hover:text-fg">
                <X className="size-3.5" />
              </button>
            </>
          ) : (
            <span className="h-1.5 w-24 overflow-hidden rounded-full bg-line">
              <span className="block h-full bg-accent-ink transition-all" style={{ width: `${Math.round(i.progress * 100)}%` }} />
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
