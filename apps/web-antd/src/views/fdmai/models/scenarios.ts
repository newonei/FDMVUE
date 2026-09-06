import type { FdmAiApi } from '#/api/fdmai';

export interface ModelScene {
  id: string;
  title: string;
  description: string;
  icon: string;
  routeKey: string;
  modality: FdmAiApi.Modality;
  capability: FdmAiApi.Capability;
}

export const MODEL_SCENES: ModelScene[] = [
  {
    id: 'text',
    title: '文案与对话',
    description: '产品文案、翻译与提示词优化',
    icon: 'ant-design:comment-outlined',
    routeKey: 'creative.prompt.refine',
    modality: 'TEXT',
    capability: 'CHAT',
  },
  {
    id: 'image',
    title: '图片生成',
    description: '根据文字描述生成图片',
    icon: 'ant-design:picture-outlined',
    routeKey: 'creative.image.generate.default',
    modality: 'IMAGE',
    capability: 'TEXT_TO_IMAGE',
  },
  {
    id: 'edit',
    title: '图片编辑',
    description: '对图片进行编辑与优化处理',
    icon: 'ant-design:edit-outlined',
    routeKey: 'creative.image.edit.default',
    modality: 'IMAGE',
    capability: 'IMAGE_EDIT',
  },
  {
    id: 'video',
    title: '视频生成',
    description: '根据文字描述生成视频',
    icon: 'ant-design:video-camera-outlined',
    routeKey: 'creative.video.generate.default',
    modality: 'VIDEO',
    capability: 'TEXT_TO_VIDEO',
  },
];

export function sameId(left: unknown, right: unknown) {
  return left != null && right != null && String(left) === String(right);
}

function compareId(
  left: FdmAiApi.RouteDefinition,
  right: FdmAiApi.RouteDefinition,
) {
  const a = String(left.id);
  const b = String(right.id);
  return a.length - b.length || a.localeCompare(b);
}

export function supportsScene(
  model: FdmAiApi.ModelDefinition,
  scene: ModelScene,
) {
  return (
    model.modality === scene.modality &&
    model.capabilities.includes(scene.capability)
  );
}

/** Match server route precedence, including a disabled tenant override masking platform routes. */
export function resolveScene(
  scene: ModelScene,
  routes: FdmAiApi.RouteDefinition[],
  models: FdmAiApi.ModelDefinition[],
  providers: FdmAiApi.ProviderAccount[],
) {
  const matching = routes
    .filter((route) => route.routeKey === scene.routeKey)
    .sort(compareId);
  const tenant = matching.filter((route) => !route.platform);
  const candidates = tenant.length
    ? tenant
    : matching.filter((route) => route.platform);
  const modelFor = (route: FdmAiApi.RouteDefinition) =>
    models.find((model) => sameId(model.id, route.modelId));
  const providerFor = (route: FdmAiApi.RouteDefinition) =>
    providers.find((provider) => sameId(provider.id, route.providerAccountId));
  const route =
    candidates.find(
      (item) =>
        item.enabled && modelFor(item)?.enabled && providerFor(item)?.enabled,
    ) ?? candidates[0];
  const model = route ? modelFor(route) : undefined;
  const provider = route ? providerFor(route) : undefined;
  let issue = '';
  if (!route) issue = '尚未配置场景模型';
  else if (!route.enabled) issue = '场景配置已停用';
  else if (!model) issue = '模型信息不可见';
  else if (!model.enabled) issue = '模型已停用';
  else if (!provider) issue = '服务商信息不可见';
  else if (!provider.enabled) issue = '服务商已停用';
  else if (!supportsScene(model, scene)) issue = '模型不支持此场景';
  return {
    scene,
    route,
    model,
    provider,
    issue,
    configured: Boolean(route && model && provider && !issue),
  };
}

export function sceneCandidates(
  scene: ModelScene,
  routes: FdmAiApi.RouteDefinition[],
  models: FdmAiApi.ModelDefinition[],
  providers: FdmAiApi.ProviderAccount[],
) {
  return models
    .filter((model) => model.enabled && supportsScene(model, scene))
    .flatMap((model) => {
      const seen = new Set<string>();
      return routes
        .filter((route) => sameId(route.modelId, model.id) && route.enabled)
        .sort(compareId)
        .flatMap((route) => {
          const provider = providers.find((item) =>
            sameId(item.id, route.providerAccountId),
          );
          const key = `${String(provider?.id)}:${route.providerModel}`;
          if (!provider?.enabled || seen.has(key)) return [];
          seen.add(key);
          return [{ model, route, provider }];
        });
    });
}
