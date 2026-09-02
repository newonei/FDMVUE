import { requestClient } from '#/api/request';

export namespace FdmProductAiApi {
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
    businessId?: string;
    companyId: string;
    context?: Record<string, unknown>;
    history?: ChatHistoryItem[];
    idempotencyKey: string;
    modelId: string;
    pageKey: string;
    pageTitle: string;
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

const BASE_URL = '/fdmproduct/ai';

export function getFdmProductAiModels() {
  return requestClient.get<FdmProductAiApi.ModelOption[]>(`${BASE_URL}/models`);
}

export function chatWithFdmProductAi(data: FdmProductAiApi.ChatReq) {
  return requestClient.post<FdmProductAiApi.ChatResp>(
    `${BASE_URL}/chat`,
    data,
    {
      timeout: 75_000,
    },
  );
}
