import type { FdmCreativeApi } from '#/api/fdmcreative';

export interface CreativeNodeTemplate {
  color: string;
  defaultConfig?: Record<string, unknown>;
  description: string;
  icon: string;
  label: string;
  ports: FdmCreativeApi.WorkflowPort[];
  type: string;
}

export type CreativeNodeVariant =
  | 'asset'
  | 'compact'
  | 'compose'
  | 'generate'
  | 'plan-item'
  | 'planner';

export interface CreativeNodeVisual {
  height: number;
  variant: CreativeNodeVariant;
  width: number;
}

const ASSET_NODE_TYPES = new Set(['image-input', 'video-input']);
const PLAN_ITEM_NODE_TYPES = new Set(['image-plan-item', 'video-plan-item']);
const GENERATE_NODE_TYPES = new Set([
  'first-last-frame-to-video',
  'image-edit',
  'image-generate',
  'image-to-image',
  'image-to-video',
  'video-generate',
]);
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
    return { height: 206, variant: 'asset', width: 166 };
  }
  if (type === 'content-planner') {
    return { height: 224, variant: 'planner', width: 184 };
  }
  if (PLAN_ITEM_NODE_TYPES.has(type)) {
    return { height: 156, variant: 'plan-item', width: 178 };
  }
  if (GENERATE_NODE_TYPES.has(type)) {
    return { height: 158, variant: 'generate', width: 202 };
  }
  if (COMPOSE_NODE_TYPES.has(type)) {
    return { height: 286, variant: 'compose', width: 224 };
  }
  return { height: 120, variant: 'compact', width: 180 };
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
      input('item', 'image-plan-item', true),
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
      input('item', 'image-plan-item', true),
      input('reference', 'image-asset', true),
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
      input('image', 'image-asset', true),
      output('asset', 'image-asset'),
    ],
    type: 'image-edit',
  },
  {
    color: '#0d9488',
    defaultConfig: { height: 1024, resizeMode: 'contain', width: 1024 },
    description: '在本地受控流程中裁剪、缩放或调整图片比例',
    icon: 'lucide:scan',
    label: '图片裁剪缩放',
    ports: [
      input('image', 'image-asset', true),
      output('asset', 'image-asset'),
    ],
    type: 'image-resize',
  },
  {
    color: '#0f766e',
    description: '文生视频、图生视频与首尾帧视频',
    icon: 'lucide:video',
    label: '视频生成',
    ports: [
      input('item', 'video-plan-item', true),
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
      input('item', 'video-plan-item', true),
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
      input('item', 'video-plan-item', true),
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
    color: '#b45309',
    defaultConfig: { offsetSeconds: 4, transitionSeconds: 1 },
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
    description: '排序、裁剪、基础转场并导出 MP4',
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
      output('images', 'image-list'),
    ],
    type: 'image-collection',
  },
  {
    color: '#57534e',
    description: '按片段顺序组织视频并输出时间线',
    icon: 'lucide:rows-3',
    label: '视频时间线',
    ports: [
      input('videos', 'video-list', true),
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
    ports: [input('artifacts', 'artifact-set', true)],
    type: 'output',
  },
  {
    color: '#15803d',
    description: '把最终成果保存到 FDM 私有素材库',
    icon: 'lucide:archive',
    label: '保存到素材库',
    ports: [input('artifacts', 'artifact-set', true)],
    type: 'asset-library-output',
  },
];

export const CREATIVE_NODE_MAP = new Map(
  CREATIVE_NODE_CATALOG.map((item) => [item.type, item]),
);

export const NODE_GROUPS = [
  {
    key: 'input',
    label: '素材输入',
    types: ['creative-brief', 'image-input', 'video-input', 'brand-input'],
  },
  {
    key: 'plan',
    label: 'AI 规划',
    types: ['content-planner', 'image-plan-item', 'video-plan-item'],
  },
  {
    key: 'generate',
    label: '图像生成与处理',
    types: ['image-generate', 'image-to-image', 'image-edit', 'image-resize'],
  },
  {
    key: 'video',
    label: '视频生成与处理',
    types: [
      'video-generate',
      'image-to-video',
      'first-last-frame-to-video',
      'video-trim',
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
