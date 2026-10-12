import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmMcpApi {
  export type DateTime = number | number[] | string;
  export type ToolRisk = 'DESTRUCTIVE' | 'READ' | 'WRITE';

  export interface Connection {
    id: number;
    clientId: string;
    clientName: string;
    clientEnabled: boolean;
    userId: number;
    userNickname?: string;
    scopes: string[];
    scopeLabels: string[];
    grantedTime?: DateTime;
    revokedTime?: DateTime;
    lastUsedTime?: DateTime;
  }

  export interface Tool {
    name: string;
    title: string;
    description: string;
    risk: ToolRisk;
    scopes: string[];
    permissions: string[];
    anyPermissions: string[];
  }

  export interface MyOverview {
    enabled: boolean;
    serverUrl?: string;
    connections: Connection[];
    tools: Tool[];
  }

  export interface Client {
    id: number;
    clientId: string;
    clientName: string;
    registrationSource: string;
    redirectUris: string[];
    scopes: string[];
    enabled: boolean;
    activeConnectionCount: number;
    createTime?: DateTime;
  }

  export interface AuditLog {
    id: number;
    traceId: string;
    clientId: string;
    clientName?: string;
    userId?: number;
    userNickname?: string;
    toolName: string;
    toolTitle?: string;
    scopeDecision: string;
    rbacDecision: string;
    resultCode: string;
    durationMs?: number;
    itemCount?: number;
    responseBytes?: number;
    clientIp?: string;
    createTime?: DateTime;
  }
}

/** 我的 AI 连接、MCP 地址与可用工具 */
export function getMyMcpOverview() {
  return requestClient.get<FdmMcpApi.MyOverview>('/fdmmcp/connection/my');
}

/** 撤销我对某个 AI 客户端的授权 */
export function revokeMyMcpConnection(clientId: string) {
  return requestClient.delete<boolean>('/fdmmcp/connection/my-revoke', {
    params: { clientId },
  });
}

export function getMcpConnectionPage(params: PageParam) {
  return requestClient.get<PageResult<FdmMcpApi.Connection>>(
    '/fdmmcp/connection/page',
    { params },
  );
}

export function revokeMcpConnection(id: number) {
  return requestClient.delete<boolean>('/fdmmcp/connection/revoke', {
    params: { id },
  });
}

export function getMcpClientPage(params: PageParam) {
  return requestClient.get<PageResult<FdmMcpApi.Client>>(
    '/fdmmcp/client/page',
    { params },
  );
}

export function updateMcpClientStatus(id: number, enabled: boolean) {
  return requestClient.put<boolean>('/fdmmcp/client/update-status', {
    id,
    enabled,
  });
}

export function getMcpToolList() {
  return requestClient.get<FdmMcpApi.Tool[]>('/fdmmcp/tool/list');
}

export function getMcpAuditLogPage(params: PageParam) {
  return requestClient.get<PageResult<FdmMcpApi.AuditLog>>(
    '/fdmmcp/audit-log/page',
    { params },
  );
}
