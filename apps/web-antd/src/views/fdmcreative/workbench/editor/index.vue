<script lang="ts" setup>
import type { CSSProperties } from 'vue';

import type { CreativeQuickConnectOption } from './graph/catalog';
import type {
  WorkbenchBlankConnectionRequest,
  WorkbenchGraphAdapter,
  WorkbenchNavigationNode,
} from './graph/graph-adapter';

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
  applyContentPlan,
  cancelCreativeExecution,
  createCreativeAsset,
  getCreativeAssetPage,
  getCreativeExecution,
  getCreativeExecutionPage,
  getCreativeProject,
  getLatestContentPlan,
  getWorkflowDraft,
  previewContentPlan,
  publishWorkflow,
  refineCreativePrompt,
  runCreativeWorkflow,
  saveWorkflowDraft,
  syncContentPlan,
  syncCreativePrompt,
} from '#/api/fdmcreative';
import { uploadFile } from '#/api/infra/file';

import CanvasNavigator from './components/CanvasNavigator.vue';
import ExecutionTaskPanel from './components/ExecutionTaskPanel.vue';
import NodeInlineEditor from './components/NodeInlineEditor.vue';
import NodeLibraryPanel from './components/NodeLibraryPanel.vue';
import WorkbenchTopbar from './components/WorkbenchTopbar.vue';
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

defineOptions({ name: 'FdmCreativeWorkbenchEditor' });

interface NodeLibraryPanelExpose {
  getElement: () => HTMLElement | undefined;
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
const saving = ref(false);
const publishing = ref(false);
const dirty = ref(false);
const graphRevision = ref(0);
const lastSavedAt = ref<Date>();
const zoomPercent = ref(100);
const canvasNavigatorOpen = ref(false);
const project = ref<FdmCreativeApi.Project>();
const draftVersion = ref(0);
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
const quickConnectRequest = ref<WorkbenchBlankConnectionRequest>();
const quickConnectSearch = ref('');
let executionTimer: ReturnType<typeof setTimeout> | undefined;
let executionEventRefreshTimer: ReturnType<typeof setTimeout> | undefined;
let planTimer: ReturnType<typeof setTimeout> | undefined;
let promptRefineTimer: ReturnType<typeof setTimeout> | undefined;
let initializationGeneration = 0;

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
  selectedNode.value?.type === 'video-input'
    ? ['mp4', 'mov', 'webm']
    : ['jpg', 'jpeg', 'png', 'webp'],
);
const inputUploadMaxSize = computed(() =>
  selectedNode.value?.type === 'video-input' ? 500 : 25,
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
const saveStatus = computed(() => {
  if (saving.value) return '保存中…';
  if (dirty.value) return '有未保存修改';
  if (lastSavedAt.value) {
    return `已保存 ${lastSavedAt.value.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }
  return '已保存';
});
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
      ['IMAGE', 'VIDEO'].includes(asset.kind) &&
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
    if (!['image-input', 'video-input'].includes(node.getData()?.type))
      continue;
    const assetId = node.getData()?.config?.assetId;
    const asset = typeof assetId === 'number' ? assets.get(assetId) : undefined;
    graphAdapter.setNodeDisplayData(node.id, {
      assetName: asset?.name,
      previewUrl: asset?.url,
    });
  }
}

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
  if (!node || !['image-input', 'video-input'].includes(node.type)) {
    throw new Error('请先选择图片或视频输入节点');
  }
  const kind = node.type === 'video-input' ? 'VIDEO' : 'IMAGE';
  const mimePrefix = kind === 'VIDEO' ? 'video/' : 'image/';
  const maxBytes = inputUploadMaxSize.value * 1024 * 1024;
  if (!file.type.startsWith(mimePrefix)) {
    throw new Error(`请选择有效的${kind === 'VIDEO' ? '视频' : '图片'}文件`);
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

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!dirty.value) return;
  event.preventDefault();
  event.returnValue = '';
}

async function initialize() {
  const generation = ++initializationGeneration;
  const requestedProjectId = projectId.value;
  closeQuickConnect();
  adapter.value?.disposeWorkbenchGraph();
  adapter.value = undefined;
  selectedNode.value = undefined;
  runningExecution.value = undefined;
  latestNodeRunsByNodeId.value = {};
  pendingPlan.value = undefined;
  projectAssets.value = [];
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
    const [projectData, draft, availableModels, assetPage] = await Promise.all([
      getCreativeProject(requestedProjectId),
      getWorkflowDraft(requestedProjectId),
      searchFdmAiModels({}).catch(() => []),
      getCreativeAssetPage({
        pageNo: 1,
        pageSize: 100,
        projectId: requestedProjectId,
      }).catch(() => ({ list: [], total: 0 })),
    ]);
    if (generation !== initializationGeneration) return;
    project.value = projectData;
    modelOptions.value = availableModels;
    projectAssets.value = assetPage.list;
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
          if (!canEdit.value) return;
          dirty.value = true;
          graphRevision.value += 1;
          if (canvasNavigatorOpen.value) refreshNavigationNodes();
        },
        onConnectToBlank: openQuickConnect,
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
    if (canEdit.value) ensureDefaultModels();
    syncAssetNodePreviews();
    dirty.value = false;
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

function handleInlineAssetChange(payload: { key: string; value: unknown }) {
  if (
    payload.key === 'assetId' &&
    ['image-input', 'video-input'].includes(selectedNode.value?.type ?? '')
  ) {
    setInputAsset(payload.value);
    return;
  }
  handleInlineConfigChange(payload.key, payload.value);
  if (
    selectedNode.value &&
    ['firstFrameAssetId', 'lastFrameAssetId', 'referenceAssetIds'].includes(
      payload.key,
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
    const asset = projectAssets.value.find((item) => item.id === assetId);
    if (asset) {
      adapter.value?.setNodeDisplayData(selectedNode.value.id, {
        assetName: asset.name,
        assetType: asset.kind,
        previewUrl: asset.url,
      });
    }
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

async function saveDraft(showMessage = true) {
  if (!canEdit.value) {
    if (showMessage) message.warning('当前项目角色为只读，不能保存草稿');
    return false;
  }
  if (!adapter.value || saving.value) return false;
  const targetProjectId = projectId.value;
  const targetGeneration = initializationGeneration;
  saving.value = true;
  try {
    const definition = adapter.value.serializeDefinition();
    if (!validateWorkflowDefinition(definition)) {
      message.error('画布包含无效连线、重复标识或超过节点上限，无法保存');
      return false;
    }
    const savedDraft = await saveWorkflowDraft({
      definition,
      expectedDraftVersion: draftVersion.value,
      projectId: targetProjectId,
    });
    if (
      targetProjectId !== projectId.value ||
      targetGeneration !== initializationGeneration
    ) {
      return false;
    }
    draftVersion.value = savedDraft.draftVersion;
    dirty.value = false;
    lastSavedAt.value = new Date();
    if (showMessage) message.success('草稿已保存');
    return true;
  } catch {
    message.error('保存失败，草稿可能已在其他页面更新，请刷新后重试');
    return false;
  } finally {
    saving.value = false;
  }
}

async function publish() {
  if (!canEdit.value) return;
  if (dirty.value && !(await saveDraft(false))) return;
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
  } else {
    adapter.value?.applyPlanAsBatch(validated.plan ?? preview.plan);
  }
  dirty.value = false;
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
  if (dirty.value && !(await saveDraft(false))) return;
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
  if (!dirty.value) return true;
  return new Promise<boolean>((resolve) => {
    Modal.confirm({
      cancelText: '继续编辑',
      content: '当前画布有未保存修改，离开后修改将丢失。',
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
onMounted(() => {
  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('keydown', handleWorkbenchKeydown);
  window.addEventListener('pointerdown', handleQuickConnectPointerDown, true);
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
  if (executionTimer) clearTimeout(executionTimer);
  if (executionEventRefreshTimer) clearTimeout(executionEventRefreshTimer);
  if (planTimer) clearTimeout(planTimer);
  if (promptRefineTimer) clearTimeout(promptRefineTimer);
  adapter.value?.disposeWorkbenchGraph();
});
</script>

<template>
  <div class="workbench-editor">
    <WorkbenchTopbar
      :can-edit="canEdit"
      :can-run="canRun"
      :dirty="dirty"
      :project-name="project?.name"
      :publishing="publishing"
      :role-label="currentUserRoleLabel"
      :save-status="saveStatus"
      :saving="saving"
      :zoom-percent="zoomPercent"
      @back="goBack"
      @fit="adapter?.fit()"
      @publish="publish"
      @redo="adapter?.redo()"
      @run="run('FULL')"
      @save="saveDraft()"
      @undo="adapter?.undo()"
      @zoom-by="adapter?.zoomBy($event)"
    />

    <div class="editor-body" :class="{ 'has-inspector': selectedNode }">
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
          :project-assets="projectAssets"
          :readonly="!canEdit"
          :result-assets="resultAssets"
          :result-text="resultText"
          :upload-accept="inputUploadAccept"
          :upload-api="uploadInputAsset"
          :upload-max-size="inputUploadMaxSize"
          variant="panel"
          @asset-change="handleInlineAssetChange"
          @close="closeInlineEditor"
          @config-change="handleInlineConfigChange"
          @name-change="setNodeName"
          @run="handleInlineRun"
          @run-downstream="handleInlineRunDownstream"
        />
      </aside>
    </div>

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

  .prompt-dock {
    width: min(620px, calc(100% - 220px));
    min-width: 500px;
  }

  .prompt-options {
    padding: 0 36px;
  }
}
</style>
