import { useAccessStore } from '@vben/stores';

import { baseRequestClient, requestClient } from '#/api/request';

import {
  normalizeWorkNotificationTaskId,
  parseWorkNotificationDetailReceipt,
  parseWorkNotificationEnvelope,
} from './response';

export namespace DingTalkWorkNotificationApi {
  export interface Card {
    title: string;
    description: string;
    coverUrl?: string;
    detailUrl: string;
    buttonTitle: string;
  }
  export interface SendParams {
    systemUserIds: number[];
    card: Card;
  }
  export interface DetailSendParams {
    requestKey: string;
    systemUserId: number;
    title: string;
    description: string;
    coverUrl?: string;
    buttonTitle: string;
  }
  export interface DetailSendResult {
    id: number;
    taskId: null | string;
    status: 'ACCEPTED' | 'FAILED' | 'SENDING' | 'UNKNOWN';
    detailUrl: string;
  }
  export interface SendResult {
    read_user_id_list?: unknown[];
    unread_user_id_list?: unknown[];
    failed_user_id_list?: unknown[];
    invalid_user_id_list?: unknown[];
    invalid_dept_id_list?: unknown[];
    forbidden_user_id_list?: unknown[];
    forbidden_list?: {
      code?: number | string;
      count?: number;
      userid?: string;
    }[];
    [key: string]: unknown;
  }
}

async function postOnce(path: string, payload: unknown) {
  const accessToken = useAccessStore().accessToken;
  if (!accessToken) throw new Error('登录已过期，请重新登录后核对本次发送状态');
  // The base client has no refresh/replay response interceptor. Never replay a POST.
  const response = await baseRequestClient.post<{ data: unknown }>(
    path,
    payload,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      responseReturn: 'raw',
      responseType: 'text',
      transformResponse: [(raw: unknown) => raw],
    },
  );
  return parseWorkNotificationEnvelope(response.data);
}

export async function sendDingTalkWorkNotification(
  data: DingTalkWorkNotificationApi.SendParams,
) {
  return normalizeWorkNotificationTaskId(
    await postOnce('/fdmdingtalk/work-notification/send-card', data),
  );
}

export async function sendDingTalkWorkNotificationDetail(
  data: DingTalkWorkNotificationApi.DetailSendParams,
) {
  return parseWorkNotificationDetailReceipt(
    await postOnce('/fdmdingtalk/work-notification/send-detail-card', data),
  );
}

export function getDingTalkWorkNotificationResult(taskId: string) {
  return requestClient.get<DingTalkWorkNotificationApi.SendResult>(
    '/fdmdingtalk/work-notification/send-result',
    {
      params: { taskId: normalizeWorkNotificationTaskId(taskId) },
      silent: true,
    },
  );
}

export function getDingTalkWorkNotificationDetailResult(id: number) {
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('通知记录编号无效');
  return requestClient.get<DingTalkWorkNotificationApi.SendResult>(
    '/fdmdingtalk/work-notification/detail-send-result',
    { params: { id }, silent: true },
  );
}
