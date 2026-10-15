'use client';

import { useCallback, useState } from 'react';
import type { MediaDto } from '@/server/services/media';

export interface UploadItem {
  key: string;
  name: string;
  progress: number;
  error?: string;
}

function uploadOne(url: string, file: File, onProgress: (p: number) => void): Promise<MediaDto> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { media?: MediaDto; error?: { message?: string } } | null = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body?.media) resolve(body.media);
      else reject(new Error(body?.error?.message ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    const form = new FormData();
    form.append('file', file);
    xhr.send(form);
  });
}

/** Uploads files one by one with per-file progress. */
export function useUpload(workspaceId: string) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const upload = useCallback(
    async (files: File[]): Promise<MediaDto[]> => {
      const done: MediaDto[] = [];
      const queued = files.map((f, i) => ({ key: `${Date.now()}-${i}-${f.name}`, name: f.name, progress: 0 }));
      setItems((cur) => [...cur, ...queued]);
      for (const [i, file] of files.entries()) {
        const key = queued[i]!.key;
        try {
          const m = await uploadOne(`/api/w/${workspaceId}/media`, file, (p) =>
            setItems((cur) => cur.map((it) => (it.key === key ? { ...it, progress: p } : it))),
          );
          done.push(m);
          setItems((cur) => cur.filter((it) => it.key !== key));
        } catch (err) {
          setItems((cur) => cur.map((it) => (it.key === key ? { ...it, error: err instanceof Error ? err.message : 'Upload failed' } : it)));
        }
      }
      return done;
    },
    [workspaceId],
  );
  const dismiss = useCallback((key: string) => setItems((cur) => cur.filter((i) => i.key !== key)), []);
  return { items, upload, dismiss };
}
