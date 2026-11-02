import type {
  ApprovalConfig,
  ApprovalNode,
} from '#/api/fdmplatform/approval-config';

export const nodeTypes = [
  { label: '申请人的部门负责人', value: 'DEPT_LEADER' },
  { label: '指定人员', value: 'USERS' },
  { label: '角色', value: 'ROLE' },
];

export const actionTypes = [
  { label: '或签（一人同意即可）', value: 'OR' },
  { label: '会签（所有人同意）', value: 'AND' },
];

export function newNode(): ApprovalNode {
  return {
    actionType: 'OR',
    minAmount: null,
    name: '',
    roleId: null,
    type: 'DEPT_LEADER',
    userIds: [],
  };
}

/** 换位置；超出范围时不动。 */
export function moveNode(nodes: ApprovalNode[], index: number, offset: number) {
  const target = index + offset;
  if (target < 0 || target >= nodes.length) return nodes;
  const moved = [...nodes];
  const [node] = moved.splice(index, 1);
  moved.splice(target, 0, node as ApprovalNode);
  return moved;
}

export function configError(configs: ApprovalConfig[]) {
  for (const config of configs) {
    if (config.enabled && config.nodes.length === 0)
      return `启用${config.name}审批前请至少配置一个审批节点`;
    for (const [index, node] of config.nodes.entries()) {
      const where = `${config.name}第 ${index + 1} 个节点`;
      if (node.type === 'USERS' && node.userIds.length === 0)
        return `${where}请选择审批人`;
      if (node.type === 'ROLE' && !node.roleId) return `${where}请选择角色`;
    }
  }
  return '';
}

function amount(value: ApprovalNode['minAmount']) {
  return value === '' || value === undefined ? null : value;
}

/** 门槛留空表示都要审批；切换类型后不带上另一种类型的选择。 */
export function configPayload(configs: ApprovalConfig[]): ApprovalConfig[] {
  return configs.map((config) => ({
    ...config,
    minAmount: amount(config.minAmount),
    nodes: config.nodes.map((node) => ({
      ...node,
      minAmount: amount(node.minAmount),
      roleId: node.type === 'ROLE' ? node.roleId : null,
      userIds: node.type === 'USERS' ? node.userIds : [],
    })),
  }));
}
