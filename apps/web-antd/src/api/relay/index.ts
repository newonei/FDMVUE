import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmRelayApi {
  export type ConfigMode = 'ADMIN_BRIDGE' | 'USER_JWT';

  export interface Config {
    id?: number;
    enabled: boolean;
    adminBaseUrl: string;
    publicBaseUrl: string;
    mode: ConfigMode;
    hasAdminApiKey: boolean;
    configured: boolean;
    connectTimeoutMillis: number;
    readTimeoutMillis: number;
    defaultBalance?: number;
    defaultConcurrency?: number;
    defaultRpmLimit?: number;
    defaultGroupId?: number;
    defaultQuota?: number;
    defaultExpiresInDays?: number;
    defaultRateLimit5h?: number;
    defaultRateLimit1d?: number;
    defaultRateLimit7d?: number;
    updateTime?: string;
  }

  /** 管理员 API Key 仅允许写入，任何查询响应都不包含该字段。 */
  export interface ConfigSaveRequest {
    enabled: boolean;
    adminBaseUrl: string;
    publicBaseUrl: string;
    mode: ConfigMode;
    adminApiKey?: string;
    connectTimeoutMillis: number;
    readTimeoutMillis: number;
    defaultBalance?: number;
    defaultConcurrency?: number;
    defaultRpmLimit?: number;
    defaultGroupId?: number;
    defaultQuota?: number;
    defaultExpiresInDays?: number;
    defaultRateLimit5h?: number;
    defaultRateLimit1d?: number;
    defaultRateLimit7d?: number;
  }

  export interface ConnectionTestResult {
    success: boolean;
    message?: string;
    latencyMillis?: number;
    version?: string;
    testTime?: string;
  }

  export interface UserBinding {
    id: number;
    userId: number;
    username?: string;
    nickname?: string;
    mobile?: string;
    deptName?: string;
    remoteUserId?: number;
    shadowEmail?: string;
    remoteStatus?: number | string;
    provisionStatus?: number | string;
    balance?: number;
    usedBalance?: number;
    concurrency?: number;
    rpmLimit?: number;
    lastSyncTime?: string;
    lastErrorCode?: string;
    createTime?: string;
  }

  export interface UserStatusUpdateRequest {
    id: number;
    status: number | string;
  }

  export interface ApiKey {
    id: number;
    userId?: number;
    username?: string;
    nickname?: string;
    remoteKeyId?: number;
    name: string;
    keyPrefix?: string;
    keyLast4?: string;
    maskedKey?: string;
    status?: number | string;
    groupId?: number;
    groupName?: string;
    quota?: number;
    usedQuota?: number;
    rateLimit5h?: number;
    rateLimit1d?: number;
    rateLimit7d?: number;
    expiresAt?: string;
    lastUsedAt?: string;
    provisionStatus?: number | string;
    lastSyncTime?: string;
    lastErrorCode?: string;
    createTime?: string;
  }

  export interface MyApiKeyCreateRequest {
    name: string;
    groupId?: number;
    quota?: number;
    expiresInDays?: number;
    rateLimit5h?: number;
    rateLimit1d?: number;
    rateLimit7d?: number;
    ipWhitelist?: string[];
    ipBlacklist?: string[];
  }

  export interface ApiKeySecretResult extends ApiKey {
    /** 只在创建或轮换成功的本次响应中返回。 */
    apiKey: string;
    publicBaseUrl?: string;
  }

  export interface UsageStats {
    requestCount?: number;
    successCount?: number;
    failedCount?: number;
    activeUserCount?: number;
    activeKeyCount?: number;
    promptTokens?: number;
    completionTokens?: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    totalCost?: number;
    quota?: number;
    usedQuota?: number;
    remainingQuota?: number;
    quotaUsed?: number;
    quotaRemaining?: number;
    successRate?: number;
    averageLatencyMillis?: number;
    todayRequestCount?: number;
    todayTokens?: number;
    todayCost?: number;
  }

  export interface UsageLog {
    id?: number | string;
    requestId?: string;
    userId?: number;
    username?: string;
    nickname?: string;
    keyId?: number;
    apiKeyId?: number;
    keyName?: string;
    keyPrefix?: string;
    model?: string;
    requestType?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    cost?: number;
    latencyMillis?: number;
    status?: number | string;
    statusCode?: number;
    errorMessage?: string;
    requestTime?: string;
    createdAt?: string;
    createTime?: string;
  }

  export interface PublicModel {
    id?: number | string;
    name: string;
    label?: string;
    groupId?: number;
  }

  export interface PublicInfo {
    enabled?: boolean;
    configured?: boolean;
    publicBaseUrl: string;
    available?: boolean;
    mode?: ConfigMode;
    apiVersion?: string;
    protocol?: string;
    docsUrl?: string;
    supportContact?: string;
    models?: Array<PublicModel | string>;
  }
}

export function getRelayConfig() {
  return requestClient.get<FdmRelayApi.Config>('/fdmrelay/config/get');
}

export function saveRelayConfig(data: FdmRelayApi.ConfigSaveRequest) {
  return requestClient.put<boolean>('/fdmrelay/config/save', data);
}

export function testRelayConnection() {
  return requestClient.post<FdmRelayApi.ConnectionTestResult>(
    '/fdmrelay/config/test',
  );
}

export function getRelayUserPage(params: PageParam & Record<string, unknown>) {
  return requestClient.get<PageResult<FdmRelayApi.UserBinding>>(
    '/fdmrelay/user/page',
    { params },
  );
}

export function syncRelayUser(id: number) {
  return requestClient.post<boolean>(`/fdmrelay/user/sync?id=${id}`);
}

export function updateRelayUserStatus(
  data: FdmRelayApi.UserStatusUpdateRequest,
) {
  return requestClient.put<boolean>('/fdmrelay/user/update-status', data);
}

export function getRelayApiKeyPage(
  params: PageParam & Record<string, unknown>,
) {
  return requestClient.get<PageResult<FdmRelayApi.ApiKey>>(
    '/fdmrelay/api-key/page',
    { params },
  );
}

export function rotateRelayApiKey(id: number) {
  return requestClient.post<FdmRelayApi.ApiKeySecretResult>(
    `/fdmrelay/api-key/admin-rotate?id=${id}`,
  );
}

export function revokeRelayApiKey(id: number) {
  return requestClient.delete<boolean>(
    `/fdmrelay/api-key/admin-revoke?id=${id}`,
  );
}

export function getMyRelayApiKeyPage(
  params: PageParam & Record<string, unknown>,
) {
  return requestClient.get<PageResult<FdmRelayApi.ApiKey>>(
    '/fdmrelay/api-key/my-page',
    { params },
  );
}

export function createMyRelayApiKey(data: FdmRelayApi.MyApiKeyCreateRequest) {
  return requestClient.post<FdmRelayApi.ApiKeySecretResult>(
    '/fdmrelay/api-key/create',
    data,
  );
}

export function rotateMyRelayApiKey(id: number) {
  return requestClient.post<FdmRelayApi.ApiKeySecretResult>(
    `/fdmrelay/api-key/rotate?id=${id}`,
  );
}

export function revokeMyRelayApiKey(id: number) {
  return requestClient.delete<boolean>(`/fdmrelay/api-key/revoke?id=${id}`);
}

export function getRelayUsageStats(params?: Record<string, unknown>) {
  return requestClient.get<FdmRelayApi.UsageStats>('/fdmrelay/usage/stats', {
    params,
  });
}

export function getRelayUsagePage(params: PageParam & Record<string, unknown>) {
  return requestClient.get<PageResult<FdmRelayApi.UsageLog>>(
    '/fdmrelay/usage/page',
    { params },
  );
}

export function getMyRelayUsageSummary(params?: Record<string, unknown>) {
  return requestClient.get<FdmRelayApi.UsageStats>(
    '/fdmrelay/usage/my-summary',
    { params },
  );
}

export function getMyRelayUsagePage(
  params: PageParam & Record<string, unknown>,
) {
  return requestClient.get<PageResult<FdmRelayApi.UsageLog>>(
    '/fdmrelay/usage/my-page',
    { params },
  );
}

export function getRelayPublicInfo() {
  return requestClient.get<FdmRelayApi.PublicInfo>('/fdmrelay/public-info');
}
