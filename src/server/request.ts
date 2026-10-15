/** Best-effort client IP from proxy headers (Coolify/Traefik sets X-Forwarded-For). */
export function clientIp(req: Request | { headers: Headers } | undefined): string {
  const h = req?.headers;
  if (!h) return 'unknown';
  const fwd = h.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return h.get('x-real-ip') ?? 'unknown';
}
