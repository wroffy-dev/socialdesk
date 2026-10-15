'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';
import { api, errorMessage } from '@/lib/api-client';

const schema = z
  .object({
    password: z
      .string()
      .min(10, 'Use at least 10 characters')
      .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), 'Include at least one letter and one number'),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: "Passwords don't match" });

export function ResetPasswordForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { password: '', confirm: '' } });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api('/api/account/reset-password', { body: { token, password: values.password } });
      setDone(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  if (done) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="success" title="Password updated">
          You&apos;ve been signed out everywhere. Sign in with your new password.
        </Alert>
        <Button asChild variant="primary" size="lg">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error && <Alert variant="danger">{error}</Alert>}
      <Field label="New password" htmlFor="password" error={errors.password?.message}>
        <Input id="password" type="password" autoComplete="new-password" autoFocus {...form.register('password')} />
      </Field>
      <Field label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}>
        <Input id="confirm" type="password" autoComplete="new-password" {...form.register('confirm')} />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={isSubmitting}>
        Set new password
      </Button>
    </form>
  );
}
