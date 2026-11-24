import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export type FeedbackCategory = 'feature' | 'issue' | 'suggestion';
export type FeedbackStatus = 'completed' | 'pending' | 'processing';
export const feedbackDiagnosticType = 'application/x-ndjson';

export interface FeedbackAttachment {
  contentType: string;
  index: number;
  name: string;
  size: number;
}

export interface DesktopFeedback {
  appVersion: null | string;
  attachments: FeedbackAttachment[];
  category: FeedbackCategory;
  createdAt: string;
  description: string;
  diagnostics?: FeedbackAttachment[];
  id: string;
  platform: null | string;
  reply: null | string;
  revision: number;
  status: FeedbackStatus;
  subject: string;
  updatedAt: string;
  userId: string;
}

interface FeedbackPageParams extends PageParam {
  category?: FeedbackCategory;
  status?: FeedbackStatus;
}

type FeedbackUpdate = Pick<DesktopFeedback, 'id' | 'revision' | 'status'> & {
  reply: string;
};

const base = '/fdmmcp/desktop-feedback';

export function getDesktopFeedbackPage(
  params: FeedbackPageParams,
  signal?: AbortSignal,
) {
  return requestClient.get<PageResult<DesktopFeedback>>(`${base}/page`, {
    params,
    signal,
    silent: true,
  });
}

export function updateDesktopFeedback(data: FeedbackUpdate) {
  return requestClient.put<boolean>(`${base}/update`, data, { silent: true });
}

export function getDesktopFeedbackAttachment(
  id: string,
  index: number,
  signal: AbortSignal,
) {
  return requestClient.download<Blob>(
    `${base}/${encodeURIComponent(id)}/attachments/${index}`,
    { signal, silent: true },
  );
}
