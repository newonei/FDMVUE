import { describe, expect, it } from 'vitest';

import { upstreamBadge } from './upstream';

describe('上道状态标记', () => {
  it('labels each upstream state and hides when there is none', () => {
    expect(upstreamBadge('WAITING')?.text).toBe('上道还没人接');
    expect(upstreamBadge('WORKING')?.text).toBe('上道在做');
    expect(upstreamBadge('PARTIAL')?.text).toBe('上道报了一部分');
    expect(upstreamBadge('DONE')?.text).toBe('上道已报工');
    expect(upstreamBadge('NONE')).toBeNull();
    expect(upstreamBadge(undefined)).toBeNull();
  });
});
