import type { FdmCreativeApi } from '#/api/fdmcreative';

export const ASSET_KIND_OPTIONS: Array<{
  icon: string;
  label: string;
  value: '' | FdmCreativeApi.CreativeAsset['kind'];
}> = [
  { icon: 'lucide:layout-grid', label: '全部', value: '' },
  { icon: 'lucide:image', label: '图片', value: 'IMAGE' },
  { icon: 'lucide:film', label: '视频', value: 'VIDEO' },
  { icon: 'lucide:audio-lines', label: '音频', value: 'AUDIO' },
];

export const PROMPT_TARGET_OPTIONS: Array<{
  label: string;
  value: FdmCreativeApi.PromptTargetType;
}> = [
  { label: '通用', value: 'GENERAL' },
  { label: '图像', value: 'IMAGE' },
  { label: '视频', value: 'VIDEO' },
];

export const PROMPT_VISIBILITY_OPTIONS: Array<{
  description: string;
  label: string;
  value: FdmCreativeApi.PromptVisibility;
}> = [
  { description: '仅自己可查看和使用', label: '个人', value: 'PERSONAL' },
  { description: '当前租户成员均可使用', label: '团队共享', value: 'TENANT' },
];

export function assetKindLabel(kind: FdmCreativeApi.CreativeAsset['kind']) {
  return (
    {
      AUDIO: '音频',
      DOCUMENT: '文档',
      IMAGE: '图片',
      OTHER: '其他',
      VIDEO: '视频',
    } as const
  )[kind];
}

export function promptTargetLabel(target: FdmCreativeApi.PromptTargetType) {
  return PROMPT_TARGET_OPTIONS.find((item) => item.value === target)?.label;
}
