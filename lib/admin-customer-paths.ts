export function resolveSafeAdminCustomerAppPath(value: string | null | undefined) {
  const trimmed = value?.trim() || '';

  if (!trimmed) return '/app';
  if (!trimmed.startsWith('/app')) return '/app';
  if (trimmed.startsWith('//')) return '/app';

  return trimmed;
}

export function buildAdminCustomerOpenHref(businessId: string, path = '/app') {
  const safePath = resolveSafeAdminCustomerAppPath(path);
  if (safePath === '/app') {
    return `/admin/${businessId}/open-customer`;
  }

  return `/admin/${businessId}/open-customer?path=${encodeURIComponent(safePath)}`;
}

export function buildAdminCustomerExitHref(businessId?: string | null) {
  if (!businessId) return '/admin/exit-customer-mode';
  return `/admin/exit-customer-mode?businessId=${encodeURIComponent(businessId)}`;
}
