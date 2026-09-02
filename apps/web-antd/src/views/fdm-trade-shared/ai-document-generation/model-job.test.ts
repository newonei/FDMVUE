import { describe, expect, it } from 'vitest';

import { isTerminalAiGenerationJob } from './useAiGenerationJob';
import { compatibleAiModels } from './useAiModelCatalog';

describe('aI model catalog and job lifecycle', () => {
  it('only exposes enabled STRUCTURED_OUTPUT models', () => {
    expect(
      compatibleAiModels([
        {
          capabilities: ['CHAT'],
          code: 'chat',
          enabled: true,
          id: '1',
          name: 'Chat',
        },
        {
          capabilities: ['text', 'structured_output'],
          code: 'structured',
          enabled: true,
          id: '9007199254740993',
          name: 'Structured',
        },
        {
          capabilities: ['STRUCTURED_OUTPUT'],
          code: 'missing-text',
          enabled: true,
          id: '2',
          name: 'Missing text',
        },
        {
          capabilities: ['STRUCTURED_OUTPUT'],
          code: 'disabled',
          enabled: false,
          id: '3',
          name: 'Disabled',
        },
      ]).map((item) => item.id),
    ).toEqual(['9007199254740993', '2']);
  });

  it.each(['READY', 'RULE_BLOCKED', 'STALE', 'EXPIRED', 'MATERIALIZED'])(
    'treats %s as terminal',
    (status) => {
      expect(
        isTerminalAiGenerationJob({
          id: '1',
          modelId: '2',
          sourceVersion: 3,
          status: status as never,
        }),
      ).toBe(true);
    },
  );

  it('continues polling active generation states', () => {
    expect(
      isTerminalAiGenerationJob({
        id: '1',
        modelId: '2',
        sourceVersion: 3,
        status: 'VALIDATING',
      }),
    ).toBe(false);
  });
});
