export interface CardDetail {
  id: number;
  title: string;
  content: string;
  status: string;
  acknowledgedAt?: number | string;
  createTime: number | string;
}

export interface PublicConfig {
  enabled: boolean;
  corpId: string;
  clientId: string;
}

export interface CardSession {
  accessToken: string;
  expiresAt: number;
}

export function parseCardId(search: string): number {
  const raw = new URLSearchParams(search).get('id');
  if (!raw || !/^[1-9]\d*$/.test(raw)) {
    throw new Error('通知链接无效，请从钉钉卡片重新打开');
  }
  const id = Number(raw);
  if (!Number.isSafeInteger(id)) throw new Error('通知编号无效');
  return id;
}

export function cardSessionKey(tenantId: number, config: PublicConfig) {
  return `fdm:dingtalk-card:${tenantId}:${config.corpId}:${config.clientId}`;
}

export function readCardSession(
  storage: Pick<Storage, 'getItem'>,
  key: string,
  now = Date.now(),
): CardSession | undefined {
  try {
    const parsed = JSON.parse(
      storage.getItem(key) || 'null',
    ) as CardSession | null;
    if (
      parsed &&
      typeof parsed.accessToken === 'string' &&
      !!parsed.accessToken &&
      typeof parsed.expiresAt === 'number' &&
      parsed.expiresAt > now + 30_000 &&
      parsed.expiresAt <= now + 10 * 60_000
    )
      return parsed;
  } catch {
    /* Unavailable or malformed storage never prevents a fresh login. */
  }
  return undefined;
}

export function createCardSession(
  accessToken: string,
  expiresTime: number | string | undefined,
  now = Date.now(),
): CardSession {
  if (!accessToken) throw new Error('免登未返回访问凭证，请重试');
  const serverExpiry =
    typeof expiresTime === 'number'
      ? expiresTime
      : Date.parse(expiresTime || '');
  return {
    accessToken,
    expiresAt: Math.min(
      now + 5 * 60_000,
      Number.isFinite(serverExpiry) ? serverExpiry : Infinity,
    ),
  };
}

export function detailStatusLabel(status: string) {
  return (
    (
      {
        ACKNOWLEDGED: '已知晓',
        DELIVERED: '等待确认',
        FAILED: '发送失败',
        SENDING: '处理中',
        UNKNOWN: '状态待核实',
      } as Record<string, string>
    )[status] || '通知'
  );
}
