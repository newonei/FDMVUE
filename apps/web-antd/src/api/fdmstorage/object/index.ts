import type { AxiosRequestConfig } from '@vben/request';

import { requestClient } from '#/api/request';

export const FDM_OBJECT_UPLOAD_TIMEOUT = 5 * 60 * 1000;

/** Upload progress callback accepted by the shared request client. */
export type AxiosProgressEvent = AxiosRequestConfig['onUploadProgress'];

export namespace FdmStorageObjectApi {
  export interface UploadRequest {
    directory?: string;
    file: globalThis.File;
  }

  export interface UploadResponse {
    objectId?: number | string;
    path?: string;
    size?: number;
    type?: string;
    url?: string;
  }
}

/** Upload an FDM-owned object without depending on the official Infra file API. */
export function uploadFdmObject(
  data: FdmStorageObjectApi.UploadRequest,
  onUploadProgress?: AxiosProgressEvent,
) {
  const payload = { ...data };
  if (!payload.directory?.trim()) delete payload.directory;
  return requestClient.upload<FdmStorageObjectApi.UploadResponse | string>(
    '/fdmstorage/object/upload',
    payload,
    {
      onUploadProgress,
      timeout: FDM_OBJECT_UPLOAD_TIMEOUT,
    },
  );
}
