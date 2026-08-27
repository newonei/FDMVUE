import type { PageParam, PageResult } from '@vben/request';

import type { FdmAiApi } from '#/api/fdmai';

import { requestClient } from '#/api/request';

export namespace FdmCreativeApi {
  export type ProjectStatus = 'ACTIVE' | 'ARCHIVED';
  export type ProjectMemberRole = 'EDITOR' | 'OWNER' | 'RUNNER' | 'VIEWER';
  export type PlanMode = 'IMAGE_SET' | 'MIXED' | 'VIDEO_SEQUENCE';
  export type PlanItemKind = 'IMAGE' | 'VIDEO';
  export type ExecutionScope = 'DOWNSTREAM' | 'FULL' | 'NODE';
  export type ExecutionStatus =
    | 'CANCEL_REQUESTED'
    | 'CANCELED'
    | 'CREATED'
    | 'FAILED'
    | 'PARTIAL_SUCCESS'
    | 'RUNNING'
    | 'SUCCEEDED';
  export type NodeRunStatus =
    | 'ARCHIVING_AI'
    | 'BLOCKED'
    | 'CANCEL_REQUESTED'
    | 'CANCELED'
    | 'FAILED'
    | 'PENDING'
    | 'RUNNING'
    | 'SKIPPED'
    | 'STALE'
    | 'SUCCEEDED'
    | 'WAITING_AI';
  export type PortDirection = 'INPUT' | 'OUTPUT';
  export type PortType =
    | 'artifact-set'
    | 'audio-asset'
    | 'audio-list'
    | 'content-plan'
    | 'creative-brief'
    | 'image-asset'
    | 'image-list'
    | 'image-plan-item'
    | 'prompt-text'
    | 'timeline'
    | 'video-asset'
    | 'video-list'
    | 'video-plan-item';

  export interface Project {
    coverAssetId?: number;
    createTime?: string;
    creator?: string;
    currentRevisionId?: number;
    currentUserRole: ProjectMemberRole;
    description?: string;
    draftVersion: number;
    id: number;
    name: string;
    ownerUserId?: number;
    status: ProjectStatus;
    updateTime?: string;
  }

  export type ProjectPageParams = PageParam & {
    keyword?: string;
    status?: ProjectStatus;
  };

  export interface ProjectSaveReq {
    coverAssetId?: number;
    description?: string;
    id?: number;
    name: string;
  }

  export interface ProjectMember {
    id?: number;
    role: ProjectMemberRole;
    userId: number;
  }

  export interface ProjectMemberSaveReq {
    members: Array<{
      role: Exclude<ProjectMemberRole, 'OWNER'>;
      userId: number;
    }>;
    projectId: number;
  }

  export interface WorkflowPort {
    direction: PortDirection;
    id: string;
    required?: boolean;
    type: PortType;
  }

  export interface WorkflowNode {
    config: Record<string, unknown>;
    height: number;
    id: string;
    name: string;
    ports: WorkflowPort[];
    type: string;
    width: number;
    x: number;
    y: number;
  }

  export interface WorkflowEdge {
    id: string;
    sourceNodeId: string;
    sourcePortId: string;
    targetNodeId: string;
    targetPortId: string;
  }

  export interface WorkflowDefinition {
    edges: WorkflowEdge[];
    nodes: WorkflowNode[];
    schemaVersion: 1;
    viewport: {
      x: number;
      y: number;
      zoom: number;
    };
  }

  export interface WorkflowDraft {
    currentRevisionId?: number;
    definition: WorkflowDefinition;
    /** Server-calculated SHA-256 of the normalized draft. */
    definitionHash?: string;
    draftVersion: number;
    projectId?: number;
    /** New P2 fields tolerate legacy number serialization during rollout. */
    savedByUserId?: number | string;
    savedTime?: number | string;
    staleNodeIds?: string[];
  }

  export interface WorkflowCapability {
    autosaveEnabled: boolean;
    mediaToolsEnabled: boolean;
  }

  export interface WorkflowExportDocument {
    definition: WorkflowDefinition;
    exportedAt: number;
    format: 'FdmCreativeWorkflowExport';
    metadata: {
      definitionSchemaVersion: number;
      edgeCount: number;
      nodeCount: number;
    };
    schemaVersion: 1;
  }

  export interface WorkflowImportAssetIssue {
    assetId: string;
    configPath: string;
    nodeId: string;
    reason: string;
  }

  export interface WorkflowImportPreview {
    canImport: boolean;
    clearedAssetReferences: WorkflowImportAssetIssue[];
    definition: WorkflowDefinition;
    definitionHash: string;
    edgeCount: number;
    nodeCount: number;
    unavailableAssetReferences: WorkflowImportAssetIssue[];
  }

  export interface WorkflowImportResult {
    draft: WorkflowDraft;
    report: WorkflowImportPreview;
  }

  export interface WorkflowRevision {
    createTime?: string;
    creator?: string;
    id: number;
    projectId: number;
    revisionNo?: number;
  }

  export interface ImagePlanConfig {
    aspectRatio?: string;
    composition?: string;
    height?: number;
    lighting?: string;
    outputCount?: number;
    width?: number;
  }

  export interface VideoPlanConfig {
    action?: string;
    cameraMovement?: string;
    durationSeconds?: number;
    firstFrameAssetId?: number;
    lastFrameAssetId?: number;
    shotSize?: string;
    transition?: string;
  }

  export interface ContentPlanItem {
    continuityGroup?: string;
    image?: ImagePlanConfig;
    itemId: string;
    kind: PlanItemKind;
    negativePrompt?: string;
    order: number;
    prompt: string;
    purpose?: string;
    referenceAssetIds?: number[];
    title: string;
    video?: VideoPlanConfig;
  }

  export interface ContentPlan {
    items: ContentPlanItem[];
    mode: PlanMode;
    originalPrompt?: string;
    schemaVersion?: 1;
  }

  export interface PlanPreviewReq {
    imageCount?: number;
    logicalModelId?: string;
    mode: PlanMode;
    plan?: ContentPlan;
    projectId: number;
    prompt: string;
    referenceAssetIds?: number[];
    videoCount?: number;
  }

  export interface PlanDiff {
    addedItemIds?: string[];
    changedItemIds?: string[];
    removedItemIds?: string[];
  }

  export interface PlanPreviewResp {
    diff?: PlanDiff;
    errorMessage?: string;
    invocationId?: string;
    plan?: ContentPlan;
    planRevisionId?: number;
    quote?: {
      currency?: string;
      estimatedCost?: number;
    };
    status: 'FAILED' | 'GENERATING' | 'PREVIEW' | 'REPAIRING';
  }

  export interface Execution {
    completedTime?: string;
    failedNodeCount?: number;
    id: number;
    projectId: number;
    scope?: ExecutionScope;
    startNodeId?: string;
    startedTime?: string;
    status: ExecutionStatus;
    succeededNodeCount?: number;
    totalNodeCount?: number;
    /** The node runs are included in both task detail and task-list responses. */
    nodeRuns?: NodeRun[];
    workflowDraftVersion?: number;
    workflowRevisionId?: number;
  }

  export type ExecutionPageParams = PageParam & {
    projectId?: number;
    status?: ExecutionStatus;
  };

  export interface NodeRun {
    attemptNo?: number;
    completedTime?: string;
    errorCode?: string;
    errorMessage?: string;
    fdmaiInvocationId?: string;
    id: number;
    /** Immutable node configuration captured when this task was created. */
    inputJson?: string;
    nodeId: string;
    nodeType?: string;
    outputJson?: string;
    startedTime?: string;
    status: NodeRunStatus;
  }

  export type ExecutionDetail = Execution;

  export interface PromptRefineResp {
    errorMessage?: string;
    invocationId?: string;
    refinedPrompt?: string;
    refinementId: number;
    status: 'FAILED' | 'GENERATING' | 'SUCCEEDED';
  }

  export type AgentImageTaskStatus =
    | 'CANCEL_REQUESTED'
    | 'CANCELED'
    | 'CREATED'
    | 'FAILED'
    | 'LAUNCHING'
    | 'RUNNING'
    | 'SUCCEEDED';

  /** Safe release limits for the direct-image Creative Agent. */
  export interface AgentImageCapability {
    enabled: boolean;
    maxOutputCount: number;
    maxPromptBytes: number;
    maxReferenceCount: number;
  }

  /** A durable direct Agent request; output URLs are existing private creative asset URLs. */
  export interface AgentImageTask {
    attemptNo: number;
    completedTime?: string;
    createTime?: string;
    errorCode?: string;
    errorMessage?: string;
    executionId?: number;
    id: number;
    logicalModelId?: string;
    negativePrompt?: string;
    nodeId?: string;
    nodeRunId?: number;
    outputAssets: CreativeAsset[];
    projectId: number;
    prompt: string;
    resultAssetId?: number;
    startedTime?: string;
    status: AgentImageTaskStatus;
    updateTime?: string;
  }

  export interface CreativeAsset {
    createTime?: string;
    creator?: string;
    expiresAt?: string;
    fileId?: number;
    id: number;
    kind: 'AUDIO' | 'DOCUMENT' | 'IMAGE' | 'OTHER' | 'VIDEO';
    metadataJson?: string;
    mimeType?: string;
    name: string;
    projectId: number;
    projectName?: string;
    sha256?: string;
    size?: number;
    sourceNodeRunId?: number;
    sourceType?: string;
    updateTime?: string;
    url?: string;
  }

  export interface CreativeAssetCreateReq {
    kind: CreativeAsset['kind'];
    name: string;
    projectId: number;
    url: string;
  }

  export type PromptTargetType = 'GENERAL' | 'IMAGE' | 'VIDEO';
  export type PromptVisibility = 'PERSONAL' | 'TENANT';
  export type PromptCategory =
    | 'BRAND_VISUAL'
    | 'CAMERA_SHOT'
    | 'COPYWRITING'
    | 'GENERAL'
    | 'ILLUSTRATION_ANIME'
    | 'NEGATIVE_PROMPT'
    | 'PORTRAIT'
    | 'PRODUCT_ECOMMERCE'
    | 'PROMPT_OPTIMIZATION'
    | 'SCENE_SPACE'
    | 'SOCIAL_POSTER'
    | 'VIDEO_SCRIPT';

  export interface CreativePrompt {
    category: PromptCategory;
    content: string;
    createTime?: string;
    creator?: string;
    description?: string;
    editable: boolean;
    id: number;
    name: string;
    ownerUserId: number;
    tags?: string;
    targetType: PromptTargetType;
    updateTime?: string;
    visibility: PromptVisibility;
  }

  export interface CreativePromptCategory {
    code: PromptCategory;
    description: string;
    label: string;
  }

  export type CreativePromptPageParams = PageParam & {
    category?: PromptCategory;
    compatibleTargetType?: PromptTargetType;
    keyword?: string;
    mineOnly?: boolean;
    targetType?: PromptTargetType;
    visibility?: PromptVisibility;
  };

  export interface CreativePromptSaveReq {
    category: PromptCategory;
    content: string;
    description?: string;
    id?: number;
    name: string;
    tags?: string;
    targetType: PromptTargetType;
    visibility: PromptVisibility;
  }

  /**
   * Agent-specific Long values are always represented as decimal strings. The legacy workbench
   * APIs predate this rule, but new Agent state must never pass a Snowflake-style identifier
   * through a JavaScript number.
   */
  export type AgentLongId = string;

  export type AgentConversationStatus = 'ACTIVE' | 'ARCHIVED';
  export type AgentMessageRole = 'ASSISTANT' | 'SYSTEM' | 'USER';
  export type AgentReferenceType = 'ASSET' | 'NODE' | 'PROMPT';
  export type AgentRunStatus =
    | 'APPLIED'
    | 'APPLYING'
    | 'CANCEL_REQUESTED'
    | 'CANCELED'
    | 'CONFLICT'
    | 'CREATED'
    | 'FAILED'
    | 'PLANNING'
    | 'READY';
  export type CanvasPatchOperationType =
    | 'ADD_NODE'
    | 'CONNECT'
    | 'DELETE_NODE'
    | 'DISCONNECT'
    | 'MOVE_NODE'
    | 'RENAME_NODE'
    | 'UPDATE_NODE_CONFIG';
  export type CanvasPatchPlacement = 'ABOVE' | 'BELOW' | 'LEFT' | 'RIGHT';
  export type CanvasPatchSuggestedRunScope =
    | 'DOWNSTREAM'
    | 'FULL'
    | 'NODE'
    | 'NONE';

  export interface AgentReference {
    id: string;
    type: AgentReferenceType;
  }

  export interface AgentConversation {
    createTime?: string;
    createdByUserId: AgentLongId;
    id: AgentLongId;
    lastMessageSequence?: AgentLongId;
    lastRunId?: AgentLongId;
    projectId: AgentLongId;
    status: AgentConversationStatus;
    title: string;
    updateTime?: string;
  }

  export interface AgentMessage {
    content: string;
    conversationId: AgentLongId;
    createTime?: string;
    id: AgentLongId;
    references?: AgentReference[];
    role: AgentMessageRole;
    runId?: AgentLongId;
    sequenceNo: AgentLongId;
  }

  export interface CanvasPatchOperation {
    config?: Record<string, unknown>;
    edgeId?: string;
    name?: string;
    nodeId?: string;
    nodeType?: string;
    operationId: string;
    placement?: CanvasPatchPlacement;
    relativeToNodeId?: string;
    sourceNodeId?: string;
    sourcePortId?: string;
    targetNodeId?: string;
    targetPortId?: string;
    type: CanvasPatchOperationType;
    x?: number;
    y?: number;
  }

  export interface CanvasPatch {
    baseDraftVersion: number;
    operations: CanvasPatchOperation[];
    schemaVersion: 1;
    suggestedRun?: {
      scope: CanvasPatchSuggestedRunScope;
      startNodeId?: string;
    };
    summary?: string;
    warnings?: string[];
  }

  export interface AgentRun {
    appliedDraftVersion?: number;
    attemptNo: number;
    baseDraftVersion: number;
    completedTime?: string;
    conversationId: AgentLongId;
    createTime?: string;
    errorCode?: string;
    errorMessage?: string;
    executionId?: AgentLongId;
    id: AgentLongId;
    invocationId?: string;
    logicalModelId?: AgentLongId;
    patch?: CanvasPatch;
    planningStartedTime?: string;
    projectId: AgentLongId;
    repairAttempted?: boolean;
    requestMessageId: AgentLongId;
    status: AgentRunStatus;
    suggestedRunScope?: CanvasPatchSuggestedRunScope;
    suggestedStartNodeId?: string;
    summary?: string;
  }

  export interface AgentEvent {
    eventTime?: string;
    eventType: string;
    payloadJson?: string;
    sequenceNo: AgentLongId;
  }

  export interface AgentCapability {
    enabled: boolean;
    routeKey: string;
  }

  export interface AgentApplyResp {
    affectedNodeIds?: string[];
    destructiveOperationIds?: string[];
    draft?: WorkflowDraft;
    run: AgentRun;
    status: AgentRunStatus;
  }

  /** All P3 result-history identifiers stay decimal strings in browser state. */
  export type MediaLongId = string;

  export type NodeResultAssetAvailability = 'ACTIVE' | 'EXPIRED' | 'MISSING';

  export interface NodeResultAsset {
    adopted: boolean;
    availability: NodeResultAssetAvailability;
    deleteEligible: boolean;
    durationMillis?: number;
    height?: number;
    id?: MediaLongId;
    kind?: 'AUDIO' | 'IMAGE' | 'VIDEO';
    mimeType?: string;
    name?: string;
    size?: number;
    unavailableReason?: string;
    url?: string;
    width?: number;
  }

  export interface NodeResultVersion {
    adoptedAssetId?: MediaLongId;
    adoptedNodeRunId?: MediaLongId;
    assets: NodeResultAsset[];
    attemptNo?: number;
    completedTime?: string;
    cost?: {
      costAmount?: number;
      currency?: string;
      estimatedCost?: number;
      priceVersion?: string;
    };
    model?: {
      logicalModelId?: MediaLongId;
      name?: string;
      providerCode?: string;
    };
    nodeRunId: MediaLongId;
    nodeType?: string;
    selectionStatus?: 'CURRENT' | 'STALE';
    selectionVersion: number;
    semanticFingerprint?: string;
    startedTime?: string;
  }

  export type NodeResultPageParams = PageParam & {
    nodeId: string;
    projectId: number;
  };

  export interface NodeResultAdoptReq {
    assetId: MediaLongId;
    confirmStale?: boolean;
    expectedSelectionVersion: number;
    nodeId: string;
    nodeRunId: MediaLongId;
    projectId: number;
  }

  export interface NodeResultAdoption {
    adoptedAssetId?: MediaLongId;
    adoptedNodeRunId?: MediaLongId;
    selectionTime?: string;
    selectionUserId?: MediaLongId;
    selectionVersion: number;
    status: 'CURRENT' | 'STALE';
  }

  export interface MediaToolDescriptor {
    applicableAssetKinds: Array<'AUDIO' | 'IMAGE' | 'VIDEO'>;
    available: boolean;
    defaultConfig: Record<string, unknown>;
    generatedNodeType: string;
    id: string;
    inputPort: string;
    label: string;
    localExecution: boolean;
    outputPlacement: 'RIGHT';
    requiredCapability?: string;
    schemaVersion: 1;
    template?: 'MULTI_ANGLE_V1';
    unavailableReason?: string;
  }
}

const PROJECT = '/fdmcreative/project';
const WORKFLOW = '/fdmcreative/workflow';
const PLAN = '/fdmcreative/plan';
const EXECUTION = '/fdmcreative/execution';
const ASSET = '/fdmcreative/asset';
const PROMPT = '/fdmcreative/prompt';
const AGENT = '/fdmcreative/agent';
const AGENT_IMAGE = '/fdmcreative/agent-image';
const NODE_RESULT = '/fdmcreative/node-result';
const MEDIA_TOOL = '/fdmcreative/media-tool';

export function getCreativeProjectPage(
  params: FdmCreativeApi.ProjectPageParams,
) {
  return requestClient.get<PageResult<FdmCreativeApi.Project>>(
    `${PROJECT}/page`,
    { params },
  );
}

export function getCreativeProject(id: number) {
  return requestClient.get<FdmCreativeApi.Project>(`${PROJECT}/get`, {
    params: { id },
  });
}

export function createCreativeProject(data: FdmCreativeApi.ProjectSaveReq) {
  return requestClient.post<number>(`${PROJECT}/create`, data);
}

export function updateCreativeProject(data: FdmCreativeApi.ProjectSaveReq) {
  return requestClient.put<boolean>(`${PROJECT}/update`, data);
}

export function deleteCreativeProject(id: number) {
  return requestClient.delete<boolean>(`${PROJECT}/delete`, { params: { id } });
}

export function getCreativeProjectMembers(projectId: number) {
  return requestClient.get<FdmCreativeApi.ProjectMember[]>(
    `${PROJECT}/members`,
    { params: { projectId } },
  );
}

export function saveCreativeProjectMembers(
  data: FdmCreativeApi.ProjectMemberSaveReq,
) {
  return requestClient.put<boolean>(`${PROJECT}/members`, data);
}

export function getWorkflowDraft(projectId: number) {
  return requestClient.get<FdmCreativeApi.WorkflowDraft>(`${WORKFLOW}/draft`, {
    params: { projectId },
  });
}

export function getWorkflowCapability(projectId: number) {
  return requestClient.get<FdmCreativeApi.WorkflowCapability>(
    `${WORKFLOW}/capability`,
    { params: { projectId } },
  );
}

export function saveWorkflowDraft(data: {
  definition: FdmCreativeApi.WorkflowDefinition;
  definitionHash: string;
  expectedDraftVersion: number;
  mutationId: string;
  projectId: number;
}) {
  return requestClient.put<FdmCreativeApi.WorkflowDraft>(
    `${WORKFLOW}/draft`,
    data,
  );
}

export function exportWorkflowDraft(projectId: number) {
  return requestClient.get<FdmCreativeApi.WorkflowExportDocument>(
    `${WORKFLOW}/export`,
    { params: { projectId } },
  );
}

export function previewWorkflowImport(data: {
  clearUnavailableAssetReferences?: boolean;
  document: string;
  projectId: number;
}) {
  return requestClient.post<FdmCreativeApi.WorkflowImportPreview>(
    `${WORKFLOW}/import/preview`,
    data,
  );
}

export function importWorkflowDraft(data: {
  clearUnavailableAssetReferences?: boolean;
  definitionHash: string;
  document: string;
  expectedDraftVersion: number;
  mutationId: string;
  projectId: number;
  replaceConfirmed: true;
}) {
  return requestClient.post<FdmCreativeApi.WorkflowImportResult>(
    `${WORKFLOW}/import`,
    data,
  );
}

export function publishWorkflow(data: {
  expectedDraftVersion: number;
  projectId: number;
}) {
  return requestClient.post<number>(`${WORKFLOW}/publish`, data);
}

export function getWorkflowRevisions(projectId: number) {
  return requestClient.get<FdmCreativeApi.WorkflowRevision[]>(
    `${WORKFLOW}/revision-list`,
    { params: { projectId } },
  );
}

export function previewContentPlan(data: FdmCreativeApi.PlanPreviewReq) {
  return requestClient.post<FdmCreativeApi.PlanPreviewResp>(
    `${PLAN}/preview`,
    data,
  );
}

export function getLatestContentPlan(projectId: number) {
  return requestClient.get<FdmCreativeApi.PlanPreviewResp | null>(
    `${PLAN}/latest`,
    { params: { projectId } },
  );
}

export function syncContentPlan(planRevisionId: number) {
  return requestClient.post<FdmCreativeApi.PlanPreviewResp>(
    `${PLAN}/sync`,
    undefined,
    { params: { planRevisionId } },
  );
}

export function refineCreativePrompt(data: {
  logicalModelId?: string;
  projectId: number;
  prompt: string;
}) {
  return requestClient.post<FdmCreativeApi.PromptRefineResp>(
    `${PLAN}/refine`,
    data,
  );
}

export function syncCreativePrompt(refinementId: number) {
  return requestClient.post<FdmCreativeApi.PromptRefineResp>(
    `${PLAN}/refine-sync`,
    undefined,
    { params: { refinementId } },
  );
}

export function getAgentImageCapability() {
  return requestClient.get<FdmCreativeApi.AgentImageCapability>(
    `${AGENT_IMAGE}/capability`,
  );
}

export function getAgentImageModels() {
  return requestClient.get<FdmAiApi.ModelOption[]>(`${AGENT_IMAGE}/models`);
}

export function generateAgentImage(data: {
  aspectRatio?: string;
  idempotencyKey: string;
  /** Java Long IDs are serialized as decimal strings to avoid JavaScript precision loss. */
  logicalModelId?: string;
  modelParameters?: Record<string, unknown>;
  negativePrompt?: string;
  outputCount?: number;
  projectId: number;
  prompt: string;
  referenceAssetIds?: number[];
}) {
  return requestClient.post<FdmCreativeApi.AgentImageTask>(
    `${AGENT_IMAGE}/generate`,
    data,
  );
}

export function getAgentImageTaskPage(
  params: PageParam & { projectId: number },
) {
  return requestClient.get<PageResult<FdmCreativeApi.AgentImageTask>>(
    `${AGENT_IMAGE}/task/page`,
    { params },
  );
}

export function cancelAgentImageTask(data: {
  projectId: number;
  taskId: number;
}) {
  return requestClient.post<FdmCreativeApi.AgentImageTask>(
    `${AGENT_IMAGE}/task/cancel`,
    data,
  );
}

export function retryAgentImageTask(data: {
  projectId: number;
  taskId: number;
}) {
  return requestClient.post<FdmCreativeApi.AgentImageTask>(
    `${AGENT_IMAGE}/task/retry`,
    data,
  );
}

export function applyContentPlan(data: {
  expectedDraftVersion: number;
  planRevisionId: number;
  projectId: number;
}) {
  return requestClient.post<{
    definition: FdmCreativeApi.WorkflowDefinition;
    definitionHash?: string;
    draftVersion: number;
  }>(`${PLAN}/apply`, data);
}

export function runCreativeWorkflow(data: {
  expectedDraftVersion: number;
  projectId: number;
  scope: FdmCreativeApi.ExecutionScope;
  startNodeId?: string;
}) {
  return requestClient.post<number>(`${EXECUTION}/run`, data);
}

export function cancelCreativeExecution(id: number) {
  return requestClient.post<boolean>(`${EXECUTION}/cancel`, undefined, {
    params: { id },
  });
}

export function retryCreativeNode(nodeRunId: number) {
  return requestClient.post<boolean>(`${EXECUTION}/retry-node`, undefined, {
    params: { nodeRunId },
  });
}

export function getCreativeNodeResultPage(
  params: FdmCreativeApi.NodeResultPageParams,
) {
  return requestClient.get<PageResult<FdmCreativeApi.NodeResultVersion>>(
    `${NODE_RESULT}/page`,
    { params },
  );
}

export function adoptCreativeNodeResult(
  data: FdmCreativeApi.NodeResultAdoptReq,
) {
  return requestClient.post<FdmCreativeApi.NodeResultAdoption>(
    `${NODE_RESULT}/adopt`,
    data,
  );
}

export function getCreativeMediaToolDescriptors(projectId: number) {
  return requestClient.get<FdmCreativeApi.MediaToolDescriptor[]>(
    `${MEDIA_TOOL}/descriptors`,
    { params: { projectId } },
  );
}

export function getCreativeExecution(id: number) {
  return requestClient.get<FdmCreativeApi.ExecutionDetail>(`${EXECUTION}/get`, {
    params: { id },
  });
}

export function getCreativeExecutionPage(
  params: FdmCreativeApi.ExecutionPageParams,
) {
  return requestClient.get<PageResult<FdmCreativeApi.Execution>>(
    `${EXECUTION}/page`,
    { params },
  );
}

export function getCreativeAssetPage(
  params: PageParam & {
    keyword?: string;
    kind?: string;
    kinds?: string[];
    projectId?: number;
  },
) {
  return requestClient.get<PageResult<FdmCreativeApi.CreativeAsset>>(
    `${ASSET}/page`,
    { params },
  );
}

export function importCreativeAsset(data: {
  sourceAssetId: number;
  targetProjectId: number;
}) {
  return requestClient.post<FdmCreativeApi.CreativeAsset>(
    `${ASSET}/import`,
    data,
  );
}

export function getCreativeAsset(id: number) {
  return requestClient.get<FdmCreativeApi.CreativeAsset>(`${ASSET}/get`, {
    params: { id },
  });
}

export function createCreativeAsset(
  data: FdmCreativeApi.CreativeAssetCreateReq,
) {
  return requestClient.post<number>(`${ASSET}/create`, data);
}

export function deleteCreativeAsset(id: number) {
  return requestClient.delete<boolean>(`${ASSET}/delete`, { params: { id } });
}

export function getCreativePromptPage(
  params: FdmCreativeApi.CreativePromptPageParams,
) {
  return requestClient.get<PageResult<FdmCreativeApi.CreativePrompt>>(
    `${PROMPT}/page`,
    { params },
  );
}

export function getCreativePromptCategories() {
  return requestClient.get<FdmCreativeApi.CreativePromptCategory[]>(
    `${PROMPT}/categories`,
  );
}

export function createCreativePrompt(
  data: FdmCreativeApi.CreativePromptSaveReq,
) {
  return requestClient.post<number>(`${PROMPT}/create`, data);
}

export function updateCreativePrompt(
  data: FdmCreativeApi.CreativePromptSaveReq & { id: number },
) {
  return requestClient.put<boolean>(`${PROMPT}/update`, data);
}

export function deleteCreativePrompt(id: number) {
  return requestClient.delete<boolean>(`${PROMPT}/delete`, { params: { id } });
}

export function getCreativeAgentCapability() {
  return requestClient.get<FdmCreativeApi.AgentCapability>(
    `${AGENT}/capability`,
  );
}

export function createCreativeAgentConversation(data: {
  projectId: number;
  title?: string;
}) {
  return requestClient.post<FdmCreativeApi.AgentLongId>(
    `${AGENT}/conversation`,
    data,
  );
}

export function renameCreativeAgentConversation(data: {
  conversationId: FdmCreativeApi.AgentLongId;
  title: string;
}) {
  return requestClient.put<boolean>(`${AGENT}/conversation/rename`, data);
}

export function archiveCreativeAgentConversation(
  conversationId: FdmCreativeApi.AgentLongId,
) {
  return requestClient.post<boolean>(`${AGENT}/conversation/archive`, {
    conversationId,
  });
}

export function getCreativeAgentConversationPage(
  params: PageParam & {
    projectId: number;
    status?: FdmCreativeApi.AgentConversationStatus;
  },
) {
  return requestClient.get<PageResult<FdmCreativeApi.AgentConversation>>(
    `${AGENT}/conversation/page`,
    { params },
  );
}

export function getCreativeAgentMessagePage(
  params: PageParam & {
    afterSequence?: FdmCreativeApi.AgentLongId;
    conversationId: FdmCreativeApi.AgentLongId;
  },
) {
  return requestClient.get<PageResult<FdmCreativeApi.AgentMessage>>(
    `${AGENT}/message/page`,
    { params },
  );
}

export function createCreativeAgentRun(data: {
  content: string;
  conversationId: FdmCreativeApi.AgentLongId;
  idempotencyKey: string;
  logicalModelId?: FdmCreativeApi.AgentLongId;
  projectId: number;
  references: FdmCreativeApi.AgentReference[];
}) {
  return requestClient.post<FdmCreativeApi.AgentRun>(`${AGENT}/run`, data);
}

export function getCreativeAgentRun(id: FdmCreativeApi.AgentLongId) {
  return requestClient.get<FdmCreativeApi.AgentRun>(`${AGENT}/run/get`, {
    params: { id },
  });
}

export function applyCreativeAgentRun(data: {
  approveDestructive?: boolean;
  expectedDraftVersion: number;
  projectId: number;
  runId: FdmCreativeApi.AgentLongId;
}) {
  return requestClient.post<FdmCreativeApi.AgentApplyResp>(
    `${AGENT}/run/apply`,
    data,
  );
}

export function cancelCreativeAgentRun(id: FdmCreativeApi.AgentLongId) {
  return requestClient.post<boolean>(`${AGENT}/run/cancel`, undefined, {
    params: { id },
  });
}

export function retryCreativeAgentRun(id: FdmCreativeApi.AgentLongId) {
  return requestClient.post<FdmCreativeApi.AgentRun>(
    `${AGENT}/run/retry`,
    undefined,
    { params: { id } },
  );
}

export function executeCreativeAgentRun(data: {
  expectedDraftVersion: number;
  projectId: number;
  runId: FdmCreativeApi.AgentLongId;
  scope: Exclude<FdmCreativeApi.CanvasPatchSuggestedRunScope, 'NONE'>;
  startNodeId?: string;
}) {
  return requestClient.post<FdmCreativeApi.AgentLongId>(
    `${AGENT}/run/execute`,
    data,
  );
}
