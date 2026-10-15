'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/feedback';
import { useConfirm } from '@/components/ui/confirm';
import { api, errorMessage } from '@/lib/api-client';
import { SettingsSection } from './section';

type Tag = { id: string; name: string; color: string; postCount: number };
const COLORS = ['#e879a6', '#60a5fa', '#34d399', '#fbbf24', '#a78bfa', '#f87171', '#9ca3af', '#2dd4bf'];

export function TagsManager({ workspaceId, initial, canManage }: { workspaceId: string; initial: Tag[]; canManage: boolean }) {
  const confirm = useConfirm();
  const [tags, setTags] = useState(initial);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]!);

  const save = async (t: Tag, patch: Partial<Tag>) => {
    const next = { ...t, ...patch };
    setTags((cur) => cur.map((x) => (x.id === t.id ? next : x)));
    try {
      await api(`/api/w/${workspaceId}/tags/${t.id}`, { method: 'PATCH', body: { name: next.name, color: next.color } });
    } catch (err) {
      toast.error(errorMessage(err));
      setTags((cur) => cur.map((x) => (x.id === t.id ? t : x)));
    }
  };

  return (
    <SettingsSection title="Tags" description="Label posts by campaign or theme, then filter the calendar and lists by tag.">
      {canManage && (
        <form
          className="mb-4 flex flex-wrap items-center gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              const { tag } = await api<{ tag: Omit<Tag, 'postCount'> }>(`/api/w/${workspaceId}/tags`, { body: { name, color } });
              setTags((cur) => [...cur, { ...tag, postCount: 0 }].sort((a, b) => a.name.localeCompare(b.name)));
              setName('');
            } catch (err) {
              toast.error(errorMessage(err));
            }
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New tag name" maxLength={40} className="max-w-xs" aria-label="Tag name" />
          <div className="flex gap-1" role="radiogroup" aria-label="Colour">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={color === c}
                aria-label={c}
                onClick={() => setColor(c)}
                className={`size-6 rounded-full ring-offset-2 ${color === c ? 'ring-2 ring-fg' : ''}`}
                style={{ background: c }}
              />
            ))}
          </div>
          <Button type="submit" variant="primary" disabled={!name.trim()}>
            <Plus /> Add tag
          </Button>
        </form>
      )}
      {tags.length === 0 ? (
        <EmptyState title="No tags yet" />
      ) : (
        <ul className="-my-2 divide-y divide-line">
          {tags.map((t) => (
            <li key={t.id} className="flex items-center gap-3 py-2">
              <input
                type="color"
                value={t.color}
                disabled={!canManage}
                onChange={(e) => save(t, { color: e.target.value })}
                className="size-6 cursor-pointer rounded border-0 bg-transparent p-0"
                aria-label={`Colour for ${t.name}`}
              />
              {canManage ? (
                <Input defaultValue={t.name} onBlur={(e) => e.target.value.trim() && e.target.value !== t.name && save(t, { name: e.target.value.trim() })} className="h-8 max-w-xs" aria-label="Tag name" />
              ) : (
                <span className="text-[14px]">{t.name}</span>
              )}
              <span className="ml-auto text-xs text-muted">
                {t.postCount} post{t.postCount === 1 ? '' : 's'}
              </span>
              {canManage && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${t.name}`}
                  onClick={async () => {
                    if (!(await confirm({ title: `Delete "${t.name}"?`, description: 'The tag is removed from all posts.', confirmLabel: 'Delete', destructive: true }))) return;
                    try {
                      await api(`/api/w/${workspaceId}/tags/${t.id}`, { method: 'DELETE' });
                      setTags((cur) => cur.filter((x) => x.id !== t.id));
                    } catch (err) {
                      toast.error(errorMessage(err));
                    }
                  }}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}
