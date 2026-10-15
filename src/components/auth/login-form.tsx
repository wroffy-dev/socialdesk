'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';

const schema = z.object({
  email: z.string().trim().email('Enter a valid email'),
  password: z.string().min(1, 'Enter your password'),
});

const MESSAGES: Record<string, string> = {
  rate_limited: 'Too many sign-in attempts. Wait a few minutes and try again.',
  locked: 'This account is temporarily locked after repeated failed attempts. Try again in 15 minutes or reset your password.',
  suspended: 'This account has been suspended. Contact support for help.',
};

/** Only same-site relative paths are allowed as post-login destinations. */
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/app';
}

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: '', password: '' } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    const res = await signIn('credentials', { ...values, redirect: false });
    if (!res || res.error) {
      setError(MESSAGES[res?.code ?? ''] ?? 'That email and password combination is incorrect.');
      return;
    }
    router.replace(safeNext(next));
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error && <Alert variant="danger">{error}</Alert>}
      <Field label="Email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" autoFocus aria-invalid={!!errors.email} {...form.register('email')} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="current-password" aria-invalid={!!errors.password} {...form.register('password')} />
      </Field>
      <div className="-mt-1 text-right">
        <Link href="/forgot-password" className="text-[13px] text-muted hover:text-fg">
          Forgot password?
        </Link>
      </div>
      <Button type="submit" variant="primary" size="lg" loading={isSubmitting}>
        Sign in
      </Button>
    </form>
  );
}
