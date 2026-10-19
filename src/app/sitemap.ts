import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const base = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  return ['', '/features', '/pricing', '/legal/terms', '/legal/privacy'].map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path.startsWith('/legal') ? 'yearly' : 'monthly',
    priority: path === '' ? 1 : path.startsWith('/legal') ? 0.3 : 0.8,
  }));
}
