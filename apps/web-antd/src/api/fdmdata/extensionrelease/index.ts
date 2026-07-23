import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmdataExtensionReleaseApi {
  export interface ExtensionRelease {
    id?: number;
    channel?: string;
    browser?: string;
    version?: string;
    minSupportedVersion?: string;
    downloadUrl?: string;
    crxUrl?: string;
    updateUrl?: string;
    sha256?: string;
    forceUpdate?: number;
    rolloutPercent?: number;
    published?: number;
    releaseNotes?: string;
    publishTime?: string;
    createTime?: string;
    updateTime?: string;
  }

  export interface PackageUploadResp {
    url: string;
    fileName: string;
    sha256: string;
    size: number;
  }
}

export function getExtensionReleasePage(params: PageParam) {
  return requestClient.get<
    PageResult<FdmdataExtensionReleaseApi.ExtensionRelease>
  >('/fdmdata/extension-release/page', { params });
}

export function getExtensionRelease(id: number) {
  return requestClient.get<FdmdataExtensionReleaseApi.ExtensionRelease>(
    `/fdmdata/extension-release/get?id=${id}`,
  );
}

export function createExtensionRelease(
  data: FdmdataExtensionReleaseApi.ExtensionRelease,
) {
  return requestClient.post<number>('/fdmdata/extension-release/create', data);
}

export function uploadExtensionReleasePackage(file: File) {
  return requestClient.upload<FdmdataExtensionReleaseApi.PackageUploadResp>(
    '/fdmdata/extension-release/upload-package',
    { file },
    { timeout: 5 * 60 * 1000 },
  );
}

export function updateExtensionRelease(
  data: FdmdataExtensionReleaseApi.ExtensionRelease,
) {
  return requestClient.put<boolean>('/fdmdata/extension-release/update', data);
}

export function deleteExtensionRelease(id: number) {
  return requestClient.delete<boolean>(
    `/fdmdata/extension-release/delete?id=${id}`,
  );
}
