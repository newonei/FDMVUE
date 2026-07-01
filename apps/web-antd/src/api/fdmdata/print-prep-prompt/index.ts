import { requestClient } from '#/api/request';

export namespace PrintPrepPromptApi {
  export interface Row {
    id: number;
    name: string;
    content: string;
    scene: string;
    sort?: number;
    remark?: string;
    createTime?: string;
    updateTime?: string;
  }

  export interface SaveReq {
    id?: number;
    name: string;
    content: string;
    scene?: string;
    sort?: number;
    remark?: string;
  }

  export interface ListReq {
    includeCommon?: boolean;
    keyword?: string;
    scene?: string;
  }
}

export function listPrintPrepPrompts(params?: PrintPrepPromptApi.ListReq) {
  return requestClient.get<PrintPrepPromptApi.Row[]>('/fdmdata/print-prep-prompt/list', {
    params,
  });
}

export function getPrintPrepPrompt(id: number) {
  return requestClient.get<PrintPrepPromptApi.Row>(
    `/fdmdata/print-prep-prompt/get?id=${id}`,
  );
}

export function createPrintPrepPrompt(data: PrintPrepPromptApi.SaveReq) {
  return requestClient.post<number>('/fdmdata/print-prep-prompt/create', data);
}

export function updatePrintPrepPrompt(data: PrintPrepPromptApi.SaveReq) {
  return requestClient.put<boolean>('/fdmdata/print-prep-prompt/update', data);
}

export function deletePrintPrepPrompt(id: number) {
  return requestClient.delete<boolean>(`/fdmdata/print-prep-prompt/delete?id=${id}`);
}
