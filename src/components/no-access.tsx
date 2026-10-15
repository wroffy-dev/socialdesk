import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NoAccess({ backHref, message }: { backHref: string; message?: string }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-20 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-subtle text-muted">
        <Lock className="size-5" />
      </span>
      <h1 className="text-lg font-semibold">You don&apos;t have access to this page</h1>
      <p className="max-w-sm text-[13px] text-muted">{message ?? 'Your role in this workspace does not include this. Ask a workspace admin if you need access.'}</p>
      <Button asChild variant="outline">
        <Link href={backHref}>Go back</Link>
      </Button>
    </div>
  );
}
