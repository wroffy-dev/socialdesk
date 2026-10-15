import { Logo } from '@/components/brand';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center bg-canvas px-4 py-10">
      <Logo className="mb-8" />
      <main className="w-full max-w-[400px] rounded-xl border border-line bg-surface p-6 shadow-card sm:p-7">{children}</main>
    </div>
  );
}
