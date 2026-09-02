import { requestClient } from '#/api/request';

export namespace FdmWaimaoAiApi {
  export interface CompanyOption {
    id: string;
    name: string;
  }

  export interface SurfaceIdentity {
    businessId: string;
    pageKey: string;
  }

  export interface ModelQuery extends SurfaceIdentity {
    companyId: string;
  }

  export interface ModelOption {
    capabilities: string[];
    code: string;
    enabled: boolean;
    id: string;
    name: string;
  }

  export interface ChatHistoryItem {
    content: string;
    role: 'assistant' | 'user';
  }

  export interface ChatReq {
    businessId: string;
    companyId: string;
    history?: ChatHistoryItem[];
    idempotencyKey: string;
    modelId: string;
    pageKey: string;
    question: string;
  }

  export interface ChatResp {
    answer: string;
    generatedAt?: number | string;
    invocationId?: string;
    modelId: string;
    modelName?: string;
  }
}

const BASE_URL = '/fdmwaimao/ai';

export function getFdmWaimaoAiCompanies(
  params: FdmWaimaoAiApi.SurfaceIdentity,
) {
  return requestClient.get<FdmWaimaoAiApi.CompanyOption[]>(
    `${BASE_URL}/companies`,
    { params },
  );
}

export function getFdmWaimaoAiModels(params: FdmWaimaoAiApi.ModelQuery) {
  return requestClient.get<FdmWaimaoAiApi.ModelOption[]>(`${BASE_URL}/models`, {
    params,
  });
}

export function chatWithFdmWaimaoAi(data: FdmWaimaoAiApi.ChatReq) {
  return requestClient.post<FdmWaimaoAiApi.ChatResp>(`${BASE_URL}/chat`, data, {
    timeout: 75_000,
  });
}
