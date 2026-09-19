import type { FdmAiApi } from '#/api/fdmai';

import { sameModelLibraryId } from './model-library';

export interface ModelTestAvailability {
  reason: string;
  status: 'available' | 'unavailable' | 'unknown';
}

/** Match server precedence: any tenant configuration masks platform defaults. */
export function getModelTestAvailability(options: {
  canViewPlatform: boolean;
  model?: FdmAiApi.ModelDefinition;
  models: FdmAiApi.ModelDefinition[];
  providers: FdmAiApi.ProviderAccount[];
  routeKey?: string;
  routes: FdmAiApi.RouteDefinition[];
}): ModelTestAvailability {
  const { model, models, providers, routes, routeKey, canViewPlatform } = options;
  if (!model) return { status: 'unavailable', reason: '模型已删除或不可见，请刷新模型列表' };
  if (!model.enabled) return { status: 'unavailable', reason: '模型已停用，请先恢复模型' };
  const matching = routes.filter((route) => routeKey
    ? route.routeKey === routeKey
    : sameModelLibraryId(route.modelId, model.id));
  const tenant = matching.filter((route) => !route.platform);
  const candidates = (tenant.length ? tenant : matching.filter((route) => route.platform))
    .sort((left, right) => {
      const a = String(left.id);
      const b = String(right.id);
      return a.length - b.length || a.localeCompare(b);
    });
  if (!candidates.length) return canViewPlatform
    ? { status: 'unavailable', reason: '尚未配置此模型的调用路由，请先接入模型或配置场景' }
    : { status: 'unknown', reason: '平台默认来源不可见，提交时将由服务端确认可用性' };

  const reasons: string[] = [];
  let hasUnseenSource = false;
  for (const route of candidates) {
    if (!route.enabled) {
      reasons.push(`${route.platform ? '平台' : '当前租户'}调用路由已停用，请先恢复路由`);
      continue;
    }
    const routedModel = models.find((item) => sameModelLibraryId(item.id, route.modelId));
    const provider = providers.find((item) => sameModelLibraryId(item.id, route.providerAccountId));
    if (routedModel && !routedModel.enabled) {
      reasons.push('路由关联的模型已停用，请先恢复模型');
      continue;
    }
    if (provider && !provider.enabled) {
      reasons.push(`服务商「${provider.name}」已停用，请先在服务商接入中启用`);
      continue;
    }
    if (!routedModel || !provider) {
      hasUnseenSource = true;
      continue;
    }
    if (hasUnseenSource) break;
    if (!sameModelLibraryId(routedModel.id, model.id)) {
      return { status: 'unavailable', reason: '此场景的模型已变更，请返回场景配置后重新测试' };
    }
    return { status: 'available', reason: '' };
  }
  if (hasUnseenSource) return {
    status: 'unknown', reason: '部分调用来源信息不可见，提交时将由服务端确认可用性',
  };
  return { status: 'unavailable', reason: reasons[0] || '当前调用来源不可用，请检查路由和服务商配置' };
}
