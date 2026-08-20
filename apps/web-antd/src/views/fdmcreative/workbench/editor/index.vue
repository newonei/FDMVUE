<script lang="ts" setup>
import type { CSSProperties } from 'vue';

import type { CreativeQuickConnectOption } from './graph/catalog';
import type {
  WorkbenchBlankConnectionRequest,
  WorkbenchGraphAdapter,
  WorkbenchNavigationNode,
} from './graph/graph-adapter';
import type { WorkflowAutosaveSnapshot } from './use-workflow-autosave';

import type { FdmAiApi } from '#/api/fdmai';
import type { FdmCreativeApi } from '#/api/fdmcreative';
import type { AxiosProgressEvent } from '#/api/infra/file';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { onBeforeRouteLeave, useRoute, useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Drawer,
  Empty,
  Input,
  InputNumber,
  message,
  Modal,
  Segmented,
  Spin,
  Switch,
  Tag,
  Textarea,
  Tooltip,
} from 'ant-design-vue';

import { searchFdmAiModels } from '#/api/fdmai';
import {
  adoptCreativeNodeResult,
  applyContentPlan,
  cancelCreativeExecution,
  createCreativeAsset,
  exportWorkflowDraft,
  getCreativeAsset,
  getCreativeAssetPage,
  getCreativeExecution,
  getCreativeExecutionPage,
  getCreativeMediaToolDescriptors,
  getCreativeNodeResultPage,
  getCreativeProject,
  getLatestContentPlan,
  getWorkflowCapability,
  getWorkflowDraft,
  importWorkflowDraft,
  previewContentPlan,
  previewWorkflowImport,
  publishWorkflow,
  refineCreativePrompt,
  runCreativeWorkflow,
  saveWorkflowDraft,
  syncContentPlan,
  syncCreativePrompt,
} from '#/api/fdmcreative';
import { uploadFile } from '#/api/infra/file';

import PromptLibraryPicker from '../../shared/PromptLibraryPicker.vue';
import { firstRestorableAgentNode } from './agent-draft-restore';
import CanvasAgentPanel from './components/CanvasAgentPanel.vue';
import CanvasNavigator from './components/CanvasNavigator.vue';
import ExecutionTaskPanel from './components/ExecutionTaskPanel.vue';
import NodeInlineEditor from './components/NodeInlineEditor.vue';
import NodeLibraryPanel from './components/NodeLibraryPanel.vue';
import WorkbenchTopbar from './components/WorkbenchTopbar.vue';
import WorkflowConflictModal from './components/WorkflowConflictModal.vue';
import { resolveConnectedImageReferences } from './connected-image-references';
import { CREATIVE_NODE_CATALOG } from './graph/catalog';
import {
  createWorkbenchGraph,
  MAX_WORKBENCH_NODES,
} from './graph/graph-adapter';
import {
  EMPTY_WORKFLOW,
  planSummary,
  validateWorkflowDefinition,
} from './graph/workflow-utils';
import { aggregateLoopNodeRuns, canvasNodeIdForRun } from './loop-run';
import { normalizeModelIdentifier } from './model-identifier';
import { supportsNodeModel } from './node-model-filter';
import { extractPromptText } from './prompt-text-output';
import { useExecutionEventStream } from './use-execution-event-stream';
import {
  isWorkflowVersionConflict,
  useWorkflowAutosave,
} from './use-workflow-autosave';
import { workflowSaveBlockedFeedback } from './workflow-save-feedback';
import {
  createWorkflowExport,
  downloadWorkflowExport,
  parseWorkflowExport,
  WORKFLOW_EXPORT_MAX_BYTES,
} from './workflow-export';

defineOptions({ name: 'FdmCreativeWorkbenchEditor' });

interface NodeLibraryPanelExpose {
  getElement: () => HTMLElement | undefined;
}

interface PromptLibrarySelection {
  content: string;
  mode: 'append' | 'replace';
}

const route = useRoute();
const router = useRouter();
const projectId = computed(() => Number(route.params.projectId));
const canvasRef = ref<HTMLElement>();
const canvasShellRef = ref<HTMLElement>();
const minimapRef = ref<HTMLElement>();
const nodeLibraryRef = ref<NodeLibraryPanelExpose>();
const quickConnectRef = ref<HTMLElement>();
const adapter = ref<WorkbenchGraphAdapter>();
const loading = ref(true);
const publishing = ref(false);
const graphRevision = ref(0);
const zoomPercent = ref(100);
const canvasNavigatorOpen = ref(false);
const agentPanelOpen = ref(false);
const agentPanelWidth = ref(480);
const viewportWidth = ref(
  typeof window === 'undefined' ? 1440 : window.innerWidth,
);
const project = ref<FdmCreativeApi.Project>();
const draftVersion = ref(0);
const workflowCapability = ref<FdmCreativeApi.WorkflowCapability>({
  autosaveEnabled: false,
  mediaToolsEnabled: false,
});
const workflowConflictOpen = ref(false);
const workflowConflictLoading = ref(false);
const workflowConflictServerDraft = ref<FdmCreativeApi.WorkflowDraft>();
const workflowExporting = ref(false);
const workflowImporting = ref(false);
const workflowImportPreviewing = ref(false);
const workflowImportModalOpen = ref(false);
const workflowImportFileRef = ref<HTMLInputElement>();
const workflowImportDocument = ref<string>();
const workflowImportPreview = ref<FdmCreativeApi.WorkflowImportPreview>();
const clearUnavailableImportAssets = ref(false);
const selectedNode = ref<FdmCreativeApi.WorkflowNode>();
const navigationNodes = ref<WorkbenchNavigationNode[]>([]);
const plannerBusy = ref(false);
const promptRefineBusy = ref(false);
const planModalOpen = ref(false);
const pendingPlan = ref<FdmCreativeApi.PlanPreviewResp>();
const runningExecution = ref<FdmCreativeApi.ExecutionDetail>();
const latestNodeRunsByNodeId = ref<
  Record<string, FdmCreativeApi.NodeRun | undefined>
>({});
const modelOptions = ref<FdmAiApi.ModelOption[]>([]);
const projectAssets = ref<FdmCreativeApi.CreativeAsset[]>([]);
const nodeResultVersions = ref<FdmCreativeApi.NodeResultVersion[]>([]);
const nodeResultLoading = ref(false);
const mediaTools = ref<FdmCreativeApi.MediaToolDescriptor[]>([]);
const quickConnectRequest = ref<WorkbenchBlankConnectionRequest>();
const quickConnectSearch = ref('');
let executionTimer: ReturnType<typeof setTimeout> | undefined;
let executionEventRefreshTimer: ReturnType<typeof setTimeout> | undefined;
let planTimer: ReturnType<typeof setTimeout> | undefined;
let promptRefineTimer: ReturnType<typeof setTimeout> | undefined;
let initializationGeneration = 0;
let graphDragActive = false;
let graphChangedDuringDrag = false;
let nodeResultRequestSequence = 0;

const autosave = useWorkflowAutosave({
  enabled: () => workflowCapability.value.autosaveEnabled,
  getExpectedDraftVersion: () => draftVersion.value,
  onConflict: async (snapshot, error) => {
    await showWorkflowConflict(snapshot, error);
  },
  onSaved: (draft) => {
    draftVersion.value = draft.draftVersion;
    if (project.value) project.value.draftVersion = draft.draftVersion;
  },
  projectId: () => projectId.value,
  save: (request) =>
    saveWorkflowDraft({
      ...request,
      projectId: projectId.value,
    }),
});
const saving = autosave.isSaving;
const dirty = autosave.hasUnpersistedSnapshot;
const localConflictSnapshot = autosave.localSnapshot;

const MODEL_NODE_TYPES = new Set([
  'content-planner',
  'first-last-frame-to-video',
  'image-edit',
  'image-generate',
  'image-to-image',
  'image-to-video',
  'prompt-generator',
  'video-generate',
]);

const quickConnectPosition = reactive({ left: 16, top: 16 });

const planner = reactive({
  imageCount: 4,
  mode: 'MIXED' as FdmCreativeApi.PlanMode,
  prompt: '',
  videoCount: 4,
});
const plannerPromptTarget = computed<FdmCreativeApi.PromptTargetType>(() =>
  planner.mode === 'IMAGE_SET'
    ? 'IMAGE'
    : planner.mode === 'VIDEO_SEQUENCE'
      ? 'VIDEO'
      : 'GENERAL',
);

const selectedConfig = computed(() => selectedNode.value?.config ?? {});
const currentUserRole = computed(() => project.value?.currentUserRole);
const canEdit = computed(() =>
  ['EDITOR', 'OWNER'].includes(currentUserRole.value ?? ''),
);
const canRun = computed(
  () => Boolean(currentUserRole.value) && currentUserRole.value !== 'VIEWER',
);
const canRunSelectedNode = computed(
  () =>
    canRun.value &&
    (canEdit.value || selectedNode.value?.type !== 'content-planner'),
);
const agentPanelUsesDrawer = computed(
  // Preserve a usable graph viewport rather than forcing four narrow desktop columns.
  () => viewportWidth.value < (selectedNode.value ? 1600 : 1120),
);
const agentPanelStyle = computed<CSSProperties>(() => ({
  '--agent-panel-width': `${agentPanelWidth.value}px`,
}));
const agentWorkflowNodes = computed(() => {
  // X6 owns the live graph; this revision makes add/remove/config changes visible to Agent refs.
  void graphRevision.value;
  return adapter.value?.serializeDefinition().nodes ?? [];
});
const currentUserRoleLabel = computed(() => {
  const role = currentUserRole.value;
  return role
    ? {
        EDITOR: '编辑者',
        OWNER: '所有者',
        RUNNER: '运行者',
        VIEWER: '只读',
      }[role]
    : '';
});
const inputUploadAccept = computed(() =>
  selectedNode.value?.type === 'audio-input'
    ? ['mp3', 'wav', 'm4a', 'flac', 'ogg']
    : selectedNode.value?.type === 'video-input'
      ? ['mp4', 'mov', 'webm']
      : ['jpg', 'jpeg', 'png', 'webp'],
);
const inputUploadMaxSize = computed(() =>
  selectedNode.value?.type === 'audio-input'
    ? 100
    : selectedNode.value?.type === 'video-input'
      ? 500
      : 25,
);
const quickConnectStyle = computed<CSSProperties>(() => ({
  left: `${quickConnectPosition.left}px`,
  top: `${quickConnectPosition.top}px`,
}));
const filteredQuickConnectOptions = computed(() => {
  const keyword = quickConnectSearch.value.trim().toLowerCase();
  return (quickConnectRequest.value?.options ?? []).filter(
    ({ template }) =>
      !keyword ||
      template.label.toLowerCase().includes(keyword) ||
      template.description.toLowerCase().includes(keyword),
  );
});
const summary = computed(() => planSummary(pendingPlan.value?.plan));
const saveStatus = autosave.statusLabel;
const hasAutosaveConflict = computed(
  () => autosave.status.value === 'CONFLICT',
);
const aggregatedRunningNodeRuns = computed(() =>
  aggregateLoopNodeRuns(runningExecution.value?.nodeRuns ?? []),
);
const activeExecutionId = computed(() => {
  const execution = runningExecution.value;
  return execution &&
    ['CANCEL_REQUESTED', 'CREATED', 'RUNNING'].includes(execution.status)
    ? execution.id
    : undefined;
});
const { state: executionStreamState } = useExecutionEventStream({
  executionId: () => activeExecutionId.value,
  onError: (_error, context) => {
    if (!context.reconnecting) scheduleExecutionRefresh(500);
  },
  onEvent: () => scheduleExecutionRefresh(),
  onReady: () => scheduleExecutionRefresh(),
});
const selectedResultNodeRun = computed(() =>
  selectedNode.value
    ? (aggregatedRunningNodeRuns.value.find(
        (nodeRun) => nodeRun.nodeId === selectedNode.value?.id,
      ) ?? latestNodeRunsByNodeId.value[selectedNode.value.id])
    : undefined,
);
const inlineEditorBusy = computed(
  () =>
    plannerBusy.value ||
    [
      'ARCHIVING_AI',
      'BLOCKED',
      'CANCEL_REQUESTED',
      'PENDING',
      'RUNNING',
      'WAITING_AI',
    ].includes(selectedResultNodeRun.value?.status ?? ''),
);
const inlineEditorProgress = computed(() => {
  const status = selectedResultNodeRun.value?.status;
  if (status === 'SUCCEEDED') return 100;
  if (status === 'FAILED' || status === 'CANCELED') return 0;
  return status ? executionProgress(runningExecution.value) : undefined;
});
const visibleResultNodeRuns = computed(() => {
  const nodeRuns = runningExecution.value?.nodeRuns ?? [];
  return selectedNode.value
    ? nodeRuns.filter(
        (nodeRun) =>
          canvasNodeIdForRun(nodeRun.nodeId) === selectedNode.value?.id,
      )
    : nodeRuns;
});
const resultAssets = computed(() => {
  const nodeRunIds = new Set(
    visibleResultNodeRuns.value.map((nodeRun) => nodeRun.id),
  );
  const assetIds = new Set<number>();
  const urls = new Set<string>();
  for (const nodeRun of visibleResultNodeRuns.value) {
    if (!nodeRun.outputJson) continue;
    try {
      collectOutputReferences(JSON.parse(nodeRun.outputJson), assetIds, urls);
    } catch {
      // Invalid provider output remains visible in the run tab, never rendered as media.
    }
  }
  return projectAssets.value.filter(
    (asset) =>
      Boolean(asset.url) &&
      ['AUDIO', 'IMAGE', 'VIDEO'].includes(asset.kind) &&
      (assetIds.has(asset.id) ||
        (asset.url ? urls.has(asset.url) : false) ||
        (asset.sourceNodeRunId
          ? nodeRunIds.has(asset.sourceNodeRunId)
          : false)),
  );
});
const generatedImageAssetsByNodeId = computed(() => {
  const result = new Map<string, FdmCreativeApi.CreativeAsset[]>();
  const metadataForwardingTypes = new Set([
    'image-collection',
    'image-loop',
    'image-select',
  ]);
  const orderedNodeIds = new Set<string>();
  const nodeRuns = runningExecution.value?.nodeRuns ?? [];
  const nodeRunById = new Map(nodeRuns.map((nodeRun) => [nodeRun.id, nodeRun]));
  const append = (nodeId: string, asset: FdmCreativeApi.CreativeAsset) => {
    const canvasNodeId = canvasNodeIdForRun(nodeId);
    const values = result.get(canvasNodeId) ?? [];
    if (!values.some((item) => item.id === asset.id)) values.push(asset);
    result.set(canvasNodeId, values);
  };
  const imageAssetById = new Map(
    projectAssets.value
      .filter((asset) => asset.kind === 'IMAGE')
      .map((asset) => [asset.id, asset]),
  );
  for (const nodeRun of nodeRuns) {
    if (
      !nodeRun.outputJson ||
      !nodeRun.nodeType ||
      !metadataForwardingTypes.has(nodeRun.nodeType)
    ) {
      continue;
    }
    const assetIds = new Set<number>();
    try {
      collectOutputReferences(
        JSON.parse(nodeRun.outputJson),
        assetIds,
        new Set(),
      );
    } catch {
      continue;
    }
    if (assetIds.size > 0) {
      orderedNodeIds.add(canvasNodeIdForRun(nodeRun.nodeId));
    }
    for (const assetId of assetIds) {
      const asset = imageAssetById.get(assetId);
      if (asset) append(nodeRun.nodeId, asset);
    }
  }
  for (const asset of projectAssets.value) {
    if (asset.kind !== 'IMAGE' || !asset.sourceNodeRunId) continue;
    const nodeRun = nodeRunById.get(asset.sourceNodeRunId);
    if (!nodeRun) continue;
    append(nodeRun.nodeId, asset);
  }
  for (const [nodeId, values] of result) {
    if (!orderedNodeIds.has(nodeId)) {
      values.sort((left, right) => left.id - right.id);
    }
  }
  return result;
});
const connectedImageReferences = computed(() => {
  // X6 owns the graph state, so this revision makes edge/config changes reactive.
  void graphRevision.value;
  const graphAdapter = adapter.value;
  const nodeId = selectedNode.value?.id;
  if (!graphAdapter || !nodeId) return [];
  return resolveConnectedImageReferences(
    graphAdapter.serializeDefinition(),
    nodeId,
    projectAssets.value,
    generatedImageAssetsByNodeId.value,
  );
});
const navigationNodeCount = computed(() => {
  // X6 owns the node collection; graphRevision makes structural changes reactive.
  void graphRevision.value;
  return adapter.value?.graph.getNodes().length ?? navigationNodes.value.length;
});
const connectedTextSources = computed(() => {
  void graphRevision.value;
  const graphAdapter = adapter.value;
  const node = selectedNode.value;
  if (!graphAdapter || !node) return [];
  const textInputPorts = new Map(
    node.ports
      .filter(
        (port) =>
          port.direction === 'INPUT' &&
          ['creative-brief', 'prompt-text'].includes(port.type),
      )
      .map(
        (port) =>
          [port.id, port.type as 'creative-brief' | 'prompt-text'] as const,
      ),
  );
  if (textInputPorts.size === 0) return [];
  const definition = graphAdapter.serializeDefinition();
  const nodes = new Map(definition.nodes.map((item) => [item.id, item]));
  return definition.edges.flatMap((edge) => {
    const portType = textInputPorts.get(edge.targetPortId);
    if (edge.targetNodeId !== node.id || !portType) return [];
    const source = nodes.get(edge.sourceNodeId);
    if (!source) return [];
    const nodeRun = latestNodeRunsByNodeId.value[source.id];
    const configuredPreview = [
      source.config.prompt,
      source.config.brief,
      source.config.description,
    ].find(
      (value): value is string =>
        typeof value === 'string' && Boolean(value.trim()),
    );
    return [
      {
        id: edge.id,
        name: source.name,
        portType,
        preview:
          portType === 'prompt-text'
            ? extractPromptText(nodeRun?.outputJson)
            : configuredPreview?.trim(),
        status: nodeRun?.status,
      },
    ];
  });
});
const connectedPromptInputCount = computed(
  () =>
    connectedTextSources.value.filter(
      (source) => source.portType === 'prompt-text',
    ).length,
);
const resultText = computed(() =>
  [
    'image-loop',
    'prompt-generator',
    'prompt-template',
    'random-prompt',
    'video-loop',
  ].includes(selectedNode.value?.type ?? '')
    ? extractPromptText(selectedResultNodeRun.value?.outputJson)
    : undefined,
);

interface ResultHistoryAction {
  asset: FdmCreativeApi.NodeResultAsset;
  version: FdmCreativeApi.NodeResultVersion;
}

async function refreshNodeResultVersions() {
  const targetProjectId = projectId.value;
  const targetNodeId = selectedNode.value?.id;
  const requestSequence = ++nodeResultRequestSequence;
  if (!targetNodeId || !Number.isFinite(targetProjectId)) {
    nodeResultVersions.value = [];
    nodeResultLoading.value = false;
    return;
  }
  nodeResultVersions.value = [];
  nodeResultLoading.value = true;
  try {
    const page = await getCreativeNodeResultPage({
      nodeId: targetNodeId,
      pageNo: 1,
      pageSize: 20,
      projectId: targetProjectId,
    });
    if (
      requestSequence === nodeResultRequestSequence &&
      targetProjectId === projectId.value &&
      targetNodeId === selectedNode.value?.id
    ) {
      nodeResultVersions.value = page.list;
    }
  } catch {
    // Result history is supplemental to the editor. Do not block a working
    // draft when a retained history row has been concurrently cleaned up.
    if (
      requestSequence === nodeResultRequestSequence &&
      targetProjectId === projectId.value &&
      targetNodeId === selectedNode.value?.id
    ) {
      nodeResultVersions.value = [];
    }
  } finally {
    if (requestSequence === nodeResultRequestSequence) {
      nodeResultLoading.value = false;
    }
  }
}

function collectOutputReferences(
  value: unknown,
  assetIds: Set<number>,
  urls: Set<string>,
  depth = 0,
) {
  if (depth > 10 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) {
      collectOutputReferences(item, assetIds, urls, depth + 1);
    }
    return;
  }
  if (typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (typeof record.assetId === 'number') assetIds.add(record.assetId);
  if (typeof record.url === 'string') urls.add(record.url);
  for (const nested of Object.values(record)) {
    collectOutputReferences(nested, assetIds, urls, depth + 1);
  }
}

async function refreshProjectAssets(targetProjectId = projectId.value) {
  const page = await getCreativeAssetPage({
    pageNo: 1,
    pageSize: 100,
    projectId: targetProjectId,
  }).catch(() => undefined);
  if (page && targetProjectId === projectId.value) {
    projectAssets.value = page.list;
    syncAssetNodePreviews();
    syncExecutionNodePreviews();
  }
}

function syncAssetNodePreviews() {
  const graphAdapter = adapter.value;
  if (!graphAdapter) return;
  const assets = new Map(projectAssets.value.map((asset) => [asset.id, asset]));
  for (const node of graphAdapter.graph.getNodes()) {
    if (
      !['audio-input', 'image-input', 'video-input'].includes(
        node.getData()?.type,
      )
    )
      continue;
    const assetId = node.getData()?.config?.assetId;
    const asset = [...assets.values()].find(
      (candidate) => String(candidate.id) === String(assetId),
    );
    graphAdapter.setNodeDisplayData(node.id, {
      assetName: asset?.name,
      previewUrl: asset?.url,
    });
  }
}

watch(
  () => [projectId.value, selectedNode.value?.id] as const,
  () => {
    void refreshNodeResultVersions();
  },
);

function syncExecutionNodePreviews() {
  const graphAdapter = adapter.value;
  const execution = runningExecution.value;
  if (!graphAdapter) return;
  const latestNodeRuns = Object.values(latestNodeRunsByNodeId.value).filter(
    (item): item is FdmCreativeApi.NodeRun => item !== undefined,
  );
  if (!execution?.nodeRuns && latestNodeRuns.length === 0) return;
  const nodeRunById = new Map(
    [...(execution?.nodeRuns ?? []), ...latestNodeRuns].map((item) => [
      item.id,
      item,
    ]),
  );
  for (const nodeRun of latestNodeRuns) {
    const canvasNodeId = canvasNodeIdForRun(nodeRun.nodeId);
    const graphNodeType = graphAdapter.graph
      .getCellById(canvasNodeId)
      ?.getData()?.type;
    if (
      nodeRun.nodeType !== 'prompt-generator' &&
      ![
        'image-loop',
        'prompt-generator',
        'prompt-template',
        'random-prompt',
        'video-loop',
      ].includes(graphNodeType ?? '')
    ) {
      continue;
    }
    graphAdapter.setNodeDisplayData(canvasNodeId, {
      outputText: extractPromptText(nodeRun.outputJson),
    });
  }
  for (const asset of projectAssets.value) {
    if (!asset.sourceNodeRunId || !asset.url) continue;
    const nodeRun = nodeRunById.get(asset.sourceNodeRunId);
    if (!nodeRun) continue;
    graphAdapter.setNodeDisplayData(canvasNodeIdForRun(nodeRun.nodeId), {
      assetName: asset.name,
      assetType: asset.kind,
      previewUrl: asset.url,
    });
  }
}

function mergeLatestNodeRuns(execution: FdmCreativeApi.ExecutionDetail) {
  if (!execution.nodeRuns?.length) return;
  const next = { ...latestNodeRunsByNodeId.value };
  for (const nodeRun of aggregateLoopNodeRuns(execution.nodeRuns)) {
    next[nodeRun.nodeId] = nodeRun;
  }
  latestNodeRunsByNodeId.value = next;
}

async function restoreLatestExecution(
  targetProjectId: number,
  generation: number,
) {
  try {
    const page = await getCreativeExecutionPage({
      pageNo: 1,
      pageSize: 1,
      projectId: targetProjectId,
    });
    const latest = page.list[0];
    if (
      !latest ||
      generation !== initializationGeneration ||
      runningExecution.value
    ) {
      return;
    }
    const execution = await getCreativeExecution(latest.id);
    if (
      generation !== initializationGeneration ||
      targetProjectId !== projectId.value ||
      runningExecution.value
    ) {
      return;
    }
    runningExecution.value = execution;
    mergeLatestNodeRuns(execution);
    for (const nodeRun of aggregateLoopNodeRuns(execution.nodeRuns ?? [])) {
      adapter.value?.setNodeStatus(nodeRun.nodeId, nodeRun.status);
    }
    syncExecutionNodePreviews();
    if (['CANCEL_REQUESTED', 'CREATED', 'RUNNING'].includes(execution.status)) {
      executionTimer = setTimeout(
        () => refreshExecutionInBackground(execution.id, targetProjectId),
        15_000,
      );
    }
  } catch {
    // Historical results accelerate the editor, but never block opening a draft.
  }
}

function setInputAsset(value: unknown) {
  const assetId = typeof value === 'number' ? value : undefined;
  setConfig('assetId', assetId);
  const nodeId = selectedNode.value?.id;
  if (!nodeId) return;
  const asset = projectAssets.value.find((item) => item.id === assetId);
  adapter.value?.setNodeDisplayData(nodeId, {
    assetName: asset?.name,
    previewUrl: asset?.url,
  });
}

function uploadedUrl(result: unknown) {
  if (typeof result === 'string') return result;
  if (!result || typeof result !== 'object') return undefined;
  const response = result as Record<string, unknown>;
  if (typeof response.url === 'string') return response.url;
  if (typeof response.data === 'string') return response.data;
  return undefined;
}

async function uploadInputAsset(
  file: File,
  onUploadProgress?: AxiosProgressEvent,
) {
  const node = selectedNode.value;
  if (
    !node ||
    !['audio-input', 'image-input', 'video-input'].includes(node.type)
  ) {
    throw new Error('请先选择图片、视频或音频输入节点');
  }
  const kind =
    node.type === 'audio-input'
      ? 'AUDIO'
      : node.type === 'video-input'
        ? 'VIDEO'
        : 'IMAGE';
  const mimePrefix =
    kind === 'AUDIO' ? 'audio/' : kind === 'VIDEO' ? 'video/' : 'image/';
  const maxBytes = inputUploadMaxSize.value * 1024 * 1024;
  if (!file.type.startsWith(mimePrefix)) {
    throw new Error(
      `请选择有效的${kind === 'AUDIO' ? '音频' : kind === 'VIDEO' ? '视频' : '图片'}文件`,
    );
  }
  if (file.size > maxBytes) {
    throw new Error(`文件不能超过 ${inputUploadMaxSize.value} MB`);
  }
  const response = await uploadFile(
    { directory: `fdmcreative/${projectId.value}/uploads`, file },
    onUploadProgress,
  );
  const url = uploadedUrl(response);
  if (!url) throw new Error('文件服务未返回可用 URL');
  const assetId = await createCreativeAsset({
    kind,
    name: file.name,
    projectId: projectId.value,
    url,
  });
  const overrides = new Set(
    Array.isArray(node.config.userOverrides)
      ? node.config.userOverrides.map(String)
      : [],
  );
  overrides.add('assetId');
  const config = {
    ...node.config,
    assetId,
    userOverrides: [...overrides],
  };
  adapter.value?.updateNode(node.id, { config });
  adapter.value?.setNodeDisplayData(node.id, {
    assetName: file.name,
    previewUrl: url,
  });
  if (selectedNode.value?.id === node.id) {
    selectedNode.value = { ...node, config };
  }
  await refreshProjectAssets(projectId.value);
  message.success('素材已上传并绑定到当前节点');
  return url;
}

/**
 * Agent attachments are first imported into the current project through the normal asset service.
 * The Agent request subsequently carries only its stable asset ID—never an upload URL or file
 * path—so the gateway remains inside FDM's existing asset and permission boundary.
 */
async function uploadAgentReferenceAsset(file: File) {
  let kind: 'AUDIO' | 'IMAGE' | 'VIDEO' | undefined;
  if (file.type.startsWith('image/')) {
    kind = 'IMAGE';
  } else if (file.type.startsWith('video/')) {
    kind = 'VIDEO';
  } else if (file.type.startsWith('audio/')) {
    kind = 'AUDIO';
  }
  if (!kind) throw new Error('仅支持图片、视频或音频素材作为 Agent 引用');
  const maxSizeMb = { AUDIO: 100, IMAGE: 25, VIDEO: 500 }[kind];
  const kindLabel = { AUDIO: '音频', IMAGE: '图片', VIDEO: '视频' }[kind];
  if (file.size > maxSizeMb * 1024 * 1024) {
    throw new Error(`${kindLabel}不能超过 ${maxSizeMb} MB`);
  }
  const response = await uploadFile({
    directory: `fdmcreative/${projectId.value}/agent-references`,
    file,
  });
  const url = uploadedUrl(response);
  if (!url) throw new Error('文件服务未返回可用 URL');
  const assetId = await createCreativeAsset({
    kind,
    name: file.name,
    projectId: projectId.value,
    url,
  });
  const asset = await getCreativeAsset(assetId);
  await refreshProjectAssets(projectId.value);
  return asset;
}

function toggleAgentPanel() {
  agentPanelOpen.value = !agentPanelOpen.value;
}

function recordGraphChange() {
  if (!canEdit.value) return;
  graphRevision.value += 1;
  if (canvasNavigatorOpen.value) refreshNavigationNodes();
  if (graphDragActive) {
    graphChangedDuringDrag = true;
    return;
  }
  const definition = adapter.value?.serializeDefinition();
  if (definition) void autosave.markChanged(definition);
}

function handleNodeDragStateChange(dragging: boolean, changed = false) {
  graphDragActive = dragging;
  if (dragging) {
    graphChangedDuringDrag = false;
    return;
  }
  const shouldCapture = changed || graphChangedDuringDrag;
  graphChangedDuringDrag = false;
  if (!shouldCapture || !canEdit.value) return;
  const definition = adapter.value?.serializeDefinition();
  if (definition) void autosave.markChanged(definition);
}

async function flushBeforeWorkflowAction(action: string) {
  if (!canEdit.value) return true;
  const saved = await autosave.flush();
  if (!saved) {
    showWorkflowSaveBlockedFeedback(action);
  }
  return saved;
}

function showWorkflowSaveBlockedFeedback(action: string) {
  const feedback = workflowSaveBlockedFeedback(
    autosave.status.value,
    action,
    autosave.conflictError.value,
  );
  if (!feedback) return;
  if (feedback.level === 'error') {
    message.error(feedback.message);
  } else {
    message.warning(feedback.message);
  }
}

function prepareAgentCanvasMutation() {
  if (!canEdit.value) {
    message.warning('当前项目角色为只读，不能提交或应用 Agent 方案');
    return Promise.resolve(false);
  }
  return flushBeforeWorkflowAction('提交或应用 Agent 方案');
}

async function applyAgentDraft(payload: {
  affectedNodeIds: string[];
  draft: FdmCreativeApi.WorkflowDraft;
}) {
  draftVersion.value = payload.draft.draftVersion;
  selectedNode.value = undefined;
  adapter.value?.restoreAuthoritativeAgentDefinition(payload.draft.definition);
  autosave.resetBaseline(payload.draft);
  syncAssetNodePreviews();
  refreshNavigationNodes();
  await nextTick();
  const firstAffectedNodeId = firstRestorableAgentNode(
    payload.draft,
    payload.affectedNodeIds,
  );
  if (firstAffectedNodeId) adapter.value?.focusNode(firstAffectedNodeId);
}

function monitorAgentExecution() {
  // Agent execution returns a Java Long as a string. Do not coerce it through Number: refresh
  // the normal execution list instead, which also handles a very fast terminal execution.
  const targetProjectId = projectId.value;
  const targetGeneration = initializationGeneration;
  window.setTimeout(() => {
    if (
      targetProjectId === projectId.value &&
      targetGeneration === initializationGeneration
    ) {
      void restoreLatestExecution(targetProjectId, targetGeneration);
    }
  }, 450);
}

function updateViewportWidth() {
  viewportWidth.value = window.innerWidth;
}

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!autosave.needsUnloadGuard.value) return;
  event.preventDefault();
  event.returnValue = '';
}

async function initialize() {
  const generation = ++initializationGeneration;
  const requestedProjectId = projectId.value;
  closeQuickConnect();
  autosave.resetBaseline();
  adapter.value?.disposeWorkbenchGraph();
  adapter.value = undefined;
  selectedNode.value = undefined;
  runningExecution.value = undefined;
  latestNodeRunsByNodeId.value = {};
  pendingPlan.value = undefined;
  projectAssets.value = [];
  nodeResultVersions.value = [];
  nodeResultLoading.value = false;
  mediaTools.value = [];
  planModalOpen.value = false;
  if (executionTimer) clearTimeout(executionTimer);
  if (executionEventRefreshTimer) clearTimeout(executionEventRefreshTimer);
  if (planTimer) clearTimeout(planTimer);
  if (promptRefineTimer) clearTimeout(promptRefineTimer);
  if (!Number.isFinite(requestedProjectId)) {
    message.error('项目编号无效');
    void router.replace('/fdmcreative/workbench');
    return;
  }
  loading.value = true;
  try {
    const [projectData, draft, capability, availableModels, assetPage, tools] =
      await Promise.all([
        getCreativeProject(requestedProjectId),
        getWorkflowDraft(requestedProjectId),
        getWorkflowCapability(requestedProjectId).catch(() => ({
          autosaveEnabled: false,
          mediaToolsEnabled: false,
        })),
        searchFdmAiModels({}).catch(() => []),
        getCreativeAssetPage({
          pageNo: 1,
          pageSize: 100,
          projectId: requestedProjectId,
        }).catch(() => ({ list: [], total: 0 })),
        getCreativeMediaToolDescriptors(requestedProjectId).catch(() => []),
      ]);
    if (generation !== initializationGeneration) return;
    project.value = projectData;
    workflowCapability.value = capability;
    modelOptions.value = availableModels;
    projectAssets.value = assetPage.list;
    mediaTools.value = tools;
    draftVersion.value = draft?.draftVersion ?? projectData.draftVersion ?? 0;
    await nextTick();
    if (!canvasRef.value || !minimapRef.value) return;
    adapter.value = createWorkbenchGraph(
      {
        container: canvasRef.value,
        dndContainer: nodeLibraryRef.value?.getElement(),
        minimapContainer: minimapRef.value,
        readonly: !canEdit.value,
      },
      {
        onChange: () => {
          recordGraphChange();
        },
        onConnectToBlank: openQuickConnect,
        onNodeDragStateChange: handleNodeDragStateChange,
        onNavigationChange: () => {
          if (canvasNavigatorOpen.value) refreshNavigationNodes();
        },
        onSelectionChange: (node) => {
          if (node) closeQuickConnect();
          selectedNode.value = node;
          syncPlannerControls(node);
        },
        onViewportChange: () => {
          const request = quickConnectRequest.value;
          if (!request || !adapter.value) return;
          const clientPoint = adapter.value.graph.localToClient(
            request.graphPoint,
          );
          request.clientPoint = {
            x: clientPoint.x,
            y: clientPoint.y,
          };
          void nextTick(updateQuickConnectPosition);
        },
        onZoom: (zoom) => {
          zoomPercent.value = Math.round(zoom * 100);
        },
      },
    );
    adapter.value.restoreDefinition(draft?.definition ?? EMPTY_WORKFLOW);
    refreshNavigationNodes();
    autosave.resetBaseline(
      draft ?? {
        definition: EMPTY_WORKFLOW,
        draftVersion: draftVersion.value,
        projectId: requestedProjectId,
      },
    );
    if (canEdit.value) ensureDefaultModels();
    syncAssetNodePreviews();
    void restoreLatestPlan(requestedProjectId, generation);
    void restoreLatestExecution(requestedProjectId, generation);
  } finally {
    if (generation === initializationGeneration) loading.value = false;
  }
}

function startDrag(type: string, event: MouseEvent) {
  if (!canEdit.value) return;
  const template = CREATIVE_NODE_CATALOG.find((item) => item.type === type);
  if (template && adapter.value?.startDrag(template, event) === false) {
    message.warning(
      type === 'content-planner'
        ? '画布中只能有一个 AI 内容规划节点'
        : `画布最多支持 ${MAX_WORKBENCH_NODES} 个节点`,
    );
  }
}

function addNode(type: string) {
  if (!canEdit.value) return;
  if (!adapter.value?.addNode(type, { x: 180, y: 160 })) {
    message.warning(
      type === 'content-planner'
        ? '画布中只能有一个 AI 内容规划节点'
        : `画布最多支持 ${MAX_WORKBENCH_NODES} 个节点`,
    );
  }
}

function refreshNavigationNodes() {
  navigationNodes.value = adapter.value?.getNavigationNodes() ?? [];
}

function toggleCanvasNavigator() {
  refreshNavigationNodes();
  canvasNavigatorOpen.value = !canvasNavigatorOpen.value;
}

async function locateCanvasNode(nodeId: string) {
  const graphAdapter = adapter.value;
  if (!graphAdapter?.focusNode(nodeId)) return;
  canvasNavigatorOpen.value = false;
  await nextTick();
  graphAdapter.focusNode(nodeId);
}

function updateQuickConnectPosition() {
  const request = quickConnectRequest.value;
  const shell = canvasShellRef.value;
  if (!request || !shell) return;
  const shellRect = shell.getBoundingClientRect();
  const popupRect = quickConnectRef.value?.getBoundingClientRect();
  const popupWidth = popupRect?.width || 320;
  const popupHeight = popupRect?.height || 380;
  const anchorX = request.clientPoint.x - shellRect.left;
  const anchorY = request.clientPoint.y - shellRect.top;
  const preferredTop = anchorY + 12;
  quickConnectPosition.left = Math.max(
    12,
    Math.min(anchorX + 12, shellRect.width - popupWidth - 12),
  );
  quickConnectPosition.top = Math.max(
    12,
    Math.min(
      preferredTop + popupHeight <= shellRect.height
        ? preferredTop
        : anchorY - popupHeight - 12,
      shellRect.height - popupHeight - 12,
    ),
  );
}

function openQuickConnect(request: WorkbenchBlankConnectionRequest) {
  if (!canEdit.value) return;
  adapter.value?.clearSelection();
  quickConnectSearch.value = '';
  quickConnectRequest.value = request;
  void nextTick(() => {
    updateQuickConnectPosition();
    quickConnectRef.value?.querySelector('input')?.focus();
  });
}

function closeQuickConnect() {
  quickConnectRequest.value = undefined;
  quickConnectSearch.value = '';
}

function createQuickConnectedNode(option: CreativeQuickConnectOption) {
  if (!canEdit.value) return;
  const request = quickConnectRequest.value;
  const graphAdapter = adapter.value;
  if (!request || !graphAdapter) return;
  const created = graphAdapter.addConnectedNode(request, option);
  closeQuickConnect();
  if (!created) {
    message.warning('该节点当前无法创建或连接，请检查节点上限与端口类型');
  }
}

function chooseFirstQuickConnectOption() {
  const option = filteredQuickConnectOptions.value[0];
  if (option) createQuickConnectedNode(option);
}

function handleQuickConnectPointerDown(event: PointerEvent) {
  if (
    quickConnectRequest.value &&
    event.target instanceof Node &&
    !quickConnectRef.value?.contains(event.target)
  ) {
    closeQuickConnect();
  }
}

function updateSelected(patch: {
  config?: Record<string, unknown>;
  name?: string;
}) {
  if (!canEdit.value) return;
  if (!selectedNode.value) return;
  adapter.value?.updateNode(selectedNode.value.id, patch);
  selectedNode.value = {
    ...selectedNode.value,
    ...patch,
    config: patch.config ?? selectedNode.value.config,
  };
}

function setConfig(key: string, value: unknown) {
  if (!canEdit.value) return;
  const userOverrides = new Set(
    Array.isArray(selectedConfig.value.userOverrides)
      ? selectedConfig.value.userOverrides.map(String)
      : [],
  );
  if (key !== 'promptReferenceBindings') {
    userOverrides.add(key);
  }
  updateSelected({
    config: {
      ...selectedConfig.value,
      [key]: value,
      userOverrides: [...userOverrides],
    },
  });
}

function setNodeName(value?: string) {
  if (!canEdit.value) return;
  const normalized = value?.trim() || selectedNode.value?.id || '未命名节点';
  setConfig('name', normalized);
  updateSelected({ name: normalized });
}

function ensurePlannerNode() {
  const graphAdapter = adapter.value;
  if (!graphAdapter) return false;
  const current =
    graphAdapter.graph.getCellById('content-planner') ??
    graphAdapter.graph
      .getNodes()
      .find((node) => node.getData()?.type === 'content-planner');
  let plannerNodeId = current?.id;
  if (!current) {
    const created = graphAdapter.addNode('content-planner', { x: 100, y: 180 });
    if (!created) {
      message.error(
        `无法创建规划节点，画布最多支持 ${MAX_WORKBENCH_NODES} 个节点`,
      );
      return false;
    }
    plannerNodeId = created.id;
  }
  graphAdapter.updateNode(plannerNodeId!, {
    config: {
      ...graphAdapter.graph.getCellById(plannerNodeId!)?.getData()?.config,
      imageCount: planner.imageCount,
      planMode: planner.mode,
      prompt: planner.prompt.trim(),
      videoCount: planner.videoCount,
    },
  });
  return true;
}

function defaultModelForNode(node: FdmCreativeApi.WorkflowNode) {
  const referenceAssetIds = Array.isArray(node.config.referenceAssetIds)
    ? node.config.referenceAssetIds.filter(
        (item): item is number => typeof item === 'number',
      )
    : [];
  return modelOptions.value.find((model) => {
    if (node.type === 'content-planner') {
      return (
        model.modality === 'TEXT' &&
        model.capabilities.includes('STRUCTURED_OUTPUT') &&
        (referenceAssetIds.length === 0 ||
          model.capabilities.includes('IMAGE_INPUT'))
      );
    }
    return supportsNodeModel(model, node.type, referenceAssetIds);
  });
}

function ensureDefaultModel(node: FdmCreativeApi.WorkflowNode) {
  if (!MODEL_NODE_TYPES.has(node.type)) return true;
  if (plannerLogicalModelIdForNode(node)) return true;
  const defaultModel = defaultModelForNode(node);
  const logicalModelId = normalizeModelIdentifier(defaultModel?.id);
  if (!logicalModelId) return false;
  adapter.value?.updateNode(node.id, {
    config: { ...node.config, logicalModelId },
  });
  return true;
}

function plannerLogicalModelIdForNode(node: FdmCreativeApi.WorkflowNode) {
  return normalizeModelIdentifier(
    node.config.logicalModelId ?? node.config.modelId,
  );
}

function ensureDefaultModels() {
  const graphAdapter = adapter.value;
  if (!graphAdapter) return false;
  let allConfigured = true;
  for (const node of graphAdapter.serializeDefinition().nodes) {
    if (!ensureDefaultModel(node)) allConfigured = false;
  }
  return allConfigured;
}

function ensurePlannerDefaultModel() {
  const plannerNode = adapter.value
    ?.serializeDefinition()
    .nodes.find((node) => node.type === 'content-planner');
  return plannerNode ? ensureDefaultModel(plannerNode) : false;
}

function plannerConfig() {
  const plannerNode = adapter.value?.graph
    .getNodes()
    .find((node) => node.getData()?.type === 'content-planner');
  return (plannerNode?.getData()?.config ?? {}) as Record<string, unknown>;
}

function plannerLogicalModelId() {
  return normalizeModelIdentifier(
    plannerConfig().logicalModelId ?? plannerConfig().modelId,
  );
}

function plannerReferenceAssetIds() {
  const value = plannerConfig().referenceAssetIds;
  return Array.isArray(value)
    ? value.filter((item): item is number => typeof item === 'number')
    : undefined;
}

function selectedPlannerModel() {
  const logicalModelId = plannerLogicalModelId();
  if (!logicalModelId) return undefined;
  return modelOptions.value.find(
    (item) => normalizeModelIdentifier(item.id) === logicalModelId,
  );
}

function validateSelectedPlannerModel(
  requiredCapability: FdmAiApi.Capability,
  requireImageInput = false,
) {
  const logicalModelId = plannerLogicalModelId();
  if (!logicalModelId) return true;
  const model = selectedPlannerModel();
  if (!model) {
    message.warning('所选模型已被删除或停用，请重新选择模型');
    return false;
  }
  if (
    model.modality !== 'TEXT' ||
    !model.capabilities.includes(requiredCapability)
  ) {
    message.warning(`所选模型不支持 ${requiredCapability}，请更换模型`);
    return false;
  }
  if (
    requireImageInput &&
    (plannerReferenceAssetIds()?.length ?? 0) > 0 &&
    !model.capabilities.includes('IMAGE_INPUT')
  ) {
    message.warning('所选模型不支持参考图片理解，请更换模型或移除参考图片');
    return false;
  }
  return true;
}

function syncPlannerControls(node?: FdmCreativeApi.WorkflowNode) {
  if (!node || node.type !== 'content-planner') return;
  const config = node.config;
  const prompt = config.prompt;
  const mode = config.planMode ?? config.mode;
  const imageCount = config.imageCount;
  const videoCount = config.videoCount;
  if (typeof prompt === 'string') planner.prompt = prompt;
  if (['IMAGE_SET', 'MIXED', 'VIDEO_SEQUENCE'].includes(String(mode))) {
    planner.mode = mode as FdmCreativeApi.PlanMode;
  }
  if (typeof imageCount === 'number') planner.imageCount = imageCount;
  if (typeof videoCount === 'number') planner.videoCount = videoCount;
}

function closeInlineEditor() {
  selectedNode.value = undefined;
  adapter.value?.clearSelection();
}

function handleInlineConfigChange(key: string, value: unknown) {
  setConfig(key, value);
  if (selectedNode.value?.type === 'content-planner') {
    if (key === 'prompt' && typeof value === 'string') planner.prompt = value;
    if (
      (key === 'planMode' || key === 'mode') &&
      ['IMAGE_SET', 'MIXED', 'VIDEO_SEQUENCE'].includes(String(value))
    ) {
      planner.mode = value as FdmCreativeApi.PlanMode;
    }
    if (key === 'imageCount' && typeof value === 'number') {
      planner.imageCount = value;
    }
    if (key === 'videoCount' && typeof value === 'number') {
      planner.videoCount = value;
    }
  }
}

function handleInlineAssetChange(payload: {
  assets?: FdmCreativeApi.CreativeAsset[];
  key: string;
  slot?: string;
  value: unknown;
}) {
  if (payload.assets?.length) {
    const merged = new Map(
      projectAssets.value.map((asset) => [asset.id, asset]),
    );
    payload.assets.forEach((asset) => merged.set(asset.id, asset));
    projectAssets.value = [...merged.values()];
  }
  if (
    payload.key === 'assetId' &&
    ['audio-input', 'image-input', 'video-input'].includes(
      selectedNode.value?.type ?? '',
    )
  ) {
    setInputAsset(payload.value);
    return;
  }
  handleInlineConfigChange(payload.key, payload.value);
  if (
    selectedNode.value &&
    ['firstFrameAssetId', 'lastFrameAssetId', 'referenceAssetIds'].includes(
      payload.slot || payload.key,
    )
  ) {
    let assetId: number | undefined;
    if (Array.isArray(payload.value)) {
      assetId = payload.value.find(
        (item): item is number => typeof item === 'number',
      );
    } else if (typeof payload.value === 'number') {
      assetId = payload.value;
    }
    const asset =
      payload.assets?.find((item) => item.id === assetId) ||
      payload.assets?.[0] ||
      projectAssets.value.find((item) => item.id === assetId);
    if (asset) {
      adapter.value?.setNodeDisplayData(selectedNode.value.id, {
        assetName: asset.name,
        assetType: asset.kind,
        previewUrl: asset.url,
      });
    }
  }
}

function canMutateFromResult(action: ResultHistoryAction) {
  if (!canEdit.value) {
    message.warning('当前项目角色为只读，不能采用结果或创建画布分支');
    return false;
  }
  if (autosave.status.value === 'CONFLICT') {
    message.warning('草稿存在保存冲突，请先处理冲突后再创建结果分支');
    return false;
  }
  if (
    action.asset.availability !== 'ACTIVE' ||
    !action.asset.id ||
    !action.asset.url ||
    !action.asset.kind
  ) {
    message.warning(action.asset.unavailableReason || '该历史素材已不可用');
    return false;
  }
  return true;
}

async function submitResultAdoption(
  action: ResultHistoryAction,
  nodeId: string,
  confirmStale: boolean,
) {
  if (!canMutateFromResult(action) || !action.asset.id) return;
  try {
    await adoptCreativeNodeResult({
      assetId: action.asset.id,
      confirmStale,
      expectedSelectionVersion: action.version.selectionVersion,
      nodeId,
      nodeRunId: action.version.nodeRunId,
      projectId: projectId.value,
    });
    await refreshNodeResultVersions();
    message.success(
      '已采用该结果版本；后续重跑会保留你的选择直到节点语义再次变更',
    );
  } catch (error) {
    await refreshNodeResultVersions();
    message.error(
      error instanceof Error
        ? error.message
        : '采用失败：结果可能已被其他编辑者更新，已刷新当前版本',
    );
  }
}

function handleResultAdopt(action: ResultHistoryAction) {
  if (!canMutateFromResult(action)) return;
  const nodeId = selectedNode.value?.id;
  if (!nodeId) return;
  if (action.version.selectionStatus !== 'STALE') {
    void submitResultAdoption(action, nodeId, false);
    return;
  }
  Modal.confirm({
    cancelText: '取消',
    content:
      '该节点的配置或上游语义已经变化。继续采用此历史结果会把它作为当前可复用结果；请确认这是你的明确选择。',
    okText: '确认采用历史结果',
    onOk: () => submitResultAdoption(action, nodeId, true),
    title: '确认采用语义已过期的结果？',
  });
}

function applyResultAssetDisplay(
  nodeId: string,
  asset: FdmCreativeApi.NodeResultAsset,
) {
  adapter.value?.setNodeDisplayData(nodeId, {
    assetName: asset.name,
    assetType: asset.kind,
    previewUrl: asset.url,
  });
}

function handleResultPin(action: ResultHistoryAction) {
  if (!canMutateFromResult(action) || !action.asset.id || !action.asset.kind)
    return;
  const branch = adapter.value?.addPinnedMediaAsset({
    assetId: action.asset.id,
    assetKind: action.asset.kind,
    assetName: action.asset.name,
    originNodeId: selectedNode.value?.id,
  });
  if (!branch) {
    message.warning(
      `无法固定素材：请检查画布节点上限（${MAX_WORKBENCH_NODES}）`,
    );
    return;
  }
  applyResultAssetDisplay(branch.inputNode.id, action.asset);
  refreshNavigationNodes();
  message.success('已将结果固定为画布输入节点；素材仍由现有资产体系管理');
}

function handleResultTool(
  action: ResultHistoryAction & {
    tool: FdmCreativeApi.MediaToolDescriptor;
  },
) {
  if (!canMutateFromResult(action) || !action.asset.id || !action.asset.kind)
    return;
  if (!action.tool.available) {
    message.warning(action.tool.unavailableReason || '该媒体工具当前不可用');
    return;
  }
  const branch = adapter.value?.addMediaToolBranch({
    assetId: action.asset.id,
    assetKind: action.asset.kind,
    assetName: action.asset.name,
    originNodeId: selectedNode.value?.id,
    tool: action.tool,
  });
  if (!branch) {
    message.warning(
      `无法创建“${action.tool.label}”分支，请检查端口兼容性、节点上限或工具配置`,
    );
    return;
  }
  applyResultAssetDisplay(branch.inputNode.id, action.asset);
  refreshNavigationNodes();
  message.success(
    action.tool.id === 'save-asset-library'
      ? '已创建资产库输出分支，运行工作流后会按现有资产生命周期保存'
      : `已创建“${action.tool.label}”分支；请检查参数后按正常工作流运行`,
  );
}

function applyPlannerPromptFromLibrary(selection: PromptLibrarySelection) {
  planner.prompt =
    selection.mode === 'replace' || !planner.prompt.trim()
      ? selection.content
      : `${planner.prompt.trimEnd()}\n${selection.content}`;
  planner.prompt = planner.prompt.slice(0, 10_000);
  if (selectedNode.value?.type === 'content-planner') {
    handleInlineConfigChange('prompt', planner.prompt);
  }
}

function handleInlineRun(nodeId: string) {
  if (selectedNode.value?.type === 'content-planner') {
    syncPlannerControls(selectedNode.value);
    void previewPlan();
    return;
  }
  void run('NODE', nodeId);
}

function handleInlineRunDownstream(nodeId: string) {
  void run('DOWNSTREAM', nodeId);
}

function handleWorkbenchKeydown(event: KeyboardEvent) {
  const hasOpenPopup = document.querySelector(
    '.ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-picker-dropdown:not(.ant-picker-dropdown-hidden), .ant-modal-wrap',
  );
  const editableTarget =
    event.target instanceof Element &&
    event.target.closest(
      'input, textarea, [contenteditable="true"], [role="textbox"]',
    );
  if (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === 'f' &&
    !hasOpenPopup &&
    !editableTarget
  ) {
    event.preventDefault();
    refreshNavigationNodes();
    canvasNavigatorOpen.value = true;
    return;
  }
  if (event.key !== 'Escape' || event.defaultPrevented || hasOpenPopup) return;
  if (canvasNavigatorOpen.value) {
    event.preventDefault();
    canvasNavigatorOpen.value = false;
    return;
  }
  if (quickConnectRequest.value) {
    event.preventDefault();
    closeQuickConnect();
    return;
  }
  if (selectedNode.value) {
    event.preventDefault();
    closeInlineEditor();
  }
}

async function showWorkflowConflict(
  _snapshot: WorkflowAutosaveSnapshot,
  _error: unknown,
) {
  const targetProjectId = projectId.value;
  workflowConflictOpen.value = true;
  workflowConflictLoading.value = true;
  workflowConflictServerDraft.value = undefined;
  try {
    const latest = await getWorkflowDraft(targetProjectId);
    if (targetProjectId === projectId.value) {
      workflowConflictServerDraft.value = latest;
    }
  } catch {
    if (targetProjectId === projectId.value) {
      message.warning('无法读取服务器最新草稿；本地副本仍可安全导出');
    }
  } finally {
    if (targetProjectId === projectId.value) {
      workflowConflictLoading.value = false;
    }
  }
}

function downloadLocalConflictSnapshot() {
  const snapshot = autosave.localSnapshot.value;
  if (!snapshot) return;
  downloadWorkflowExport(createWorkflowExport(snapshot.definition));
  message.success('本地未保存副本已导出');
}

function keepLocalConflictSnapshot() {
  autosave.keepLocalForLater();
  workflowConflictOpen.value = false;
  message.info('已保留本地副本；自动保存保持暂停，稍后可继续处理冲突');
}

function handleWorkflowConflictModalOpen(nextOpen: boolean) {
  workflowConflictOpen.value = nextOpen;
  if (!nextOpen) autosave.keepLocalForLater();
}

function loadServerConflictDraft() {
  const latest = workflowConflictServerDraft.value;
  if (!latest) return;
  Modal.confirm({
    cancelText: '继续保留本地',
    content:
      '加载服务器版本会替换当前画布。若需要保留本地工作，请先点击“导出本地副本”。',
    okText: '加载服务器版本',
    okType: 'danger',
    onCancel: () => autosave.keepLocalForLater(),
    onOk: () => {
      selectedNode.value = undefined;
      adapter.value?.restoreDefinition(latest.definition);
      draftVersion.value = latest.draftVersion;
      if (project.value) project.value.draftVersion = latest.draftVersion;
      autosave.discardLocalAndLoadServer(latest);
      syncAssetNodePreviews();
      refreshNavigationNodes();
      workflowConflictOpen.value = false;
      message.success('已加载服务器最新草稿');
    },
    title: '确认加载服务器版本？',
  });
}

async function exportWorkflow() {
  if (!project.value) return;
  workflowExporting.value = true;
  try {
    const document = await exportWorkflowDraft(projectId.value);
    // Verify the server response before turning it into a browser download.
    const safeDocument = parseWorkflowExport(JSON.stringify(document));
    downloadWorkflowExport(safeDocument);
    message.success('工作流结构已导出');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '工作流导出失败');
  } finally {
    workflowExporting.value = false;
  }
}

function openWorkflowImport() {
  if (!canEdit.value) return;
  workflowImportFileRef.value?.click();
}

async function handleWorkflowImportFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (file.size > WORKFLOW_EXPORT_MAX_BYTES) {
    message.error('导入文件超过工作流大小限制');
    return;
  }
  try {
    const document = parseWorkflowExport(await file.text());
    workflowImportModalOpen.value = false;
    workflowImportDocument.value = JSON.stringify(document);
    workflowImportPreview.value = undefined;
    clearUnavailableImportAssets.value = false;
    await previewSelectedWorkflowImport();
  } catch (error) {
    message.error(error instanceof Error ? error.message : '导入文件不可用');
  }
}

async function previewSelectedWorkflowImport() {
  const document = workflowImportDocument.value;
  if (!document || !canEdit.value) return;
  workflowImportPreviewing.value = true;
  try {
    const preview = await previewWorkflowImport({
      clearUnavailableAssetReferences: clearUnavailableImportAssets.value,
      document,
      projectId: projectId.value,
    });
    workflowImportPreview.value = preview;
    workflowImportModalOpen.value = true;
  } catch (error) {
    message.error(error instanceof Error ? error.message : '导入预检失败');
  } finally {
    workflowImportPreviewing.value = false;
  }
}

async function confirmWorkflowImport() {
  const document = workflowImportDocument.value;
  const preview = workflowImportPreview.value;
  if (!document || !preview || !canEdit.value) return;
  if (!preview.canImport) {
    message.warning('请先清空失效素材引用，或在原项目中恢复相应素材后再导入');
    return;
  }
  if (!(await flushBeforeWorkflowAction('导入并替换当前草稿'))) return;

  const mutationId = createWorkflowMutationId('workflow-import');
  const conflictSnapshot: WorkflowAutosaveSnapshot = {
    definition: preview.definition,
    definitionHash: preview.definitionHash,
    expectedDraftVersion: draftVersion.value,
    mutationId,
    sequence: -1,
  };
  workflowImporting.value = true;
  try {
    const result = await importWorkflowDraft({
      clearUnavailableAssetReferences: clearUnavailableImportAssets.value,
      definitionHash: preview.definitionHash,
      document,
      expectedDraftVersion: draftVersion.value,
      mutationId,
      projectId: projectId.value,
      replaceConfirmed: true,
    });
    draftVersion.value = result.draft.draftVersion;
    if (project.value) project.value.draftVersion = result.draft.draftVersion;
    selectedNode.value = undefined;
    adapter.value?.restoreDefinition(result.draft.definition);
    autosave.resetBaseline(result.draft);
    syncAssetNodePreviews();
    refreshNavigationNodes();
    workflowImportModalOpen.value = false;
    message.success(
      result.report.clearedAssetReferences.length > 0
        ? '工作流结构已导入，失效素材引用已清空'
        : '工作流结构已导入',
    );
  } catch (error) {
    if (isWorkflowVersionConflict(error)) {
      await autosave.enterExternalConflict(conflictSnapshot, error);
    } else {
      message.error(error instanceof Error ? error.message : '工作流导入失败');
    }
  } finally {
    workflowImporting.value = false;
  }
}

function createWorkflowMutationId(prefix: string) {
  const unique =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}:${unique}`;
}

async function saveDraft(showMessage = true) {
  if (!canEdit.value) {
    if (showMessage) message.warning('当前项目角色为只读，不能保存草稿');
    return false;
  }
  if (!adapter.value) return false;
  try {
    const definition = adapter.value.serializeDefinition();
    if (!validateWorkflowDefinition(definition)) {
      message.error('画布包含无效连线、重复标识或超过节点上限，无法保存');
      return false;
    }
    // A manual click is an explicit immediate flush. If no change has been
    // captured yet, create one so manual save remains compatible with P1.
    if (!dirty.value) await autosave.markChanged(definition);
    const saved = await autosave.flush();
    if (saved && showMessage) message.success('草稿已保存');
    if (!saved && showMessage) showWorkflowSaveBlockedFeedback('保存草稿');
    return saved;
  } catch (error) {
    if (showMessage) {
      message.error(error instanceof Error ? error.message : '草稿保存失败');
    }
    return false;
  }
}

async function publish() {
  if (!canEdit.value) return;
  if (!(await flushBeforeWorkflowAction('发布任务'))) return;
  publishing.value = true;
  try {
    await publishWorkflow({
      expectedDraftVersion: draftVersion.value,
      projectId: projectId.value,
    });
    message.success('当前草稿已发布为不可变版本');
  } finally {
    publishing.value = false;
  }
}

async function previewPlan() {
  if (!canEdit.value) return;
  if (!planner.prompt.trim()) {
    message.warning('请先输入完整创作需求');
    return;
  }
  const requestedItems =
    (planner.mode === 'VIDEO_SEQUENCE' ? 0 : planner.imageCount) +
    (planner.mode === 'IMAGE_SET' ? 0 : planner.videoCount);
  if (requestedItems > 20) {
    message.warning('单次规划的图片与视频内容项合计不能超过 20 个');
    return;
  }
  if (!ensurePlannerNode() || !ensurePlannerDefaultModel()) {
    message.warning('当前没有可用的默认模型，请先在模型中心启用可用模型');
    return;
  }
  if (!validateSelectedPlannerModel('STRUCTURED_OUTPUT', true)) return;
  plannerBusy.value = true;
  try {
    const response = await previewContentPlan({
      imageCount:
        planner.mode === 'VIDEO_SEQUENCE' ? undefined : planner.imageCount,
      logicalModelId: plannerLogicalModelId(),
      mode: planner.mode,
      projectId: projectId.value,
      prompt: planner.prompt.trim(),
      referenceAssetIds: plannerReferenceAssetIds(),
      videoCount: planner.mode === 'IMAGE_SET' ? undefined : planner.videoCount,
    });
    pendingPlan.value = response;
    planModalOpen.value = true;
    if (['GENERATING', 'REPAIRING'].includes(response.status)) {
      message.info('规划任务已提交，可在任务面板查看进度');
      schedulePlanSync(response.planRevisionId);
    }
  } finally {
    plannerBusy.value = false;
  }
}

async function restoreLatestPlan(targetProjectId: number, generation: number) {
  try {
    const latest = await getLatestContentPlan(targetProjectId);
    if (generation !== initializationGeneration) return;
    if (!latest) return;
    pendingPlan.value = latest;
    if (['GENERATING', 'REPAIRING'].includes(latest.status)) {
      schedulePlanSync(latest.planRevisionId);
    }
  } catch {
    // 新项目还没有规划时后端可能返回空记录，不影响画布初始化。
  }
}

function schedulePlanSync(
  planRevisionId?: number,
  targetProjectId = projectId.value,
) {
  if (!planRevisionId) return;
  if (planTimer) clearTimeout(planTimer);
  planTimer = setTimeout(async () => {
    try {
      const result = await syncContentPlan(planRevisionId);
      if (targetProjectId !== projectId.value) return;
      pendingPlan.value = result;
      if (['GENERATING', 'REPAIRING'].includes(result.status)) {
        schedulePlanSync(planRevisionId, targetProjectId);
      } else if (result.status === 'PREVIEW') {
        planModalOpen.value = true;
        message.success('内容规划已生成，请确认后应用到画布');
      } else {
        message.error('内容规划生成失败，请调整提示词后重试');
      }
    } catch {
      if (targetProjectId === projectId.value) {
        schedulePlanSync(planRevisionId, targetProjectId);
      }
    }
  }, 2000);
}

async function applyPlan() {
  if (!canEdit.value) return;
  const preview = pendingPlan.value;
  if (!preview?.planRevisionId || !preview.plan) return;
  if (!ensurePlannerNode() || !ensurePlannerDefaultModel()) {
    message.warning('当前没有可用的默认模型，请先在模型中心启用可用模型');
    return;
  }
  if (!(await flushBeforeWorkflowAction('应用内容规划'))) return;
  const validated = await previewContentPlan({
    imageCount:
      planner.mode === 'VIDEO_SEQUENCE' ? undefined : planner.imageCount,
    logicalModelId: plannerLogicalModelId(),
    mode: preview.plan.mode,
    plan: preview.plan,
    projectId: projectId.value,
    prompt: planner.prompt.trim(),
    referenceAssetIds: plannerReferenceAssetIds(),
    videoCount: planner.mode === 'IMAGE_SET' ? undefined : planner.videoCount,
  });
  if (validated.status !== 'PREVIEW' || !validated.planRevisionId) {
    pendingPlan.value = validated;
    message.error('人工调整后的规划未通过 Schema 校验，请修正后重试');
    return;
  }
  pendingPlan.value = validated;
  const result = await applyContentPlan({
    expectedDraftVersion: draftVersion.value,
    planRevisionId: validated.planRevisionId,
    projectId: projectId.value,
  });
  draftVersion.value = result.draftVersion;
  if (result.definition) {
    adapter.value?.restoreDefinition(result.definition, false);
    syncAssetNodePreviews();
    autosave.resetBaseline({
      definition: result.definition,
      definitionHash: result.definitionHash,
      draftVersion: result.draftVersion,
      projectId: projectId.value,
    });
  } else {
    adapter.value?.applyPlanAsBatch(validated.plan ?? preview.plan);
    const definition = adapter.value?.serializeDefinition();
    if (definition) void autosave.markChanged(definition);
  }
  planModalOpen.value = false;
  message.success('规划已作为一个批次应用到画布，不会自动执行模型');
}

async function polishPrompt() {
  if (!canEdit.value) return;
  if (!planner.prompt.trim()) {
    message.warning('请先输入需要润色的创作需求');
    return;
  }
  if (!ensurePlannerNode() || !ensurePlannerDefaultModel()) {
    message.warning('当前没有可用的默认模型，请先在模型中心启用可用模型');
    return;
  }
  if (!validateSelectedPlannerModel('CHAT')) return;
  promptRefineBusy.value = true;
  try {
    const result = await refineCreativePrompt({
      logicalModelId: plannerLogicalModelId(),
      projectId: projectId.value,
      prompt: planner.prompt.trim(),
    });
    if (result.status === 'SUCCEEDED' && result.refinedPrompt) {
      planner.prompt = result.refinedPrompt;
      promptRefineBusy.value = false;
      message.success('提示词已润色');
      return;
    }
    schedulePromptRefineSync(result.refinementId, projectId.value);
  } catch {
    promptRefineBusy.value = false;
  }
}

function schedulePromptRefineSync(
  refinementId: number,
  targetProjectId = projectId.value,
) {
  if (promptRefineTimer) clearTimeout(promptRefineTimer);
  promptRefineTimer = setTimeout(async () => {
    try {
      const result = await syncCreativePrompt(refinementId);
      if (targetProjectId !== projectId.value) return;
      if (result.status === 'GENERATING') {
        schedulePromptRefineSync(refinementId, targetProjectId);
      } else {
        promptRefineBusy.value = false;
        if (result.status === 'SUCCEEDED' && result.refinedPrompt) {
          planner.prompt = result.refinedPrompt;
          message.success('提示词已润色');
        } else {
          message.error(result.errorMessage || '提示词润色失败');
        }
      }
    } catch {
      if (targetProjectId === projectId.value) {
        schedulePromptRefineSync(refinementId, targetProjectId);
      }
    }
  }, 2000);
}

function executionProgress(execution?: FdmCreativeApi.Execution) {
  if (!execution?.totalNodeCount) return 0;
  return Math.round(
    (((execution.succeededNodeCount ?? 0) + (execution.failedNodeCount ?? 0)) /
      execution.totalNodeCount) *
      100,
  );
}

async function run(scope: FdmCreativeApi.ExecutionScope, startNodeId?: string) {
  const targetProjectId = projectId.value;
  const targetGeneration = initializationGeneration;
  if (!canRun.value) {
    message.warning('当前项目角色没有运行权限');
    return;
  }
  if (canEdit.value && !ensureDefaultModels()) {
    message.warning('当前没有可用的默认模型，请先在模型中心启用可用模型');
    return;
  }
  if (canEdit.value && !(await flushBeforeWorkflowAction('运行工作流'))) return;
  if (
    targetProjectId !== projectId.value ||
    targetGeneration !== initializationGeneration
  ) {
    return;
  }
  const id = await runCreativeWorkflow({
    expectedDraftVersion: draftVersion.value,
    projectId: targetProjectId,
    scope,
    startNodeId,
  });
  if (
    targetProjectId !== projectId.value ||
    targetGeneration !== initializationGeneration
  ) {
    return;
  }
  await monitorExecution(id, targetProjectId);
}

async function monitorExecution(id: number, targetProjectId = projectId.value) {
  if (executionTimer) clearTimeout(executionTimer);
  const execution = await getCreativeExecution(id);
  if (targetProjectId !== projectId.value) return;
  runningExecution.value = execution;
  mergeLatestNodeRuns(execution);
  for (const node of aggregateLoopNodeRuns(execution.nodeRuns ?? [])) {
    adapter.value?.setNodeStatus(node.nodeId, node.status);
  }
  syncExecutionNodePreviews();
  if (['CANCEL_REQUESTED', 'CREATED', 'RUNNING'].includes(execution.status)) {
    if (executionTimer) clearTimeout(executionTimer);
    executionTimer = setTimeout(
      () => refreshExecutionInBackground(id, targetProjectId),
      15_000,
    );
  } else {
    await refreshProjectAssets(targetProjectId);
    void refreshNodeResultVersions();
  }
}

function refreshExecutionInBackground(
  id: number,
  targetProjectId = projectId.value,
) {
  void monitorExecution(id, targetProjectId).catch(() => {
    if (targetProjectId !== projectId.value || activeExecutionId.value !== id) {
      return;
    }
    if (executionTimer) clearTimeout(executionTimer);
    executionTimer = setTimeout(
      () => refreshExecutionInBackground(id, targetProjectId),
      15_000,
    );
  });
}

function scheduleExecutionRefresh(delay = 160) {
  const execution = runningExecution.value;
  if (!execution || execution.id !== activeExecutionId.value) return;
  if (executionEventRefreshTimer) clearTimeout(executionEventRefreshTimer);
  const targetProjectId = projectId.value;
  executionEventRefreshTimer = setTimeout(() => {
    executionEventRefreshTimer = undefined;
    refreshExecutionInBackground(execution.id, targetProjectId);
  }, delay);
}

async function cancelRun() {
  const executionId = runningExecution.value?.id;
  if (!executionId || !canRun.value) return;
  const targetProjectId = projectId.value;
  const targetGeneration = initializationGeneration;
  await cancelCreativeExecution(executionId);
  if (
    targetProjectId !== projectId.value ||
    targetGeneration !== initializationGeneration
  ) {
    return;
  }
  await monitorExecution(executionId, targetProjectId);
}

function goBack() {
  void router.push('/fdmcreative/workbench');
}

onBeforeRouteLeave(() => {
  if (!autosave.needsUnloadGuard.value) return true;
  return new Promise<boolean>((resolve) => {
    Modal.confirm({
      cancelText: '继续编辑',
      content:
        autosave.status.value === 'CONFLICT'
          ? '当前画布存在保存冲突，离开前请先导出本地副本或加载服务器版本。'
          : '当前画布仍有未持久化修改，离开后修改将丢失。',
      okText: '确认离开',
      onCancel: () => resolve(false),
      onOk: () => resolve(true),
      title: '确认离开工作台？',
    });
  });
});

watch(
  () => route.params.projectId,
  () => void initialize(),
);
watch(clearUnavailableImportAssets, () => {
  if (workflowImportModalOpen.value && workflowImportDocument.value) {
    void previewSelectedWorkflowImport();
  }
});
onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('keydown', handleWorkbenchKeydown);
  window.addEventListener('pointerdown', handleQuickConnectPointerDown, true);
  window.addEventListener('resize', updateViewportWidth);
  void initialize();
});

onBeforeUnmount(() => {
  initializationGeneration += 1;
  window.removeEventListener('beforeunload', handleBeforeUnload);
  window.removeEventListener('keydown', handleWorkbenchKeydown);
  window.removeEventListener(
    'pointerdown',
    handleQuickConnectPointerDown,
    true,
  );
  window.removeEventListener('resize', updateViewportWidth);
  if (executionTimer) clearTimeout(executionTimer);
  if (executionEventRefreshTimer) clearTimeout(executionEventRefreshTimer);
  if (planTimer) clearTimeout(planTimer);
  if (promptRefineTimer) clearTimeout(promptRefineTimer);
  autosave.destroy();
  adapter.value?.disposeWorkbenchGraph();
});
</script>

<template>
  <div class="workbench-editor">
    <WorkbenchTopbar
      :can-edit="canEdit"
      :can-export="Boolean(project)"
      :can-import="canEdit && Boolean(project)"
      :can-run="canRun"
      :dirty="dirty"
      :exporting="workflowExporting"
      :importing="workflowImporting"
      :project-name="project?.name"
      :publishing="publishing"
      :role-label="currentUserRoleLabel"
      :save-status="saveStatus"
      :saving="saving"
      :zoom-percent="zoomPercent"
      @back="goBack"
      @export="exportWorkflow"
      @fit="adapter?.fit()"
      @import="openWorkflowImport"
      @publish="publish"
      @redo="adapter?.redo()"
      @run="run('FULL')"
      @save="saveDraft()"
      @undo="adapter?.undo()"
      @zoom-by="adapter?.zoomBy($event)"
    />
    <input
      ref="workflowImportFileRef"
      accept="application/json,.json"
      class="workflow-import-file"
      type="file"
      @change="handleWorkflowImportFile"
    />

    <div
      class="editor-body"
      :class="{
        'has-agent-panel': agentPanelOpen && !agentPanelUsesDrawer,
        'has-inspector': selectedNode,
      }"
      :style="agentPanelStyle"
    >
      <NodeLibraryPanel
        ref="nodeLibraryRef"
        :readonly="!canEdit"
        @node-add="addNode"
        @node-drag-start="startDrag"
      />

      <main
        ref="canvasShellRef"
        class="canvas-shell"
        :class="{
          'is-detail': zoomPercent > 110,
          'is-overview': zoomPercent < 60,
          'is-standard': zoomPercent >= 60 && zoomPercent <= 110,
        }"
      >
        <Spin :spinning="loading" tip="正在加载画布…">
          <div ref="canvasRef" class="graph-canvas"></div>
        </Spin>

        <section
          v-if="quickConnectRequest"
          ref="quickConnectRef"
          class="quick-connect-menu"
          :style="quickConnectStyle"
          data-testid="quick-connect-menu"
          @click.stop
          @mousedown.stop
          @pointerdown.stop
        >
          <header class="quick-connect-menu__header">
            <div>
              <strong>选择下一个节点</strong>
              <span>选择后将在此处创建，并自动完成连线</span>
            </div>
            <Button
              aria-label="关闭节点选择器"
              class="quick-connect-menu__close"
              size="small"
              type="text"
              @click="closeQuickConnect"
            >
              <IconifyIcon icon="lucide:x" />
            </Button>
          </header>

          <Input
            v-model:value="quickConnectSearch"
            allow-clear
            class="quick-connect-menu__search"
            placeholder="搜索兼容节点"
            @keydown.enter.prevent="chooseFirstQuickConnectOption"
          >
            <template #prefix>
              <IconifyIcon icon="lucide:search" />
            </template>
          </Input>

          <div
            v-if="filteredQuickConnectOptions.length"
            class="quick-connect-menu__list"
          >
            <button
              v-for="option in filteredQuickConnectOptions"
              :key="`${option.template.type}:${option.targetPortId}`"
              class="quick-connect-option"
              :style="{ '--node-accent': option.template.color }"
              type="button"
              @click="createQuickConnectedNode(option)"
            >
              <span class="quick-connect-option__icon">
                <IconifyIcon :icon="option.template.icon" />
              </span>
              <span class="quick-connect-option__content">
                <strong>{{ option.template.label }}</strong>
                <small>{{ option.template.description }}</small>
              </span>
              <span class="quick-connect-option__action">
                自动连线
                <IconifyIcon icon="lucide:arrow-right" />
              </span>
            </button>
          </div>
          <Empty
            v-else
            class="quick-connect-menu__empty"
            description="没有匹配的兼容节点"
          />
        </section>

        <Button
          class="canvas-navigator-trigger"
          :type="canvasNavigatorOpen ? 'primary' : 'default'"
          @click="toggleCanvasNavigator"
        >
          <IconifyIcon icon="lucide:search" />
          查找节点
          <span>{{ navigationNodeCount }}</span>
        </Button>

        <Button
          class="canvas-agent-trigger"
          :type="agentPanelOpen ? 'primary' : 'default'"
          @click="toggleAgentPanel"
        >
          <IconifyIcon icon="lucide:bot" />
          画布 Agent
        </Button>

        <CanvasNavigator
          v-model="canvasNavigatorOpen"
          :active-node-id="selectedNode?.id"
          :nodes="navigationNodes"
          @locate="locateCanvasNode"
        />

        <div class="minimap-wrap">
          <div ref="minimapRef" class="minimap"></div>
          <div class="minimap-controls">
            <Button size="small" type="text" @click="adapter?.zoomBy(-0.1)">
              <IconifyIcon icon="lucide:minus" />
            </Button>
            <span>{{ zoomPercent }}%</span>
            <Button size="small" type="text" @click="adapter?.zoomBy(0.1)">
              <IconifyIcon icon="lucide:plus" />
            </Button>
            <Button size="small" type="text" @click="adapter?.fit()">
              <IconifyIcon icon="lucide:scan" />
            </Button>
          </div>
        </div>

        <section
          v-if="!selectedNode && !quickConnectRequest && canEdit"
          class="prompt-dock"
        >
          <div class="prompt-input-row">
            <Tooltip title="AI 润色提示词">
              <Button
                v-access:code="['fdmcreative:plan:generate']"
                class="prompt-ai"
                :loading="promptRefineBusy"
                shape="circle"
                type="text"
                @click="polishPrompt"
              >
                <IconifyIcon icon="lucide:sparkles" />
              </Button>
            </Tooltip>
            <PromptLibraryPicker
              button-text="提示词库"
              :current-text="planner.prompt"
              :disabled="!canEdit"
              :target-type="plannerPromptTarget"
              @select="applyPlannerPromptFromLibrary"
            />
            <Textarea
              v-model:value="planner.prompt"
              :auto-size="{ minRows: 1, maxRows: 3 }"
              placeholder="描述你想生成的视频或图案…"
            />
            <Button
              v-access:code="['fdmcreative:plan:generate']"
              class="plan-button"
              :loading="plannerBusy"
              shape="circle"
              type="primary"
              @click="previewPlan"
            >
              <IconifyIcon icon="lucide:send" />
            </Button>
          </div>
          <div class="prompt-options">
            <Segmented
              v-model:value="planner.mode"
              :options="[
                { label: '图片', value: 'IMAGE_SET' },
                { label: '视频', value: 'VIDEO_SEQUENCE' },
                { label: '混合', value: 'MIXED' },
              ]"
              size="small"
            />
            <InputNumber
              v-if="planner.mode !== 'VIDEO_SEQUENCE'"
              v-model:value="planner.imageCount"
              :max="20"
              :min="1"
              addon-before="图片"
              size="small"
            />
            <InputNumber
              v-if="planner.mode !== 'IMAGE_SET'"
              v-model:value="planner.videoCount"
              :max="20"
              :min="1"
              addon-before="片段"
              size="small"
            />
            <span class="auto-run">
              <Switch :checked="false" disabled size="small" /> 自动执行
            </span>
          </div>
        </section>

        <ExecutionTaskPanel
          :allow-cancel="canRun"
          :execution="runningExecution"
          :stream-state="executionStreamState"
          @cancel="cancelRun"
        />
      </main>

      <aside v-if="selectedNode" class="inspector-panel">
        <NodeInlineEditor
          :busy="inlineEditorBusy"
          :can-run="canRunSelectedNode"
          :connected-references="connectedImageReferences"
          :connected-prompt-input-count="connectedPromptInputCount"
          :connected-text-sources="connectedTextSources"
          :error-message="selectedResultNodeRun?.errorMessage"
          :execution-status="runningExecution?.status"
          :model-options="modelOptions"
          :node="selectedNode"
          :node-run="selectedResultNodeRun"
          :progress="inlineEditorProgress"
          :project-id="projectId"
          :project-assets="projectAssets"
          :readonly="!canEdit"
          :result-assets="resultAssets"
          :result-history-autosave-conflict="hasAutosaveConflict"
          :result-history-can-edit="canEdit"
          :result-history-loading="nodeResultLoading"
          :result-media-tools="mediaTools"
          :result-versions="nodeResultVersions"
          :result-text="resultText"
          :upload-accept="inputUploadAccept"
          :upload-api="uploadInputAsset"
          :upload-max-size="inputUploadMaxSize"
          variant="panel"
          @asset-change="handleInlineAssetChange"
          @close="closeInlineEditor"
          @config-change="handleInlineConfigChange"
          @name-change="setNodeName"
          @result-adopt="handleResultAdopt"
          @result-pin="handleResultPin"
          @result-tool="handleResultTool"
          @run="handleInlineRun"
          @run-downstream="handleInlineRunDownstream"
        />
      </aside>

      <aside v-if="agentPanelOpen && !agentPanelUsesDrawer" class="agent-panel">
        <CanvasAgentPanel
          :can-edit="canEdit"
          :can-run="canRun"
          :current-node="selectedNode"
          :current-user-role="currentUserRole"
          :draft-version="draftVersion"
          :model-options="modelOptions"
          :nodes="agentWorkflowNodes"
          :prepare-canvas-mutation="prepareAgentCanvasMutation"
          :project-id="projectId"
          :upload-asset="uploadAgentReferenceAsset"
          :width="agentPanelWidth"
          @close="agentPanelOpen = false"
          @draft-applied="applyAgentDraft"
          @execution-created="monitorAgentExecution"
          @resize="agentPanelWidth = $event"
        />
      </aside>
    </div>

    <Drawer
      v-if="agentPanelOpen && agentPanelUsesDrawer"
      :body-style="{ padding: '0' }"
      :closable="false"
      destroy-on-close
      placement="right"
      :open="agentPanelOpen"
      :width="Math.min(agentPanelWidth, Math.max(320, viewportWidth - 16))"
      @close="agentPanelOpen = false"
    >
      <CanvasAgentPanel
        :can-edit="canEdit"
        :can-run="canRun"
        :current-node="selectedNode"
        :current-user-role="currentUserRole"
        :draft-version="draftVersion"
        :model-options="modelOptions"
        :nodes="agentWorkflowNodes"
        :prepare-canvas-mutation="prepareAgentCanvasMutation"
        :project-id="projectId"
        :upload-asset="uploadAgentReferenceAsset"
        :width="agentPanelWidth"
        @close="agentPanelOpen = false"
        @draft-applied="applyAgentDraft"
        @execution-created="monitorAgentExecution"
        @resize="agentPanelWidth = $event"
      />
    </Drawer>

    <WorkflowConflictModal
      :loading-server-draft="workflowConflictLoading"
      :local-snapshot="localConflictSnapshot"
      :open="workflowConflictOpen"
      :server-draft="workflowConflictServerDraft"
      @download-local="downloadLocalConflictSnapshot"
      @keep-local="keepLocalConflictSnapshot"
      @load-server="loadServerConflictDraft"
      @update:open="handleWorkflowConflictModalOpen"
    />

    <Modal
      v-model:open="workflowImportModalOpen"
      :confirm-loading="workflowImporting"
      :ok-button-props="{
        disabled: workflowImportPreviewing || !workflowImportPreview?.canImport,
      }"
      ok-text="确认替换并导入"
      title="导入工作流结构"
      :width="660"
      @ok="confirmWorkflowImport"
    >
      <Alert
        show-icon
        type="warning"
        message="导入会替换当前草稿"
        description="导入前已执行本地格式检查与服务端预检。系统不会复制其他项目的私有素材；失效引用必须由你明确选择清空。"
      />
      <div v-if="workflowImportPreviewing" class="workflow-import-loading">
        正在预检工作流和素材引用…
      </div>
      <template v-else-if="workflowImportPreview">
        <dl class="workflow-import-summary">
          <dt>导入结构</dt>
          <dd>
            {{ workflowImportPreview.nodeCount }} 个节点，
            {{ workflowImportPreview.edgeCount }} 条连线
          </dd>
          <dt>可替换</dt>
          <dd>
            <Tag :color="workflowImportPreview.canImport ? 'green' : 'red'">
              {{
                workflowImportPreview.canImport
                  ? '可以导入'
                  : '需要处理失效引用'
              }}
            </Tag>
          </dd>
        </dl>

        <div
          v-if="workflowImportPreview.unavailableAssetReferences.length"
          class="workflow-import-issues"
        >
          <strong>失效或无权访问的素材引用</strong>
          <ul>
            <li
              v-for="issue in workflowImportPreview.unavailableAssetReferences"
              :key="`${issue.nodeId}:${issue.configPath}:${issue.assetId}`"
            >
              节点 {{ issue.nodeId }} · {{ issue.configPath }} · 素材
              {{ issue.assetId }}（{{ issue.reason }}）
            </li>
          </ul>
          <div class="workflow-import-clear-option">
            <Switch
              v-model:checked="clearUnavailableImportAssets"
              size="small"
            />
            <span>仅导入结构，并清空这些失效素材引用</span>
          </div>
        </div>
        <Alert
          v-if="workflowImportPreview.clearedAssetReferences.length"
          show-icon
          type="info"
          :message="`本次将清空 ${workflowImportPreview.clearedAssetReferences.length} 个失效素材引用`"
        />
      </template>
    </Modal>

    <Modal
      v-model:open="planModalOpen"
      :footer="null"
      title="内容规划预览"
      :width="920"
    >
      <Alert
        v-if="['GENERATING', 'REPAIRING'].includes(pendingPlan?.status || '')"
        :message="
          pendingPlan?.status === 'REPAIRING'
            ? '正在自动修复规划格式'
            : 'AI 正在拆分图片与视频内容'
        "
        description="生成完成后不会自动执行付费图片或视频模型。"
        show-icon
        type="info"
      />
      <Alert
        v-else-if="pendingPlan?.status === 'FAILED'"
        :description="pendingPlan.errorMessage || '请编辑提示词后重新生成'"
        message="内容规划失败"
        show-icon
        type="error"
      />
      <template v-else-if="pendingPlan?.plan">
        <div class="plan-summary">
          <span>共 {{ summary.itemCount }} 项</span>
          <span>{{ summary.imageCount }} 张图片</span>
          <span>{{ summary.videoCount }} 个视频片段</span>
          <span>视频 {{ summary.videoDurationSeconds }} 秒</span>
          <span>
            预计费用
            {{
              pendingPlan.quote?.estimatedCost === undefined
                ? '待报价'
                : `${pendingPlan.quote.estimatedCost} ${pendingPlan.quote.currency || 'CNY'}`
            }}
          </span>
        </div>
        <div v-if="pendingPlan.diff" class="plan-diff">
          <Tag
            v-for="item in pendingPlan.diff.addedItemIds || []"
            :key="`added-${item}`"
            color="green"
          >
            + {{ item }}
          </Tag>
          <Tag
            v-for="item in pendingPlan.diff.changedItemIds || []"
            :key="`changed-${item}`"
            color="gold"
          >
            ~ {{ item }}
          </Tag>
          <Tag
            v-for="item in pendingPlan.diff.removedItemIds || []"
            :key="`removed-${item}`"
            color="red"
          >
            − {{ item }}
          </Tag>
        </div>
        <div class="plan-items">
          <article v-for="item in pendingPlan.plan.items" :key="item.itemId">
            <header>
              <Tag :color="item.kind === 'IMAGE' ? 'purple' : 'cyan'">
                {{ item.kind === 'IMAGE' ? '图片' : '视频' }}
              </Tag>
              <strong>{{ item.order }}. {{ item.title }}</strong>
              <span v-if="item.video?.durationSeconds">
                {{ item.video.durationSeconds }}s
              </span>
            </header>
            <Textarea
              v-model:value="item.prompt"
              :auto-size="{ minRows: 3, maxRows: 7 }"
              class="plan-prompt"
              :disabled="!canEdit"
              placeholder="正向提示词"
            />
            <Textarea
              v-model:value="item.negativePrompt"
              :auto-size="{ minRows: 2, maxRows: 4 }"
              class="plan-prompt"
              :disabled="!canEdit"
              placeholder="负向提示词（可选）"
            />
            <small v-if="item.purpose">{{ item.purpose }}</small>
          </article>
        </div>
        <div class="plan-actions">
          <Button @click="planModalOpen = false">继续调整</Button>
          <Button
            v-access:code="['fdmcreative:plan:apply']"
            :disabled="!canEdit"
            type="primary"
            @click="applyPlan"
          >
            确认并应用到画布
          </Button>
        </div>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.workbench-editor {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  grid-template-rows: 60px minmax(0, 1fr);
  overflow: hidden;
  color: hsl(var(--foreground));
  background: hsl(var(--background));
}

.workflow-import-file {
  display: none;
}

.workflow-import-loading {
  padding: 24px 0;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.workflow-import-summary {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 10px 14px;
  padding: 16px 0;
  margin: 0;
  font-size: 13px;
}

.workflow-import-summary dt {
  color: hsl(var(--muted-foreground));
}

.workflow-import-summary dd {
  margin: 0;
  color: hsl(var(--foreground));
}

.workflow-import-issues {
  padding: 13px;
  margin-bottom: 14px;
  font-size: 12px;
  background: rgb(245 158 11 / 7%);
  border: 1px solid rgb(245 158 11 / 28%);
  border-radius: 9px;
}

.workflow-import-issues > strong {
  color: #b45309;
}

.workflow-import-issues ul {
  max-height: 144px;
  padding-left: 20px;
  margin: 9px 0;
  overflow: auto;
  color: hsl(var(--muted-foreground));
}

.workflow-import-issues li + li {
  margin-top: 5px;
}

.workflow-import-clear-option {
  display: flex;
  gap: 8px;
  align-items: center;
  color: hsl(var(--foreground));
}

.editor-body {
  display: grid;
  grid-template-columns: clamp(196px, 11.6vw, 222px) minmax(0, 1fr);
  min-height: 0;
  transition: grid-template-columns 160ms ease;
}

.editor-body.has-inspector {
  grid-template-columns:
    clamp(196px, 11.6vw, 222px) minmax(0, 1fr)
    clamp(440px, 28vw, 540px);
}

.editor-body.has-agent-panel {
  grid-template-columns:
    clamp(196px, 11.6vw, 222px) minmax(0, 1fr)
    var(--agent-panel-width);
}

.editor-body.has-inspector.has-agent-panel {
  grid-template-columns:
    clamp(196px, 11.6vw, 222px) minmax(0, 1fr)
    clamp(400px, 24vw, 500px) var(--agent-panel-width);
}

.canvas-navigator-trigger {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 9;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 34px;
  border-radius: 9px;
  box-shadow: 0 6px 18px hsl(var(--foreground) / 10%);
}

.canvas-agent-trigger {
  position: absolute;
  top: 16px;
  right: 16px;
  z-index: 9;
  display: inline-flex;
  gap: 6px;
  align-items: center;
  height: 34px;
  border-radius: 9px;
  box-shadow: 0 6px 18px hsl(var(--foreground) / 10%);
}

.canvas-agent-trigger :deep(svg) {
  width: 15px;
  height: 15px;
}

.canvas-navigator-trigger > span {
  min-width: 20px;
  padding: 1px 5px;
  font-size: 10px;
  line-height: 16px;
  color: hsl(var(--muted-foreground));
  text-align: center;
  background: hsl(var(--muted) / 68%);
  border-radius: 999px;
}

.canvas-navigator-trigger.ant-btn-primary > span {
  color: hsl(var(--primary-foreground));
  background: hsl(var(--primary-foreground) / 18%);
}

.minimap-wrap {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 7;
  width: 176px;
  padding: 7px;
  background: hsl(var(--card) / 94%);
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
  box-shadow: 0 8px 24px hsl(var(--foreground) / 10%);
  backdrop-filter: blur(12px);
}

.minimap {
  width: 160px;
  height: 116px;
  overflow: hidden;
  background: hsl(var(--muted) / 38%);
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.minimap-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 28px;
  margin-top: 4px;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.minimap-controls :deep(.ant-btn) {
  width: 26px;
  height: 26px;
  padding: 0;
}

.canvas-shell {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: hsl(var(--muted) / 20%);
}

.inspector-panel {
  z-index: 4;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: hsl(var(--card));
  border-left: 1px solid hsl(var(--border));
  box-shadow: -8px 0 24px hsl(var(--foreground) / 4%);
}

.agent-panel {
  z-index: 5;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: hsl(var(--card));
  border-left: 1px solid hsl(var(--border));
  box-shadow: -8px 0 24px hsl(var(--foreground) / 5%);
}

.canvas-shell :deep(.ant-spin-nested-loading),
.canvas-shell :deep(.ant-spin-container),
.graph-canvas {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.graph-canvas :deep(.x6-node foreignObject > body) {
  width: 100%;
  height: 100%;
  min-height: 0 !important;
  margin: 0;
  overflow: hidden;
}

.graph-canvas :deep(.x6-node.x6-available-node .creative-node) {
  border-color: #4f7cff;
  box-shadow:
    0 0 0 3px rgb(79 124 255 / 16%),
    0 8px 22px rgb(37 99 235 / 14%);
}

.graph-canvas :deep(.x6-available-magnet) {
  stroke-width: 3;
}

.graph-canvas :deep(.x6-widget-selection-box) {
  margin: -2px;
  border: 2px solid #6d5dfc;
  border-radius: 10px;
  box-shadow: 0 0 0 3px rgb(109 93 252 / 10%);
}

.quick-connect-menu {
  position: absolute;
  z-index: 32;
  display: flex;
  flex-direction: column;
  width: 336px;
  max-width: calc(100% - 24px);
  max-height: calc(100% - 24px);
  padding: 12px;
  overflow: hidden;
  color: hsl(var(--foreground));
  background: hsl(var(--card) / 98%);
  border: 1px solid hsl(var(--border));
  border-radius: 14px;
  box-shadow:
    0 20px 48px hsl(var(--foreground) / 18%),
    0 3px 10px hsl(var(--foreground) / 8%);
  backdrop-filter: blur(18px);
  transform-origin: top left;
  animation: quick-connect-enter 140ms ease-out;
}

.quick-connect-menu__header {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 10px;
}

.quick-connect-menu__header > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.quick-connect-menu__header strong {
  font-size: 14px;
  line-height: 22px;
  color: hsl(var(--foreground));
}

.quick-connect-menu__header span {
  font-size: 11px;
  line-height: 18px;
  color: hsl(var(--muted-foreground));
}

.quick-connect-menu__close {
  flex: none;
  width: 26px;
  height: 26px;
  padding: 0;
  color: hsl(var(--muted-foreground));
}

.quick-connect-menu__search {
  height: 36px;
  margin-bottom: 8px;
  font-size: 12px;
  background: hsl(var(--muted) / 38%);
  border-color: hsl(var(--border));
  border-radius: 9px;
}

.quick-connect-menu__search :deep(.ant-input) {
  font-size: 12px;
  background: transparent;
}

.quick-connect-menu__search :deep(.ant-input-prefix) {
  color: hsl(var(--muted-foreground));
}

.quick-connect-menu__list {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-height: 0;
  max-height: min(318px, calc(100vh - 250px));
  padding-right: 2px;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.quick-connect-option {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  gap: 9px;
  align-items: center;
  width: 100%;
  min-height: 58px;
  padding: 8px;
  color: hsl(var(--foreground) / 86%);
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 10px;
  transition:
    background 120ms ease,
    border-color 120ms ease,
    transform 120ms ease;
}

.quick-connect-option:hover,
.quick-connect-option:focus-visible {
  outline: none;
  background: color-mix(in srgb, var(--node-accent) 7%, hsl(var(--card)));
  border-color: color-mix(in srgb, var(--node-accent) 24%, hsl(var(--border)));
  transform: translateX(1px);
}

.quick-connect-option__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  color: var(--node-accent);
  background: color-mix(in srgb, var(--node-accent) 11%, hsl(var(--card)));
  border-radius: 9px;
}

.quick-connect-option__icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.quick-connect-option__content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.quick-connect-option__content strong {
  font-size: 12px;
  line-height: 18px;
  color: hsl(var(--foreground) / 90%);
}

.quick-connect-option__content small {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  line-height: 16px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.quick-connect-option__action {
  display: flex;
  gap: 3px;
  align-items: center;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.quick-connect-menu__empty {
  margin: 14px 0 4px;
}

.quick-connect-menu__empty :deep(.ant-empty-image) {
  height: 48px;
}

.quick-connect-menu__empty :deep(.ant-empty-description) {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

@keyframes quick-connect-enter {
  from {
    opacity: 0;
    transform: translateY(-4px) scale(0.98);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

.prompt-dock {
  position: absolute;
  bottom: 22px;
  left: 50%;
  z-index: 8;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: min(700px, calc(100% - 400px));
  min-width: 540px;
  padding: 9px 10px 8px;
  background: hsl(var(--card) / 96%);
  border: 1px solid hsl(var(--border));
  border-radius: 16px;
  box-shadow: 0 14px 36px hsl(var(--foreground) / 14%);
  backdrop-filter: blur(16px);
  transform: translateX(-50%);
}

.prompt-input-row {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.prompt-input-row > :deep(.ant-btn) {
  flex: none;
}

.prompt-input-row :deep(.ant-input) {
  min-height: 38px !important;
  padding: 8px 10px;
  font-size: 12px;
  line-height: 20px;
  resize: none;
  border: 0;
  box-shadow: none !important;
}

.prompt-ai {
  flex: none;
  width: 36px;
  height: 36px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
}

.prompt-ai :deep(svg) {
  width: 17px;
  height: 17px;
}

.prompt-options {
  display: flex;
  gap: 7px;
  align-items: center;
  padding: 0 44px;
}

.prompt-options :deep(.ant-input-number-group-wrapper) {
  width: 104px;
}

.prompt-options :deep(.ant-input-number) {
  width: 52px;
}

.prompt-options .auto-run {
  margin-left: auto;
}

.auto-run {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.plan-button {
  flex: none;
  width: 38px;
  height: 38px;
}

.plan-summary {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.plan-summary span {
  padding: 5px 9px;
  font-size: 12px;
  color: hsl(var(--foreground) / 78%);
  background: hsl(var(--muted) / 48%);
  border-radius: 7px;
}

.plan-items {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  max-height: 520px;
  overflow: auto;
}

.plan-items article {
  padding: 12px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.plan-items header {
  display: flex;
  gap: 7px;
  align-items: center;
}

.plan-items header span:last-child {
  margin-left: auto;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.plan-items p {
  margin: 8px 0 4px;
  font-size: 12px;
  line-height: 19px;
  color: hsl(var(--foreground) / 86%);
}

.plan-diff {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 10px;
}

.plan-prompt {
  margin-top: 8px;
  font-size: 12px;
}

.plan-items small {
  color: hsl(var(--muted-foreground));
}

.plan-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 14px;
}

@media (max-width: 1500px) {
  .prompt-dock {
    width: min(700px, calc(100% - 360px));
  }
}

@media (max-width: 1200px) {
  .editor-body {
    grid-template-columns: 190px minmax(0, 1fr);
  }

  .editor-body.has-inspector {
    grid-template-columns: 190px minmax(0, 1fr) 400px;
  }

  .editor-body.has-agent-panel {
    grid-template-columns: 190px minmax(0, 1fr) var(--agent-panel-width);
  }

  .editor-body.has-inspector.has-agent-panel {
    grid-template-columns: 190px minmax(0, 1fr) 400px var(--agent-panel-width);
  }

  .prompt-dock {
    width: min(620px, calc(100% - 220px));
    min-width: 500px;
  }

  .prompt-options {
    padding: 0 36px;
  }
}
</style>
