import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';
import type { FdmgongchangWageApi } from '#/api/fdmgongchang/wage';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { CardApiError } from '../dingtalk-card/api';

interface Envelope<T> {
  code: number;
  data: T;
  msg?: string;
}

export interface ReportContext {
  accessToken: string;
  factoryId: number;
  tenantId: number;
}

const WORKBENCH = '/fdmgongchang/workbench';
const REQUEST_TIMEOUT = 15_000;
const UPLOAD_TIMEOUT = 120_000;

/** 报工页用的接口，和网页工作台是同一套；这个页面不加载整个后台，所以不走 requestClient。 */
export function createReportApi(
  apiBase: string,
  fetcher: typeof fetch = fetch,
) {
  const base = apiBase.replace(/\/+$/, '');

  async function call<T>(
    context: ReportContext,
    path: string,
    init: {
      body?: BodyInit;
      json?: unknown;
      method?: string;
      timeout?: number;
    } = {},
  ) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      init.timeout ?? REQUEST_TIMEOUT,
    );
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${context.accessToken}`,
      'factory-id': String(context.factoryId),
      'tenant-id': String(context.tenantId),
    };
    if (init.json !== undefined) headers['Content-Type'] = 'application/json';
    try {
      const response = await fetcher(`${base}${path}`, {
        body: init.json === undefined ? init.body : JSON.stringify(init.json),
        cache: 'no-store',
        credentials: 'omit',
        headers,
        method: init.method ?? 'GET',
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new CardApiError(
          response.status,
          response.status === 401 ? '登录已过期' : '网络不太好，请再试一次',
        );
      }
      const envelope = (await response.json()) as Envelope<T>;
      if (envelope.code !== 0) {
        throw new CardApiError(envelope.code, envelope.msg || '操作失败');
      }
      return envelope.data;
    } catch (error) {
      if (error instanceof CardApiError) throw error;
      throw new Error('网络不太好，请再试一次', { cause: error });
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    my: (context: ReportContext) => call<Api.My>(context, `${WORKBENCH}/my`),
    options: (context: ReportContext) =>
      call<StockApi.Options>(context, `${WORKBENCH}/options`),
    prepare: (context: ReportContext, taskId: number) =>
      call<Api.TaskPrepare>(context, `${WORKBENCH}/task/prepare?id=${taskId}`),
    report: (context: ReportContext, data: Api.TaskReportReq) =>
      call<number>(context, `${WORKBENCH}/task/report`, {
        json: data,
        method: 'POST',
      }),
    upload(context: ReportContext, file: Blob, name: string) {
      const form = new FormData();
      form.append('file', file, name);
      form.append('directory', 'fdmgongchang/issue-sheet');
      return call<string>(context, '/fdmstorage/object/upload', {
        body: form,
        method: 'POST',
        timeout: UPLOAD_TIMEOUT,
      });
    },
    wageMatch(
      context: ReportContext,
      params: {
        length?: null | number;
        process: string;
        thickness?: null | number;
        width?: null | number;
      },
    ) {
      const query = new URLSearchParams({ process: params.process });
      for (const key of ['length', 'thickness', 'width'] as const) {
        const value = params[key];
        if (value !== null && value !== undefined)
          query.set(key, String(value));
      }
      return call<FdmgongchangWageApi.Match[]>(
        context,
        `${WORKBENCH}/wage-match?${query}`,
      );
    },
  };
}

/** 手机照片动辄几兆，传之前缩到看得清字的大小；压不了（比如 HEIC）就传原图。 */
export async function shrinkPhoto(file: File, maxSide = 1600): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext('2d')
      ?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.82),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
