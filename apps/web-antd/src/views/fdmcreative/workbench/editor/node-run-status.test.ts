import { describe, expect, it } from 'vitest';

import { nodeRunStatusLabel } from './node-run-status';

describe('nodeRunStatusLabel', () => {
  it('maps the asynchronous node lifecycle instead of showing idle', () => {
    expect(nodeRunStatusLabel('PENDING')).toBe('排队中');
    expect(nodeRunStatusLabel('WAITING_AI')).toBe('模型生成中');
    expect(nodeRunStatusLabel('ARCHIVING_AI')).toBe('结果归档中');
  });

  it('only treats an empty or idle status as not started', () => {
    expect(nodeRunStatusLabel()).toBe('待运行');
    expect(nodeRunStatusLabel('IDLE')).toBe('待运行');
    expect(nodeRunStatusLabel('PROVIDER_SYNCING')).toBe('PROVIDER_SYNCING');
  });
});
