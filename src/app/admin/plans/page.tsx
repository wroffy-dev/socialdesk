import { listAllPlans } from '@/server/services/admin';
import { AdminTitle } from '@/components/admin/ui';
import { PlanEditor } from '@/components/admin/plan-editor';

export const metadata = { title: 'Plans & limits' };

export default async function AdminPlans() {
  const plans = await listAllPlans();
  return (
    <>
      <AdminTitle title="Plans & limits" description="Prices are in the smallest currency unit (paise). Limits apply immediately to every workspace on the plan. Leave a limit empty for unlimited." />
      <div className="flex flex-col gap-4">
        {plans.map((p) => (
          <PlanEditor
            key={p.id}
            plan={{
              id: p.id,
              key: p.key,
              name: p.name,
              description: p.description,
              priceAmount: p.priceAmount,
              currency: p.currency,
              razorpayPlanId: p.razorpayPlanId,
              isActive: p.isActive,
              isPublic: p.isPublic,
              sortOrder: p.sortOrder,
              subscriptions: p._count.subscriptions,
              entitlements: p.entitlements.map((e) => ({ key: e.key, enabled: e.enabled, limit: e.limit })),
            }}
          />
        ))}
      </div>
    </>
  );
}
