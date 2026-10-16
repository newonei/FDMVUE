import type { DingTalkWorkNotificationApi } from './index';

/** Keep the scalar Long in CommonResult.data as text before JSON parses it. */
export function parseWorkNotificationEnvelope(raw: unknown): unknown {
  if (typeof raw !== 'string') throw new Error('工作通知接口响应格式无效');
  const envelope = JSON.parse(
    raw.replace(/("data"\s*:\s*)(\d+)(?=\s*[,}])/, '$1"$2"'),
  ) as { code?: number; data?: unknown; msg?: string };
  if (envelope?.code !== 0) {
    throw new Error(
      envelope?.msg || '工作通知请求未成功，请核对登录和应用权限',
    );
  }
  return envelope.data;
}

export function normalizeWorkNotificationTaskId(value: unknown): string {
  let text = '';
  if (typeof value === 'string') text = value;
  else if (typeof value === 'number' && Number.isSafeInteger(value))
    text = String(value);
  if (
    !/^[1-9]\d{0,18}$/.test(text) ||
    (text.length === 19 && text > '9223372036854775807')
  ) {
    throw new Error('未取得有效的工作通知任务编号，请核对钉钉客户端');
  }
  return text;
}

export function parseWorkNotificationDetailReceipt(
  value: unknown,
): DingTalkWorkNotificationApi.DetailSendResult {
  const receipt =
    value as null | Partial<DingTalkWorkNotificationApi.DetailSendResult>;
  if (
    !receipt ||
    !Number.isSafeInteger(receipt.id) ||
    receipt.id! <= 0 ||
    !['ACCEPTED', 'FAILED', 'SENDING', 'UNKNOWN'].includes(
      receipt.status || '',
    ) ||
    typeof receipt.detailUrl !== 'string'
  )
    throw new Error('未取得可确认的工作通知记录，请核对钉钉客户端');
  const taskId = receipt.taskId
    ? normalizeWorkNotificationTaskId(receipt.taskId)
    : null;
  if (receipt.status === 'ACCEPTED' && !taskId)
    throw new Error('受理结果缺少任务编号，请核对钉钉客户端');
  return {
    id: receipt.id!,
    status: receipt.status!,
    taskId,
    detailUrl: receipt.detailUrl,
  };
}
