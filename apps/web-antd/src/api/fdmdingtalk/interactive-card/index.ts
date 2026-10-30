import { requestClient } from '#/api/request';

export namespace DingTalkInteractiveCardApi {
  export interface Settings {
    enabled: boolean;
    templateId: string;
    robotCode: string;
    corpId: string;
    streamEnabled: boolean;
    streamRunning: boolean;
  }

  export interface SaveSettingsParams {
    enabled: boolean;
    templateId: string;
  }

  export interface SendParams {
    requestKey: string;
    systemUserId: number;
    title: string;
    content: string;
  }

  export type Status =
    | 'ACKNOWLEDGED'
    | 'DELIVERED'
    | 'FAILED'
    | 'SENDING'
    | 'UNKNOWN';

  export type CloudUpdateStatus = 'FAILED' | 'NONE' | 'PENDING' | 'SYNCED';

  export interface Instance {
    id: number;
    outTrackId: string;
    requestKey: string;
    systemUserId: number;
    title: string;
    content: string;
    status: Status;
    cloudUpdateStatus: CloudUpdateStatus;
    acknowledgedAt?: number | string;
    createTime: number | string;
    lastError?: string;
  }
}

const baseUrl = '/fdmdingtalk/interactive-card';

export function getDingTalkInteractiveCardSettings() {
  return requestClient.get<DingTalkInteractiveCardApi.Settings>(
    `${baseUrl}/settings`,
  );
}

export function saveDingTalkInteractiveCardSettings(
  data: DingTalkInteractiveCardApi.SaveSettingsParams,
) {
  return requestClient.put<boolean>(`${baseUrl}/settings`, data);
}

export function sendDingTalkInteractiveCard(
  data: DingTalkInteractiveCardApi.SendParams,
) {
  return requestClient.post<DingTalkInteractiveCardApi.Instance>(
    `${baseUrl}/send`,
    data,
  );
}

export function getRecentDingTalkInteractiveCards() {
  return requestClient.get<DingTalkInteractiveCardApi.Instance[]>(
    `${baseUrl}/recent-list`,
  );
}

export function getDingTalkInteractiveCard(id: number) {
  return requestClient.get<DingTalkInteractiveCardApi.Instance>(
    `${baseUrl}/get`,
    { params: { id } },
  );
}
