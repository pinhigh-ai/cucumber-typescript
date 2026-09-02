/**
 * PROJECT ADAPTER — logical downstream service names used in feature files,
 * mapped to the base URLs the application actually calls.
 *
 * Feature files reference the logical name ("payments"), never the host, so the
 * same feature runs against any environment. These must match the URLs the app
 * is configured with at runtime, or Nock will not intercept the call.
 */
const REGISTRY: Record<string, string | undefined> = {
  payments: process.env.PAYMENTS_BASE_URL,
  // 'inventory': process.env.INVENTORY_BASE_URL,
};

export function baseUrlFor(service: string): string {
  const url = REGISTRY[service];
  if (!url) {
    const known = Object.keys(REGISTRY).join(', ') || '(none registered)';
    throw new Error(
      `Unknown downstream service "${service}". Register it in tests/support/services.ts. Known: ${known}`,
    );
  }
  return url.replace(/\/+$/, '');
}

export function knownServices(): string[] {
  return Object.keys(REGISTRY);
}
