import type { FdmCreativeApi } from '#/api/fdmcreative';

export interface ResultHistorySelection {
  asset: FdmCreativeApi.NodeResultAsset;
  version: FdmCreativeApi.NodeResultVersion;
}

/** A browser may only branch from a currently readable asset URL/id pair. */
export function isActiveResultAsset(asset: FdmCreativeApi.NodeResultAsset) {
  return asset.availability === 'ACTIVE' && Boolean(asset.id && asset.url);
}

/**
 * The node-level quick toolbar follows the same input policy exposed by the
 * backend: an explicitly adopted, semantically-current asset first, followed
 * by the newest currently readable output. It never chooses a stale adoption.
 */
export function defaultResultHistorySelection(
  versions: FdmCreativeApi.NodeResultVersion[],
): ResultHistorySelection | undefined {
  for (const version of versions) {
    if (version.selectionStatus === 'STALE') continue;
    const adopted = version.assets.find(
      (asset) => asset.adopted && isActiveResultAsset(asset),
    );
    if (adopted) return { asset: adopted, version };
  }
  for (const version of versions) {
    const latest = version.assets.find(isActiveResultAsset);
    if (latest) return { asset: latest, version };
  }
  return undefined;
}

export function resultBranchBlockedReason(options: {
  autosaveConflict: boolean;
  canEdit: boolean;
}) {
  if (!options.canEdit) return '当前项目角色为只读，不能修改画布或采用结果';
  if (options.autosaveConflict) return '草稿存在保存冲突，请先处理冲突后再创建分支';
  return undefined;
}
