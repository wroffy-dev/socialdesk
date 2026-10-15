'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { api, errorMessage } from '@/lib/api-client';
import { formatAgo } from '@/lib/time';

export function ContentEditor({ page }: { page: { key: string; title: string; body: string; updatedAt: string } }) {
  const [title, setTitle] = useState(page.title);
  const [body, setBody] = useState(page.body);
  const [busy, setBusy] = useState(false);
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between">
        <a href={`/legal/${page.key}`} target="_blank" rel="noreferrer" className="text-[13px] text-info underline">
          /legal/{page.key}
        </a>
        <span className="text-xs text-muted">Updated {formatAgo(page.updatedAt)}</span>
      </div>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title" />
      <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[320px] font-mono text-xs" aria-label="Body (Markdown)" />
      <Button
        variant="primary"
        className="self-end"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api(`/api/admin/content/${page.key}`, { method: 'PUT', body: { title, body } });
            toast.success('Saved');
          } catch (err) {
            toast.error(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        Save
      </Button>
    </Card>
  );
}
