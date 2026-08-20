import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmCreativeApi {
  export type ProjectStatus = 'ACTIVE' | 'ARCHIVED';
  export type ProjectType = 'DRAMA' | 'WORKBENCH';
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
    | 'document-asset'
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
    projectType?: ProjectType;
    status: ProjectStatus;
    updateTime?: string;
  }

  export type ProjectPageParams = PageParam & {
    keyword?: string;
    /** Omitted keeps the workbench's legacy WORKBENCH-only view; ALL is an explicit cross-surface filter. */
    projectType?: 'ALL' | ProjectType;
    status?: ProjectStatus;
  };

  export type DramaScriptStatus =
    | 'CONFIRMED'
    | 'CREATED'
    | 'FAILED'
    | 'GENERATING'
    | 'PREVIEW';
  export type DramaEntityType = 'CHARACTER' | 'PROP' | 'SCENE';

  export interface DramaProject {
    aspectRatio: string;
    coverAssetId?: number;
    createTime?: string;
    creator?: string;
    currentScriptRevisionId?: number;
    currentUserRole: ProjectMemberRole;
    description?: string;
    dramaType: string;
    id: number;
    language: string;
    name: string;
    ownerUserId?: number;
    projectId: number;
    status: ProjectStatus;
    targetDurationSeconds: number;
    updateTime?: string;
    version: number;
    visualStyle?: string;
  }

  export interface DramaScriptEntity {
    description: string;
    entityKey: string;
    name: string;
    prompt?: string;
    referenceAssetIds: number[];
  }

  export interface DramaDialogue {
    action?: string;
    characterKey: string;
    narration?: string;
    text: string;
  }

  export interface DramaStoryScene {
    action: string;
    dialogues: DramaDialogue[];
    estimatedDurationSeconds: number;
    narration?: string;
    sceneEntityKey: string;
    sceneKey: string;
    sceneNo: number;
    title: string;
  }

  export interface DramaScript {
    characters: DramaScriptEntity[];
    props: DramaScriptEntity[];
    scenes: DramaScriptEntity[];
    schemaVersion: 1;
    storyScenes: DramaStoryScene[];
    synopsis: string;
    theme?: string;
    title: string;
  }

  export interface DramaScriptDiff {
    addedEntityKeys: string[];
    addedSceneKeys: string[];
    changedEntityKeys: string[];
    changedSceneKeys: string[];
    removedEntityKeys: string[];
    removedSceneKeys: string[];
  }

  export interface DramaScriptRevision {
    confirmedByUserId?: number;
    createTime?: string;
    creator?: string;
    diff?: DramaScriptDiff;
    dramaProjectId: number;
    errorCode?: string;
    errorMessage?: string;
    id: number;
    invocationId?: string;
    revisionNo: number;
    schemaVersion: number;
    script?: DramaScript;
    sourceAgentRunId?: number;
    status: DramaScriptStatus;
  }

  export interface DramaEntity {
    adoptedAssetId?: number;
    createTime?: string;
    creator?: string;
    description: string;
    dramaProjectId: number;
    entityKey: string;
    entityType: DramaEntityType;
    id: number;
    locked: boolean;
    name: string;
    prompt?: string;
    sourceScriptRevisionId?: number;
    updateTime?: string;
    version: number;
  }

  export interface DramaScriptEvent {
    eventTime?: string;
    eventType: string;
    id: number;
    payloadJson?: string;
  }

  export type DramaShotStatus =
    | 'DRAFT'
    | 'GENERATING_IMAGE'
    | 'GENERATING_VIDEO'
    | 'IMAGE_READY'
    | 'REMOVED'
    | 'STALE'
    | 'VIDEO_READY';
  export type DramaShotTaskType = 'GENERATE_IMAGE' | 'GENERATE_VIDEO';
  export type DramaShotTaskStatus =
    | 'CANCEL_REQUESTED'
    | 'CANCELED'
    | 'CREATED'
    | 'FAILED'
    | 'LAUNCHING'
    | 'RUNNING'
    | 'STALE'
    | 'SUCCEEDED';

  /** Versioned P5B projection of one confirmed DramaScript; generated deterministically on the server. */
  export interface DramaStoryboardShot {
    actionText?: string;
    cameraMovement?: string;
    continuityGroup?: string;
    dialogueText?: string;
    durationSeconds: number;
    framing?: string;
    narrationText?: string;
    sceneKey: string;
    sceneNo: number;
    shotKey: string;
    shotNo: number;
    sortOrder: number;
    title?: string;
    visualPrompt: string;
  }

  export interface DramaStoryboard {
    schemaVersion: 1;
    scriptRevisionId: number;
    shots: DramaStoryboardShot[];
    totalDurationSeconds: number;
  }

  export interface DramaStoryboardChange {
    reason: string;
    shotKey: string;
  }

  export interface DramaStoryboardDiff {
    added: DramaStoryboardChange[];
    lockedRetained: DramaStoryboardChange[];
    removed: DramaStoryboardChange[];
    updated: DramaStoryboardChange[];
  }

  export interface DramaStoryboardGeneration {
    diff: DramaStoryboardDiff;
    dramaVersion: number;
    scriptRevisionId: number;
    storyboard: DramaStoryboard;
  }

  /** Current editable truth; media histories remain in the existing node-run result ledger. */
  export interface DramaShot {
    actionText?: string;
    adoptedAudioAssetId?: number | string;
    adoptedImageAssetId?: number | string;
    adoptedImageNodeRunId?: number;
    adoptedVideoAssetId?: number | string;
    adoptedVideoNodeRunId?: number;
    cameraMovement?: string;
    continuityGroup?: string;
    createTime?: string;
    dialogueText?: string;
    dramaProjectId: number;
    durationSeconds: number;
    framing?: string;
    id: number;
    locked: boolean;
    narrationText?: string;
    sceneKey: string;
    sceneNo: number;
    scriptRevisionId: number;
    shotKey: string;
    shotNo: number;
    sortOrder: number;
    status: DramaShotStatus;
    title?: string;
    updateTime?: string;
    version: number;
    videoStale?: boolean;
    visualPrompt: string;
  }

  /** A durable idempotent bridge to exactly one controlled execution. */
  export interface DramaShotTask {
    adoptedAssetId?: number | string;
    attemptNo: number;
    completedTime?: string;
    dramaProjectId: number;
    errorCode?: string;
    errorMessage?: string;
    executionId?: number;
    id: number;
    nodeId?: string;
    nodeRunId?: number;
    resultAssetId?: number | string;
    shotId: number;
    sourceImageAssetId?: number | string;
    startedTime?: string;
    status: DramaShotTaskStatus;
    taskType: DramaShotTaskType;
    updateTime?: string;
  }

  export interface DramaShotTaskWorkflow {
    executionId?: number;
    readOnly: true;
    taskId: number;
    workflow: WorkflowDefinition;
  }

  /** P5C: only frame fields are persisted as timing truth; seconds are derived at the FFmpeg boundary. */
  export type DramaTimelineTrackType =
    | 'DIALOGUE'
    | 'MUSIC'
    | 'NARRATION'
    | 'SOUND_EFFECT'
    | 'SUBTITLE'
    | 'VIDEO';
  export type DramaAudioTaskType =
    | 'DIALOGUE'
    | 'MUSIC'
    | 'NARRATION'
    | 'SOUND_EFFECT';
  export type DramaAudioTaskStatus =
    | 'CANCEL_REQUESTED'
    | 'CANCELED'
    | 'CREATED'
    | 'FAILED'
    | 'LAUNCHING'
    | 'RUNNING'
    | 'STALE'
    | 'SUCCEEDED';
  export type DramaCompositionStatus =
    | 'CANCEL_REQUESTED'
    | 'CANCELED'
    | 'CREATED'
    | 'FAILED'
    | 'LAUNCHING'
    | 'RUNNING'
    | 'SUCCEEDED';

  export interface DramaTimelineClip {
    assetId?: number;
    characterKey?: string;
    clipId: string;
    cueKey?: string;
    durationFrames: number;
    startFrame: number;
    text?: string;
    transition?: 'FADE' | 'FADEBLACK' | 'NONE';
    transitionFrames?: number;
    trimInFrames?: number;
    trimOutFrames?: number;
    voiceId?: string;
    voicePitch?: number;
    voiceSpeed?: number;
    volume?: number;
  }

  export interface DramaTimelineTrack {
    clips: DramaTimelineClip[];
    label?: string;
    trackId: string;
    type: DramaTimelineTrackType;
  }

  export interface DramaTimeline {
    durationFrames: number;
    fps: number;
    height: number;
    schemaVersion: 1;
    tracks: DramaTimelineTrack[];
    width: number;
  }

  export interface DramaTimelineResponse {
    dramaProjectId: number;
    id: number;
    schemaVersion: number;
    scriptRevisionId: number;
    timeline: DramaTimeline;
    timelineHash: string;
    updateTime?: string;
    version: number;
  }

  export interface DramaAudioTask {
    adoptedAssetId?: number;
    attemptNo: number;
    completedTime?: string;
    cueKey: string;
    dramaProjectId: number;
    errorCode?: string;
    errorMessage?: string;
    executionId?: number;
    id: number;
    nodeId?: string;
    nodeRunId?: number;
    resultAssetId?: number;
    startedTime?: string;
    status: DramaAudioTaskStatus;
    taskType: DramaAudioTaskType;
    timelineId: number;
    timelineVersion: number;
    updateTime?: string;
  }

  export interface DramaAudioTaskWorkflow {
    executionId?: number;
    readOnly: true;
    taskId: number;
    workflow: WorkflowDefinition;
  }

  export interface DramaComposition {
    completedTime?: string;
    dramaProjectId: number;
    errorCode?: string;
    errorMessage?: string;
    executionId?: number;
    finalAssetId?: number;
    finalNodeRunId?: number;
    id: number;
    materialAssetIds: number[];
    startedTime?: string;
    status: DramaCompositionStatus;
    subtitleNodeRunId?: number;
    subtitleSrtAssetId?: number;
    subtitleVttAssetId?: number;
    timelineHash: string;
    timelineId: number;
    timelineVersion: number;
    updateTime?: string;
  }

  export interface DramaCompositionWorkflow {
    executionId?: number;
    readOnly: true;
    revisionId: number;
    workflow: WorkflowDefinition;
  }

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
const NODE_RESULT = '/fdmcreative/node-result';
const MEDIA_TOOL = '/fdmcreative/media-tool';
const DRAMA = '/fdmcreative/drama';

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

export function getDramaProjectPage(
  params: PageParam & {
    keyword?: string;
    status?: FdmCreativeApi.ProjectStatus;
  },
) {
  return requestClient.get<PageResult<FdmCreativeApi.DramaProject>>(
    `${DRAMA}/page`,
    { params },
  );
}

export function getDramaProject(projectId: number) {
  return requestClient.get<FdmCreativeApi.DramaProject>(`${DRAMA}/get`, {
    params: { projectId },
  });
}

export function createDramaProject(data: {
  aspectRatio?: string;
  coverAssetId?: number;
  description?: string;
  dramaType?: string;
  language?: string;
  name: string;
  targetDurationSeconds?: number;
  visualStyle?: string;
}) {
  return requestClient.post<number>(`${DRAMA}/create`, data);
}

export function updateDramaProject(data: {
  aspectRatio?: string;
  coverAssetId?: number;
  description?: string;
  dramaType?: string;
  expectedVersion: number;
  language?: string;
  name?: string;
  projectId: number;
  targetDurationSeconds?: number;
  visualStyle?: string;
}) {
  return requestClient.put<boolean>(`${DRAMA}/update`, data);
}

export function archiveDramaProject(data: {
  expectedVersion: number;
  projectId: number;
}) {
  return requestClient.post<boolean>(`${DRAMA}/archive`, undefined, {
    params: data,
  });
}

export function generateDramaScript(data: {
  logicalModelId?: number;
  projectId: number;
  prompt: string;
  promptIds?: number[];
  referenceAssetIds?: number[];
  sourceAgentRunId?: number;
}) {
  return requestClient.post<FdmCreativeApi.DramaScriptRevision>(
    `${DRAMA}/script/generate`,
    data,
  );
}

export function previewDramaScript(data: {
  projectId: number;
  script: FdmCreativeApi.DramaScript;
  sourceAgentRunId?: number;
}) {
  return requestClient.post<FdmCreativeApi.DramaScriptRevision>(
    `${DRAMA}/script/preview`,
    data,
  );
}

export function getDramaScript(projectId: number, scriptRevisionId: number) {
  return requestClient.get<FdmCreativeApi.DramaScriptRevision>(
    `${DRAMA}/script/get`,
    { params: { projectId, scriptRevisionId } },
  );
}

export function getDramaScriptPage(params: PageParam & { projectId: number }) {
  return requestClient.get<PageResult<FdmCreativeApi.DramaScriptRevision>>(
    `${DRAMA}/script/page`,
    { params },
  );
}

export function syncDramaScript(projectId: number, scriptRevisionId: number) {
  return requestClient.post<FdmCreativeApi.DramaScriptRevision>(
    `${DRAMA}/script/sync`,
    undefined,
    { params: { projectId, scriptRevisionId } },
  );
}

export function confirmDramaScript(data: {
  expectedDramaVersion: number;
  projectId: number;
  scriptRevisionId: number;
}) {
  return requestClient.post<FdmCreativeApi.DramaScriptRevision>(
    `${DRAMA}/script/confirm`,
    data,
  );
}

export function getDramaScriptEvents(params: {
  afterId?: number;
  projectId: number;
  scriptRevisionId: number;
}) {
  return requestClient.get<FdmCreativeApi.DramaScriptEvent[]>(
    `${DRAMA}/script/events`,
    { params },
  );
}

export function getDramaEntityPage(
  params: PageParam & {
    entityType?: FdmCreativeApi.DramaEntityType;
    keyword?: string;
    projectId: number;
  },
) {
  return requestClient.get<PageResult<FdmCreativeApi.DramaEntity>>(
    `${DRAMA}/entity/page`,
    { params },
  );
}

export function updateDramaEntity(data: {
  adoptedAssetId?: number;
  description?: string;
  entityId: number;
  expectedVersion: number;
  name?: string;
  projectId: number;
  prompt?: string;
}) {
  return requestClient.put<FdmCreativeApi.DramaEntity>(
    `${DRAMA}/entity/update`,
    data,
  );
}

export function adoptDramaEntityReference(data: {
  adoptedAssetId: number;
  entityId: number;
  expectedVersion: number;
  projectId: number;
}) {
  return requestClient.post<FdmCreativeApi.DramaEntity>(
    `${DRAMA}/entity/adopt-reference`,
    data,
  );
}

export function lockDramaEntity(data: {
  entityId: number;
  expectedVersion: number;
  locked: boolean;
  projectId: number;
}) {
  return requestClient.post<FdmCreativeApi.DramaEntity>(
    `${DRAMA}/entity/lock`,
    data,
  );
}

export function generateDramaEntityReference(data: {
  entityId: number;
  expectedEntityVersion: number;
  logicalModelId?: number;
  projectId: number;
}) {
  return requestClient.post<number>(`${DRAMA}/entity/generate-reference`, data);
}

export function generateDramaStoryboard(data: {
  expectedDramaVersion: number;
  projectId: number;
  scriptRevisionId: number;
}) {
  return requestClient.post<FdmCreativeApi.DramaStoryboardGeneration>(
    `${DRAMA}/storyboard/generate`,
    data,
  );
}

export function getDramaShotPage(
  params: PageParam & {
    includeRemoved?: boolean;
    keyword?: string;
    projectId: number;
  },
) {
  return requestClient.get<PageResult<FdmCreativeApi.DramaShot>>(
    `${DRAMA}/shot/page`,
    { params },
  );
}

export function updateDramaShot(data: {
  actionText?: string;
  cameraMovement?: string;
  continuityGroup?: string;
  dialogueText?: string;
  durationSeconds?: number;
  expectedVersion: number;
  framing?: string;
  narrationText?: string;
  projectId: number;
  shotId: number;
  visualPrompt?: string;
}) {
  return requestClient.put<FdmCreativeApi.DramaShot>(
    `${DRAMA}/shot/update`,
    data,
  );
}

export function lockDramaShot(data: {
  expectedVersion: number;
  locked: boolean;
  projectId: number;
  shotId: number;
}) {
  return requestClient.post<FdmCreativeApi.DramaShot>(
    `${DRAMA}/shot/lock`,
    data,
  );
}

export function sortDramaShots(data: {
  items: Array<{
    expectedVersion: number;
    shotId: number;
    sortOrder: number;
  }>;
  projectId: number;
}) {
  return requestClient.put<FdmCreativeApi.DramaShot[]>(
    `${DRAMA}/shot/sort`,
    data,
  );
}

export function generateDramaShotImage(data: {
  expectedShotVersion: number;
  logicalModelId?: number;
  projectId: number;
  shotId: number;
}) {
  return requestClient.post<FdmCreativeApi.DramaShotTask>(
    `${DRAMA}/shot/generate-image`,
    data,
  );
}

export function generateDramaShotImages(data: {
  logicalModelId?: number;
  projectId: number;
  shots: Array<{
    expectedShotVersion: number;
    shotId: number;
  }>;
}) {
  return requestClient.post<FdmCreativeApi.DramaShotTask[]>(
    `${DRAMA}/shot/generate-images`,
    data,
  );
}

export function generateDramaShotVideo(data: {
  expectedShotVersion: number;
  logicalModelId?: number;
  projectId: number;
  shotId: number;
}) {
  return requestClient.post<FdmCreativeApi.DramaShotTask>(
    `${DRAMA}/shot/generate-video`,
    data,
  );
}

export function getDramaShotTaskPage(
  params: PageParam & {
    projectId: number;
    shotId?: number;
  },
) {
  return requestClient.get<PageResult<FdmCreativeApi.DramaShotTask>>(
    `${DRAMA}/shot/task/page`,
    { params },
  );
}

export function cancelDramaShotTask(data: {
  projectId: number;
  taskId: number;
}) {
  return requestClient.post<FdmCreativeApi.DramaShotTask>(
    `${DRAMA}/shot/task/cancel`,
    data,
  );
}

export function retryDramaShotTask(data: {
  projectId: number;
  taskId: number;
}) {
  return requestClient.post<FdmCreativeApi.DramaShotTask>(
    `${DRAMA}/shot/task/retry`,
    data,
  );
}

export function adoptDramaShotTaskResult(data: {
  assetId: number | string;
  expectedShotVersion: number;
  projectId: number;
  taskId: number;
}) {
  return requestClient.post<FdmCreativeApi.DramaShot>(
    `${DRAMA}/shot/task/adopt`,
    data,
  );
}

export function getDramaShotTaskWorkflow(projectId: number, taskId: number) {
  return requestClient.get<FdmCreativeApi.DramaShotTaskWorkflow>(
    `${DRAMA}/shot/task/workflow`,
    { params: { projectId, taskId } },
  );
}

export function getDramaTimeline(projectId: number) {
  return requestClient.get<FdmCreativeApi.DramaTimelineResponse>(
    `${DRAMA}/timeline`,
    { params: { projectId } },
  );
}

export function initializeDramaTimeline(projectId: number) {
  return requestClient.post<FdmCreativeApi.DramaTimelineResponse>(
    `${DRAMA}/timeline/initialize`,
    { projectId },
  );
}

export function updateDramaTimeline(data: {
  expectedVersion: number;
  projectId: number;
  timeline: FdmCreativeApi.DramaTimeline;
}) {
  return requestClient.put<FdmCreativeApi.DramaTimelineResponse>(
    `${DRAMA}/timeline`,
    data,
  );
}

export function generateDramaAudio(data: {
  cueKey: string;
  expectedTimelineVersion: number;
  logicalModelId?: number;
  projectId: number;
}) {
  return requestClient.post<FdmCreativeApi.DramaAudioTask>(
    `${DRAMA}/audio/generate`,
    data,
  );
}

export function getDramaAudioTaskPage(
  params: PageParam & { cueKey?: string; projectId: number },
) {
  return requestClient.get<PageResult<FdmCreativeApi.DramaAudioTask>>(
    `${DRAMA}/audio/task/page`,
    { params },
  );
}

export function cancelDramaAudioTask(data: {
  projectId: number;
  taskId: number;
}) {
  return requestClient.post<FdmCreativeApi.DramaAudioTask>(
    `${DRAMA}/audio/task/cancel`,
    data,
  );
}

export function retryDramaAudioTask(data: {
  projectId: number;
  taskId: number;
}) {
  return requestClient.post<FdmCreativeApi.DramaAudioTask>(
    `${DRAMA}/audio/task/retry`,
    data,
  );
}

export function adoptDramaAudioTaskResult(data: {
  assetId: number;
  expectedTimelineVersion: number;
  projectId: number;
  taskId: number;
}) {
  return requestClient.post<FdmCreativeApi.DramaTimelineResponse>(
    `${DRAMA}/audio/task/adopt`,
    data,
  );
}

export function getDramaAudioTaskWorkflow(projectId: number, taskId: number) {
  return requestClient.get<FdmCreativeApi.DramaAudioTaskWorkflow>(
    `${DRAMA}/audio/task/workflow`,
    { params: { projectId, taskId } },
  );
}

export function publishDramaComposition(data: {
  expectedTimelineVersion: number;
  projectId: number;
}) {
  return requestClient.post<FdmCreativeApi.DramaComposition>(
    `${DRAMA}/composition/publish`,
    data,
  );
}

export function getDramaCompositionPage(
  params: PageParam & { projectId: number },
) {
  return requestClient.get<PageResult<FdmCreativeApi.DramaComposition>>(
    `${DRAMA}/composition/page`,
    { params },
  );
}

export function cancelDramaComposition(data: {
  projectId: number;
  revisionId: number;
}) {
  return requestClient.post<FdmCreativeApi.DramaComposition>(
    `${DRAMA}/composition/cancel`,
    data,
  );
}

export function retryDramaComposition(data: {
  projectId: number;
  revisionId: number;
}) {
  return requestClient.post<FdmCreativeApi.DramaComposition>(
    `${DRAMA}/composition/retry`,
    data,
  );
}

export function getDramaCompositionWorkflow(
  projectId: number,
  revisionId: number,
) {
  return requestClient.get<FdmCreativeApi.DramaCompositionWorkflow>(
    `${DRAMA}/composition/workflow`,
    { params: { projectId, revisionId } },
  );
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
