import { getConfiguredAppBaseUrl } from '@/lib/env.server';

export function getAppBaseUrl() {
  return getConfiguredAppBaseUrl() || 'http://localhost:3000';
}

export function absoluteUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${getAppBaseUrl()}${normalized}`;
}
