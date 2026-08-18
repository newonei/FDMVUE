import type { FdmCreativeApi } from '#/api/fdmcreative';

import { isPortTypeCompatible } from './workflow-utils';

export interface CreativeNodeTemplate {
  color: string;
  defaultConfig?: Record<string, unknown>;
  description: string;
  icon: string;
  label: string;
  ports: FdmCreativeApi.WorkflowPort[];
  type: string;
}

export interface CreativeQuickConnectOption {
  targetPortId: string;
  template: CreativeNodeTemplate;
}

export type CreativeNodeVariant =
  | 'asset'
  | 'compact'
  | 'compose'
  | 'generate'
  | 'llm'
  | 'plan-item'
  | 'planner';

export interface CreativeNodeVisual {
  height: number;
  variant: CreativeNodeVariant;
  width: number;
}

const ASSET_NODE_TYPES = new Set(['image-input', 'video-input']);
const PLAN_ITEM_NODE_TYPES = new Set(['image-plan-item', 'video-plan-item']);
const AI_GENERATE_NODE_TYPES = new Set([
  'first-last-frame-to-video',
  'image-edit',
  'image-generate',
  'image-to-image',
  'image-to-video',
  'video-generate',
]);
const RESULT_PREVIEW_NODE_TYPES = new Set([
  ...AI_GENERATE_NODE_TYPES,
  'image-crop',
  'image-resize',
  'image-split',
  'video-frame-extract',
  'video-normalize',
  'video-transition',
  'video-trim',
]);

/**
 * Restore ports that were added after a draft was saved while retaining ports
 * owned by future versions or external providers. Canonical fields always win
 * so legacy required flags and port types cannot keep a restored graph invalid.
 */
export function normalizeCreativeNodePorts(
  type: string,
  ports: FdmCreativeApi.WorkflowPort[],
) {
  const canonicalPorts = CREATIVE_NODE_MAP.get(type)?.ports;
  if (!canonicalPorts) return ports.map((port) => ({ ...port }));

  const canonicalIds = new Set(canonicalPorts.map((port) => port.id));
  const restoredCanonicalPorts = canonicalPorts.map((canonicalPort) => {
    const persistedPort = ports.find((port) => port.id === canonicalPort.id);
    if (!persistedPort) return { ...canonicalPort };
    const { required: _legacyRequired, ...persistedFields } = persistedPort;
    return { ...persistedFields, ...canonicalPort };
  });
  const unknownPorts = ports
    .filter((port) => !canonicalIds.has(port.id))
    .map((port) => ({ ...port }));
  return [...restoredCanonicalPorts, ...unknownPorts];
}

/** Migrates edge endpoints whose legacy node used the same id for input and output. */
export function normalizeCreativeWorkflowEdges(
  nodes: FdmCreativeApi.WorkflowNode[],
  edges: FdmCreativeApi.WorkflowEdge[],
) {
  const nodeTypes = new Map(nodes.map((node) => [node.id, node.type]));
  return edges.map((edge) => ({
    ...edge,
    sourcePortId:
      nodeTypes.get(edge.sourceNodeId) === 'image-collection' &&
      edge.sourcePortId === 'images'
        ? 'ordered-images'
        : edge.sourcePortId,
  }));
}

const COMPOSE_NODE_TYPES = new Set([
  'asset-library-output',
  'output',
  'video-compose',
]);

/**
 * Visual dimensions belong to the workbench adapter, not to provider or model
 * data. Keeping them canonical prevents legacy drafts and provider-created
 * definitions from stretching Vue shapes across the canvas.
 */
export function getCreativeNodeVisual(type: string): CreativeNodeVisual {
  if (ASSET_NODE_TYPES.has(type)) {
    return { height: 164, variant: 'asset', width: 160 };
  }
  if (type === 'content-planner') {
    return { height: 164, variant: 'planner', width: 176 };
  }
  if (type === 'prompt-generator') {
    return { height: 132, variant: 'llm', width: 184 };
  }
  if (PLAN_ITEM_NODE_TYPES.has(type)) {
    return { height: 124, variant: 'plan-item', width: 168 };
  }
  if (RESULT_PREVIEW_NODE_TYPES.has(type)) {
    return { height: 126, variant: 'generate', width: 184 };
  }
  if (COMPOSE_NODE_TYPES.has(type)) {
    return { height: 176, variant: 'compose', width: 196 };
  }
  return { height: 92, variant: 'compact', width: 168 };
}

const input = (
  id: string,
  type: FdmCreativeApi.PortType,
  required = false,
): FdmCreativeApi.WorkflowPort => ({
  direction: 'INPUT',
  id,
  required,
  type,
});

const output = (
  id: string,
  type: FdmCreativeApi.PortType,
): FdmCreativeApi.WorkflowPort => ({ direction: 'OUTPUT', id, type });

export const CREATIVE_NODE_CATALOG: CreativeNodeTemplate[] = [
  {
    color: '#2563eb',
    description: '输入创作目标、品牌约束和参考说明',
    icon: 'lucide:message-square-text',
    label: '创作需求',
    ports: [output('brief', 'creative-brief')],
    type: 'creative-brief',
  },
  {
    color: '#0284c7',
    description: '选择素材库或上传的图片，供参考图、首帧和编辑节点使用',
    icon: 'lucide:image',
    label: '图片素材',
    ports: [output('asset', 'image-asset')],
    type: 'image-input',
  },
  {
    color: '#0369a1',
    description: '选择素材库中的视频，供裁剪、转场和合成节点使用',
    icon: 'lucide:file-video',
    label: '视频素材',
    ports: [output('asset', 'video-asset')],
    type: 'video-input',
  },
  {
    color: '#1d4ed8',
    description: '输入品牌规范、商品卖点和必须保持的视觉约束',
    icon: 'lucide:badge-info',
    label: '品牌 / 商品资料',
    ports: [output('brief', 'creative-brief')],
    type: 'brand-input',
  },
  {
    color: '#7c3aed',
    description: '将总提示词规划成图片、视频或混合内容项',
    icon: 'lucide:sparkles',
    label: 'AI 内容规划',
    ports: [input('brief', 'creative-brief'), output('plan', 'content-plan')],
    type: 'content-planner',
  },
  {
    color: '#7c3aed',
    defaultConfig: {
      language: 'ZH_CN',
      prompt: '',
      targetType: 'GENERAL',
    },
    description: '输入可复用的静态提示词，可连接到多个图像或视频生成节点',
    icon: 'lucide:text-cursor-input',
    label: '提示词文本',
    ports: [output('prompt', 'prompt-text')],
    type: 'prompt-input',
  },
  {
    color: '#6d28d9',
    defaultConfig: {
      language: 'ZH_CN',
      prompts: '',
      targetType: 'GENERAL',
    },
    description: '从多行候选或多个上游提示词中随机选择一个，每次执行重新抽取',
    icon: 'lucide:shuffle',
    label: '随机提示词',
    ports: [input('prompts', 'prompt-text'), output('prompt', 'prompt-text')],
    type: 'random-prompt',
  },
  {
    color: '#6d28d9',
    defaultConfig: {
      language: 'ZH_CN',
      prompt: '{{input}}',
      targetType: 'GENERAL',
    },
    description: '在本地合并上游提示词和创作需求，不调用模型',
    icon: 'lucide:braces',
    label: '提示词模板',
    ports: [
      input('input', 'prompt-text'),
      input('brief', 'creative-brief'),
      output('prompt', 'prompt-text'),
    ],
    type: 'prompt-template',
  },
  {
    color: '#7c3aed',
    defaultConfig: {
      language: 'ZH_CN',
      prompt: '',
      systemPrompt:
        '你是 FDM 专业图像与视频提示词工程师。请把任务和上下文转换为可直接交给下游生成模型的提示词，只输出最终提示词，不要解释，也不要使用 Markdown 代码块。',
      targetType: 'GENERAL',
    },
    description: '根据生成要求、上下文、创作需求和参考图生成专业提示词',
    icon: 'lucide:bot',
    label: '提示词生成器',
    ports: [
      input('brief', 'creative-brief'),
      input('context', 'prompt-text'),
      input('reference', 'image-list'),
      output('prompt', 'prompt-text'),
    ],
    type: 'prompt-generator',
  },
  {
    color: '#8b5cf6',
    description: '一张图片的构图、光线和生成提示词',
    icon: 'lucide:file-image',
    label: '图片方案',
    ports: [
      input('plan', 'content-plan', true),
      output('item', 'image-plan-item'),
    ],
    type: 'image-plan-item',
  },
  {
    color: '#7c3aed',
    description: '一个视频片段的动作、运镜和时长提示词',
    icon: 'lucide:clapperboard',
    label: '视频片段',
    ports: [
      input('plan', 'content-plan', true),
      output('item', 'video-plan-item'),
    ],
    type: 'video-plan-item',
  },
  {
    color: '#0891b2',
    description: '文生图、参考图生图与图片编辑',
    icon: 'lucide:image-plus',
    label: '图片生成',
    ports: [
      input('item', 'image-plan-item'),
      input('prompt', 'prompt-text'),
      input('reference', 'image-list'),
      output('asset', 'image-asset'),
    ],
    type: 'image-generate',
  },
  {
    color: '#0e7490',
    description: '使用一张或多张参考图生成新的图片',
    icon: 'lucide:images',
    label: '参考图生图',
    ports: [
      input('item', 'image-plan-item'),
      input('prompt', 'prompt-text'),
      input('reference', 'image-list', true),
      output('asset', 'image-asset'),
    ],
    type: 'image-to-image',
  },
  {
    color: '#0f766e',
    description: '按提示词修改输入图片的局部内容或视觉风格',
    icon: 'lucide:paintbrush',
    label: '图片编辑',
    ports: [
      input('prompt', 'prompt-text'),
      input('image', 'image-asset', true),
      output('asset', 'image-asset'),
    ],
    type: 'image-edit',
  },
  {
    color: '#0d9488',
    defaultConfig: {
      format: 'png',
      height: 1024,
      resizeMode: 'FIT',
      width: 1024,
    },
    description: '在本地受控流程中缩放、适配或调整图片比例，不会伪装成 AI 超分',
    icon: 'lucide:scan',
    label: '图片缩放/适配',
    ports: [
      input('image', 'image-asset', true),
      output('asset', 'image-asset'),
    ],
    type: 'image-resize',
  },
  {
    color: '#0f766e',
    defaultConfig: {
      coordinateMode: 'NORMALIZED',
      cropHeight: 1,
      cropWidth: 1,
      cropX: 0,
      cropY: 0,
      format: 'png',
    },
    description: '用归一化坐标在服务端裁剪原图，预览缩放不会改变实际裁剪范围',
    icon: 'lucide:crop',
    label: '图片裁剪',
    ports: [
      input('image', 'image-asset', true),
      output('asset', 'image-asset'),
    ],
    type: 'image-crop',
  },
  {
    color: '#0d9488',
    defaultConfig: { columns: 2, format: 'png', rows: 2 },
    description: '在受控像素、输出数量和临时磁盘上限内，把图片拆分为独立素材',
    icon: 'lucide:panels-top-left',
    label: '图片分割',
    ports: [
      input('image', 'image-asset', true),
      output('images', 'image-list'),
    ],
    type: 'image-split',
  },
  {
    color: '#0f766e',
    description: '文生视频、图生视频与首尾帧视频',
    icon: 'lucide:video',
    label: '视频生成',
    ports: [
      input('item', 'video-plan-item'),
      input('prompt', 'prompt-text'),
      output('asset', 'video-asset'),
    ],
    type: 'video-generate',
  },
  {
    color: '#0f766e',
    description: '使用图片作为首帧或视觉参考生成视频',
    icon: 'lucide:image-play',
    label: '图生视频',
    ports: [
      input('item', 'video-plan-item'),
      input('prompt', 'prompt-text'),
      input('first-frame', 'image-asset', true),
      output('asset', 'video-asset'),
    ],
    type: 'image-to-video',
  },
  {
    color: '#047857',
    description: '用明确的首帧和尾帧约束视频片段',
    icon: 'lucide:gallery-horizontal-end',
    label: '首尾帧视频',
    ports: [
      input('item', 'video-plan-item'),
      input('prompt', 'prompt-text'),
      input('first-frame', 'image-asset', true),
      input('last-frame', 'image-asset', true),
      output('asset', 'video-asset'),
    ],
    type: 'first-last-frame-to-video',
  },
  {
    color: '#c2410c',
    defaultConfig: { durationSeconds: 5, startSeconds: 0 },
    description: '使用受控 FFmpeg 执行器裁剪视频片段',
    icon: 'lucide:scissors',
    label: '视频裁剪',
    ports: [
      input('video', 'video-asset', true),
      output('asset', 'video-asset'),
    ],
    type: 'video-trim',
  },
  {
    color: '#be123c',
    defaultConfig: { frameMode: 'FIRST', timeSeconds: 0 },
    description: '从视频首帧、尾帧或指定时间抽取一张图片',
    icon: 'lucide:gallery-horizontal',
    label: '视频抽帧',
    ports: [
      input('video', 'video-asset', true),
      output('asset', 'image-asset'),
    ],
    type: 'video-frame-extract',
  },
  {
    color: '#9f1239',
    defaultConfig: {
      fps: 30,
      height: 720,
      resizeMode: 'FIT',
      width: 1280,
    },
    description: '统一视频的尺寸、帧率、像素格式和音频编码，便于稳定合成',
    icon: 'lucide:scan-line',
    label: '视频规格统一',
    ports: [
      input('video', 'video-asset', true),
      output('asset', 'video-asset'),
    ],
    type: 'video-normalize',
  },
  {
    color: '#b45309',
    defaultConfig: {
      offsetSeconds: 4,
      transition: '淡化',
      transitionSeconds: 1,
    },
    description: '为两个视频片段添加基础淡化转场',
    icon: 'lucide:blend',
    label: '视频转场',
    ports: [
      input('first', 'video-asset', true),
      input('second', 'video-asset', true),
      output('asset', 'video-asset'),
    ],
    type: 'video-transition',
  },
  {
    color: '#ea580c',
    description: '按输入顺序拼接视频片段并导出 MP4',
    icon: 'lucide:film',
    label: '视频合成',
    ports: [
      input('videos', 'video-list', true),
      output('timeline', 'timeline'),
      output('asset', 'video-asset'),
    ],
    type: 'video-compose',
  },
  {
    color: '#64748b',
    description: '把多张图片整理为有序图片集合',
    icon: 'lucide:gallery-vertical-end',
    label: '图片集合',
    ports: [
      input('images', 'image-list', true),
      output('ordered-images', 'image-list'),
    ],
    type: 'image-collection',
  },
  {
    color: '#475569',
    defaultConfig: { index: 1, mode: 'FIRST' },
    description: '从图片集合中按首张、末张或序号选出一张图片',
    icon: 'lucide:mouse-pointer-2',
    label: '图片选择',
    ports: [
      input('images', 'image-list', true),
      output('image', 'image-asset'),
    ],
    type: 'image-select',
  },
  {
    color: '#44403c',
    defaultConfig: { index: 1, mode: 'FIRST' },
    description: '从视频集合中按首个、末个或序号选出一个视频',
    icon: 'lucide:mouse-pointer-2',
    label: '视频选择',
    ports: [
      input('videos', 'video-list', true),
      output('video', 'video-asset'),
    ],
    type: 'video-select',
  },
  {
    color: '#d97706',
    defaultConfig: {
      batchSize: 1,
      count: 4,
      language: 'ZH_CN',
      promptTemplate: '{{input}}\n{{brief}}\n{{item}}',
      startIndex: 1,
      variations: '',
    },
    description: '按轮次切换变化提示词和图片，串行重复运行整个下游分支',
    icon: 'lucide:repeat-2',
    label: '图片循环',
    ports: [
      input('prompt', 'prompt-text'),
      input('brief', 'creative-brief'),
      input('images', 'image-list'),
      output('result-prompt', 'prompt-text'),
      output('selected-images', 'image-list'),
    ],
    type: 'image-loop',
  },
  {
    color: '#b45309',
    defaultConfig: {
      batchSize: 1,
      count: 4,
      language: 'ZH_CN',
      promptTemplate: '{{input}}\n{{brief}}\n{{item}}',
      startIndex: 1,
      variations: '',
    },
    description: '按轮次切换变化提示词和视频，串行重复运行整个下游分支',
    icon: 'lucide:refresh-cw',
    label: '视频循环',
    ports: [
      input('prompt', 'prompt-text'),
      input('brief', 'creative-brief'),
      input('videos', 'video-list'),
      output('result-prompt', 'prompt-text'),
      output('selected-videos', 'video-list'),
    ],
    type: 'video-loop',
  },
  {
    color: '#57534e',
    description: '按片段顺序组织视频并输出时间线',
    icon: 'lucide:rows-3',
    label: '视频时间线',
    ports: [
      input('videos', 'video-list', true),
      output('ordered-videos', 'video-list'),
      output('timeline', 'timeline'),
    ],
    type: 'video-timeline',
  },
  {
    color: '#475569',
    description: '聚合图片、视频和时间线成果',
    icon: 'lucide:package-open',
    label: '成果集合',
    ports: [
      input('images', 'image-list'),
      input('image', 'image-asset'),
      input('videos', 'video-list'),
      input('video', 'video-asset'),
      input('timeline', 'timeline'),
      output('artifacts', 'artifact-set'),
    ],
    type: 'artifact-collection',
  },
  {
    color: '#16a34a',
    description: '预览并保存到素材库或下载',
    icon: 'lucide:download',
    label: '成果输出',
    ports: [
      input('artifacts', 'artifact-set'),
      input('images', 'image-list'),
      input('image', 'image-asset'),
      input('videos', 'video-list'),
      input('video', 'video-asset'),
      input('timeline', 'timeline'),
    ],
    type: 'output',
  },
  {
    color: '#15803d',
    description: '把最终成果保存到 FDM 私有素材库',
    icon: 'lucide:archive',
    label: '保存到素材库',
    ports: [
      input('artifacts', 'artifact-set'),
      input('images', 'image-list'),
      input('image', 'image-asset'),
      input('videos', 'video-list'),
      input('video', 'video-asset'),
      input('timeline', 'timeline'),
    ],
    type: 'asset-library-output',
  },
];

export const CREATIVE_NODE_MAP = new Map(
  CREATIVE_NODE_CATALOG.map((item) => [item.type, item]),
);

/** Fill fields introduced after a draft was saved without overwriting user values. */
export function normalizeCreativeNodeConfig(
  type: string,
  config: Record<string, unknown> | undefined,
) {
  return {
    ...CREATIVE_NODE_MAP.get(type)?.defaultConfig,
    ...config,
  };
}

export function getQuickConnectOptions(
  sourceType: FdmCreativeApi.PortType,
): CreativeQuickConnectOption[] {
  return CREATIVE_NODE_CATALOG.flatMap((template) => {
    const targetPort = template.ports
      .filter(
        (port) =>
          port.direction === 'INPUT' &&
          isPortTypeCompatible(sourceType, port.type),
      )
      .toSorted((left, right) => {
        const leftExact = left.type === sourceType ? 1 : 0;
        const rightExact = right.type === sourceType ? 1 : 0;
        if (leftExact !== rightExact) return rightExact - leftExact;
        return Number(Boolean(right.required)) - Number(Boolean(left.required));
      })[0];
    return targetPort ? [{ targetPortId: targetPort.id, template }] : [];
  });
}

export const NODE_GROUPS = [
  {
    key: 'input',
    label: '素材输入',
    types: ['creative-brief', 'image-input', 'video-input', 'brand-input'],
  },
  {
    key: 'llm',
    label: '提示词与 LLM',
    types: [
      'prompt-input',
      'random-prompt',
      'prompt-template',
      'prompt-generator',
    ],
  },
  {
    key: 'flow',
    label: '流程控制与批处理',
    types: ['image-loop', 'video-loop', 'image-select', 'video-select'],
  },
  {
    key: 'plan',
    label: 'AI 规划',
    types: ['content-planner', 'image-plan-item', 'video-plan-item'],
  },
  {
    key: 'generate',
    label: '图像生成与处理',
    types: [
      'image-generate',
      'image-to-image',
      'image-edit',
      'image-resize',
      'image-crop',
      'image-split',
    ],
  },
  {
    key: 'video',
    label: '视频生成与处理',
    types: [
      'video-generate',
      'image-to-video',
      'first-last-frame-to-video',
      'video-trim',
      'video-frame-extract',
      'video-normalize',
      'video-transition',
      'video-compose',
    ],
  },
  {
    key: 'aggregate',
    label: '聚合与输出',
    types: [
      'image-collection',
      'video-timeline',
      'artifact-collection',
      'output',
      'asset-library-output',
    ],
  },
];
