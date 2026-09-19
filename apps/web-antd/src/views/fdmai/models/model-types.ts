import type { FdmAiApi } from '#/api/fdmai';

export const MODALITIES: FdmAiApi.Modality[] = [
  'TEXT',
  'IMAGE',
  'VIDEO',
  'AUDIO',
  'MUSIC',
  'EMBEDDING',
  'RERANK',
];

export const CAPABILITIES_BY_MODALITY: Record<FdmAiApi.Modality, FdmAiApi.Capability[]> = {
  AUDIO: ['TEXT_TO_AUDIO'],
  EMBEDDING: ['EMBEDDING'],
  IMAGE: ['TEXT_TO_IMAGE', 'IMAGE_TO_IMAGE', 'MULTI_REFERENCE', 'IMAGE_EDIT'],
  MUSIC: ['TEXT_TO_MUSIC'],
  RERANK: ['RERANK'],
  TEXT: ['CHAT', 'STRUCTURED_OUTPUT', 'IMAGE_INPUT'],
  VIDEO: ['TEXT_TO_VIDEO', 'FIRST_FRAME_TO_VIDEO', 'FIRST_LAST_FRAME_TO_VIDEO'],
};

export const CAPABILITIES = MODALITIES.flatMap((type) => CAPABILITIES_BY_MODALITY[type]);

export const MODALITY_LABELS: Record<FdmAiApi.Modality, string> = {
  AUDIO: '语音生成',
  EMBEDDING: '向量',
  IMAGE: '图片生成',
  MUSIC: '音乐生成',
  RERANK: '重排序',
  TEXT: '文本对话',
  VIDEO: '视频生成',
};

export const CAPABILITY_LABELS: Record<FdmAiApi.Capability, string> = {
  CHAT: '对话 / 文本生成',
  EMBEDDING: '生成向量',
  FIRST_FRAME_TO_VIDEO: '首帧生视频',
  FIRST_LAST_FRAME_TO_VIDEO: '首尾帧生视频',
  IMAGE_EDIT: '图片编辑',
  IMAGE_INPUT: '图片理解',
  IMAGE_TO_IMAGE: '参考图生图',
  MULTI_REFERENCE: '多参考图',
  RERANK: '文本重排序',
  STRUCTURED_OUTPUT: '结构化 JSON',
  TEXT_TO_AUDIO: '文本生成语音',
  TEXT_TO_IMAGE: '文生图',
  TEXT_TO_MUSIC: '文本生成音乐',
  TEXT_TO_VIDEO: '文生视频',
};

export const CAPABILITY_DESCRIPTIONS: Record<FdmAiApi.Capability, string> = {
  CHAT: '输入文字，获取文本回答',
  EMBEDDING: '将内容转换为向量，用于检索',
  FIRST_FRAME_TO_VIDEO: '以一张图片作为视频的起始画面',
  FIRST_LAST_FRAME_TO_VIDEO: '用首尾两张图片控制视频变化',
  IMAGE_EDIT: '修改图片中的指定内容',
  IMAGE_INPUT: '让文本模型读取和理解图片',
  IMAGE_TO_IMAGE: '根据参考图片与描述生成新图片',
  MULTI_REFERENCE: '同时参考多张图片生成',
  RERANK: '按相关性重新排列检索结果',
  STRUCTURED_OUTPUT: '按指定结构返回数据',
  TEXT_TO_AUDIO: '将文字转换为语音',
  TEXT_TO_IMAGE: '根据文字描述生成图片',
  TEXT_TO_MUSIC: '根据描述创作音乐',
  TEXT_TO_VIDEO: '根据文字描述生成视频',
};

export const MODEL_TYPE_OPTIONS = MODALITIES.map((value) => ({
  value,
  label: MODALITY_LABELS[value],
  description: {
    TEXT: '问答、写作与分析',
    IMAGE: '生成与编辑图片',
    VIDEO: '文生视频、图生视频',
    AUDIO: '文字转语音',
    MUSIC: '音乐与配乐创作',
    EMBEDDING: '语义检索与匹配',
    RERANK: '优化检索结果排序',
  }[value],
  icon: {
    TEXT: 'M4 4h16v12H9l-5 4V4Zm4 4h8M8 12h5',
    IMAGE: 'M4 4h16v16H4V4Zm0 12 5-5 4 4 3-3 4 4M15 8h.01',
    VIDEO: 'M3 5h13v14H3V5Zm13 5 5-3v10l-5-3M8 9l4 3-4 3V9Z',
    AUDIO: 'M9 5a3 3 0 0 1 6 0v6a3 3 0 0 1-6 0V5Zm-3 6a6 6 0 0 0 12 0M12 17v4M9 21h6',
    MUSIC:
      'M9 17V5l11-2v12M9 8l11-2M9 17a3 3 0 1 1-3-3 3 3 0 0 1 3 3Zm11-2a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z',
    EMBEDDING:
      'M5 5h4v4H5V5Zm10 0h4v4h-4V5ZM5 15h4v4H5v-4Zm10 0h4v4h-4v-4M9 7h6M7 9v6M17 9v6M9 17h6',
    RERANK: 'M8 5h12M8 12h8M8 19h4M3 4v16M1 18l2 2 2-2',
  }[value],
}));
