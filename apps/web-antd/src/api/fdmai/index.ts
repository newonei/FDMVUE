import type { PageParam, PageResult } from '@vben/request';

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
    capabilities: Capability[];
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

  export interface ProviderModelInfo {
    capabilities?: Capability[];
    classificationConfidence?: 'HIGH' | 'LOW' | 'MEDIUM';
    classificationNote?: string;
    classificationSource?: 'FALLBACK' | 'MODEL_PATTERN' | 'PROVIDER_METADATA';
    id: string;
    importable?: boolean;
    metadata: Record<string, unknown>;
    modality?: Modality;
    name?: string;
    ownedBy?: string;
    requiresConfirmation?: boolean;
  }

  export interface ProviderProbeReq {
    discoverModels: boolean;
    provider: ProviderSaveReq;
  }

  export interface ProviderProbeResult {
    check: CredentialCheckResult;
    models: ProviderModelInfo[];
    normalizedBaseUrl: string;
    warning?: string;
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

  export interface ProviderModelImportItem {
    capabilities?: Capability[];
    code?: string;
    currency?: string;
    modality?: Modality;
    name?: string;
    parameterSchema?: string;
    providerModel: string;
    providerOptions?: Record<string, unknown>;
    routeKey?: string;
    unitPrice?: number;
  }

  export interface ProviderModelImportReq {
    models: ProviderModelImportItem[];
    providerAccountId: number;
  }

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

  export interface ImportedModel {
    created: boolean;
    model: ModelDefinition;
    route: RouteDefinition;
  }

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
    modality?: Modality;
    requiredCapabilities?: Capability[];
    routeKey?: string;
  }

  export interface ModelOption {
    capabilities: Capability[];
    code: string;
    enabled: boolean;
    id: number | string;
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

  export type DateTimeValue = number | string;
  export type NumericValue = number | string;

  export interface InvocationPageReq extends PageParam {
    keyword?: string;
    logicalModelId?: number;
    providerCode?: string;
    status?: string;
  }

  export interface InvocationPageItem {
    businessId?: string;
    businessType?: string;
    capability?: Capability;
    caller?: string;
    createdAt?: DateTimeValue;
    durationMillis?: number;
    errorCode?: string;
    errorMessage?: string;
    externalTaskId?: string;
    id: string;
    logicalModelId?: number;
    modality?: Modality;
    progress?: number;
    providerCode?: string;
    providerModel?: string;
    requestSummary?: string;
    resultText?: string;
    resultUrl?: string;
    status: string;
    updatedAt?: DateTimeValue;
  }

  export interface InvocationInput {
    negativePrompt?: string;
    prompt?: string;
    referenceUrls?: string[];
    variables?: Record<string, unknown>;
  }

  export interface InvocationRequestSnapshot {
    additionalRequiredCapabilities?: Capability[];
    businessId?: string;
    businessType?: string;
    caller?: string;
    capability?: Capability;
    commonParameters?: Record<string, unknown>;
    idempotencyKey?: string;
    input?: InvocationInput;
    logicalModelId?: number;
    maxCost?: NumericValue;
    modality?: Modality;
    providerOptions?: Record<string, unknown>;
    quoteId?: string;
    routeKey?: string;
  }

  export interface InvocationOutput {
    metadata?: Record<string, unknown>;
    mimeType?: string;
    text?: string;
    type: string;
    url?: string;
  }

  export interface InvocationSubmitReq {
    additionalRequiredCapabilities?: Capability[];
    businessId: string;
    businessType: string;
    caller: string;
    capability: Capability;
    commonParameters: Record<string, unknown>;
    idempotencyKey: string;
    input: InvocationInput;
    logicalModelId: number;
    maxCost?: NumericValue;
    modality: Modality;
    providerOptions: Record<string, unknown>;
    quoteId?: string;
    routeKey?: string;
  }

  export interface InvocationTicket {
    invocationId: string;
    status: string;
  }

  export interface InvocationSnapshot {
    createdAt?: DateTimeValue;
    errorCode?: string;
    errorMessage?: string;
    invocationId: string;
    logicalModelId?: number;
    outputs: InvocationOutput[];
    progress: number;
    providerCode?: string;
    status: string;
    updatedAt?: DateTimeValue;
  }

  export interface InvocationAttempt {
    attemptNo?: number;
    failureCode?: string;
    finishedAt?: DateTimeValue;
    id: number;
    providerTaskId?: string;
    retryable?: boolean;
    startedAt?: DateTimeValue;
    status: string;
  }

  export interface InvocationEvent {
    invocationId: string;
    message?: string;
    occurredAt?: DateTimeValue;
    sequence: number;
    status?: string;
    type: string;
  }

  export interface InvocationUsage {
    costAmount?: NumericValue;
    currency?: string;
    estimatedCost?: NumericValue;
    finishedAt?: DateTimeValue;
    inputUnits?: NumericValue;
    outputUnits?: NumericValue;
    priceVersion?: string;
  }

  export interface InvocationDetail extends InvocationPageItem {
    attempts: InvocationAttempt[];
    events: InvocationEvent[];
    modelCurrency?: string;
    outputs: InvocationOutput[];
    priceVersion?: string;
    providerAccountId?: number;
    requestSnapshot?: InvocationRequestSnapshot;
    routeId?: number;
    usage?: InvocationUsage;
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

export function probeFdmAiProvider(data: FdmAiApi.ProviderProbeReq) {
  return requestClient.post<FdmAiApi.ProviderProbeResult>(
    `${PROVIDERS}/probe`,
    data,
  );
}

export function discoverFdmAiProviderModels(id: number) {
  return requestClient.get<FdmAiApi.ProviderModelInfo[]>(
    `${PROVIDERS}/${id}/models`,
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

export function importFdmAiProviderModels(
  data: FdmAiApi.ProviderModelImportReq,
) {
  return requestClient.post<FdmAiApi.ImportedModel[]>(`${MODELS}/import`, data);
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

export function getFdmAiInvocationPage(params: FdmAiApi.InvocationPageReq) {
  return requestClient.get<PageResult<FdmAiApi.InvocationPageItem>>(
    '/fdmai/invocations/page',
    { params },
  );
}

export function submitFdmAiInvocation(data: FdmAiApi.InvocationSubmitReq) {
  return requestClient.post<FdmAiApi.InvocationTicket>(
    '/fdmai/invocations',
    data,
  );
}

export function getFdmAiInvocation(id: string) {
  return requestClient.get<FdmAiApi.InvocationSnapshot>(
    `/fdmai/invocations/${encodeURIComponent(id)}`,
  );
}

export function getFdmAiInvocationDetail(id: string) {
  return requestClient.get<FdmAiApi.InvocationDetail>(
    `/fdmai/invocations/${encodeURIComponent(id)}/detail`,
  );
}

export function cancelFdmAiInvocation(id: string) {
  return requestClient.post<boolean>(
    `/fdmai/invocations/${encodeURIComponent(id)}/cancel`,
  );
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
