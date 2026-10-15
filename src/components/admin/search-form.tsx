import Link from 'next/link';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function SearchForm({ q, placeholder }: { q?: string; placeholder: string }) {
  return (
    <form className="flex gap-2">
      <Input name="q" defaultValue={q} placeholder={placeholder} className="w-64" aria-label="Search" />
      <Button type="submit" variant="outline">
        Search
      </Button>
    </form>
  );
}

export function Pager({ page, total, pageSize, base, q }: { page: number; total: number; pageSize: number; base: string; q?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const href = (p: number) => `${base}?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ''}`;
  return (
    <div className="mt-3 flex items-center justify-end gap-2 text-[13px] text-muted">
      Page {page} of {pages}
      {page > 1 && <Link href={href(page - 1)} className="rounded-md border border-line px-2 py-1 hover:bg-subtle">Previous</Link>}
      {page < pages && <Link href={href(page + 1)} className="rounded-md border border-line px-2 py-1 hover:bg-subtle">Next</Link>}
    </div>
  );
}
