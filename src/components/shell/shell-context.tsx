'use client';

import { createContext, useContext } from 'react';
import type { ShellData } from '@/server/services/shell';
import type { Permission } from '@/lib/permissions';

const ShellContext = createContext<ShellData | null>(null);

export const ShellProvider = ShellContext.Provider;

export function useShell(): ShellData {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error('useShell must be used inside a workspace page');
  return ctx;
}

/** UI-only permission check. The server re-checks every action. */
export function useCan() {
  const { permissions } = useShell();
  return (p: Permission) => permissions.includes(p);
}

export function useWorkspacePaths() {
  const { workspace } = useShell();
  const base = `/w/${workspace.slug}`;
  return { base, api: `/api/w/${workspace.id}` };
}
