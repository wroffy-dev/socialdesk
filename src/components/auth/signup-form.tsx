'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';
import { api, ApiError, errorMessage } from '@/lib/api-client';

const schema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80),
  email: z.string().trim().email('Enter a valid email'),
  password: z
    .string()
    .min(10, 'Use at least 10 characters')
    .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), 'Include at least one letter and one number'),
});

export function SignupForm({ next, defaultEmail }: { next: string | null; defaultEmail?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: defaultEmail ?? '', password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await api('/api/account/signup', { body: values });
    } catch (err) {
      if (err instanceof ApiError) {
        for (const [field, msgs] of Object.entries(err.fieldErrors)) {
          if (msgs?.[0]) form.setError(field as keyof typeof values, { message: msgs[0] });
        }
      }
      setError(errorMessage(err));
      return;
    }
    const res = await signIn('credentials', { email: values.email, password: values.password, redirect: false });
    if (res?.error) {
      router.push('/login');
      return;
    }
    const dest = next && next.startsWith('/') && !next.startsWith('//') ? next : '/onboarding';
    router.replace(dest);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error && <Alert variant="danger">{error}</Alert>}
      <Field label="Your name" htmlFor="name" error={errors.name?.message}>
        <Input id="name" autoComplete="name" autoFocus aria-invalid={!!errors.name} {...form.register('name')} />
      </Field>
      <Field label="Work email" htmlFor="email" error={errors.email?.message}>
        <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...form.register('email')} />
      </Field>
      <Field label="Password" htmlFor="password" error={errors.password?.message} hint="At least 10 characters, with a letter and a number.">
        <Input id="password" type="password" autoComplete="new-password" aria-invalid={!!errors.password} {...form.register('password')} />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={isSubmitting}>
        Create account
      </Button>
    </form>
  );
}
