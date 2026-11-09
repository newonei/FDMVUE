import { describe, expect, it } from 'vitest';

import { businessError } from './business-error';

describe('businessError', () => {
  it('reads the code and message of a failed request', () => {
    expect(businessError({ response: { data: { code: 1_215_024_000, msg: '今天已经报过' } } })).toEqual({
      code: 1_215_024_000,
      msg: '今天已经报过',
    });
    expect(businessError({ data: { code: 500, msg: '出错了' } })).toEqual({ code: 500, msg: '出错了' });
    expect(businessError(new Error('网络断了'))).toEqual({ code: 0, msg: '网络断了' });
  });
});
