'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Search, Upload } from 'lucide-react';
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState, Spinner } from '@/components/ui/feedback';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { MediaDto } from '@/server/services/media';
import { MediaThumb } from './media-thumb';
import { useUpload } from './use-upload';
import { UploadProgress } from './upload-progress';

export const ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime';

/** Choose media for a post: upload new files or pick from the library. */
export function MediaPicker({
  open,
  onOpenChange,
  workspaceId,
  max,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  workspaceId: string;
  max: number;
  onAdd: (media: MediaDto[]) => void;
}) {
  const [tab, setTab] = useState('upload');
  const [library, setLibrary] = useState<MediaDto[] | null>(null);
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const { items, upload, dismiss } = useUpload(workspaceId);
  const [dragging, setDragging] = useState(false);

  const load = useCallback(async () => {
    setLibrary(null);
    const res = await api<{ items: MediaDto[] }>(`/api/w/${workspaceId}/media?take=60${q ? `&q=${encodeURIComponent(q)}` : ''}`);
    setLibrary(res.items);
  }, [workspaceId, q]);

  useEffect(() => {
    if (open && tab === 'library') void load();
  }, [open, tab, load]);
  useEffect(() => {
    if (!open) setPicked([]);
  }, [open]);

  const handleFiles = async (files: FileList | File[] | null) => {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, max);
    const uploaded = await upload(list);
    if (uploaded.length) {
      onAdd(uploaded);
      if (uploaded.length === list.length) onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add media</DialogTitle>
        </DialogHeader>
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-col">
          <TabsList className="px-5">
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="library">Media library</TabsTrigger>
          </TabsList>
          <TabsContent value="upload">
            <DialogBody className="pb-5">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragging(false);
                  void handleFiles(e.dataTransfer.files);
                }}
                className={cn(
                  'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line-strong px-6 py-10 text-center transition-colors',
                  dragging && 'border-accent-ink bg-accent-soft',
                )}
              >
                <Upload className="size-6 text-muted" />
                <p className="font-medium">Drop files here</p>
                <p className="text-xs text-muted">JPEG, PNG, WebP, GIF images or MP4/MOV videos. Up to {max} files.</p>
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <ImagePlus /> Choose files
                </Button>
                <input ref={fileRef} type="file" accept={ACCEPT} multiple hidden onChange={(e) => void handleFiles(e.target.files)} />
              </div>
              <UploadProgress items={items} onDismiss={dismiss} />
            </DialogBody>
          </TabsContent>
          <TabsContent value="library">
            <DialogBody>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by file name" className="pl-8" onKeyDown={(e) => e.key === 'Enter' && load()} />
              </div>
              {!library ? (
                <div className="flex justify-center py-10">
                  <Spinner />
                </div>
              ) : library.length === 0 ? (
                <EmptyState title="Your library is empty" description="Uploaded files appear here so you can reuse them." />
              ) : (
                <div className="grid max-h-[50vh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-4">
                  {library.map((m) => {
                    const idx = picked.indexOf(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          setPicked((cur) => (cur.includes(m.id) ? cur.filter((x) => x !== m.id) : cur.length < max ? [...cur, m.id] : cur))
                        }
                        className={cn('relative rounded-md ring-2 ring-transparent', idx >= 0 && 'ring-accent-ink')}
                        aria-pressed={idx >= 0}
                        title={m.originalName}
                      >
                        <MediaThumb media={m} className="aspect-square w-full" />
                        {idx >= 0 && (
                          <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-accent-ink text-xs font-semibold text-white">
                            {idx + 1}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </DialogBody>
            <DialogFooter>
              <span className="mr-auto text-xs text-muted">{picked.length ? `${picked.length} selected` : `Select up to ${max}`}</span>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                disabled={!picked.length}
                onClick={() => {
                  onAdd(picked.map((id) => library!.find((m) => m.id === id)!).filter(Boolean));
                  onOpenChange(false);
                }}
              >
                <Check /> Add
              </Button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
