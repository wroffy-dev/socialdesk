import { NextResponse } from 'next/server';
import { listPublicPlans } from '@/server/services/billing';

export async function GET() {
  return NextResponse.json({ plans: await listPublicPlans() });
}
