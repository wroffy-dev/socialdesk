'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/feedback';
import { api } from '@/lib/api-client';
import { formatAgo } from '@/lib/time';
import { SettingsSection } from './section';

type Item = { id: string; action: string; actor: string; targetType: string | null; targetId: string | null; metadata: unknown; createdAt: string; workspace?: string | null };

/** Paginated audit trail; shared by workspace settings and the admin panel. */
export function AuditLog({ endpoint, title = 'Audit log' }: { endpoint: string; title?: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(
    async (after: string | null) => {
      setLoading(true);
      try {
        const res = await api<{ items: Item[]; nextCursor: string | null }>(`${endpoint}${after ? `?cursor=${after}` : ''}`);
        setItems((cur) => (after ? [...(cur ?? []), ...res.items] : res.items));
        setCursor(res.nextCursor);
      } finally {
        setLoading(false);
      }
    },
    [endpoint],
  );
  useEffect(() => void load(null), [load]);

  return (
    <SettingsSection title={title} description="Sensitive actions such as sign-ins, role changes, channel connections and deletions.">
      {!items ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-[13px] text-muted">Nothing recorded yet.</p>
      ) : (
        <ul className="-my-1 divide-y divide-line text-[13px]">
          {items.map((i) => (
            <li key={i.id} className="flex flex-wrap items-baseline gap-x-2 py-2">
              <code className="rounded bg-subtle px-1.5 py-0.5 text-xs">{i.action}</code>
              <span>{i.actor}</span>
              {i.workspace && <span className="text-muted">in {i.workspace}</span>}
              {i.targetType && <span className="text-muted">· {i.targetType}</span>}
              <span className="ml-auto text-xs text-muted" title={new Date(i.createdAt).toLocaleString()}>
                {formatAgo(i.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {cursor && (
        <Button variant="outline" size="sm" className="mt-3" loading={loading} onClick={() => load(cursor)}>
          Load more
        </Button>
      )}
    </SettingsSection>
  );
}
