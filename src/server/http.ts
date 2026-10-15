import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { ZodError, type ZodType, type ZodTypeDef } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError, badRequest, forbidden, validationError } from './errors';
import { env } from './env';

type Handler<P> = (req: NextRequest, ctx: { params: P }) => Promise<Response | unknown>;

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * CSRF defence for cookie-authenticated JSON endpoints: mutating requests must come from
 * our own origin. (Session cookies are also SameSite=Lax.)
 */
function assertSameOrigin(req: NextRequest) {
  if (!MUTATING.has(req.method)) return;
  const origin = req.headers.get('origin');
  const allowed = new URL(env().APP_URL).origin;
  const self = req.nextUrl.origin;
  if (origin && origin !== allowed && origin !== self) throw forbidden('Cross-origin request blocked.');
  if (!origin && req.headers.get('sec-fetch-site') === 'cross-site') throw forbidden('Cross-origin request blocked.');
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof AppError) {
    const headers: Record<string, string> = {};
    if (err.status === 429 && err.details && typeof err.details === 'object' && 'retryAfterSec' in err.details) {
      headers['Retry-After'] = String((err.details as { retryAfterSec: number }).retryAfterSec);
    }
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status, headers });
  }
  if (err instanceof ZodError) return errorResponse(validationError(err.flatten()));
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    return errorResponse(new AppError(409, 'conflict', 'That already exists.'));
  }
  console.error('[api] unhandled error', err);
  return NextResponse.json({ error: { code: 'internal', message: 'Something went wrong. Please try again.' } }, { status: 500 });
}

/** Wraps a route handler: origin check, JSON serialisation and consistent error shape. */
export function route<P = Record<string, string>>(handler: Handler<P>) {
  return async (req: NextRequest, ctx: { params: Promise<P> }) => {
    try {
      assertSameOrigin(req);
      const result = await handler(req, { params: await ctx.params });
      if (result instanceof Response) return result;
      if (result === undefined) return new NextResponse(null, { status: 204 });
      return NextResponse.json(result);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function parseJson<T>(req: Request, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest('Request body must be valid JSON.');
  }
  return schema.parse(body);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T, ZodTypeDef, unknown>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams));
}
