import { describe, expect, it } from 'vitest';

import { extractPromptText, parsePromptTextOutput } from './prompt-text-output';

describe('prompt text output', () => {
  it('parses the stable PROMPT_TEXT envelope', () => {
    expect(
      parsePromptTextOutput(
        JSON.stringify({
          contentType: 'PROMPT_TEXT',
          language: 'ZH_CN',
          schemaVersion: 1,
          targetType: 'VIDEO',
          text: '  电影感产品展示提示词  ',
        }),
      ),
    ).toEqual({
      contentType: 'PROMPT_TEXT',
      language: 'ZH_CN',
      schemaVersion: 1,
      targetType: 'VIDEO',
      text: '电影感产品展示提示词',
    });
  });

  it('uses stable defaults for unknown optional values', () => {
    expect(
      parsePromptTextOutput(
        JSON.stringify({
          contentType: 'PROMPT_TEXT',
          language: 'unknown',
          targetType: 'unknown',
          text: 'prompt',
        }),
      ),
    ).toMatchObject({ language: 'AUTO', targetType: 'GENERAL' });
  });

  it('rejects malformed or empty stable output', () => {
    expect(parsePromptTextOutput('{')).toBeUndefined();
    expect(
      parsePromptTextOutput(
        JSON.stringify({ contentType: 'PROMPT_TEXT', text: ' ' }),
      ),
    ).toBeUndefined();
    expect(
      parsePromptTextOutput(
        JSON.stringify({ contentType: 'IMAGE', text: 'x' }),
      ),
    ).toBeUndefined();
  });

  it('extracts a text result from supported nested provider envelopes', () => {
    expect(
      extractPromptText(
        JSON.stringify({
          outputs: [
            { type: 'IMAGE', url: 'https://example.test/a.png' },
            { type: 'TEXT', text: 'generated prompt' },
          ],
        }),
      ),
    ).toBe('generated prompt');
  });

  it('does not mistake unrelated provider strings for prompt output', () => {
    expect(
      extractPromptText(
        JSON.stringify({ output: { id: 'task-1', status: 'SUCCEEDED' } }),
      ),
    ).toBeUndefined();
  });
});
