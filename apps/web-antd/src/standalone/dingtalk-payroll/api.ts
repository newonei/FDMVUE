import { CardApiError, createCardApi } from '../dingtalk-card/api';
import { parseSlipResult } from './model';

export function createPayrollApi(
  apiBase: string,
  fetcher: typeof fetch = fetch,
) {
  const base = apiBase.replace(/\/+$/, '');
  const dingtalk = createCardApi(base, fetcher);

  return {
    resolveTenant: dingtalk.resolveTenant,
    publicConfig: dingtalk.publicConfig,
    login: dingtalk.login,
    async detail(
      tenantId: number,
      accessToken: string,
      id: string,
      signal: AbortSignal,
    ) {
      const timeout = new AbortController();
      const abort = () => timeout.abort();
      const timer = setTimeout(abort, 15_000);
      signal.addEventListener('abort', abort, { once: true });

      try {
        if (signal.aborted) throw new DOMException('请求已取消', 'AbortError');
        const response = await fetcher(
          `${base}/fdmplatform/payroll/my-slip?id=${encodeURIComponent(id)}`,
          {
            cache: 'no-store',
            credentials: 'omit',
            headers: {
              Accept: 'application/json',
              Authorization: `Bearer ${accessToken}`,
              'tenant-id': String(tenantId),
            },
            redirect: 'error',
            signal: timeout.signal,
          },
        );

        if (!response.ok)
          throw new CardApiError(response.status, '无法读取工资条');
        const envelope = (await response.json()) as null | {
          code?: number;
          data?: unknown;
        };
        if (envelope?.code !== 0)
          throw new CardApiError(envelope?.code ?? 500, '无法读取工资条');
        return parseSlipResult(envelope.data, response.headers.get('Date'));
      } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
      }
    },
  };
}
