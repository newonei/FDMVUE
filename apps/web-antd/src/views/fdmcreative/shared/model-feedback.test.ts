import { describe, expect, it } from 'vitest';

import { creativeModelLoadError } from './model-feedback';

describe('creative model loading feedback', () => {
  it('retains actionable business errors from business responses', () => {
    expect(creativeModelLoadError({ code: 400, msg: '暂无可用模型路由' }))
      .toBe('模型目录加载失败：暂无可用模型路由');
  });

  it('handles transport errors and missing response details', () => {
    expect(creativeModelLoadError(new Error(' Network Error ')))
      .toBe('模型目录加载失败：Network Error');
    expect(creativeModelLoadError(null)).toContain('服务商路由');
  });
});
