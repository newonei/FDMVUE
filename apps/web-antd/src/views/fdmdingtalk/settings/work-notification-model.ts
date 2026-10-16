import type { DingTalkWorkNotificationApi } from '#/api/fdmdingtalk/work-notification';

import { normalizeWorkNotificationTaskId } from '../../../api/fdmdingtalk/work-notification/response';

export const WORK_NOTIFICATION_COVER =
  '/images/dingtalk-work-notification-cover.png';

export interface WorkNotificationForm {
  systemUserId?: number;
  detailMode: 'lightweight' | 'link';
  title: string;
  description: string;
  buttonTitle: string;
  detailUrl: string;
  coverUrl: string;
}

export interface WorkNotificationAttempt {
  phase: 'accepted' | 'failed' | 'sending' | 'unknown';
  requestKey: string;
  taskId?: string;
  detailId?: number;
  detailUrl?: string;
  recipientLabel: string;
  title: string;
  createdAt: number;
}

export function isValidWorkNotificationUrl(value: string): boolean {
  if (
    !/^https?:\/\//i.test(value) ||
    value.length > 500 ||
    /[()<>\\]/.test(value) ||
    [...value].some(
      (character) =>
        /\s/.test(character) ||
        (character.codePointAt(0) ?? 0) < 32 ||
        character.codePointAt(0) === 127,
    )
  )
    return false;
  try {
    const url = new URL(value);
    return !!url.hostname && !url.username && !url.password;
  } catch {
    return false;
  }
}

function textField(
  value: string,
  label: string,
  max: number,
  multiline = false,
) {
  const text = value.trim();
  if (
    !text ||
    text.length > max ||
    [...text].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return (
        code === 127 ||
        (code < 32 && !(multiline && [9, 10, 13].includes(code)))
      );
    })
  )
    throw new Error(
      `${label}需填写1至${max}个字符${multiline ? '' : '，且不能换行'}`,
    );
  return text;
}

export function buildWorkNotificationPayload(
  form: WorkNotificationForm,
  requestKey: string,
) {
  if (!Number.isSafeInteger(form.systemUserId) || form.systemUserId! <= 0)
    throw new Error('请选择一位真实系统用户');
  const fields = {
    title: textField(form.title, '标题', 100),
    description: textField(form.description, '说明', 600, true),
    buttonTitle: textField(form.buttonTitle, '按钮文字', 20),
    ...(form.coverUrl.trim() ? { coverUrl: form.coverUrl.trim() } : {}),
  };
  if (fields.coverUrl && !isValidWorkNotificationUrl(fields.coverUrl))
    throw new Error(
      '封面需为有效HTTP(S)地址，最多500字符，不能包含账号、空白或括号',
    );
  if (form.detailMode === 'lightweight')
    return {
      mode: 'lightweight' as const,
      data: { ...fields, requestKey, systemUserId: form.systemUserId! },
    };
  if (
    form.detailMode !== 'link' ||
    !isValidWorkNotificationUrl(form.detailUrl.trim())
  )
    throw new Error(
      '详情链接需为有效HTTP(S)地址，最多500字符，不能包含账号、空白或括号',
    );
  return {
    mode: 'link' as const,
    data: {
      systemUserIds: [form.systemUserId!],
      card: { ...fields, detailUrl: form.detailUrl.trim() },
    },
  };
}

export function beginWorkNotificationAttempt(
  current: WorkNotificationAttempt | undefined,
  recipientLabel: string,
  title: string,
  requestKey: string,
): WorkNotificationAttempt {
  if (current)
    throw new Error('本次发送已锁定，请先核对结果或明确开始另一条通知');
  return {
    phase: 'sending',
    recipientLabel,
    title,
    requestKey,
    createdAt: Date.now(),
  };
}

export function restoreWorkNotificationAttempt(
  raw: null | string,
): WorkNotificationAttempt | undefined {
  try {
    const value = JSON.parse(raw || 'null') as WorkNotificationAttempt | null;
    if (
      !value ||
      !['accepted', 'failed', 'sending', 'unknown'].includes(value.phase) ||
      typeof value.requestKey !== 'string' ||
      typeof value.recipientLabel !== 'string' ||
      typeof value.title !== 'string' ||
      typeof value.createdAt !== 'number'
    )
      return undefined;
    if (value.taskId)
      value.taskId = normalizeWorkNotificationTaskId(value.taskId);
    if (value.phase === 'sending') value.phase = 'unknown';
    return value;
  } catch {
    return undefined;
  }
}

export function summarizeWorkNotificationResult(
  result: DingTalkWorkNotificationApi.SendResult | null,
) {
  const fields = [
    'read_user_id_list',
    'unread_user_id_list',
    'failed_user_id_list',
    'invalid_user_id_list',
    'invalid_dept_id_list',
    'forbidden_user_id_list',
    'forbidden_list',
  ] as const;
  const counts = Object.fromEntries(
    fields.map((key) => [
      key,
      Array.isArray(result?.[key]) ? result[key].length : 0,
    ]),
  ) as Record<(typeof fields)[number], number>;
  const malformed =
    !result ||
    fields.some(
      (key) => result[key] !== undefined && !Array.isArray(result[key]),
    );
  const hasIssues = fields.slice(2).some((key) => counts[key] > 0);
  const hasReceivers =
    counts.read_user_id_list + counts.unread_user_id_list > 0;
  let state = 'pending';
  if (malformed) state = 'invalid';
  else if (hasIssues) state = 'issues';
  else if (hasReceivers) state = 'reported';
  return { counts, state };
}
