import Link from 'next/link';
import { Logo } from '@/components/brand';
import { Button } from '@/components/ui/button';

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-canvas px-4 text-center">
      <Logo />
      <h1 className="max-w-xl text-3xl font-semibold">Plan, schedule and publish your social media in one calm place.</h1>
      <div className="flex gap-2">
        <Button asChild variant="primary" size="lg">
          <Link href="/signup">Get started free</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    </div>
  );
}
