import { requestClient } from '#/api/request';

export namespace FdmAiApi {
  export type Modality =
    | 'AUDIO'
    | 'EMBEDDING'
    | 'IMAGE'
    | 'MUSIC'
    | 'RERANK'
    | 'TEXT'
    | 'VIDEO';

  export type Capability =
    | 'CHAT'
    | 'EMBEDDING'
    | 'FIRST_FRAME_TO_VIDEO'
    | 'FIRST_LAST_FRAME_TO_VIDEO'
    | 'IMAGE_EDIT'
    | 'IMAGE_INPUT'
    | 'IMAGE_TO_IMAGE'
    | 'MULTI_REFERENCE'
    | 'RERANK'
    | 'STRUCTURED_OUTPUT'
    | 'TEXT_TO_AUDIO'
    | 'TEXT_TO_IMAGE'
    | 'TEXT_TO_MUSIC'
    | 'TEXT_TO_VIDEO';

  export interface AdapterDescriptor {
    code: string;
    configurationSchema?: string;
    credentialSchema?: string;
    modalities: Modality[];
    name: string;
  }

  export interface ProviderAccount {
    adapterCode: string;
    baseUrl: string;
    configuration: Record<string, unknown>;
    createdAt?: string;
    credentialConfigured: boolean;
    credentialMask?: string;
    enabled: boolean;
    id: number;
    name: string;
    platform: boolean;
    tenantId: number;
    updatedAt?: string;
  }

  export interface ProviderSaveReq {
    adapterCode: string;
    baseUrl: string;
    configuration: Record<string, unknown>;
    credential?: string;
    enabled: boolean;
    name: string;
    platform: boolean;
  }

  export interface CredentialCheckResult {
    latencyMillis: number;
    message?: string;
    valid: boolean;
  }

  export interface ModelDefinition {
    capabilities: Capability[];
    code: string;
    createdAt?: string;
    currency?: string;
    enabled: boolean;
    id: number;
    modality: Modality;
    name: string;
    parameterSchema?: string;
    unitPrice?: number;
    updatedAt?: string;
  }

  export type ModelSaveReq = Omit<
    ModelDefinition,
    'createdAt' | 'id' | 'updatedAt'
  >;

  export interface RouteDefinition {
    createdAt?: string;
    enabled: boolean;
    id: number;
    modelId: number;
    platform: boolean;
    providerAccountId: number;
    providerModel: string;
    providerOptions: Record<string, unknown>;
    routeKey: string;
    tenantId: number;
    updatedAt?: string;
  }

  export type RouteSaveReq = Omit<
    RouteDefinition,
    'createdAt' | 'id' | 'tenantId' | 'updatedAt'
  >;

  export interface UsageRecord {
    costAmount?: number;
    currency?: string;
    estimatedCost?: number;
    finishedAt?: string;
    inputUnits?: number;
    invocationId: string;
    logicalModelId: number;
    outputUnits?: number;
    priceVersion?: string;
    providerCode: string;
    startedAt?: string;
    status: string;
    tenantId: number;
  }

  export interface ModelQuery {
    capability?: Capability;
    modality?: Modality;
    routeKey?: string;
  }

  export interface ModelOption {
    capabilities: Capability[];
    code: string;
    enabled: boolean;
    id: number;
    modality: Modality;
    name: string;
    parameterSchema?: string;
  }

  export interface ModelCapabilities {
    capabilities: Capability[];
    logicalModelId: number;
    modality: Modality;
    parameterSchema?: string;
  }
}

const PROVIDERS = '/fdmai/providers';
const MODELS = '/fdmai/models';
const ROUTES = '/fdmai/routes';

export function getFdmAiAdapters() {
  return requestClient.get<FdmAiApi.AdapterDescriptor[]>(
    `${PROVIDERS}/adapters`,
  );
}

export function getFdmAiProviders(includePlatform = true) {
  return requestClient.get<FdmAiApi.ProviderAccount[]>(PROVIDERS, {
    params: { includePlatform },
  });
}

export function createFdmAiProvider(data: FdmAiApi.ProviderSaveReq) {
  return requestClient.post<FdmAiApi.ProviderAccount>(PROVIDERS, data);
}

export function updateFdmAiProvider(
  id: number,
  data: FdmAiApi.ProviderSaveReq,
) {
  return requestClient.put<FdmAiApi.ProviderAccount>(
    `${PROVIDERS}/${id}`,
    data,
  );
}

export function deleteFdmAiProvider(id: number, platform = false) {
  return requestClient.delete<boolean>(`${PROVIDERS}/${id}`, {
    params: { platform },
  });
}

export function testFdmAiProvider(id: number) {
  return requestClient.post<FdmAiApi.CredentialCheckResult>(
    `${PROVIDERS}/${id}/test`,
  );
}

export function getFdmAiModels() {
  return requestClient.get<FdmAiApi.ModelDefinition[]>(MODELS);
}

export function createFdmAiModel(data: FdmAiApi.ModelSaveReq) {
  return requestClient.post<FdmAiApi.ModelDefinition>(MODELS, data);
}

export function updateFdmAiModel(id: number, data: FdmAiApi.ModelSaveReq) {
  return requestClient.put<FdmAiApi.ModelDefinition>(`${MODELS}/${id}`, data);
}

export function deleteFdmAiModel(id: number) {
  return requestClient.delete<boolean>(`${MODELS}/${id}`);
}

export function getFdmAiRoutes(includePlatform = true) {
  return requestClient.get<FdmAiApi.RouteDefinition[]>(ROUTES, {
    params: { includePlatform },
  });
}

export function createFdmAiRoute(data: FdmAiApi.RouteSaveReq) {
  return requestClient.post<FdmAiApi.RouteDefinition>(ROUTES, data);
}

export function updateFdmAiRoute(id: number, data: FdmAiApi.RouteSaveReq) {
  return requestClient.put<FdmAiApi.RouteDefinition>(`${ROUTES}/${id}`, data);
}

export function deleteFdmAiRoute(id: number, platform = false) {
  return requestClient.delete<boolean>(`${ROUTES}/${id}`, {
    params: { platform },
  });
}

export function getFdmAiUsage() {
  return requestClient.get<FdmAiApi.UsageRecord[]>('/fdmai/usage');
}

export function searchFdmAiModels(data: FdmAiApi.ModelQuery) {
  return requestClient.post<FdmAiApi.ModelOption[]>(
    '/fdmai/catalog/models/search',
    data,
  );
}

export function getFdmAiModelCapabilities(id: number) {
  return requestClient.get<FdmAiApi.ModelCapabilities>(
    `/fdmai/catalog/models/${id}/capabilities`,
  );
}
