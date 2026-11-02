import { describe, expect, it } from 'vitest';

import { configError, configPayload, moveNode, newNode } from './model';

const config = {
  docType: 'PAYMENT',
  enabled: true,
  name: '采购付款',
  nodes: [newNode()],
};

describe('approval config', () => {
  it('requires a node before enabling', () => {
    expect(configError([{ ...config, nodes: [] }])).toContain('至少配置一个');
    expect(configError([{ ...config, enabled: false, nodes: [] }])).toBe('');
    expect(configError([config])).toBe('');
  });

  it('requires people for user and role nodes', () => {
    expect(
      configError([{ ...config, nodes: [{ ...newNode(), type: 'USERS' }] }]),
    ).toContain('第 1 个节点请选择审批人');
    expect(
      configError([{ ...config, nodes: [{ ...newNode(), type: 'ROLE' }] }]),
    ).toContain('请选择角色');
  });

  it('drops choices of another node type and blank amounts', () => {
    const [saved] = configPayload([
      {
        ...config,
        minAmount: '',
        nodes: [{ ...newNode(), minAmount: '', roleId: 3, userIds: [1] }],
      },
    ]);
    expect(saved?.minAmount).toBeNull();
    expect(saved?.nodes[0]).toMatchObject({
      minAmount: null,
      roleId: null,
      userIds: [],
    });
  });

  it('moves nodes within range only', () => {
    const first = { ...newNode(), name: 'a' };
    const second = { ...newNode(), name: 'b' };
    expect(moveNode([first, second], 0, 1).map((n) => n.name)).toEqual([
      'b',
      'a',
    ]);
    expect(moveNode([first, second], 0, -1).map((n) => n.name)).toEqual([
      'a',
      'b',
    ]);
  });
});
