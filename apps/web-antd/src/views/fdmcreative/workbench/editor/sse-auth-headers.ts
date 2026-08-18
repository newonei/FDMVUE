export interface SseAuthenticationContext {
  accessToken?: null | string;
  tenantEnabled: boolean;
  tenantId?: null | number | string;
  visitTenantId?: null | number | string;
}

/**
 * Merges caller headers with current application authentication. It is deliberately transport
 * agnostic so execution, Agent and Drama streams all use exactly the same tenant semantics.
 */
export function mergeSseAuthenticationHeaders(
  configured: HeadersInit | undefined,
  context: SseAuthenticationContext,
): Headers {
  const headers = new Headers(configured);
  if (context.accessToken) {
    headers.set('Authorization', `Bearer ${context.accessToken}`);
  }
  if (context.tenantEnabled) {
    if (context.tenantId !== null && context.tenantId !== undefined) {
      headers.set('tenant-id', String(context.tenantId));
    }
    if (context.visitTenantId !== null && context.visitTenantId !== undefined) {
      headers.set('visit-tenant-id', String(context.visitTenantId));
    }
  }
  return headers;
}
