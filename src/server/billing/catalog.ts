/**
 * Default plan catalogue, written to the database by the seed script. After seeding, the
 * database is the source of truth: prices and limits are edited from the super-admin panel.
 */
export const ENTITLEMENT_KEYS = {
  socialAccounts: 'social_accounts',
  teamMembers: 'team_members',
  workspaces: 'workspaces',
  postsPerMonth: 'posts_per_month',
  analyticsHistoryDays: 'analytics_history_days',
  analyticsExport: 'analytics_export',
} as const;

export type EntitlementKey = (typeof ENTITLEMENT_KEYS)[keyof typeof ENTITLEMENT_KEYS];

export const ENTITLEMENT_LABEL: Record<EntitlementKey, string> = {
  social_accounts: 'Connected channels',
  team_members: 'Team members',
  workspaces: 'Workspaces you own',
  posts_per_month: 'Posts per month',
  analytics_history_days: 'Analytics history (days)',
  analytics_export: 'CSV export',
};

export interface PlanDefinition {
  key: string;
  name: string;
  description: string;
  priceAmount: number;
  sortOrder: number;
  entitlements: Record<EntitlementKey, number | null | boolean>;
}

export const DEFAULT_PLANS: PlanDefinition[] = [
  {
    key: 'free',
    name: 'Free',
    description: 'For individuals getting started.',
    priceAmount: 0,
    sortOrder: 0,
    entitlements: {
      social_accounts: 3,
      team_members: 1,
      workspaces: 1,
      posts_per_month: 30,
      analytics_history_days: 30,
      analytics_export: false,
    },
  },
  {
    key: 'starter',
    name: 'Starter',
    description: 'For small businesses posting every week.',
    priceAmount: 49900,
    sortOrder: 1,
    entitlements: {
      social_accounts: 6,
      team_members: 3,
      workspaces: 2,
      posts_per_month: 200,
      analytics_history_days: 90,
      analytics_export: true,
    },
  },
  {
    key: 'pro',
    name: 'Pro',
    description: 'For growing teams with several brands.',
    priceAmount: 149900,
    sortOrder: 2,
    entitlements: {
      social_accounts: 15,
      team_members: 10,
      workspaces: 5,
      posts_per_month: 1000,
      analytics_history_days: 365,
      analytics_export: true,
    },
  },
  {
    key: 'agency',
    name: 'Agency',
    description: 'For agencies managing many clients.',
    priceAmount: 399900,
    sortOrder: 3,
    entitlements: {
      social_accounts: 50,
      team_members: 30,
      workspaces: 25,
      posts_per_month: null,
      analytics_history_days: 730,
      analytics_export: true,
    },
  },
];

export const DEFAULT_PLAN_KEY = 'free';

/** Boolean entitlements are stored as enabled=true/false with limit=null. */
export function toEntitlementRow(key: EntitlementKey, value: number | null | boolean) {
  if (typeof value === 'boolean') return { key, enabled: value, limit: null };
  return { key, enabled: true, limit: value };
}
