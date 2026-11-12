import type { InternalAxiosRequestConfig } from '@vben/request';

import { AxiosError, AxiosHeaders } from '@vben/request';

import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  resolveUploadErrorMessage,
  useUploadTaskStore,
} from '#/store/upload-task';

import { requestClient, uploadWithDiagnostics } from './request';
import { UploadRequestError } from './upload';

const mocks = vi.hoisted(() => ({
  access: {
    accessToken: 'test-access-token',
    isAccessChecked: true,
    refreshToken: 'test-refresh-token',
    setAccessToken: vi.fn(),
    setLoginExpired: vi.fn(),
    tenantId: 1,
    visitTenantId: 2,
  },
  logout: vi.fn(),
  messageError: vi.fn(),
  refreshToken: vi.fn(),
}));

vi.mock('@vben/hooks', () => ({
  isTenantEnable: () => true,
  useAppConfig: () => ({ apiURL: '/admin-api' }),
}));
vi.mock('@vben/preferences', () => ({
  preferences: {
    app: {
      enableRefreshToken: true,
      locale: 'zh-CN',
      loginExpiredMode: 'modal',
    },
  },
}));
vi.mock('@vben/stores', () => ({ useAccessStore: () => mocks.access }));
vi.mock('@vben/locales', () => ({ $t: (key: string) => key }));
vi.mock('ant-design-vue', () => ({
  message: { error: mocks.messageError },
}));
vi.mock('#/store', () => ({
  useAuthStore: () => ({ logout: mocks.logout }),
}));
vi.mock('./core', () => ({ refreshTokenApi: mocks.refreshToken }));

function response(
  config: InternalAxiosRequestConfig,
  status: number,
  data: unknown,
) {
  return {
    config,
    data,
    headers: new AxiosHeaders(),
    status,
    statusText: String(status),
  };
}

function httpError(
  config: InternalAxiosRequestConfig,
  status: number,
  data: unknown,
) {
  return new AxiosError(
    `Request failed with status code ${status}`,
    status >= 500 ? 'ERR_BAD_RESPONSE' : 'ERR_BAD_REQUEST',
    config,
    {},
    response(config, status, data),
  );
}

const file = () => new File(['image'], 'design.jpg', { type: 'image/jpeg' });
const uploadUrl = '/fdmdata/pattern/design-item/upload-design-image';
const originalAdapter = requestClient.instance.defaults.adapter;

describe('upload diagnostics through the application request client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    mocks.access.accessToken = 'test-access-token';
    mocks.access.setAccessToken.mockImplementation((token: string) => {
      mocks.access.accessToken = token;
    });
    mocks.refreshToken.mockResolvedValue({
      data: { data: { accessToken: 'refreshed-access-token' } },
    });
  });

  afterEach(() => {
    useUploadTaskStore().$reset();
    requestClient.instance.defaults.adapter = originalAdapter;
  });

  it.each([
    [413, '文件超过服务器允许的大小（HTTP 413）'],
    [502, '上传服务响应异常，请稍后重试（HTTP 502）'],
    [503, '上传服务暂不可用，请稍后重试（HTTP 503）'],
    [504, '服务器处理超时，请稍后重试（HTTP 504）'],
  ])(
    'keeps HTTP %i when the proxy responds with HTML',
    async (status, message) => {
      let rawError: AxiosError | undefined;
      requestClient.instance.defaults.adapter = async (config) => {
        rawError = httpError(config, status, `<html><h1>${status}</h1></html>`);
        throw rawError;
      };

      const error = await uploadWithDiagnostics(
        uploadUrl,
        { file: file() },
        {
          silent: true,
        },
      ).catch((error) => error);

      expect(error).toBeInstanceOf(UploadRequestError);
      expect(error.httpStatus).toBe(status);
      expect(error.cause).toBe(rawError);
      expect(error.response).toBeUndefined();
      expect(resolveUploadErrorMessage(error)).toBe(message);
      expect(mocks.messageError).not.toHaveBeenCalled();
    },
  );

  it('keeps business errors returned as HTTP 200 JSON', async () => {
    requestClient.instance.defaults.adapter = async (config) =>
      response(config, 200, {
        code: 1_002_001,
        data: null,
        msg: '上传的不是图片',
      });

    const error = await uploadWithDiagnostics(
      uploadUrl,
      { file: file() },
      {
        silent: true,
      },
    ).catch((error) => error);

    expect(error).toMatchObject({ businessCode: 1_002_001, httpStatus: 200 });
    expect(error.code).toBeUndefined();
    expect(resolveUploadErrorMessage(error)).toBe('上传的不是图片');
  });

  it.each([
    ['ERR_NETWORK', 'Network Error', '网络异常，请检查网络后重试'],
    ['ECONNABORTED', 'timeout of 1800000ms exceeded', '上传超时，请重试'],
  ])('keeps transport code %s', async (code, message, expected) => {
    requestClient.instance.defaults.adapter = async (config) => {
      throw new AxiosError(message, code, config);
    };

    const error = await uploadWithDiagnostics(
      uploadUrl,
      { file: file() },
      {
        silent: true,
      },
    ).catch((error) => error);

    expect(error.code).toBe(code);
    expect(error.httpStatus).toBeUndefined();
    expect(resolveUploadErrorMessage(error)).toBe(expected);
  });

  it('keeps the HTTP status even when an authenticated retry also fails', async () => {
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      throw httpError(config, 401, '');
    });
    requestClient.instance.defaults.adapter = adapter;

    const error = await uploadWithDiagnostics(
      uploadUrl,
      { file: file() },
      {
        silent: true,
      },
    ).catch((error) => error);

    expect(adapter).toHaveBeenCalledTimes(2);
    expect(mocks.refreshToken).toHaveBeenCalledOnce();
    expect(mocks.access.setLoginExpired).toHaveBeenCalledWith(true);
    expect(error.httpStatus).toBe(401);
    expect(error.cause).toBeInstanceOf(AxiosError);
    expect(resolveUploadErrorMessage(error)).toBe(
      '登录已过期，请重新登录后重试（HTTP 401）',
    );
  });

  it('keeps the authentication failure when refreshing the token fails', async () => {
    const authError = { code: 401, msg: '刷新令牌已过期' };
    mocks.refreshToken.mockRejectedValueOnce(authError);
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      throw httpError(config, 401, '');
    });
    requestClient.instance.defaults.adapter = adapter;

    const error = await uploadWithDiagnostics(
      uploadUrl,
      { file: file() },
      {
        silent: true,
      },
    ).catch((error) => error);

    expect(adapter).toHaveBeenCalledOnce();
    expect(error).toBe(authError);
    expect(resolveUploadErrorMessage(error)).toBe('刷新令牌已过期');
  });

  it('still refreshes authentication and returns the successful response data', async () => {
    const result = { designImageUrl: '/images/design.jpg' };
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      if (config.headers.Authorization === 'Bearer test-access-token') {
        throw httpError(config, 401, '');
      }
      return response(config, 200, { code: 0, data: result });
    });
    requestClient.instance.defaults.adapter = adapter;

    await expect(
      uploadWithDiagnostics(
        uploadUrl,
        { file: file() },
        {
          silent: true,
        },
      ),
    ).resolves.toEqual(result);
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(mocks.refreshToken).toHaveBeenCalledOnce();
  });

  it('preserves multipart fields, progress, cancellation, timeout and auth headers', async () => {
    const controller = new AbortController();
    const onUploadProgress = vi.fn();
    const image = file();
    const adapter = vi.fn(async (config: InternalAxiosRequestConfig) => {
      expect(config.data).toBeInstanceOf(FormData);
      expect(config.data.get('file')).toBe(image);
      expect(config.data.has('preserveUploadError')).toBe(false);
      expect(config.headers.has('preserveUploadError')).toBe(false);
      expect(config.headers.getContentType()).toBe('multipart/form-data');
      expect(config.headers.Authorization).toBe('Bearer test-access-token');
      expect(config.headers['tenant-id']).toBe('1');
      expect(config.onUploadProgress).toBe(onUploadProgress);
      expect(config.signal).toBe(controller.signal);
      expect(config.timeout).toBe(1_800_000);
      return response(config, 200, {
        code: 0,
        data: { designImageUrl: '/image' },
      });
    });
    requestClient.instance.defaults.adapter = adapter;

    await expect(
      uploadWithDiagnostics(
        uploadUrl,
        { file: image },
        {
          onUploadProgress,
          signal: controller.signal,
          silent: true,
          timeout: 1_800_000,
        },
      ),
    ).resolves.toEqual({ designImageUrl: '/image' });
    expect(adapter).toHaveBeenCalledOnce();
  });

  it('retains the existing rejection body contract for requests that do not opt in', async () => {
    const body = '<html>502 Bad Gateway</html>';
    requestClient.instance.defaults.adapter = async (config) => {
      throw httpError(config, 502, body);
    };

    await expect(
      requestClient.upload(
        uploadUrl,
        { file: file() },
        {
          silent: true,
        },
      ),
    ).rejects.toBe(body);
  });

  it('also preserves errors for result queries that explicitly opt in', async () => {
    requestClient.instance.defaults.adapter = async (config) => {
      expect(config.method).toBe('get');
      throw httpError(config, 503, '<html>Service Unavailable</html>');
    };
    const config = { preserveUploadError: true, silent: true };
    const error = await requestClient
      .get('/upload-result', config)
      .catch((error) => error);

    expect(error).toBeInstanceOf(UploadRequestError);
    expect(error.httpStatus).toBe(503);
  });

  it('shows the diagnostic message in the actual upload queue', async () => {
    requestClient.instance.defaults.adapter = async (config) => {
      throw httpError(config, 504, '<html>Gateway Time-out</html>');
    };
    const store = useUploadTaskStore();
    const id = store.add({
      file: file(),
      upload: (image) =>
        uploadWithDiagnostics(uploadUrl, { file: image }, { silent: true }),
    });

    await vi.waitFor(() => {
      expect(store.getTask(id)).toMatchObject({
        error: '服务器处理超时，请稍后重试（HTTP 504）',
        status: 'error',
      });
    });
  });
});
