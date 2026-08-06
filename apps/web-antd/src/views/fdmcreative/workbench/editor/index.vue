<script lang="ts" setup>
import type { CSSProperties } from 'vue';

import type { CreativeQuickConnectOption } from './graph/catalog';
import type {
  WorkbenchBlankConnectionRequest,
  WorkbenchGraphAdapter,
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
  Collapse,
  Drawer,
  Empty,
  Input,
  InputNumber,
  message,
  Modal,
  Progress,
  Segmented,
  Space,
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

import { calculateInlineEditorPosition } from './components/node-editor/inline-editor-position';
import NodeInlineEditor from './components/NodeInlineEditor.vue';
import { resolveConnectedImageReferences } from './connected-image-references';
import { CREATIVE_NODE_CATALOG, NODE_GROUPS } from './graph/catalog';
import {
  createWorkbenchGraph,
  MAX_WORKBENCH_NODES,
} from './graph/graph-adapter';
import {
  EMPTY_WORKFLOW,
  planSummary,
  validateWorkflowDefinition,
} from './graph/workflow-utils';
import { normalizeModelIdentifier } from './model-identifier';
import { extractPromptText } from './prompt-text-output';

defineOptions({ name: 'FdmCreativeWorkbenchEditor' });

const route = useRoute();
const router = useRouter();
const projectId = computed(() => Number(route.params.projectId));
const canvasRef = ref<HTMLElement>();
const canvasShellRef = ref<HTMLElement>();
const inlineEditorRef = ref<HTMLElement>();
const minimapRef = ref<HTMLElement>();
const nodeLibraryRef = ref<HTMLElement>();
const quickConnectRef = ref<HTMLElement>();
const taskQueueRef = ref<HTMLElement>();
const adapter = ref<WorkbenchGraphAdapter>();
const loading = ref(true);
const saving = ref(false);
const publishing = ref(false);
const dirty = ref(false);
const graphRevision = ref(0);
const lastSavedAt = ref<Date>();
const zoomPercent = ref(100);
const project = ref<FdmCreativeApi.Project>();
const draftVersion = ref(0);
const selectedNode = ref<FdmCreativeApi.WorkflowNode>();
const librarySearch = ref('');
const plannerBusy = ref(false);
const promptRefineBusy = ref(false);
const planModalOpen = ref(false);
const pendingPlan = ref<FdmCreativeApi.PlanPreviewResp>();
const runningExecution = ref<FdmCreativeApi.ExecutionDetail>();
const latestNodeRunsByNodeId = ref<
  Record<string, FdmCreativeApi.NodeRun | undefined>
>({});
const taskDrawerOpen = ref(false);
const modelOptions = ref<FdmAiApi.ModelOption[]>([]);
const projectAssets = ref<FdmCreativeApi.CreativeAsset[]>([]);
const quickConnectRequest = ref<WorkbenchBlankConnectionRequest>();
const quickConnectSearch = ref('');
let executionTimer: ReturnType<typeof setTimeout> | undefined;
let planTimer: ReturnType<typeof setTimeout> | undefined;
let promptRefineTimer: ReturnType<typeof setTimeout> | undefined;
let inlineEditorFrame: number | undefined;
let inlineEditorResizeObserver: ResizeObserver | undefined;
let initializationGeneration = 0;

const inlineEditorPosition = reactive({
  anchorLeft: 350,
  left: 16,
  placement: 'bottom' as 'bottom' | 'top',
  top: 16,
  visible: false,
  width: 700,
});

const quickConnectPosition = reactive({ left: 16, top: 16 });

const planner = reactive({
  imageCount: 4,
  mode: 'MIXED' as FdmCreativeApi.PlanMode,
  prompt: '',
  videoCount: 4,
});

const selectedConfig = computed(() => selectedNode.value?.config ?? {});
const inputUploadAccept = computed(() =>
  selectedNode.value?.type === 'video-input'
    ? ['mp4', 'mov', 'webm']
    : ['jpg', 'jpeg', 'png', 'webp'],
);
const inputUploadMaxSize = computed(() =>
  selectedNode.value?.type === 'video-input' ? 500 : 25,
);
const inlineEditorPlacement = computed(() =>
  inlineEditorPosition.placement === 'top' ? 'above' : 'below',
);
const inlineEditorStyle = computed<CSSProperties>(() => ({
  '--inline-editor-anchor-left': `${inlineEditorPosition.anchorLeft}px`,
  left: `${inlineEditorPosition.left}px`,
  top: `${inlineEditorPosition.top}px`,
  visibility: inlineEditorPosition.visible ? 'visible' : 'hidden',
  width: `${inlineEditorPosition.width}px`,
}));
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
const filteredGroups = computed(() => {
  const keyword = librarySearch.value.trim().toLowerCase();
  return NODE_GROUPS.map((group) => ({
    ...group,
    nodes: group.types
      .map((type) => CREATIVE_NODE_CATALOG.find((item) => item.type === type)!)
      .filter(
        (node) =>
          !keyword ||
          node.label.toLowerCase().includes(keyword) ||
          node.description.toLowerCase().includes(keyword),
      ),
  })).filter((group) => group.nodes.length > 0);
});
const selectedResultNodeRun = computed(() =>
  selectedNode.value
    ? (runningExecution.value?.nodeRuns?.find(
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
    ? nodeRuns.filter((nodeRun) => nodeRun.nodeId === selectedNode.value?.id)
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
  const nodeRunById = new Map(
    (runningExecution.value?.nodeRuns ?? []).map((nodeRun) => [
      nodeRun.id,
      nodeRun,
    ]),
  );
  for (const asset of projectAssets.value) {
    if (asset.kind !== 'IMAGE' || !asset.sourceNodeRunId) continue;
    const nodeRun = nodeRunById.get(asset.sourceNodeRunId);
    if (!nodeRun) continue;
    const values = result.get(nodeRun.nodeId) ?? [];
    values.push(asset);
    result.set(nodeRun.nodeId, values);
  }
  for (const values of result.values()) {
    values.sort((left, right) => left.id - right.id);
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
  if (!textInputPorts.size) return [];
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
  selectedNode.value?.type === 'prompt-generator'
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
    (item): item is FdmCreativeApi.NodeRun => Boolean(item),
  );
  if (!execution?.nodeRuns && latestNodeRuns.length === 0) return;
  const nodeRunById = new Map(
    [...(execution?.nodeRuns ?? []), ...latestNodeRuns].map((item) => [
      item.id,
      item,
    ]),
  );
  for (const nodeRun of latestNodeRuns) {
    const graphNodeType = graphAdapter.graph
      .getCellById(nodeRun.nodeId)
      ?.getData()?.type;
    if (
      nodeRun.nodeType !== 'prompt-generator' &&
      graphNodeType !== 'prompt-generator'
    ) {
      continue;
    }
    graphAdapter.setNodeDisplayData(nodeRun.nodeId, {
      outputText: extractPromptText(nodeRun.outputJson),
    });
  }
  for (const asset of projectAssets.value) {
    if (!asset.sourceNodeRunId || !asset.url) continue;
    const nodeRun = nodeRunById.get(asset.sourceNodeRunId);
    if (!nodeRun) continue;
    graphAdapter.setNodeDisplayData(nodeRun.nodeId, {
      assetName: asset.name,
      assetType: asset.kind,
      previewUrl: asset.url,
    });
  }
}

function mergeLatestNodeRuns(execution: FdmCreativeApi.ExecutionDetail) {
  if (!execution.nodeRuns?.length) return;
  const next = { ...latestNodeRunsByNodeId.value };
  for (const nodeRun of execution.nodeRuns) {
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
    for (const nodeRun of execution.nodeRuns ?? []) {
      adapter.value?.setNodeStatus(nodeRun.nodeId, nodeRun.status);
    }
    syncExecutionNodePreviews();
    if (['CANCEL_REQUESTED', 'CREATED', 'RUNNING'].includes(execution.status)) {
      executionTimer = setTimeout(
        () => void monitorExecution(execution.id, targetProjectId),
        2500,
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
        dndContainer: nodeLibraryRef.value,
        minimapContainer: minimapRef.value,
      },
      {
        onChange: () => {
          dirty.value = true;
          graphRevision.value += 1;
        },
        onConnectToBlank: openQuickConnect,
        onNodeGeometryChange: (nodeId) => {
          if (nodeId === selectedNode.value?.id) scheduleInlineEditorPosition();
        },
        onSelectionChange: (node) => {
          if (node) closeQuickConnect();
          selectedNode.value = node;
          syncPlannerControls(node);
          if (node) {
            void nextTick(scheduleInlineEditorPosition);
          } else {
            inlineEditorPosition.visible = false;
          }
        },
        onViewportChange: () => {
          scheduleInlineEditorPosition();
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
    syncAssetNodePreviews();
    dirty.value = false;
    void restoreLatestPlan(requestedProjectId, generation);
    void restoreLatestExecution(requestedProjectId, generation);
  } finally {
    if (generation === initializationGeneration) loading.value = false;
  }
}

function startDrag(type: string, event: MouseEvent) {
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
  if (!adapter.value?.addNode(type, { x: 180, y: 160 })) {
    message.warning(
      type === 'content-planner'
        ? '画布中只能有一个 AI 内容规划节点'
        : `画布最多支持 ${MAX_WORKBENCH_NODES} 个节点`,
    );
  }
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
  adapter.value?.clearSelection();
  inlineEditorPosition.visible = false;
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
  if (!selectedNode.value) return;
  adapter.value?.updateNode(selectedNode.value.id, patch);
  selectedNode.value = {
    ...selectedNode.value,
    ...patch,
    config: patch.config ?? selectedNode.value.config,
  };
}

function setConfig(key: string, value: unknown) {
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

function updateInlineEditorPosition() {
  const graphAdapter = adapter.value;
  const shell = canvasShellRef.value;
  if (!graphAdapter || !shell || !selectedNode.value) {
    inlineEditorPosition.visible = false;
    return;
  }
  const shellRect = shell.getBoundingClientRect();
  const canvasRect = graphAdapter.getCanvasClientRect();
  const editorHeight =
    inlineEditorRef.value?.getBoundingClientRect().height || 320;
  const position = calculateInlineEditorPosition({
    canvasRect,
    editorHeight,
    obstacleRects: taskQueueRef.value
      ? [taskQueueRef.value.getBoundingClientRect()]
      : [],
    preferredWidth: 700,
  });
  Object.assign(inlineEditorPosition, position, {
    left: position.left + canvasRect.left - shellRect.left,
    top: position.top + canvasRect.top - shellRect.top,
  });
}

function scheduleInlineEditorPosition() {
  if (inlineEditorFrame !== undefined) return;
  inlineEditorFrame = requestAnimationFrame(() => {
    inlineEditorFrame = undefined;
    updateInlineEditorPosition();
  });
}

function closeInlineEditor() {
  inlineEditorPosition.visible = false;
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
  void nextTick(scheduleInlineEditorPosition);
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
    const assetId = Array.isArray(payload.value)
      ? payload.value.find((item): item is number => typeof item === 'number')
      : typeof payload.value === 'number'
        ? payload.value
        : undefined;
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
  if (event.key !== 'Escape' || event.defaultPrevented || hasOpenPopup) return;
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
  if (!adapter.value || saving.value) return false;
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
      projectId: projectId.value,
    });
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
  if (!validateSelectedPlannerModel('STRUCTURED_OUTPUT', true)) return;
  if (!ensurePlannerNode()) return;
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
  const preview = pendingPlan.value;
  if (!preview?.planRevisionId || !preview.plan) return;
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
  if (!planner.prompt.trim()) {
    message.warning('请先输入需要润色的创作需求');
    return;
  }
  if (!validateSelectedPlannerModel('CHAT')) return;
  if (!ensurePlannerNode()) return;
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
  if (dirty.value && !(await saveDraft(false))) return;
  const id = await runCreativeWorkflow({
    expectedDraftVersion: draftVersion.value,
    projectId: projectId.value,
    scope,
    startNodeId,
  });
  await monitorExecution(id, projectId.value);
}

async function monitorExecution(id: number, targetProjectId = projectId.value) {
  if (executionTimer) clearTimeout(executionTimer);
  const execution = await getCreativeExecution(id);
  if (targetProjectId !== projectId.value) return;
  runningExecution.value = execution;
  mergeLatestNodeRuns(execution);
  void nextTick(scheduleInlineEditorPosition);
  for (const node of execution.nodeRuns ?? []) {
    adapter.value?.setNodeStatus(node.nodeId, node.status);
  }
  syncExecutionNodePreviews();
  if (['CANCEL_REQUESTED', 'CREATED', 'RUNNING'].includes(execution.status)) {
    executionTimer = setTimeout(
      () => void monitorExecution(id, targetProjectId),
      2500,
    );
  } else {
    await refreshProjectAssets(targetProjectId);
  }
}

async function cancelRun() {
  if (!runningExecution.value) return;
  await cancelCreativeExecution(runningExecution.value.id);
  await monitorExecution(runningExecution.value.id, projectId.value);
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
watch(
  inlineEditorRef,
  (element) => {
    inlineEditorResizeObserver?.disconnect();
    inlineEditorResizeObserver = undefined;
    if (!element) return;
    inlineEditorResizeObserver = new ResizeObserver(
      scheduleInlineEditorPosition,
    );
    inlineEditorResizeObserver.observe(element);
    scheduleInlineEditorPosition();
  },
  { flush: 'post' },
);
watch(taskQueueRef, () => void nextTick(scheduleInlineEditorPosition), {
  flush: 'post',
});

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
  inlineEditorResizeObserver?.disconnect();
  if (inlineEditorFrame !== undefined) cancelAnimationFrame(inlineEditorFrame);
  if (executionTimer) clearTimeout(executionTimer);
  if (planTimer) clearTimeout(planTimer);
  if (promptRefineTimer) clearTimeout(promptRefineTimer);
  adapter.value?.disposeWorkbenchGraph();
});
</script>

<template>
  <div class="workbench-editor">
    <header class="topbar">
      <div class="topbar__start">
        <Tooltip title="返回项目列表">
          <Button class="icon-button" type="text" @click="goBack">
            <IconifyIcon icon="lucide:arrow-left" />
          </Button>
        </Tooltip>
        <strong class="workbench-title">节点式视频图案工作台</strong>
        <div class="project-name">
          <span>{{ project?.name || '未命名项目' }}</span>
          <IconifyIcon icon="lucide:pencil" />
        </div>
        <button
          v-access:code="['fdmcreative:workflow:update']"
          class="save-state"
          :class="{ dirty }"
          :disabled="saving"
          :title="dirty ? '点击保存当前草稿' : '草稿已保存，点击可再次保存'"
          type="button"
          @click="saveDraft()"
        >
          <i></i>{{ saveStatus }}
        </button>
      </div>
      <Space class="canvas-controls" :size="2">
        <Tooltip title="撤销">
          <Button class="icon-button" type="text" @click="adapter?.undo()">
            <IconifyIcon icon="lucide:undo-2" />
          </Button>
        </Tooltip>
        <Tooltip title="重做">
          <Button class="icon-button" type="text" @click="adapter?.redo()">
            <IconifyIcon icon="lucide:redo-2" />
          </Button>
        </Tooltip>
        <Tooltip title="缩小">
          <Button
            class="icon-button"
            type="text"
            @click="adapter?.zoomBy(-0.1)"
          >
            <IconifyIcon icon="lucide:minus" />
          </Button>
        </Tooltip>
        <span class="zoom-value">{{ zoomPercent }}%</span>
        <Tooltip title="放大">
          <Button class="icon-button" type="text" @click="adapter?.zoomBy(0.1)">
            <IconifyIcon icon="lucide:plus" />
          </Button>
        </Tooltip>
        <Tooltip title="适配画布">
          <Button class="icon-button" type="text" @click="adapter?.fit()">
            <IconifyIcon icon="lucide:scan" />
          </Button>
        </Tooltip>
      </Space>
      <Space>
        <Button
          v-access:code="['fdmcreative:execution:run']"
          @click="run('FULL')"
        >
          <IconifyIcon icon="lucide:play" />
          试运行
        </Button>
        <Button
          v-access:code="['fdmcreative:workflow:publish']"
          :loading="publishing"
          type="primary"
          @click="publish"
        >
          <IconifyIcon icon="lucide:workflow" />
          发布任务
          <IconifyIcon icon="lucide:chevron-down" />
        </Button>
      </Space>
    </header>

    <div class="editor-body">
      <aside ref="nodeLibraryRef" class="node-library">
        <div class="panel-title">
          <strong>节点库</strong><IconifyIcon icon="lucide:panel-left-close" />
        </div>
        <Input
          v-model:value="librarySearch"
          allow-clear
          placeholder="搜索节点"
          size="small"
        >
          <template #prefix><IconifyIcon icon="lucide:search" /></template>
        </Input>
        <Collapse
          :default-active-key="NODE_GROUPS.map((group) => group.key)"
          ghost
        >
          <Collapse.Panel
            v-for="group in filteredGroups"
            :key="group.key"
            :header="group.label"
          >
            <button
              v-for="node in group.nodes"
              :key="node.type"
              class="library-node"
              :style="{ '--accent': node.color }"
              :title="node.description"
              @dblclick="addNode(node.type)"
              @mousedown="startDrag(node.type, $event)"
            >
              <span><IconifyIcon :icon="node.icon" /></span>
              <strong>{{ node.label }}</strong>
              <IconifyIcon
                class="library-chevron"
                icon="lucide:chevron-right"
              />
            </button>
          </Collapse.Panel>
        </Collapse>
      </aside>

      <main
        ref="canvasShellRef"
        class="canvas-shell"
        :class="{ 'has-inline-editor': selectedNode }"
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

        <div
          v-if="selectedNode"
          ref="inlineEditorRef"
          class="node-inline-editor-host"
          :class="`node-inline-editor-host--${inlineEditorPlacement}`"
          :style="inlineEditorStyle"
        >
          <NodeInlineEditor
            :busy="inlineEditorBusy"
            :connected-references="connectedImageReferences"
            :connected-prompt-input-count="connectedPromptInputCount"
            :connected-text-sources="connectedTextSources"
            :error-message="selectedResultNodeRun?.errorMessage"
            :execution-status="runningExecution?.status"
            :model-options="modelOptions"
            :node="selectedNode"
            :node-run="selectedResultNodeRun"
            :placement="inlineEditorPlacement"
            :progress="inlineEditorProgress"
            :project-assets="projectAssets"
            :result-assets="resultAssets"
            :result-text="resultText"
            :upload-accept="inputUploadAccept"
            :upload-api="uploadInputAsset"
            :upload-max-size="inputUploadMaxSize"
            :width="inlineEditorPosition.width"
            @asset-change="handleInlineAssetChange"
            @close="closeInlineEditor"
            @config-change="handleInlineConfigChange"
            @name-change="setNodeName"
            @run="handleInlineRun"
            @run-downstream="handleInlineRunDownstream"
          />
        </div>

        <section v-else-if="!quickConnectRequest" class="prompt-dock">
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

        <button
          v-if="runningExecution"
          ref="taskQueueRef"
          class="task-queue"
          type="button"
          @click="taskDrawerOpen = true"
        >
          <header>
            <strong><IconifyIcon icon="lucide:list-checks" /> 任务队列</strong>
            <span>{{ executionProgress(runningExecution) }}%</span>
          </header>
          <Progress
            :percent="executionProgress(runningExecution)"
            :show-info="false"
            size="small"
          />
          <div
            v-for="nodeRun in (runningExecution.nodeRuns || []).slice(0, 3)"
            :key="nodeRun.id"
          >
            <span>{{ nodeRun.nodeType || nodeRun.nodeId }}</span>
            <Tag>{{ nodeRun.status }}</Tag>
          </div>
        </button>
      </main>
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
              placeholder="正向提示词"
            />
            <Textarea
              v-model:value="item.negativePrompt"
              :auto-size="{ minRows: 2, maxRows: 4 }"
              class="plan-prompt"
              placeholder="负向提示词（可选）"
            />
            <small v-if="item.purpose">{{ item.purpose }}</small>
          </article>
        </div>
        <div class="plan-actions">
          <Button @click="planModalOpen = false">继续调整</Button>
          <Button
            v-access:code="['fdmcreative:plan:apply']"
            type="primary"
            @click="applyPlan"
          >
            确认并应用到画布
          </Button>
        </div>
      </template>
    </Modal>

    <Drawer v-model:open="taskDrawerOpen" title="当前任务" :width="440">
      <template v-if="runningExecution">
        <div class="task-heading">
          <div>
            <strong>#{{ runningExecution.id }}</strong>
            <Tag>{{ runningExecution.status }}</Tag>
          </div>
          <Button
            v-access:code="['fdmcreative:execution:cancel']"
            v-if="['CREATED', 'RUNNING'].includes(runningExecution.status)"
            danger
            size="small"
            @click="cancelRun"
          >
            取消运行
          </Button>
        </div>
        <Progress :percent="executionProgress(runningExecution)" />
        <div
          v-for="node in runningExecution.nodeRuns"
          :key="node.id"
          class="task-node"
        >
          <span>{{ node.nodeType || node.nodeId }}</span>
          <Tag>{{ node.status }}</Tag>
        </div>
      </template>
      <Empty v-else description="当前没有运行任务" />
    </Drawer>
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
  color: #172033;
  background: #f7f9fc;
}

.topbar {
  z-index: 5;
  display: grid;
  grid-template-columns: minmax(500px, 1fr) auto minmax(420px, 1fr);
  gap: 16px;
  align-items: center;
  padding: 0 20px;
  background: #fff;
  border-bottom: 1px solid #e5eaf1;
  box-shadow: 0 2px 10px rgb(15 23 42 / 4%);
}

.topbar > :last-child {
  justify-self: end;
}

.topbar__start,
.project-name {
  display: flex;
  align-items: center;
}

.topbar__start {
  gap: 10px;
  min-width: 0;
}

.workbench-title {
  flex: none;
  font-size: 15px;
  font-weight: 650;
  white-space: nowrap;
}

.project-name {
  gap: 8px;
  min-width: 0;
  height: 34px;
  padding: 0 12px;
  color: #334155;
  background: #f8fafc;
  border: 1px solid #e5eaf1;
  border-radius: 9px;
}

.project-name span {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  white-space: nowrap;
}

.project-name :deep(svg) {
  width: 13px;
  height: 13px;
  color: #64748b;
}

.save-state {
  display: inline-flex;
  flex: none;
  gap: 5px;
  align-items: center;
  padding: 4px 6px;
  font-size: 10px;
  color: #64748b;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.save-state:hover {
  background: #f8fafc;
}

.save-state i {
  width: 8px;
  height: 8px;
  background: #16a34a;
  border-radius: 999px;
}

.save-state.dirty {
  color: #d97706;
}

.save-state.dirty i {
  background: #f59e0b;
}

.icon-button :deep(svg) {
  width: 17px;
  height: 17px;
}

.canvas-controls {
  height: 36px;
  padding: 0 4px;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 9px;
  box-shadow: 0 2px 8px rgb(15 23 42 / 4%);
}

.zoom-value {
  min-width: 44px;
  font-size: 11px;
  color: #475569;
  text-align: center;
}

.editor-body {
  display: grid;
  grid-template-columns: clamp(196px, 11.6vw, 222px) minmax(0, 1fr);
  min-height: 0;
}

.node-library {
  z-index: 3;
  min-height: 0;
  padding: 14px 12px;
  overflow: auto;
  background: rgb(255 255 255 / 97%);
  border-right: 1px solid #e5eaf1;
}

.panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 28px;
  margin-bottom: 8px;
}

.panel-title strong {
  font-size: 14px;
}

.panel-title > :last-child:not(strong) {
  width: 14px;
  height: 14px;
  color: #94a3b8;
}

.property-title {
  margin-bottom: 0;
}

.node-library :deep(.ant-collapse-header) {
  min-height: 32px;
  padding: 7px 0 !important;
  font-size: 12px;
  font-weight: 600;
  color: #526074 !important;
}

.node-library :deep(.ant-collapse-content-box) {
  padding: 0 0 6px !important;
}

.library-node {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  min-height: 40px;
  padding: 6px 8px;
  margin-bottom: 6px;
  text-align: left;
  cursor: grab;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-left: 2px solid var(--accent);
  border-radius: 7px;
  transition: 0.16s ease;
}

.library-node:hover {
  border-color: #bdd1f5;
  box-shadow: 0 3px 10px rgb(37 99 235 / 8%);
  transform: translateY(-1px);
}

.library-node > span {
  display: grid;
  flex: none;
  place-items: center;
  width: 25px;
  height: 25px;
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 10%, white);
  border-radius: 6px;
}

.library-node strong {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  white-space: nowrap;
}

.library-chevron {
  flex: none;
  width: 13px;
  height: 13px;
  color: #94a3b8;
}

.minimap-wrap {
  position: absolute;
  bottom: 16px;
  left: 16px;
  z-index: 7;
  width: 176px;
  padding: 7px;
  background: rgb(255 255 255 / 94%);
  border: 1px solid #dce5f1;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgb(15 23 42 / 10%);
  backdrop-filter: blur(12px);
}

.minimap {
  width: 160px;
  height: 116px;
  overflow: hidden;
  background: #f8fafc;
  border: 1px solid #e5eaf1;
  border-radius: 6px;
}

.minimap-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 28px;
  margin-top: 4px;
  font-size: 10px;
  color: #64748b;
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
  background: rgb(255 255 255 / 98%);
  border: 1px solid #dfe6f1;
  border-radius: 14px;
  box-shadow:
    0 20px 48px rgb(15 23 42 / 18%),
    0 3px 10px rgb(15 23 42 / 8%);
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
  color: #172033;
}

.quick-connect-menu__header span {
  font-size: 11px;
  line-height: 18px;
  color: #8995a8;
}

.quick-connect-menu__close {
  flex: none;
  width: 26px;
  height: 26px;
  padding: 0;
  color: #7a879a;
}

.quick-connect-menu__search {
  height: 36px;
  margin-bottom: 8px;
  font-size: 12px;
  background: #f8fafc;
  border-color: #e4eaf2;
  border-radius: 9px;
}

.quick-connect-menu__search :deep(.ant-input) {
  font-size: 12px;
  background: transparent;
}

.quick-connect-menu__search :deep(.ant-input-prefix) {
  color: #98a4b5;
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
  color: #334155;
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
  background: color-mix(in srgb, var(--node-accent) 7%, white);
  border-color: color-mix(in srgb, var(--node-accent) 24%, #e5eaf1);
  transform: translateX(1px);
}

.quick-connect-option__icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  color: var(--node-accent);
  background: color-mix(in srgb, var(--node-accent) 11%, white);
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
  color: #243047;
}

.quick-connect-option__content small {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  line-height: 16px;
  color: #8b97aa;
  white-space: nowrap;
}

.quick-connect-option__action {
  display: flex;
  gap: 3px;
  align-items: center;
  font-size: 10px;
  color: #7b88a0;
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
  color: #94a3b8;
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

.node-inline-editor-host {
  position: absolute;
  z-index: 20;
  max-width: calc(100% - 32px);
  pointer-events: none;
  filter: none;
  transform-origin: center top;
  animation: inline-editor-enter 150ms ease-out;
}

.node-inline-editor-host--above {
  transform-origin: center bottom;
}

.node-inline-editor-host > * {
  pointer-events: auto;
}

@keyframes inline-editor-enter {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.selected-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px;
  margin-bottom: 14px;
  background: #f8fafc;
  border: 1px solid #e8eef6;
  border-radius: 9px;
}

.selected-heading > div {
  display: flex;
  flex-direction: column;
}

.selected-heading span {
  font-size: 9px;
  color: #94a3b8;
}

.selected-heading strong {
  font-size: 13px;
}

.input-asset-upload {
  display: block;
  margin-top: 8px;
}

.run-summary {
  padding: 12px;
  background: #f8fafc;
  border-radius: 9px;
}

.result-heading,
.result-meta > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.result-heading {
  margin-bottom: 10px;
}

.result-heading > div,
.result-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.result-heading span,
.result-meta > span {
  font-size: 10px;
  color: #94a3b8;
}

.result-list {
  display: grid;
  gap: 10px;
}

.result-card {
  overflow: hidden;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 10px;
}

.result-preview {
  display: grid;
  place-items: center;
  min-height: 120px;
  overflow: hidden;
  background: #0f172a;
}

.result-preview :deep(.ant-image),
.result-preview :deep(.ant-image-img),
.result-preview video {
  display: block;
  width: 100%;
  max-height: 220px;
  object-fit: contain;
}

.result-meta {
  gap: 4px;
  padding: 9px;
}

.result-meta > strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  white-space: nowrap;
}

.node-run,
.task-node,
.task-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 0;
  border-bottom: 1px solid #edf1f6;
}

.task-heading {
  padding-top: 0;
  margin-bottom: 14px;
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
  background: rgb(255 255 255 / 96%);
  border: 1px solid #dce5f1;
  border-radius: 16px;
  box-shadow: 0 14px 36px rgb(15 23 42 / 14%);
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
  color: #7c3aed;
  background: #f3efff;
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
  color: #94a3b8;
}

.plan-button {
  flex: none;
  width: 38px;
  height: 38px;
}

.task-queue {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 7;
  width: 320px;
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  background: rgb(255 255 255 / 96%);
  border: 1px solid #dce5f1;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgb(15 23 42 / 12%);
  backdrop-filter: blur(14px);
}

.task-queue header,
.task-queue > div {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.task-queue header {
  margin-bottom: 6px;
  font-size: 11px;
}

.task-queue header strong {
  display: inline-flex;
  gap: 5px;
  align-items: center;
}

.task-queue header span {
  color: #1677ff;
}

.task-queue > div {
  min-height: 27px;
  font-size: 9px;
  color: #64748b;
  border-top: 1px solid #f0f3f7;
}

.plan-summary {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.plan-summary span {
  padding: 5px 9px;
  font-size: 12px;
  color: #475569;
  background: #f1f5f9;
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
  background: #fbfdff;
  border: 1px solid #e5ebf3;
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
  color: #64748b;
}

.plan-items p {
  margin: 8px 0 4px;
  font-size: 12px;
  line-height: 19px;
  color: #334155;
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
  color: #94a3b8;
}

.plan-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding-top: 14px;
}

@media (max-width: 1500px) {
  .topbar {
    grid-template-columns: minmax(390px, 1fr) auto minmax(380px, 1fr);
  }

  .prompt-dock {
    width: min(700px, calc(100% - 360px));
  }

  .canvas-shell.has-inline-editor .task-queue {
    width: 240px;
  }
}

@media (max-width: 1200px) {
  .editor-body {
    grid-template-columns: 190px minmax(0, 1fr);
  }

  .topbar {
    grid-template-columns: minmax(260px, 1fr) auto minmax(330px, 1fr);
    padding: 0 10px;
  }

  .save-state,
  .topbar__start .project-name {
    display: none;
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
