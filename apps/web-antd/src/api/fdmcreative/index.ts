import type { PageParam, PageResult } from '@vben/request';

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
    draftVersion: number;
    projectId?: number;
    staleNodeIds?: string[];
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
    errorMessage?: string;
    failedNodeCount?: number;
    id: number;
    projectId: number;
    scope?: ExecutionScope;
    startNodeId?: string;
    startedTime?: string;
    status: ExecutionStatus;
    succeededNodeCount?: number;
    totalNodeCount?: number;
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
    nodeId: string;
    nodeType?: string;
    outputJson?: string;
    startedTime?: string;
    status: NodeRunStatus;
  }

  export interface ExecutionDetail extends Execution {
    nodeRuns?: NodeRun[];
  }

  export interface PromptRefineResp {
    errorMessage?: string;
    invocationId?: string;
    refinedPrompt?: string;
    refinementId: number;
    status: 'FAILED' | 'GENERATING' | 'SUCCEEDED';
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
}

const PROJECT = '/fdmcreative/project';
const WORKFLOW = '/fdmcreative/workflow';
const PLAN = '/fdmcreative/plan';
const EXECUTION = '/fdmcreative/execution';
const ASSET = '/fdmcreative/asset';
const PROMPT = '/fdmcreative/prompt';

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

export function saveWorkflowDraft(data: {
  definition: FdmCreativeApi.WorkflowDefinition;
  expectedDraftVersion: number;
  projectId: number;
}) {
  return requestClient.put<FdmCreativeApi.WorkflowDraft>(
    `${WORKFLOW}/draft`,
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

export function applyContentPlan(data: {
  expectedDraftVersion: number;
  planRevisionId: number;
  projectId: number;
}) {
  return requestClient.post<{
    definition: FdmCreativeApi.WorkflowDefinition;
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
