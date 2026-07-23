import { describe, expect, it } from 'vitest';

import {
  buildWorkBuddyModelPrompt,
  WORKBUDDY_CHAT_COMPLETIONS_URL,
  WORKBUDDY_MODEL_IDS,
} from './workbuddy-prompt';

describe('buildWorkBuddyModelPrompt', () => {
  it('injects the one-time key and complete WorkBuddy model configuration', () => {
    const apiKey = "test-key-$&-$`-$'-$$";
    const prompt = buildWorkBuddyModelPrompt(apiKey);

    expect(prompt).toContain(`API Key：${apiKey}`);
    expect(prompt.split(apiKey)).toHaveLength(2);
    expect(prompt).not.toContain('[在这里填写 API Key]');
    expect(prompt).toContain(WORKBUDDY_CHAT_COMPLETIONS_URL);
    expect(prompt).toContain(
      String.raw`C:\Users\Administrator\.workbuddy\models.json`,
    );
    for (const modelId of WORKBUDDY_MODEL_IDS) {
      expect(prompt).toContain(modelId);
    }
    expect(prompt).toContain('vendor："Custom"');
    expect(prompt).toContain('supportsToolCall：true');
    expect(prompt).toContain('supportsImages：true');
    expect(prompt).toContain('supportsReasoning：true');
    expect(prompt).toContain('useCustomProtocol：true');
    expect(prompt).toContain('["low", "medium", "high", "xhigh", "max"]');
    expect(prompt).toContain('顶层应保持 JSON 数组格式');
  });
});
