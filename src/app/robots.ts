import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const base = process.env.APP_URL?.replace(/\/$/, '');
  return {
    rules: { userAgent: '*', allow: ['/', '/features', '/pricing', '/legal/'], disallow: ['/w/', '/admin', '/api/', '/app', '/onboarding'] },
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
