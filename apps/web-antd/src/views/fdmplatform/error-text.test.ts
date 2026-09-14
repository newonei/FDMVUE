import { describe, expect, it } from 'vitest';

import { errorText } from './data';

describe('business operation error feedback', () => {
  it('preserves server rejection reasons across host interceptor envelopes', () => {
    const msg = '请款超过采购单可申请余额（待审批和已批准申请均占用）';
    for (const error of [
      { msg },
      { data: { msg } },
      { response: { data: { msg } } },
      msg,
    ]) {
      expect(errorText(error)).toBe(msg);
    }
  });

  it('keeps optimistic version conflicts and transient network failures actionable', () => {
    expect(errorText(new Error('单据已变化，请刷新最新版本'))).toContain(
      '最新版本',
    );
    expect(errorText('Network Error')).toBe('连接服务失败，请在服务启动后重试');
    expect(errorText(undefined)).toBe('操作失败，请刷新后重试');
  });
});
