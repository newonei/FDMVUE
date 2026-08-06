import { requestClient } from '#/api/request';

export namespace JinZhiDocumentApi {
  export type ProbeStatus =
    | 'EMPTY'
    | 'ERROR'
    | 'FORBIDDEN'
    | 'FOUND'
    | 'RATE_LIMITED'
    | 'UNSUPPORTED';

  export interface CatalogItem {
    dataType: number;
    documentName: string;
    docUrl: string;
    editable?: boolean;
  }

  export interface ProbeRequest {
    dataTypes: number[];
  }

  export interface ProbeResult {
    candidateApprovalFields?: string[];
    dataType: number;
    docUrl?: string;
    documented?: boolean;
    documentName?: string;
    editable?: boolean;
    errorCode?: string;
    errorMessage?: string;
    fieldNames?: Record<string, string>;
    sample?: Record<string, unknown>;
    sampleMsgId?: string;
    status: ProbeStatus;
    totalCount?: number;
  }

  export interface DocumentPage {
    candidateApprovalFields?: string[];
    data: Record<string, unknown>[];
    dataType: number;
    documentName?: string;
    fieldNames: Record<string, string>;
    pageNo: number;
    pageSize: number;
    totalCount: number;
  }
}

export function getJinZhiDocumentCatalog() {
  return requestClient.get<JinZhiDocumentApi.CatalogItem[]>(
    '/fdmdingtalk/jinzhi-documents/catalog',
  );
}

export function probeJinZhiDocumentTypes(data: JinZhiDocumentApi.ProbeRequest) {
  return requestClient.post<JinZhiDocumentApi.ProbeResult[]>(
    '/fdmdingtalk/jinzhi-documents/probe',
    data,
  );
}

export function getJinZhiDocumentPage(params: {
  dataType: number;
  pageNo: number;
  pageSize: number;
}) {
  return requestClient.get<JinZhiDocumentApi.DocumentPage>(
    '/fdmdingtalk/jinzhi-documents/page',
    { params },
  );
}
