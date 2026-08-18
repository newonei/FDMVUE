import { describe, expect, it } from 'vitest';

import {
  agentReferenceKey,
  createAgentReferenceMention,
  displayAgentReferenceMention,
} from './agent-reference-mention';

describe('agent reference mentions', () => {
  it('keeps an alias for display while submitting only the stable typed ID', () => {
    const mention = createAgentReferenceMention(
      'ASSET',
      '2083489455964938241',
      '春季产品主图',
    );

    expect(mention.reference).toEqual({
      id: '2083489455964938241',
      type: 'ASSET',
    });
    expect(agentReferenceKey(mention.reference)).toBe(
      'ASSET:2083489455964938241',
    );
    expect(displayAgentReferenceMention(mention)).toBe(
      '@资产 · 春季产品主图',
    );
    expect(JSON.stringify(mention.reference)).not.toContain('春季产品主图');
  });

  it('rejects empty or overlong reference IDs before a request is assembled', () => {
    expect(() => createAgentReferenceMention('NODE', ' ', '节点')).toThrow(
      '引用 ID 无效',
    );
    expect(() =>
      createAgentReferenceMention('PROMPT', 'a'.repeat(129), '提示词'),
    ).toThrow('引用 ID 无效');
  });
});
