import { requestClient } from '#/api/request';

export namespace DingTalkSettingsApi {
  export interface Settings {
    id?: number;
    socialClientId?: number;
    appName: string;
    corpId: string;
    clientId: string;
    agentId: string;
    appSecretConfigured: boolean;
    enabled: boolean;
    frontendBaseUrl: string;
    developerAppId: string;
    robotCode: string;
    userMappingCount: number;
    deptMappingCount: number;
    todoMappingCount: number;
    streamEnabled: boolean;
    streamRunning: boolean;
  }

  export interface SaveParams {
    appName: string;
    corpId: string;
    clientId: string;
    agentId: string;
    appSecret?: string;
    enabled: boolean;
    frontendBaseUrl: string;
    developerAppId: string;
    robotCode: string;
  }

  export interface ConnectionResult {
    success: boolean;
    checkedAt: string;
    message: string;
    agentId: string;
  }

  export interface SyncResult {
    created: number;
    updated: number;
    deleted: number;
    disabled: number;
    skipped: number;
    failed: number;
    messages: string[];
  }
}

export function getDingTalkSettings() {
  return requestClient.get<DingTalkSettingsApi.Settings>(
    '/fdmdingtalk/settings/get',
  );
}

export function saveDingTalkSettings(data: DingTalkSettingsApi.SaveParams) {
  return requestClient.put<boolean>('/fdmdingtalk/settings/save', data);
}

export function checkDingTalkConnection() {
  return requestClient.post<DingTalkSettingsApi.ConnectionResult>(
    '/fdmdingtalk/settings/check-connection',
  );
}

export function reconnectDingTalkStream() {
  return requestClient.post<boolean>('/fdmdingtalk/settings/reconnect-stream');
}

export function syncDingTalkDepartments() {
  return requestClient.post<DingTalkSettingsApi.SyncResult>(
    '/fdmdingtalk/dept/sync-all',
  );
}

export function syncDingTalkUserDepartments() {
  return requestClient.post<DingTalkSettingsApi.SyncResult>(
    '/fdmdingtalk/user/sync-dept',
  );
}
