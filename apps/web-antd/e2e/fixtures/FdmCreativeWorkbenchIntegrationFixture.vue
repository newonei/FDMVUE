<script setup lang="ts">
import type { FdmAiApi } from '../../src/api/fdmai';
import type { FdmCreativeApi } from '../../src/api/fdmcreative';

import { onBeforeUnmount, onMounted, ref } from 'vue';

import { baseRequestClient, requestClient } from '../../src/api/request';
import Editor from '../../src/views/fdmcreative/workbench/editor/index.vue';
import { workflowRunNodeIds } from '../../src/views/fdmcreative/workbench/editor/execution-feedback';
import { CREATIVE_NODE_CATALOG } from '../../src/views/fdmcreative/workbench/editor/graph/catalog';

const scenario = new URLSearchParams(location.search);
const readonly = scenario.get('readonly') === 'true';
const runner = !readonly && scenario.get('runner') === 'true';
const editableRole = runner ? 'RUNNER' : 'OWNER';
const role = readonly ? 'VIEWER' : editableRole;
const roleLabel = { OWNER: '可编辑', RUNNER: '运行者', VIEWER: '只读' }[role];
const detailFailOnce = scenario.get('detailFailOnce') === 'true';
const chainedImages = scenario.get('chain') === 'true';
const repeatedRuns = scenario.get('repeat') === 'true';
const raceScenario = scenario.get('race') === 'true';
type DelayedResponseKind = 'asset' | 'cancel' | 'detail';
const delayLabels: Record<DelayedResponseKind, string> = {
  asset: '素材',
  cancel: '取消',
  detail: '详情',
};
const delayArmed = ref({ asset: false, cancel: false, detail: false });
const delayedResponses = ref<
  Array<{ id: number; kind: DelayedResponseKind; label: string }>
>([]);
const releaseResponses = new Map<number, () => void>();
const raceResponses: Array<{
  id: number;
  kind: DelayedResponseKind;
  label: string;
  state: 'DELIVERED' | 'HELD';
}> = [];
const raceDeliveryOrder: string[] = [];
let responseId = 0;
let assetPageRevision = 0;
const eventWriters = new Map<
  number,
  ReadableStreamDefaultController<Uint8Array>
>();
const eventSequences = new Map<number, number>();
const pendingDetailFailures = new Set<number>();
const failedDetails = new Set<number>();
let detailFailureCount = 0;
let detailRecoveryCount = 0;
const status = ref('本地验收数据 · 正在挂载真实编辑器');
const calls: Array<{ method: string; url: string }> = [];
const uploadedFiles = new Map<string, File>();
let uploadCount = 0;
let eventStreamCount = 0;
let closedEventStreamCount = 0;
const clone = <T>(value: T): T =>
  value === undefined ? value : JSON.parse(JSON.stringify(value));
const svg = (background: string, accent: string, label: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480" viewBox="0 0 640 480"><rect width="640" height="480" fill="${background}"/><ellipse cx="320" cy="350" rx="190" ry="30" fill="#000" opacity=".08"/><rect x="165" y="160" width="310" height="170" rx="30" fill="${accent}"/><path d="M180 188h270M180 215h270M180 242h270M180 269h270M180 296h270" stroke="#fff" opacity=".2"/><text x="30" y="440" font-family="sans-serif" font-size="24" fill="#475569">${label} · 示例素材</text></svg>`)}`;
const urls = [svg('#ecf0e9', '#859c84', 'V1'), svg('#e7edf4', '#768da8', 'V2')];
const assets: FdmCreativeApi.CreativeAsset[] = urls.map((url, index) => ({
  id: 501 + index,
  kind: 'IMAGE',
  mimeType: 'image/svg+xml',
  name: `瑜伽垫主图 ${index + 1}`,
  projectId: 33,
  sourceNodeRunId: 8001 + index,
  url,
}));
function node(
  id: string,
  type: string,
  name: string,
  x: number,
  y: number,
  config: Record<string, unknown> = {},
): FdmCreativeApi.WorkflowNode {
  const template = CREATIVE_NODE_CATALOG.find((item) => item.type === type)!;
  return {
    id,
    type,
    name,
    x,
    y,
    width: 260,
    height: 180,
    ports: clone(template.ports),
    config: { ...template.defaultConfig, ...config },
  };
}
let definition: FdmCreativeApi.WorkflowDefinition = {
  schemaVersion: 1,
  viewport: { x: 20, y: 20, zoom: 0.7 },
  nodes: [
    node('prompt', 'prompt-input', '主图提示词', 60, 60, {
      prompt: '保留瑜伽垫颜色和纹理，柔和侧光，浅色背景，右上留白。',
    }),
    node('reference', 'image-input', '产品参考图', 60, 350, { assetId: 501 }),
    node('generate', 'image-generate', '生成商品主图', 420, 60, {
      logicalModelId: '901',
      prompt: '自然光电商产品主图',
      aspectRatio: '1:1',
      outputCount: 1,
    }),
    node(
      'edit',
      chainedImages ? 'image-to-image' : 'image-edit',
      chainedImages ? '参考图生图' : '清理背景边缘',
      780,
      60,
      {
        logicalModelId: '901',
        prompt: '清理背景杂物，保留产品主体。',
      },
    ),
    node('output', 'output', '主图成果', 1140, 60),
    node('brief', 'creative-brief', '设计说明', 420, 350, {
      prompt: '电商主图，保留真实材质与产品比例。',
    }),
  ],
  edges: [
    {
      id: 'e1',
      sourceNodeId: 'prompt',
      sourcePortId: 'prompt',
      targetNodeId: 'generate',
      targetPortId: 'prompt',
    },
    {
      id: 'e2',
      sourceNodeId: 'reference',
      sourcePortId: 'asset',
      targetNodeId: 'generate',
      targetPortId: 'reference',
    },
    {
      id: 'e3',
      sourceNodeId: 'generate',
      sourcePortId: 'asset',
      targetNodeId: 'edit',
      targetPortId: chainedImages ? 'reference' : 'image',
    },
    {
      id: 'e4',
      sourceNodeId: 'edit',
      sourcePortId: 'asset',
      targetNodeId: 'output',
      targetPortId: 'image',
    },
  ],
};
let draftVersion = 7;
let selectionVersion = 1;
let adoptedAssetId = '502';
const model: FdmAiApi.ModelOption = {
  id: '901',
  code: 'fixture-image',
  enabled: true,
  modality: 'IMAGE',
  name: '本地验收模型（不会调用）',
  capabilities: [
    'TEXT_TO_IMAGE',
    'IMAGE_TO_IMAGE',
    'IMAGE_EDIT',
    'MULTI_REFERENCE',
  ],
};
const executions: FdmCreativeApi.Execution[] = [
  {
    id: 9002,
    projectId: 33,
    scope: 'FULL',
    status: 'PARTIAL_SUCCESS',
    startedTime: '2026-09-20 10:20:00',
    completedTime: '2026-09-20 10:20:32',
    totalNodeCount: 6,
    succeededNodeCount: 4,
    failedNodeCount: 1,
    workflowDraftVersion: 7,
    nodeRuns: [
      {
        id: 8101,
        nodeId: 'prompt',
        nodeType: 'prompt-input',
        status: 'SUCCEEDED',
        outputJson: JSON.stringify({
          text: '保留产品外观，浅色背景，自然光。',
        }),
      },
      {
        id: 8102,
        nodeId: 'reference',
        nodeType: 'image-input',
        status: 'SUCCEEDED',
        outputJson: JSON.stringify({ assetId: 501 }),
      },
      {
        id: 8002,
        nodeId: 'generate',
        nodeType: 'image-generate',
        status: 'SUCCEEDED',
        attemptNo: 2,
        outputJson: JSON.stringify({
          outputs: [
            {
              type: 'IMAGE',
              assetId: 502,
              url: urls[1],
              mimeType: 'image/svg+xml',
            },
          ],
        }),
        inputJson: JSON.stringify({
          prompt: '自然光电商产品主图',
          logicalModelId: '901',
        }),
      },
      {
        id: 8104,
        nodeId: 'edit',
        nodeType: 'image-edit',
        status: 'FAILED',
        attemptNo: 1,
        errorCode: 'FIXTURE_MODEL_TIMEOUT',
        errorMessage:
          '示例：图像编辑服务超时，可重试失败节点并恢复受影响下游。',
        inputJson: JSON.stringify({
          prompt: '清理背景杂物',
          logicalModelId: '901',
        }),
      },
      { id: 8105, nodeId: 'output', nodeType: 'output', status: 'SKIPPED' },
      {
        id: 8106,
        nodeId: 'brief',
        nodeType: 'creative-brief',
        status: 'SUCCEEDED',
      },
    ],
  },
  {
    id: 9001,
    projectId: 33,
    scope: 'NODE',
    startNodeId: 'generate',
    status: 'SUCCEEDED',
    startedTime: '2026-09-20 10:00:00',
    completedTime: '2026-09-20 10:00:18',
    totalNodeCount: 1,
    succeededNodeCount: 1,
    failedNodeCount: 0,
    workflowDraftVersion: 6,
    nodeRuns: [
      {
        id: 8001,
        nodeId: 'generate',
        nodeType: 'image-generate',
        status: 'SUCCEEDED',
        attemptNo: 1,
        outputJson: JSON.stringify({ assetIds: [501], assets: [assets[0]] }),
      },
    ],
  },
];
function versions(): FdmCreativeApi.NodeResultVersion[] {
  return [1, 0].map((index) => ({
    nodeRunId: String(8001 + index),
    nodeType: 'image-generate',
    attemptNo: index + 1,
    selectionVersion,
    adoptedAssetId,
    adoptedNodeRunId: adoptedAssetId === '502' ? '8002' : '8001',
    selectionStatus: 'CURRENT',
    completedTime: `2026-09-20 10:${index ? '20' : '00'}:18`,
    model: { logicalModelId: '901', name: model.name },
    assets: [
      {
        id: String(501 + index),
        name: assets[index]!.name,
        url: urls[index],
        kind: 'IMAGE',
        mimeType: 'image/svg+xml',
        width: 640,
        height: 480,
        availability: 'ACTIVE',
        adopted: adoptedAssetId === String(501 + index),
        deleteEligible: false,
      },
    ],
  }));
}
function inspect() {
  document.body.dataset.fixture = 'real-editor';
  document.body.dataset.readonly = String(readonly);
  document.body.dataset.role = role;
  document.body.dataset.detailFailOnce = String(detailFailOnce);
  document.body.dataset.detailFailureCount = String(detailFailureCount);
  document.body.dataset.detailRecoveryCount = String(detailRecoveryCount);
  document.body.dataset.pendingDetailFailures = JSON.stringify([
    ...pendingDetailFailures,
  ]);
  document.body.dataset.mockCalls = JSON.stringify(calls);
  document.body.dataset.workflowDefinition = JSON.stringify(definition);
  document.body.dataset.nodeCount = String(definition.nodes.length);
  document.body.dataset.edgeCount = String(definition.edges.length);
  document.body.dataset.uploadCount = String(uploadCount);
  document.body.dataset.assetCount = String(assets.length);
  document.body.dataset.eventStreamCount = String(eventStreamCount);
  document.body.dataset.closedEventStreamCount = String(closedEventStreamCount);
  document.body.dataset.race = String(raceScenario);
  document.body.dataset.raceArmed = JSON.stringify(delayArmed.value);
  document.body.dataset.racePending = JSON.stringify(delayedResponses.value);
  document.body.dataset.raceResponses = JSON.stringify(raceResponses);
  document.body.dataset.raceDeliveryOrder = JSON.stringify(raceDeliveryOrder);
  document.body.dataset.activeEventStreamExecutionIds = JSON.stringify([
    ...eventWriters.keys(),
  ]);
  document.body.dataset.createdRunCount = String(
    calls.filter(
      (call) =>
        call.method === 'POST' && call.url === '/fdmcreative/execution/run',
    ).length,
  );
}
function finishMockExecution(
  status: 'CANCELED' | 'FAILED' | 'SUCCEEDED',
  id = executions[0]?.id,
) {
  const execution = executions.find((item) => item.id === id);
  if (!execution || execution.status !== 'RUNNING') return;
  execution.status = status;
  execution.completedTime = '2026-09-20 10:30:05';
  for (const run of execution.nodeRuns ?? []) run.status = status;
  execution.succeededNodeCount =
    status === 'SUCCEEDED' ? execution.totalNodeCount : 0;
  execution.failedNodeCount =
    status === 'FAILED' ? execution.totalNodeCount : 0;
  const sequenceNo = (eventSequences.get(execution.id) ?? 0) + 1;
  eventSequences.set(execution.id, sequenceNo);
  const event = { sequenceNo, eventType: 'EXECUTION_COMPLETED' };
  eventWriters
    .get(execution.id)
    ?.enqueue(
      new TextEncoder().encode(
        `id: ${sequenceNo}\nevent: EXECUTION_COMPLETED\ndata: ${JSON.stringify(event)}\n\n`,
      ),
    );
  inspect();
}
function blocked(method: string, url: string): never {
  document.body.dataset.blockedRequest = `${method} ${url}`;
  status.value = `已阻止未覆盖请求：${method} ${url}`;
  throw new Error(status.value);
}
function mock(
  method: string,
  url: string,
  body?: unknown,
  options?: { params?: Record<string, unknown> },
): unknown {
  calls.push({ method, url });
  inspect();
  const params = options?.params ?? {};
  const data = (body ?? {}) as Record<string, unknown>;
  if (method === 'GET') {
    if (url === '/fdmcreative/project/get')
      return {
        id: 33,
        name: '电商主图 · 完整编辑器验收',
        currentUserRole: role,
        status: 'ACTIVE',
        draftVersion,
      };
    if (url === '/fdmcreative/workflow/draft')
      return { projectId: 33, definition, draftVersion, savedTime: Date.now() };
    if (url === '/fdmcreative/workflow/capability')
      return { autosaveEnabled: true, mediaToolsEnabled: false };
    if (url === '/fdmcreative/workflow/models') return [model];
    if (url === '/fdmcreative/asset/page') {
      // A generated image can be outside the first page or not refreshed yet.
      // Chained inputs must still resolve it from the archived node output.
      const list = chainedImages
        ? assets.filter((asset) => asset.id !== 502)
        : assets;
      const revision = ++assetPageRevision;
      return {
        list: raceScenario
          ? list.map((asset) => ({
              ...asset,
              name: `素材快照 ${revision} · ${asset.name}`,
              url: svg('#e7edf4', '#768da8', `素材快照 ${revision}`),
            }))
          : list,
        total: assets.length,
      };
    }
    if (url === '/fdmcreative/asset/get')
      return assets.find((asset) => asset.id === Number(params.id));
    if (url === '/fdmcreative/media-tool/descriptors') return [];
    if (url === '/fdmcreative/plan/latest') return null;
    if (url === '/fdmcreative/execution/page')
      return {
        list:
          Number(params.pageNo) > 1
            ? []
            : executions.slice(0, Number(params.pageSize) || 20),
        total: executions.length,
      };
    if (url === '/fdmcreative/execution/get') {
      const id = Number(params.id);
      if (pendingDetailFailures.delete(id)) {
        failedDetails.add(id);
        detailFailureCount += 1;
        document.body.dataset.detailFailedExecutionId = String(id);
        status.value = `已模拟任务 ${id} 首次详情请求失败；任务已创建，后续请求会恢复`;
        inspect();
        throw new Error(
          `本地验收：任务 ${id} 首次详情读取失败，请刷新任务状态`,
        );
      }
      if (failedDetails.delete(id)) {
        detailRecoveryCount += 1;
        document.body.dataset.detailRecoveredExecutionId = String(id);
        status.value = `本地验收 · 任务 ${id} 详情已恢复`;
        inspect();
      }
      return executions.find((execution) => execution.id === id);
    }
    if (url === '/fdmcreative/node-result/page')
      return {
        list: params.nodeId === 'generate' ? versions() : [],
        total: params.nodeId === 'generate' ? 2 : 0,
      };
    if (url === '/fdmcreative/agent/capability')
      return { enabled: false, routeKey: 'fixture-disabled' };
    if (
      url === '/fdmcreative/agent/conversation/page' ||
      url === '/fdmcreative/agent/message/page' ||
      url === '/fdmcreative/prompt/page'
    )
      return { list: [], total: 0 };
    if (url === '/fdmcreative/prompt/categories') return [];
    if (url === '/fdmcreative/workflow/export')
      return {
        definition,
        exportedAt: Date.now(),
        format: 'FdmCreativeWorkflowExport',
        schemaVersion: 1,
        metadata: {
          definitionSchemaVersion: 1,
          nodeCount: definition.nodes.length,
          edgeCount: definition.edges.length,
        },
      };
  }
  if (readonly && method !== 'GET') return blocked(method, url);
  if (
    runner &&
    !(
      method === 'POST' &&
      [
        '/fdmcreative/execution/run',
        '/fdmcreative/execution/cancel',
        '/fdmcreative/execution/retry-node',
      ].includes(url)
    )
  ) {
    return blocked(method, url);
  }
  if (method === 'PUT' && url === '/fdmcreative/workflow/draft') {
    definition = clone(data.definition as FdmCreativeApi.WorkflowDefinition);
    draftVersion += 1;
    inspect();
    document.body.dataset.lastMutation = 'save-draft';
    return {
      projectId: 33,
      definition,
      draftVersion,
      definitionHash: data.definitionHash,
      savedTime: Date.now(),
    };
  }
  if (method === 'POST' && url === '/fdmcreative/asset/create') {
    const uploadedUrl = String(data.url ?? '');
    const file = uploadedFiles.get(uploadedUrl);
    if (!file || Number(data.projectId) !== 33) return blocked(method, url);
    const id = Math.max(...assets.map((asset) => asset.id)) + 1;
    const kind = data.kind as FdmCreativeApi.CreativeAsset['kind'];
    assets.push({
      id,
      projectId: 33,
      kind,
      name: String(data.name ?? file.name),
      mimeType: file.type,
      size: file.size,
      sourceType: 'UPLOAD',
      url: uploadedUrl,
    });
    document.body.dataset.lastCreatedAssetId = String(id);
    document.body.dataset.lastCreatedAssetName = String(data.name ?? file.name);
    document.body.dataset.lastMutation = 'create-asset';
    inspect();
    return id;
  }
  if (method === 'POST' && url === '/fdmcreative/workflow/publish') {
    document.body.dataset.lastMutation = 'publish-version';
    return 7001;
  }
  if (method === 'POST' && url === '/fdmcreative/execution/run') {
    const id = 9000 + executions.length + 1;
    if (detailFailOnce) pendingDetailFailures.add(id);
    document.body.dataset.lastCreatedExecutionId = String(id);
    document.body.dataset.lastRunScope = String(data.scope);
    document.body.dataset.lastRunNode = String(data.startNodeId ?? '');
    const selected = workflowRunNodeIds(
      definition,
      data.scope as FdmCreativeApi.ExecutionScope,
      data.startNodeId as string | undefined,
    );
    document.body.dataset.lastRunNodes = JSON.stringify([...selected]);
    executions.unshift({
      id,
      projectId: 33,
      scope: data.scope as FdmCreativeApi.ExecutionScope,
      startNodeId: data.startNodeId as string | undefined,
      status: repeatedRuns ? 'RUNNING' : 'SUCCEEDED',
      totalNodeCount: selected.size,
      succeededNodeCount: repeatedRuns ? 0 : selected.size,
      failedNodeCount: 0,
      startedTime: '2026-09-20 10:30:00',
      completedTime: '2026-09-20 10:30:01',
      nodeRuns: [...selected].map((nodeId, index) => ({
        id: id * 100 + index,
        nodeId,
        nodeType: definition.nodes.find((node) => node.id === nodeId)?.type,
        status: repeatedRuns ? 'WAITING_AI' : 'SUCCEEDED',
      })),
    });
    inspect();
    return id;
  }
  if (method === 'POST' && url === '/fdmcreative/execution/retry-node') {
    document.body.dataset.lastRetryNode = String(params.nodeRunId);
    for (const execution of executions)
      for (const run of execution.nodeRuns ?? [])
        if (run.id === Number(params.nodeRunId)) {
          run.status = 'SUCCEEDED';
          run.errorMessage = undefined;
          execution.status = 'SUCCEEDED';
          execution.failedNodeCount = 0;
          execution.succeededNodeCount = execution.totalNodeCount;
          for (const downstream of execution.nodeRuns ?? []) {
            if (downstream.status === 'SKIPPED')
              downstream.status = 'SUCCEEDED';
          }
        }
    return true;
  }
  if (method === 'POST' && url === '/fdmcreative/execution/cancel') {
    finishMockExecution('CANCELED', Number(params.id));
    return true;
  }
  if (method === 'POST' && url === '/fdmcreative/node-result/adopt') {
    adoptedAssetId = String(data.assetId);
    selectionVersion += 1;
    document.body.dataset.adoptedAssetId = adoptedAssetId;
    return {
      adoptedAssetId,
      adoptedNodeRunId: String(data.nodeRunId),
      selectionVersion,
      status: 'CURRENT',
    };
  }
  return blocked(method, url);
}
async function mockUpload(
  url: string,
  payload: { directory?: string; file?: File },
  options?: {
    onUploadProgress?: (event: {
      bytes: number;
      lengthComputable: boolean;
      loaded: number;
      progress: number;
      total: number;
    }) => void;
  },
) {
  calls.push({ method: 'UPLOAD', url });
  const file = payload?.file;
  if (
    role !== 'OWNER' ||
    url !== '/fdmstorage/object/upload' ||
    payload.directory !== 'fdmcreative/33/uploads' ||
    !(file instanceof File)
  ) {
    return blocked('UPLOAD', url);
  }
  const localUrl = URL.createObjectURL(file);
  uploadedFiles.set(localUrl, file);
  uploadCount += 1;
  document.body.dataset.lastUploadedFile = file.name;
  document.body.dataset.lastUploadDirectory = payload.directory;
  inspect();
  options?.onUploadProgress?.({
    bytes: file.size,
    lengthComputable: true,
    loaded: file.size,
    progress: 1,
    total: file.size,
  });
  return {
    objectId: `fixture-upload-${uploadCount}`,
    path: `${payload.directory}/${file.name}`,
    size: file.size,
    type: file.type,
    url: localUrl,
  };
}
function armDelay(kind: DelayedResponseKind) {
  delayArmed.value[kind] = !delayArmed.value[kind];
  inspect();
}
function releaseResponse(id: number) {
  releaseResponses.get(id)?.();
}
async function mockResponse(
  method: string,
  url: string,
  data?: unknown,
  options?: { params?: Record<string, unknown> },
) {
  // Capture the response now: delayed A must remain older than a later B.
  // Mutation effects (including the cancel SSE) happen before HTTP is released.
  const response = clone(mock(method, url, data, options));
  let kind: DelayedResponseKind | undefined;
  if (method === 'POST' && url === '/fdmcreative/execution/cancel') {
    kind = 'cancel';
  } else if (method === 'GET' && url === '/fdmcreative/execution/get') {
    kind = 'detail';
  } else if (method === 'GET' && url === '/fdmcreative/asset/page') {
    kind = 'asset';
  }
  if (!raceScenario || !kind) return response;
  const label =
    kind === 'asset'
      ? `素材快照 ${assetPageRevision}`
      : `任务 #${String(options?.params?.id ?? '')} ${delayLabels[kind]}`;
  const record = {
    id: ++responseId,
    kind,
    label,
    state: 'DELIVERED' as 'DELIVERED' | 'HELD',
  };
  raceResponses.push(record);
  if (delayArmed.value[kind]) {
    delayArmed.value[kind] = false;
    record.state = 'HELD';
    delayedResponses.value.push({ id: record.id, kind, label });
    await new Promise<void>((resolve) => {
      releaseResponses.set(record.id, () => {
        releaseResponses.delete(record.id);
        delayedResponses.value = delayedResponses.value.filter(
          (item) => item.id !== record.id,
        );
        record.state = 'DELIVERED';
        resolve();
        inspect();
      });
      inspect();
    });
  }
  if (kind === 'asset') {
    document.body.dataset.lastDeliveredAssetSnapshot = label;
  }
  raceDeliveryOrder.push(`${record.id}: ${label}`);
  inspect();
  return response;
}
for (const client of [requestClient, baseRequestClient]) {
  Object.assign(client, {
    get: async (url: string, options?: { params?: Record<string, unknown> }) =>
      mockResponse('GET', url, undefined, options),
    post: async (
      url: string,
      data?: unknown,
      options?: { params?: Record<string, unknown> },
    ) => mockResponse('POST', url, data, options),
    put: async (
      url: string,
      data?: unknown,
      options?: { params?: Record<string, unknown> },
    ) => mockResponse('PUT', url, data, options),
    delete: async (url: string) => blocked('DELETE', url),
    upload: mockUpload,
    request: async (url: string) => blocked('REQUEST', url),
  });
}
// Empty SSE stays open until the real execution lifecycle aborts it. An immediate
// EOF would deliberately be treated as a disconnect by the production transport.
window.fetch = async (input, init) => {
  const request = input instanceof Request ? input : undefined;
  const url = new URL(request?.url ?? String(input), location.href);
  const method = (init?.method ?? request?.method ?? 'GET').toUpperCase();
  const signal = init?.signal ?? request?.signal;
  const executionId = Number(url.searchParams.get('id'));
  if (
    method === 'GET' &&
    [
      '/admin-api/fdmcreative/execution/events/stream',
      '/fdmcreative/execution/events/stream',
    ].includes(url.pathname) &&
    executions.some((execution) => execution.id === executionId)
  ) {
    calls.push({ method: 'SSE', url: url.pathname + url.search });
    eventStreamCount += 1;
    document.body.dataset.lastEventStreamExecutionId = String(executionId);
    inspect();
    let closeStream: (() => void) | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        eventWriters.set(executionId, controller);
        inspect();
        closeStream = () => {
          eventWriters.delete(executionId);
          controller.close();
          closedEventStreamCount += 1;
          inspect();
        };
        if (signal?.aborted) closeStream();
        else signal?.addEventListener('abort', closeStream, { once: true });
      },
      cancel() {
        eventWriters.delete(executionId);
        inspect();
        if (closeStream) signal?.removeEventListener('abort', closeStream);
      },
    });
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream;charset=UTF-8' },
    });
  }
  return blocked('FETCH', url.pathname + url.search);
};
XMLHttpRequest.prototype.open = function (_method, url) {
  blocked('XHR', String(url));
};
inspect();
onBeforeUnmount(() => {
  for (const release of releaseResponses.values()) release();
  for (const url of uploadedFiles.keys()) URL.revokeObjectURL(url);
  uploadedFiles.clear();
});
onMounted(() => {
  let remaining = 120;
  const ready = () => {
    if (document.querySelectorAll('.creative-node').length >= 6) {
      status.value = `本地验收 · 真实编辑器 · ${roleLabel} · 所有业务请求已隔离`;
      document.body.dataset.ready = 'true';
    } else if (remaining-- > 0) setTimeout(ready, 100);
  };
  ready();
});
</script>

<template>
  <div class="integration-fixture">
    <div class="fixture-status" data-testid="test-status" role="status">
      {{ status }}
    </div>
    <div v-if="repeatedRuns || raceScenario" class="fixture-controls">
      <button
        v-if="repeatedRuns"
        type="button"
        @click="finishMockExecution('SUCCEEDED')"
      >
        完成模拟任务
      </button>
      <button
        v-if="repeatedRuns"
        type="button"
        @click="finishMockExecution('FAILED')"
      >
        模拟任务失败
      </button>
      <template v-if="raceScenario">
        <button
          v-for="kind in ['cancel', 'detail', 'asset'] as const"
          :key="kind"
          type="button"
          :aria-pressed="delayArmed[kind]"
          @click="armDelay(kind)"
        >
          {{ delayArmed[kind] ? '已设延迟：' : '延迟下一次'
          }}{{ delayLabels[kind] }}
        </button>
        <button
          v-for="pending in delayedResponses"
          :key="pending.id"
          type="button"
          @click="releaseResponse(pending.id)"
        >
          释放 {{ pending.label }}
        </button>
      </template>
    </div>
    <Editor />
  </div>
</template>

<style>
.integration-fixture {
  height: 100%;
  min-height: 0;
}

.fixture-status {
  position: fixed;
  right: 12px;
  bottom: 4px;
  z-index: 1000;
  max-width: calc(100% - 24px);
  padding: 2px 8px;
  font: 11px/1.5 sans-serif;
  color: #334155;
  pointer-events: none;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
}

.fixture-controls {
  position: fixed;
  bottom: 30px;
  left: 80px;
  z-index: 1001;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-width: calc(100% - 96px);
  padding: 6px;
  background: #fff;
  border: 1px solid #94a3b8;
}
</style>
