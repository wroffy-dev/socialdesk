'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Quote, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Switch } from '@/components/ui/checkbox';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useConfirm } from '@/components/ui/confirm';
import { api, errorMessage } from '@/lib/api-client';

export interface TestimonialRow {
  id: string;
  quote: string;
  authorName: string;
  authorRole: string | null;
  company: string | null;
  avatarUrl: string | null;
  isPublished: boolean;
  sortOrder: number;
}

export interface LogoRow {
  id: string;
  name: string;
  imageUrl: string | null;
  websiteUrl: string | null;
  isPublished: boolean;
  sortOrder: number;
}

const NEW = 'new';

function useSave() {
  const router = useRouter();
  const confirm = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(done);
      router.refresh();
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally {
      setBusy(null);
    }
  };
  return { busy, run, confirm };
}

function Published({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-[13px]">
      Published <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

function TestimonialCard({ row, onDone }: { row: TestimonialRow; onDone?: () => void }) {
  const [t, setT] = useState(row);
  const { busy, run, confirm } = useSave();
  const isNew = row.id === NEW;
  const body = { quote: t.quote, authorName: t.authorName, authorRole: t.authorRole, company: t.company, avatarUrl: t.avatarUrl ?? '', isPublished: t.isPublished, sortOrder: t.sortOrder };
  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center gap-2">
        <Quote className="size-4 text-muted" />
        <p className="font-medium">{isNew ? 'New testimonial' : row.authorName}</p>
        {!isNew && <Badge variant={row.isPublished ? 'success' : 'neutral'}>{row.isPublished ? 'live' : 'draft'}</Badge>}
        <div className="ml-auto">
          <Published checked={t.isPublished} onChange={(v) => setT({ ...t, isPublished: v })} />
        </div>
      </div>
      <Textarea value={t.quote} onChange={(e) => setT({ ...t, quote: e.target.value })} placeholder="What the customer said, in their words" aria-label="Quote" className="min-h-[90px]" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input value={t.authorName} onChange={(e) => setT({ ...t, authorName: e.target.value })} placeholder="Name" aria-label="Name" />
        <Input value={t.authorRole ?? ''} onChange={(e) => setT({ ...t, authorRole: e.target.value || null })} placeholder="Role (e.g. Founder)" aria-label="Role" />
        <Input value={t.company ?? ''} onChange={(e) => setT({ ...t, company: e.target.value || null })} placeholder="Company" aria-label="Company" />
        <Input value={t.avatarUrl ?? ''} onChange={(e) => setT({ ...t, avatarUrl: e.target.value || null })} placeholder="Photo URL (https://…)" aria-label="Photo URL" />
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-[13px] text-muted">
          Order
          <Input type="number" min={0} value={t.sortOrder} onChange={(e) => setT({ ...t, sortOrder: Number(e.target.value) })} className="h-8 w-20" />
        </label>
        {!isNew && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-danger"
            loading={busy === 'delete'}
            onClick={async () => {
              if (await confirm({ title: `Delete ${row.authorName}’s testimonial?`, confirmLabel: 'Delete', destructive: true })) {
                await run('delete', () => api(`/api/admin/testimonials/${row.id}`, { method: 'DELETE' }), 'Deleted');
              }
            }}
          >
            <Trash2 /> Delete
          </Button>
        )}
        <Button
          variant="primary"
          size="sm"
          className={isNew ? 'ml-auto' : ''}
          loading={busy === 'save'}
          onClick={async () => {
            const ok = await run('save', () => api(isNew ? '/api/admin/testimonials' : `/api/admin/testimonials/${row.id}`, { method: isNew ? 'POST' : 'PUT', body }), 'Saved');
            if (ok) onDone?.();
          }}
        >
          {isNew ? 'Add testimonial' : 'Save'}
        </Button>
        {isNew && (
          <Button variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </Card>
  );
}

function LogoCard({ row, onDone }: { row: LogoRow; onDone?: () => void }) {
  const [l, setL] = useState(row);
  const { busy, run, confirm } = useSave();
  const isNew = row.id === NEW;
  const body = { name: l.name, imageUrl: l.imageUrl ?? '', websiteUrl: l.websiteUrl ?? '', isPublished: l.isPublished, sortOrder: l.sortOrder };
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-24 items-center justify-center overflow-hidden rounded-md border border-line bg-subtle text-[12px] font-semibold text-muted">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {l.imageUrl ? <img src={l.imageUrl} alt="" className="max-h-8 max-w-[88px] object-contain" /> : l.name || 'Logo'}
        </span>
        <p className="font-medium">{isNew ? 'New logo' : row.name}</p>
        {!isNew && <Badge variant={row.isPublished ? 'success' : 'neutral'}>{row.isPublished ? 'live' : 'draft'}</Badge>}
        <div className="ml-auto">
          <Published checked={l.isPublished} onChange={(v) => setL({ ...l, isPublished: v })} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Input value={l.name} onChange={(e) => setL({ ...l, name: e.target.value })} placeholder="Company name" aria-label="Company name" />
        <Input value={l.imageUrl ?? ''} onChange={(e) => setL({ ...l, imageUrl: e.target.value || null })} placeholder="Logo image URL (https://…, optional)" aria-label="Logo URL" />
        <Input value={l.websiteUrl ?? ''} onChange={(e) => setL({ ...l, websiteUrl: e.target.value || null })} placeholder="Website (optional)" aria-label="Website" />
      </div>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-[13px] text-muted">
          Order
          <Input type="number" min={0} value={l.sortOrder} onChange={(e) => setL({ ...l, sortOrder: Number(e.target.value) })} className="h-8 w-20" />
        </label>
        {!isNew && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto text-danger"
            loading={busy === 'delete'}
            onClick={async () => {
              if (await confirm({ title: `Delete the ${row.name} logo?`, confirmLabel: 'Delete', destructive: true })) {
                await run('delete', () => api(`/api/admin/logos/${row.id}`, { method: 'DELETE' }), 'Deleted');
              }
            }}
          >
            <Trash2 /> Delete
          </Button>
        )}
        <Button
          variant="primary"
          size="sm"
          className={isNew ? 'ml-auto' : ''}
          loading={busy === 'save'}
          onClick={async () => {
            const ok = await run('save', () => api(isNew ? '/api/admin/logos' : `/api/admin/logos/${row.id}`, { method: isNew ? 'POST' : 'PUT', body }), 'Saved');
            if (ok) onDone?.();
          }}
        >
          {isNew ? 'Add logo' : 'Save'}
        </Button>
        {isNew && (
          <Button variant="ghost" size="sm" onClick={onDone}>
            Cancel
          </Button>
        )}
      </div>
    </Card>
  );
}

export function SocialProofEditor({ testimonials, logos }: { testimonials: TestimonialRow[]; logos: LogoRow[] }) {
  const [addingT, setAddingT] = useState(false);
  const [addingL, setAddingL] = useState(false);
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="section-title">Testimonials</h2>
          <span className="text-[13px] text-muted">{testimonials.filter((t) => t.isPublished).length} live</span>
          <Button size="sm" className="ml-auto" onClick={() => setAddingT(true)} disabled={addingT}>
            <Plus /> Add testimonial
          </Button>
        </div>
        {addingT && (
          <TestimonialCard
            row={{ id: NEW, quote: '', authorName: '', authorRole: null, company: null, avatarUrl: null, isPublished: false, sortOrder: testimonials.length }}
            onDone={() => setAddingT(false)}
          />
        )}
        {testimonials.map((t) => (
          <TestimonialCard key={`${t.id}-${t.sortOrder}-${t.isPublished}`} row={t} />
        ))}
        {!testimonials.length && !addingT && <p className="rounded-lg border border-dashed border-line p-6 text-center text-[13px] text-muted">No testimonials yet. Add quotes from real customers (with their permission).</p>}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <h2 className="section-title">Customer logos</h2>
          <span className="text-[13px] text-muted">{logos.filter((l) => l.isPublished).length} live</span>
          <Button size="sm" className="ml-auto" onClick={() => setAddingL(true)} disabled={addingL}>
            <Plus /> Add logo
          </Button>
        </div>
        {addingL && <LogoCard row={{ id: NEW, name: '', imageUrl: null, websiteUrl: null, isPublished: false, sortOrder: logos.length }} onDone={() => setAddingL(false)} />}
        {logos.map((l) => (
          <LogoCard key={`${l.id}-${l.sortOrder}-${l.isPublished}`} row={l} />
        ))}
        {!logos.length && !addingL && <p className="rounded-lg border border-dashed border-line p-6 text-center text-[13px] text-muted">No logos yet. Add brands that use SocialDesk (with their permission).</p>}
      </section>
    </div>
  );
}
