import type { RequestClient, RequestClientConfig } from '@vben/request';

export interface DiagnosticUploadConfig extends RequestClientConfig {
  /** 仅在本地响应拦截器中使用，不会作为请求头或表单字段发送。 */
  preserveUploadError?: boolean;
}

/**
 * 共享 request() 会将带 response 的异常解包为响应体。用 cause 保留原始异常，
 * 避免 HTML/空响应丢失 HTTP 状态；其他请求继续遵循原有错误契约。
 */
export class UploadRequestError extends Error {
  readonly businessCode?: number | string;
  readonly code?: string;
  readonly httpStatus?: number;

  constructor(error: unknown) {
    super('文件上传请求失败', { cause: error });
    this.name = 'UploadRequestError';
    const original = (error ?? {}) as Record<string, any>;
    const status = original.response?.status;
    if (typeof status === 'number') this.httpStatus = status;
    if (typeof original.code === 'string') this.code = original.code;
    const businessCode = original.response?.data?.code ?? original.data?.code;
    if (typeof businessCode === 'number' || typeof businessCode === 'string') {
      this.businessCode = businessCode;
    }
  }
}

/** 在认证、业务错误和全局消息拦截器之后安装，一次只影响显式启用的上传。 */
export function createUploadWithDiagnostics(client: RequestClient) {
  client.addResponseInterceptor({
    rejected(error) {
      const config = (error?.config ?? error?.response?.config) as
        | DiagnosticUploadConfig
        | undefined;
      return Promise.reject(
        config?.preserveUploadError ? new UploadRequestError(error) : error,
      );
    },
  });

  return <T = any>(
    url: string,
    data: Record<string, any> & { file: Blob | File },
    config?: RequestClientConfig,
  ): Promise<T> => {
    const uploadConfig: DiagnosticUploadConfig = {
      ...config,
      preserveUploadError: true,
    };
    return client.upload<T>(url, data, uploadConfig);
  };
}
