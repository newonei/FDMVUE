import type { FdmAiApi } from '#/api/fdmai';

export interface VideoFrameConfigSlot {
  key: 'firstFrameAssetId' | 'lastFrameAssetId';
  label: string;
}

export function getVideoFrameConfigSlots(
  nodeType: string,
  capabilities: readonly FdmAiApi.Capability[],
): VideoFrameConfigSlot[] {
  if (nodeType === 'first-last-frame-to-video') {
    return [
      { key: 'firstFrameAssetId', label: '首帧' },
      { key: 'lastFrameAssetId', label: '尾帧' },
    ];
  }
  if (nodeType === 'image-to-video') {
    return [{ key: 'firstFrameAssetId', label: '首帧' }];
  }
  if (
    nodeType === 'video-generate' &&
    capabilities.includes('FIRST_FRAME_TO_VIDEO')
  ) {
    return [{ key: 'firstFrameAssetId', label: '首帧' }];
  }
  return [];
}

function referenceAssetCount(referenceAssetIds: unknown) {
  return Array.isArray(referenceAssetIds)
    ? referenceAssetIds.filter((item) => typeof item === 'number').length
    : 0;
}

function requiredCapability(
  nodeType: string,
  references: number,
): FdmAiApi.Capability | undefined {
  switch (nodeType) {
    case 'first-last-frame-to-video': {
      return 'FIRST_LAST_FRAME_TO_VIDEO';
    }
    case 'image-edit': {
      return 'IMAGE_EDIT';
    }
    case 'image-generate': {
      return references > 0 ? 'IMAGE_TO_IMAGE' : 'TEXT_TO_IMAGE';
    }
    case 'image-to-image': {
      return 'IMAGE_TO_IMAGE';
    }
    case 'image-to-video': {
      return 'FIRST_FRAME_TO_VIDEO';
    }
    case 'video-generate': {
      return references > 0 ? 'FIRST_FRAME_TO_VIDEO' : 'TEXT_TO_VIDEO';
    }
    default: {
      return undefined;
    }
  }
}

export function supportsNodeModel(
  model: Pick<FdmAiApi.ModelOption, 'capabilities' | 'modality'>,
  nodeType: string,
  referenceAssetIds: unknown,
) {
  const references = referenceAssetCount(referenceAssetIds);
  if (nodeType === 'prompt-generator') {
    if (model.modality !== 'TEXT' || !model.capabilities.includes('CHAT')) {
      return false;
    }
    return references === 0 || model.capabilities.includes('IMAGE_INPUT');
  }
  const capability = requiredCapability(nodeType, references);
  if (capability && !model.capabilities.includes(capability)) return false;
  if (
    references > 1 &&
    ['image-edit', 'image-generate', 'image-to-image'].includes(nodeType) &&
    !model.capabilities.includes('MULTI_REFERENCE')
  ) {
    return false;
  }
  return true;
}
