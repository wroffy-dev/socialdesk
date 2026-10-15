'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/checkbox';
import { api, errorMessage } from '@/lib/api-client';
import { SettingsSection } from './section';

type Prefs = { emailOnFailure: boolean; emailOnPublish: boolean; emailWeeklyDigest: boolean };

export function NotificationSettings({ workspaceId, initial, isManager }: { workspaceId: string; initial: Prefs; isManager: boolean }) {
  const [prefs, setPrefs] = useState(initial);
  const set = async (key: keyof Prefs, value: boolean) => {
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    try {
      await api(`/api/w/${workspaceId}/notifications`, { method: 'PUT', body: next });
      toast.success('Preferences saved');
    } catch (err) {
      setPrefs(prefs);
      toast.error(errorMessage(err));
    }
  };
  const rows: { key: keyof Prefs; title: string; body: string }[] = [
    {
      key: 'emailOnFailure',
      title: 'Publishing problems',
      body: isManager ? 'Email me when any post fails or needs to be checked.' : 'Email me when a post I created fails or needs to be checked.',
    },
    { key: 'emailOnPublish', title: 'Successful publishes', body: 'Email me each time a post goes live.' },
    { key: 'emailWeeklyDigest', title: 'Weekly summary', body: 'A short Monday email with last week’s results and the week ahead.' },
  ];
  return (
    <SettingsSection title="Email notifications" description="These settings apply to you in this workspace only.">
      <ul className="-my-2 divide-y divide-line">
        {rows.map((r) => (
          <li key={r.key} className="flex items-center gap-4 py-3">
            <div className="flex-1">
              <p className="text-[14px] font-medium">{r.title}</p>
              <p className="text-[13px] text-muted">{r.body}</p>
            </div>
            <Switch checked={prefs[r.key]} onCheckedChange={(v) => set(r.key, v)} aria-label={r.title} />
          </li>
        ))}
      </ul>
    </SettingsSection>
  );
}
