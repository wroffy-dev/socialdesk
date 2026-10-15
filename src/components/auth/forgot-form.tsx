'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';
import { api, errorMessage } from '@/lib/api-client';

const schema = z.object({ email: z.string().trim().email('Enter a valid email') });

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { email: '' } });

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api('/api/account/forgot-password', { body: values });
      setSent(true);
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  if (sent) {
    return (
      <Alert variant="success" title="Check your inbox">
        If an account exists for that email, we&apos;ve sent a link to reset the password. The link expires in 1 hour.
      </Alert>
    );
  }
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error && <Alert variant="danger">{error}</Alert>}
      <Field label="Email" htmlFor="email" error={form.formState.errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" autoFocus {...form.register('email')} />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={form.formState.isSubmitting}>
        Send reset link
      </Button>
    </form>
  );
}
