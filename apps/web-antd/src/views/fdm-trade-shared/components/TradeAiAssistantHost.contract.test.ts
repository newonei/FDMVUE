import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const source = readFileSync(
  resolve(
    process.cwd(),
    process.cwd().endsWith(String.raw`apps\web-antd`) ||
      process.cwd().endsWith('apps/web-antd')
      ? 'src/views/fdm-trade-shared/components/TradeAiAssistantHost.vue'
      : 'apps/web-antd/src/views/fdm-trade-shared/components/TradeAiAssistantHost.vue',
  ),
  'utf8',
);

describe('trade AI assistant host security contract', () => {
  it('separates the server-owned waimao request from the product browser-context request', () => {
    expect(source).toContain('FdmWaimaoAssistantChatRequest');
    expect(source).toContain('FdmProductAssistantChatRequest');
    expect(source).not.toContain('interface AiChatRequest');

    const waimaoAdapter = source.slice(
      source.indexOf('if (isFdmWaimaoAiPath(route.path))'),
      source.indexOf('// Procurement surfaces remain fail closed'),
    );
    expect(waimaoAdapter).toContain('chatWithFdmWaimaoAi(data)');
    expect(waimaoAdapter).not.toContain('pageTitle');
    expect(waimaoAdapter).not.toContain('context:');
  });

  it('freezes response identity, storage key and idempotency command across uncertain retries', () => {
    expect(source).toContain('const pendingQuestionCommands = new Map');
    expect(source).toContain('fdmAiPendingQuestionKey(identity, normalized)');
    expect(source).toContain('idempotencyKey: command.idempotencyKey');
    expect(source).toContain(
      'isChatRequestCurrent(requestVersion, command.identity)',
    );
    expect(source).toContain('appendMessage(command.identity.storageKey, {');
    expect(source).toContain('viewKey: `${resolved.value?.contextMode');
    expect(source).toContain('context: command.productContext');
    expect(source).toContain('pendingQuestionCommands.delete(pendingKey)');
  });

  it('invalidates stale chat and model requests when the page identity changes', () => {
    expect(source).toContain('chatRequestVersion += 1');
    expect(source).toContain('sending.value = false');
    expect(source).toMatch(
      /modelRequestVersion \+= 1;\s*loadingModels\.value = false;/,
    );
  });

  it('requires both AI use and the fixed page query permission', () => {
    expect(source).toContain('resolved.value!.queryPermission');
    expect(source).toContain("surface.availability === 'enabled'");
    expect(source).toContain('resolvedFdmWaimaoAiQuestions(page)');
    expect(source).toContain('resolvedFdmWaimaoAiDescription(page)');
  });

  it('uses the complete route query for independent finance workspaces and keeps model choice explicit', () => {
    expect(source).toContain(
      'resolveFdmWaimaoAiSurface(route.path, { ...route.query })',
    );
    expect(source).toContain(
      '// Model choice is intentionally explicit for every page/object session.',
    );
    expect(source).toContain('selectedModelId.value = undefined');
    expect(source).toContain(
      '!selectedModel || !companyId || !resolvedBusinessId',
    );
  });
});
