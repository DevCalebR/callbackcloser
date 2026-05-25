const PROTECTED_ROUTE_PREFIXES = [
  '/app',
  '/admin',
  '/api/stripe/checkout',
  '/api/stripe/portal',
  '/api/twilio/provision-number',
] as const;

const PROTECTED_MUTATION_ROUTE_PREFIXES = [
  '/api/stripe/checkout',
  '/api/stripe/portal',
  '/api/twilio/provision-number',
] as const;

const CLERK_CONTEXT_PUBLIC_ROUTE_PREFIXES = [
  '/sign-in',
  '/sign-up',
  '/start-free-pilot',
  '/buy',
] as const;

function matchesRoutePrefix(pathname: string, prefix: string) {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function matchesAnyPrefix(pathname: string, prefixes: readonly string[]) {
  return prefixes.some((prefix) => matchesRoutePrefix(pathname, prefix));
}

export function routeNeedsProtection(pathname: string) {
  return matchesAnyPrefix(pathname, PROTECTED_ROUTE_PREFIXES);
}

export function routeNeedsProtectedMutationRateLimit(pathname: string) {
  return matchesAnyPrefix(pathname, PROTECTED_MUTATION_ROUTE_PREFIXES);
}

export function routeNeedsClerkContext(pathname: string) {
  return routeNeedsProtection(pathname) || matchesAnyPrefix(pathname, CLERK_CONTEXT_PUBLIC_ROUTE_PREFIXES);
}

export function routeCanRenderWithoutClerk(pathname: string) {
  return !routeNeedsClerkContext(pathname);
}
