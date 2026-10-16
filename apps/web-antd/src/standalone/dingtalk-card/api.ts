import type { CardDetail, PublicConfig } from './model';

interface Envelope<T> {
  code: number;
  data: T;
  msg?: string;
}

export class CardApiError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message);
  }
}

export function createCardApi(apiBase: string, fetcher: typeof fetch = fetch) {
  const base = apiBase.replace(/\/+$/, '');
  async function request<T>(
    path: string,
    tenantId?: number,
    accessToken?: string,
    body?: unknown,
  ) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (tenantId) headers['tenant-id'] = String(tenantId);
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const response = await fetcher(`${base}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new CardApiError(
          response.status,
          response.status === 401
            ? '登录已过期，请重新免登'
            : '请求失败，请稍后重试',
        );
      }
      const envelope = (await response.json()) as Envelope<T>;
      if (envelope.code !== 0)
        throw new CardApiError(envelope.code, envelope.msg || '读取通知失败');
      return envelope.data;
    } finally {
      clearTimeout(timeout);
    }
  }
  return {
    async resolveTenant(hostname: string) {
      const tenant = await request<null | { id: number }>(
        `/system/tenant/get-by-website?website=${encodeURIComponent(hostname)}`,
      );
      if (!tenant || !Number.isSafeInteger(tenant.id) || tenant.id <= 0) {
        throw new Error('当前域名未绑定企业，请联系管理员配置租户域名');
      }
      return tenant.id;
    },
    publicConfig: (tenantId: number) =>
      request<PublicConfig>('/fdmdingtalk/auth/public-config', tenantId),
    login: (tenantId: number, corpId: string, code: string) =>
      request<{ accessToken: string; expiresTime?: number | string }>(
        '/fdmdingtalk/auth/dingtalk-mini-login',
        tenantId,
        undefined,
        { corpId, code },
      ),
    detail: (tenantId: number, accessToken: string, id: number) =>
      request<CardDetail>(
        `/fdmdingtalk/interactive-card/my-detail?id=${id}`,
        tenantId,
        accessToken,
      ),
  };
}
