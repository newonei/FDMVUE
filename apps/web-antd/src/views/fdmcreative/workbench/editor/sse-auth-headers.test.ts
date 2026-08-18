import { describe, expect, it } from 'vitest';

import { mergeSseAuthenticationHeaders } from './sse-auth-headers';

describe('sSE authentication headers', () => {
  it('keeps caller headers and applies the current token and tenant context', () => {
    const headers = mergeSseAuthenticationHeaders(
      { 'X-Trace-Id': 'trace-1' },
      {
        accessToken: 'fresh-token',
        tenantEnabled: true,
        tenantId: '9',
        visitTenantId: '10',
      },
    );

    expect(headers.get('Authorization')).toBe('Bearer fresh-token');
    expect(headers.get('tenant-id')).toBe('9');
    expect(headers.get('visit-tenant-id')).toBe('10');
    expect(headers.get('X-Trace-Id')).toBe('trace-1');
  });

  it('does not manufacture tenant headers when multi-tenant mode is disabled', () => {
    const headers = mergeSseAuthenticationHeaders(undefined, {
      tenantEnabled: false,
      tenantId: 9,
      visitTenantId: 10,
    });

    expect(headers.get('tenant-id')).toBeNull();
    expect(headers.get('visit-tenant-id')).toBeNull();
  });
});
