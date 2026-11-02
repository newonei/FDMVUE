import { requestClient } from '#/api/request';

const base = '/fdmplatform/v1/approval-configs';

export type ApprovalNodeType = 'DEPT_LEADER' | 'ROLE' | 'USERS';

export interface ApprovalNode {
  actionType: 'AND' | 'OR';
  /** 人民币低于此金额跳过这个节点，留空总是经过。 */
  minAmount?: null | number | string;
  name: string;
  roleId?: null | number;
  type: ApprovalNodeType;
  userIds: number[];
}

export interface ApprovalConfig {
  docType: string;
  enabled: boolean;
  minAmount?: null | number | string;
  name: string;
  nodes: ApprovalNode[];
  /** 钉钉模板编码，保存启用时由系统创建。 */
  processCode?: null | string;
}

export function getApprovalConfigs() {
  return requestClient.get<ApprovalConfig[]>(base);
}

export function saveApprovalConfigs(data: ApprovalConfig[]) {
  return requestClient.put<ApprovalConfig[]>(base, data);
}
