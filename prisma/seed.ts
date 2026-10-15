/**
 * Idempotent seed: plan catalogue, entitlements and editable legal pages.
 * Existing plan prices/limits are NOT overwritten, so edits made in the admin panel survive re-seeding.
 */
import { PrismaClient } from '@prisma/client';
import { DEFAULT_PLANS, toEntitlementRow, type EntitlementKey } from '../src/server/billing/catalog';

const db = new PrismaClient();

const LEGAL = [
  {
    key: 'terms',
    title: 'Terms of Service',
    body: `# Terms of Service\n\n_Last updated: replace with your date._\n\nThese terms govern your use of SocialDesk. Replace this placeholder text with your own terms from the Super Admin → Content page before launch.\n\n## Your account\n\nYou are responsible for activity in your workspaces and for keeping your credentials secure.\n\n## Connected platforms\n\nWhen you connect a social media account you authorise SocialDesk to act on it within the permissions you grant. Each platform's own terms continue to apply.\n\n## Contact\n\nAdd your support contact details here.`,
  },
  {
    key: 'privacy',
    title: 'Privacy Policy',
    body: `# Privacy Policy\n\n_Last updated: replace with your date._\n\nReplace this placeholder with your privacy policy from the Super Admin → Content page before launch.\n\n## What we store\n\n- Account details: name, email address and a hashed password.\n- Workspace content: posts, media and schedules you create.\n- Connected account tokens, encrypted at rest, used only to perform actions you request.\n\n## Data deletion\n\nDisconnecting a channel deletes its stored token. Deleting a workspace deletes its content.\n\n## Contact\n\nAdd your data-protection contact details here.`,
  },
];

async function main() {
  for (const def of DEFAULT_PLANS) {
    const plan = await db.plan.upsert({
      where: { key: def.key },
      create: { key: def.key, name: def.name, description: def.description, priceAmount: def.priceAmount, sortOrder: def.sortOrder },
      update: {},
    });
    for (const [key, value] of Object.entries(def.entitlements) as [EntitlementKey, number | null | boolean][]) {
      const row = toEntitlementRow(key, value);
      await db.entitlement.upsert({
        where: { planId_key: { planId: plan.id, key } },
        create: { planId: plan.id, ...row },
        update: {},
      });
    }
  }
  for (const page of LEGAL) {
    await db.siteContent.upsert({ where: { key: page.key }, create: page, update: {} });
  }
  console.log(`Seeded ${DEFAULT_PLANS.length} plans and ${LEGAL.length} content pages.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
