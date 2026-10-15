'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/ui/field';
import { Alert } from '@/components/ui/feedback';
import { api, errorMessage } from '@/lib/api-client';
import { TimezoneSelect } from './timezone-select';

const schema = z.object({
  name: z.string().trim().min(2, 'Use at least 2 characters').max(60),
  timezone: z.string().min(1),
});

export function CreateWorkspaceForm({ onCreated }: { onCreated?: () => void }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof schema>>({ resolver: zodResolver(schema), defaultValues: { name: '', timezone: 'UTC' } });
  const { errors, isSubmitting } = form.formState;

  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) form.setValue('timezone', tz);
  }, [form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const { workspace } = await api<{ workspace: { slug: string } }>('/api/workspaces', { body: values });
      onCreated?.();
      router.push(`/w/${workspace.slug}/home`);
      router.refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {error && <Alert variant="danger">{error}</Alert>}
      <Field label="Workspace name" htmlFor="ws-name" error={errors.name?.message} hint="Usually your brand or client name.">
        <Input id="ws-name" autoFocus placeholder="e.g. Digi Emporia" {...form.register('name')} />
      </Field>
      <Field label="Timezone" htmlFor="ws-tz" hint="Used for the calendar and scheduling.">
        <TimezoneSelect id="ws-tz" {...form.register('timezone')} />
      </Field>
      <Button type="submit" variant="primary" size="lg" loading={isSubmitting}>
        Create workspace
      </Button>
    </form>
  );
}
