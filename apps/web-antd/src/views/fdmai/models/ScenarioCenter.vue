<script setup lang="ts">
import type { ModelScene } from './scenarios';

import type { FdmAiApi } from '#/api/fdmai';

import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { createIconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Collapse,
  Empty,
  Form,
  Input,
  message,
  Modal,
  Select,
  Spin,
  Tag,
} from 'ant-design-vue';

import {
  createFdmAiRoute,
  getFdmAiModels,
  getFdmAiProviders,
  getFdmAiRoutes,
  testFdmAiProvider,
  updateFdmAiRoute,
} from '#/api/fdmai';

import ModelLibrary from './ModelLibrary.vue';
import {
  MODEL_SCENES,
  resolveScene,
  sameId,
  sceneCandidates,
} from './scenarios';

defineOptions({ name: 'FdmAiScenarioCenter' });
const icon = {
  text: createIconifyIcon('ant-design:comment-outlined'),
  image: createIconifyIcon('ant-design:picture-outlined'),
  edit: createIconifyIcon('ant-design:edit-outlined'),
  video: createIconifyIcon('ant-design:video-camera-outlined'),
};
const LinkIcon = createIconifyIcon('ant-design:link-outlined');
const CheckIcon = createIconifyIcon('ant-design:check-circle-outlined');
const SettingsIcon = createIconifyIcon('ant-design:control-outlined');
const { hasAccessByCodes } = useAccess();
const has = (code: string) => hasAccessByCodes([code]);
const canManagePlatform = has('fdmai:platform:manage');
const canImport =
  canManagePlatform && has('fdmai:model:create') && has('fdmai:route:create');
const canTest = has('fdmai:invocation:create') && has('fdmai:invocation:query');
const route = useRoute();
const router = useRouter();
const loading = ref(false);
const loadError = ref('');
const models = ref<FdmAiApi.ModelDefinition[]>([]);
const providers = ref<FdmAiApi.ProviderAccount[]>([]);
const routes = ref<FdmAiApi.RouteDefinition[]>([]);
const selectedSceneId = ref('image');
const libraryVisible = ref(false);
const library = ref<InstanceType<typeof ModelLibrary>>();
const activeScene = computed(
  () => MODEL_SCENES.find((item) => item.id === selectedSceneId.value)!,
);
const scenes = computed(() =>
  MODEL_SCENES.map((scene) =>
    resolveScene(scene, routes.value, models.value, providers.value),
  ),
);
const active = computed(
  () => scenes.value.find((item) => item.scene.id === selectedSceneId.value)!,
);
const platformUnknown = computed(
  () => !canManagePlatform && !active.value.route,
);
const testedResults = reactive<Record<string, boolean>>({});
function resultKey(
  modelId: number,
  routeKey: string,
  value: { capability: FdmAiApi.Capability },
) {
  return JSON.stringify([
    String(modelId),
    routeKey,
    value.capability,
  ]);
}
const testResult = computed(() =>
  active.value.model
    ? testedResults[
        resultKey(active.value.model.id, activeScene.value.routeKey, {
          capability: activeScene.value.capability,
        })
      ]
    : undefined,
);
function onTested(
  modelId: number,
  success: boolean,
  routeKey?: string,
  value?: { capability: FdmAiApi.Capability },
) {
  if (routeKey && value)
    testedResults[resultKey(modelId, routeKey, value)] = success;
}
const capabilityNames: Partial<Record<FdmAiApi.Capability, string>> = {
  CHAT: '文案对话',
  STRUCTURED_OUTPUT: '结构化输出',
  IMAGE_INPUT: '图片理解',
  TEXT_TO_IMAGE: '文生图',
  IMAGE_TO_IMAGE: '参考图生图',
  MULTI_REFERENCE: '多参考图',
  IMAGE_EDIT: '图片编辑',
  TEXT_TO_VIDEO: '文生视频',
  FIRST_FRAME_TO_VIDEO: '首帧生视频',
  FIRST_LAST_FRAME_TO_VIDEO: '首尾帧生视频',
};
const providerChecks = reactive<
  Record<string, { message?: string; valid: boolean }>
>({});
const checkingProviderId = ref('');
const providerCheck = computed(() =>
  active.value.provider
    ? providerChecks[String(active.value.provider.id)]
    : undefined,
);
const providerStatus = computed(() =>
  !active.value.provider
    ? '待配置'
    : !active.value.provider.enabled
      ? '已停用'
      : providerCheck.value
        ? providerCheck.value.valid
          ? '已连接'
          : '连接失败'
        : '待验证',
);
const bindingOpen = ref(false);
const bindingScene = ref<ModelScene>(MODEL_SCENES[1]!);
const bindingSaving = ref(false);
const bindingQuery = ref('');
const bindingRouteId = ref<number>();
const bindingScope = ref<'platform' | 'tenant'>('tenant');
const bindingOptions = computed(() =>
  sceneCandidates(
    bindingScene.value,
    routes.value,
    models.value,
    providers.value,
  ).filter(
    ({ model, provider, route: item }) =>
      Boolean(provider.platform) === (bindingScope.value === 'platform') &&
      `${model.name} ${model.code} ${provider.name} ${item.providerModel}`
        .toLowerCase()
        .includes(bindingQuery.value.trim().toLowerCase()),
  ),
);
watch(bindingScope, () => {
  bindingRouteId.value = undefined;
});
let loadRequest = 0;
let configurationSnapshot = '';

async function load() {
  const request = ++loadRequest;
  loading.value = true;
  loadError.value = '';
  const results = await Promise.allSettled([
    getFdmAiModels(),
    getFdmAiProviders(canManagePlatform),
    getFdmAiRoutes(canManagePlatform),
  ] as const);
  if (request !== loadRequest) return;
  const [modelResult, providerResult, routeResult] = results;
  models.value = modelResult.status === 'fulfilled' ? modelResult.value : [];
  providers.value =
    providerResult.status === 'fulfilled' ? providerResult.value : [];
  routes.value = routeResult.status === 'fulfilled' ? routeResult.value : [];
  const snapshot = JSON.stringify([
    models.value,
    providers.value,
    routes.value,
  ]);
  if (configurationSnapshot && configurationSnapshot !== snapshot) {
    for (const key of Object.keys(testedResults)) delete testedResults[key];
    for (const key of Object.keys(providerChecks)) delete providerChecks[key];
  }
  configurationSnapshot = snapshot;
  if (results.some((item) => item.status === 'rejected'))
    loadError.value =
      '部分配置未能读取，请重试或检查模型、服务商和路由查询权限。';
  loading.value = false;
}

function openBinding(scene = activeScene.value) {
  bindingScene.value = scene;
  selectedSceneId.value = scene.id;
  bindingQuery.value = '';
  const current = resolveScene(
    scene,
    routes.value,
    models.value,
    providers.value,
  );
  const defaultPlatform =
    current.route?.platform ??
    sceneCandidates(scene, routes.value, models.value, providers.value)[0]
      ?.provider.platform;
  bindingScope.value =
    defaultPlatform && canManagePlatform ? 'platform' : 'tenant';
  bindingRouteId.value = undefined;
  bindingOpen.value = true;
}

async function saveBinding() {
  const choice = sceneCandidates(
    bindingScene.value,
    routes.value,
    models.value,
    providers.value,
  ).find((item) => sameId(item.route.id, bindingRouteId.value));
  if (!choice) {
    message.warning('请选择一个已接入且支持此场景的模型');
    return;
  }
  const platform = bindingScope.value === 'platform';
  if (Boolean(choice.provider.platform) !== platform) {
    message.warning('请选择与生效范围一致的服务商来源');
    return;
  }
  const existing = routes.value.find(
    (item) =>
      item.routeKey === bindingScene.value.routeKey &&
      Boolean(item.platform) === platform,
  );
  if (
    !(existing ? has('fdmai:route:update') : has('fdmai:route:create')) ||
    (platform && !canManagePlatform)
  ) {
    message.warning('没有修改此范围场景配置的权限');
    return;
  }
  bindingSaving.value = true;
  const payload: FdmAiApi.RouteSaveReq = {
    routeKey: bindingScene.value.routeKey,
    modelId: choice.model.id,
    providerAccountId: choice.provider.id,
    providerModel: choice.route.providerModel,
    providerOptions: { ...choice.route.providerOptions },
    enabled: true,
    platform,
  };
  try {
    if (existing) await updateFdmAiRoute(existing.id, payload);
    else await createFdmAiRoute(payload);
    for (const key of Object.keys(testedResults)) delete testedResults[key];
    bindingOpen.value = false;
    message.success(`${bindingScene.value.title}的模型已配置`);
    await load();
  } finally {
    bindingSaving.value = false;
  }
}

async function showLibrary() {
  libraryVisible.value = true;
  await nextTick();
}

async function openImport(providerId?: number, modality?: FdmAiApi.Modality) {
  if (!canImport) return;
  bindingOpen.value = false;
  await showLibrary();
  await library.value?.openSync(providerId, modality);
}

async function checkProvider() {
  const provider = active.value.provider;
  if (!provider || checkingProviderId.value || !has('fdmai:provider:test'))
    return;
  checkingProviderId.value = String(provider.id);
  try {
    const result = await testFdmAiProvider(provider.id);
    providerChecks[String(provider.id)] = {
      valid: result.valid,
      message: result.message,
    };
  } catch {
    providerChecks[String(provider.id)] = {
      valid: false,
      message: '验证失败，请在服务商设置中检查连接和凭据。',
    };
  } finally {
    checkingProviderId.value = '';
  }
}

async function openTest() {
  if (!active.value.configured || !active.value.model) {
    openBinding();
    return;
  }
  const model = active.value.model;
  const testContext = {
    routeKey: activeScene.value.routeKey,
    capability: activeScene.value.capability,
  };
  await showLibrary();
  library.value?.openTest(model, testContext);
}

function leaveLibrary() {
  libraryVisible.value = false;
  if (route.query.import === '1') {
    const query = { ...route.query };
    delete query.import;
    delete query.providerAccountId;
    void router.replace({ path: route.path, query });
  }
  void load();
}
function onLibraryChanged() {
  for (const key of Object.keys(testedResults)) delete testedResults[key];
  for (const key of Object.keys(providerChecks)) delete providerChecks[key];
  void load();
}

let handledImportQuery = '';
async function consumeImportQuery() {
  if (route.path !== '/fdmai/models' || route.query.import !== '1' || handledImportQuery === route.fullPath) return;
  handledImportQuery = route.fullPath;
  const id = String(route.query.providerAccountId || '');
  const provider = providers.value.find((item) => sameId(item.id, id));
  if (id && !provider) {
    message.warning('该服务商账号不存在或当前不可见');
    return;
  }
  // Keep the query while the picker is open: the tab router keys views by fullPath.
  // Clearing it here would remount this page before openSync can display its modal.
  await openImport(provider?.id);
}

watch(
  () => route.fullPath,
  () => {
    if (route.path !== '/fdmai/models' || route.query.import !== '1') {
      handledImportQuery = '';
    } else if (!loading.value) void consumeImportQuery();
  },
);
onMounted(async () => {
  await load();
  await consumeImportQuery();
});
</script>

<template>
  <Page auto-content-height>
    <ModelLibrary
      v-if="libraryVisible"
      ref="library"
      @back="leaveLibrary"
      @changed="onLibraryChanged"
      @tested="onTested"
    />
    <main v-else class="scenario-center">
      <header class="center-heading">
        <div>
          <h1>模型中心</h1>
          <p>先选要做的事，再配置使用的模型</p>
        </div>
        <div class="heading-actions">
          <Button type="link" @click="showLibrary">管理全部模型</Button>
          <Button
            v-if="canImport"
            type="primary"
            size="large"
            @click="openImport()"
          >
            接入模型
          </Button>
        </div>
      </header>
      <Alert
        v-if="loadError"
        type="warning"
        show-icon
        :message="loadError"
        class="load-alert"
      >
        <template #action>
          <Button size="small" @click="load">重试</Button>
        </template>
      </Alert>
      <Alert
        v-if="!canManagePlatform"
        type="info"
        show-icon
        message="当前仅展示可管理的租户配置。平台默认模型需由平台管理员查看，未显示不代表未配置。"
        class="load-alert"
      />
      <Spin :spinning="loading">
        <div class="scenario-layout">
          <section class="scene-list" aria-label="创作场景">
            <div
              v-for="item in scenes"
              :key="item.scene.id"
              class="scene-row"
              :class="{ selected: selectedSceneId === item.scene.id }"
            >
              <button
                class="scene-select"
                :aria-pressed="selectedSceneId === item.scene.id"
                @click="selectedSceneId = item.scene.id"
              >
                <component
                  :is="icon[item.scene.id as keyof typeof icon]"
                  class="scene-icon"
                />
                <span class="scene-copy"><strong>{{ item.scene.title }}</strong><span>{{ item.scene.description }}</span></span>
                <span class="scene-current"><small>当前模型</small><strong
                    v-if="item.model"
                    :class="{ 'has-issue': item.issue }"
                    >{{ item.model.name }}</strong><span v-else class="needs-setup">{{
                    !canManagePlatform && !item.route
                      ? '平台配置不可见'
                      : '待配置'
                  }}</span><small v-if="item.model && item.issue" class="needs-setup">{{
                    item.issue
                  }}</small></span>
              </button>
              <Button
                v-if="has('fdmai:route:create') || has('fdmai:route:update')"
                type="link"
                class="change-button"
                :aria-label="`${item.model ? '更换' : '配置'}${item.scene.title}模型`"
                @click="openBinding(item.scene)"
              >
                {{ item.model ? '更换' : '配置' }}
              </Button>
            </div>
          </section>

          <aside class="scene-detail" aria-label="场景配置详情">
            <div class="detail-heading">
              <span class="detail-icon"><component :is="icon[activeScene.id as keyof typeof icon]" /></span>
              <div>
                <h2>{{ activeScene.title }}</h2>
                <p>{{ activeScene.description }}</p>
              </div>
            </div>
            <div class="current-model">
              <span class="field-label">当前模型</span>
              <h3>
                {{
                  active.model?.name ||
                  (platformUnknown ? '平台默认配置不可见' : '尚未选择模型')
                }}
              </h3>
              <p>
                {{
                  active.route?.providerModel ||
                  (platformUnknown
                    ? '请联系平台管理员确认实际生效的模型'
                    : '选择已接入模型，配置此场景的默认调用')
                }}
              </p>
              <Tag v-if="active.route" class="scope-label">
                {{ active.route.platform ? '平台默认' : '当前租户配置' }}
              </Tag>
            </div>
            <dl class="model-properties">
              <div>
                <dt>提供方</dt>
                <dd>{{ active.provider?.name || '配置后显示' }}</dd>
              </div>
              <div>
                <dt>支持能力</dt>
                <dd>
                  <template v-if="active.model">
                    <Tag
                      v-for="capability in active.model.capabilities"
                      :key="capability"
                      color="blue"
                    >
                      {{ capabilityNames[capability] || capability }}
                    </Tag>
</template><span v-else class="muted">配置后显示</span>
                </dd>
              </div>
            </dl>
            <div v-if="active.issue && active.route" class="config-issue">
              {{ active.issue }}，请更换或检查配置。
            </div>
            <section class="readiness" aria-label="配置就绪状态">
              <h3>配置就绪状态</h3>
              <div>
                <LinkIcon /><span>服务商连接</span><button
                  :disabled="
                    !active.provider ||
                    !has('fdmai:provider:test') ||
                    Boolean(checkingProviderId)
                  "
                  :class="{
                    good: providerCheck?.valid,
                    problem: providerCheck && !providerCheck.valid,
                  }"
                  @click="checkProvider"
                >
                  {{
                    checkingProviderId === String(active.provider?.id)
                      ? '验证中'
                      : providerStatus
                  }}
                </button>
              </div>
              <div>
                <CheckIcon /><span>模型验证</span><span
                  class="status-tag"
                  :class="{
                    good: testResult === true,
                    problem: testResult === false,
                  }"
                  >{{
                    testResult === undefined
                      ? '待测试'
                      : testResult
                        ? '本次测试通过'
                        : '本次测试失败'
                  }}</span>
              </div>
            </section>
            <p
              v-if="providerCheck && !providerCheck.valid"
              class="connection-error"
            >
              {{ providerCheck.message }}
              <button @click="router.push('/fdmai/providers')">前往设置</button>
            </p>
            <div class="detail-actions">
              <Button v-if="platformUnknown" @click="showLibrary">
                查看可管理模型
</Button><Button
                v-else-if="canTest || !active.configured"
                type="primary"
                size="large"
                :disabled="
                  loading ||
                  (!active.configured &&
                    !has('fdmai:route:create') &&
                    !has('fdmai:route:update'))
                "
                @click="openTest"
              >
                {{
                  active.configured
                    ? '测试当前模型'
                    : '完成配置并测试'
                }}
              </Button>
              <p>配置默认模型后，可直接测试连通性与输出效果</p>
            </div>
          </aside>
        </div>
      </Spin>
      <Collapse ghost class="advanced-settings">
        <Collapse.Panel key="advanced">
          <template #header>
            <span class="advanced-label"><SettingsIcon />高级模型与路由设置</span>
          </template>
          <div class="advanced-content">
            <p>管理更多模型、内容策划及自定义场景，或调整服务商连接。</p>
            <div>
              <Button @click="showLibrary">管理全部模型</Button><Button
                v-if="has('fdmai:provider:query')"
                @click="router.push('/fdmai/providers')"
              >
                服务商设置
</Button><Button
                v-if="has('fdmai:route:query')"
                @click="router.push('/fdmai/routes')"
              >
                高级路由
</Button><Button :loading="loading" @click="load">刷新配置</Button>
            </div>
          </div>
        </Collapse.Panel>
      </Collapse>
    </main>

    <Modal
      v-model:open="bindingOpen"
      :title="`为${bindingScene.title}选择模型`"
      :width="740"
      :confirm-loading="bindingSaving"
      ok-text="保存并启用场景"
      :ok-button-props="{ disabled: bindingRouteId == null }"
      @ok="saveBinding"
    >
      <p class="modal-help">
        只显示支持此场景且接入来源已启用的模型。保存后，新任务将使用所选来源，历史调用保留原配置。
      </p>
      <Alert
        v-if="bindingScene.id === 'image'"
        type="info"
        show-icon
        message="此默认模型也用于参考图任务。需要参考图生成时，请选择同时支持「参考图生图」能力的模型。"
      />
      <Input
        v-model:value="bindingQuery"
        allow-clear
        placeholder="搜索模型名称或服务商"
        class="candidate-search"
      />
      <div
        class="candidate-list"
        role="radiogroup"
        :aria-label="`${bindingScene.title}可选模型`"
      >
        <button
          v-for="option in bindingOptions"
          :key="String(option.route.id)"
          class="candidate"
          :class="{ chosen: sameId(bindingRouteId, option.route.id) }"
          role="radio"
          :aria-checked="sameId(bindingRouteId, option.route.id)"
          @click="bindingRouteId = option.route.id"
        >
          <span><strong>{{ option.model.name }}</strong><small>{{ option.route.providerModel }}</small>
            <span class="candidate-capabilities"><Tag
                v-for="capability in option.model.capabilities"
                :key="capability"
                color="blue"
                >{{ capabilityNames[capability] || capability }}</Tag></span></span><span>{{ option.provider.name }}</span><CheckIcon v-if="sameId(bindingRouteId, option.route.id)" />
</button><Empty
          v-if="!bindingOptions.length"
          description="没有匹配的已接入模型"
        >
          <Button
            v-if="canImport"
            type="primary"
            @click="openImport(undefined, bindingScene.modality)"
          >
            接入支持此场景的模型
          </Button>
        </Empty>
      </div>
      <Form layout="vertical" class="binding-scope">
        <Form.Item label="生效范围">
          <Select
            v-model:value="bindingScope"
            :disabled="!canManagePlatform"
            :options="[
              { value: 'tenant', label: '当前租户' },
              ...(canManagePlatform
                ? [
                    {
                      value: 'platform',
                      label: '平台默认（影响使用平台默认配置的租户）',
                    },
                  ]
                : []),
            ]"
          />
        </Form.Item>
      </Form>
      <p class="modal-help">
        已有模型未显示时，请检查模型、服务商和来源路由是否已启用，以及生效范围是否一致。
      </p>
    </Modal>

  </Page>
</template>

<style scoped>
.scenario-center {
  min-height: 100%;
  padding: 30px 36px 12px;
  background: hsl(var(--background));
  color: hsl(var(--foreground));
}
.center-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 26px;
  border-bottom: 1px solid hsl(var(--border));
}
h1 {
  margin: 0;
  font-size: 28px;
  font-weight: 650;
  letter-spacing: -0.5px;
}
.center-heading p,
.detail-heading p {
  margin: 9px 0 0;
  color: #758198;
  font-size: 14px;
}
.heading-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}
.scenario-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) minmax(330px, 1fr);
  min-height: 630px;
}
.scene-list {
  padding: 20px 26px 28px 0;
}
.scene-row {
  position: relative;
  display: flex;
  align-items: center;
  min-height: 137px;
  border-bottom: 1px solid hsl(var(--border));
  border-left: 3px solid transparent;
}
.scene-row:last-child {
  border-bottom: none;
}
.scene-row.selected {
  background: #f1f7ff;
  border-left-color: #1677ff;
}
.scene-select {
  display: flex;
  flex: 1;
  align-items: center;
  gap: 22px;
  min-width: 0;
  padding: 28px 10px 28px 22px;
  text-align: left;
  background: transparent;
  border: 0;
  cursor: pointer;
}
.scene-select:focus-visible,
.candidate:focus-visible {
  outline: 2px solid #1677ff;
  outline-offset: -2px;
}
.scene-icon {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  color: #0672ef;
}
.scene-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 9px;
  min-width: 0;
}
.scene-copy strong {
  font-size: 19px;
  font-weight: 600;
}
.scene-copy > span {
  color: #758198;
  font-size: 13px;
  line-height: 1.55;
}
.scene-current {
  display: flex;
  flex: 0 1 145px;
  flex-direction: column;
  gap: 8px;
  min-width: 105px;
  overflow-wrap: anywhere;
}
.scene-current small {
  color: #8590a5;
  font-size: 12px;
}
.scene-current strong {
  font-size: 14px;
  font-weight: 600;
}
.scene-current .needs-setup,
.needs-setup,
.config-issue {
  color: #b45309;
}
.change-button {
  margin-right: 12px;
  padding: 5px;
  font-size: 14px;
}
.scene-detail {
  padding: 34px 0 28px 28px;
  border-left: 1px solid hsl(var(--border));
}
.detail-heading {
  display: flex;
  align-items: center;
  gap: 16px;
}
.detail-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  background: #eff6ff;
  border-radius: 14px;
  color: #0672ef;
  font-size: 34px;
}
h2 {
  margin: 0;
  font-size: 23px;
  font-weight: 650;
}
.detail-heading p {
  font-size: 13px;
  line-height: 1.6;
}
.current-model {
  padding: 30px 0 19px;
}
.field-label {
  color: #8590a5;
  font-size: 13px;
}
.current-model h3 {
  margin: 9px 0 4px;
  font-size: 19px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.current-model p {
  margin: 0;
  color: #7b879c;
  font-size: 13px;
  overflow-wrap: anywhere;
}
.scope-label {
  margin-top: 8px;
  font-size: 11px;
}
.model-properties {
  margin: 0;
}
.model-properties > div {
  display: flex;
  align-items: flex-start;
  gap: 18px;
  padding: 16px 0;
  border-top: 1px solid hsl(var(--border));
}
.model-properties dt {
  flex: 0 0 76px;
  color: #7b879c;
  font-size: 14px;
}
.model-properties dd {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin: 0;
  font-size: 14px;
  overflow-wrap: anywhere;
}
.model-properties :deep(.ant-tag) {
  margin: 0;
}
.readiness {
  margin-top: 12px;
  overflow: hidden;
  border: 1px solid hsl(var(--border));
  border-radius: 9px;
}
.readiness h3 {
  margin: 0;
  padding: 12px 15px;
  background: hsl(var(--muted) / 50%);
  font-size: 13px;
  font-weight: 600;
  border-bottom: 1px solid hsl(var(--border));
}
.readiness > div {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 15px;
  font-size: 14px;
}
.readiness > div > svg {
  width: 19px;
  height: 19px;
}
.readiness > div > span:nth-child(2) {
  flex: 1;
}
.readiness button,
.status-tag {
  padding: 3px 8px;
  border: 1px solid hsl(var(--border));
  border-radius: 4px;
  background: hsl(var(--muted) / 50%);
  font-size: 12px;
  white-space: nowrap;
}
.readiness button {
  cursor: pointer;
}
.readiness button:disabled {
  cursor: default;
}
.readiness .good {
  color: #15803d;
  background: #f0fdf4;
}
.readiness .problem {
  color: #b45309;
  background: #fffbeb;
}
.connection-error {
  margin: 12px 0 0;
  color: #b45309;
  font-size: 12px;
  line-height: 1.7;
}
.connection-error button {
  color: #1677ff;
  background: none;
  border: 0;
  cursor: pointer;
}
.detail-actions {
  margin-top: 24px;
  text-align: center;
}
.detail-actions :deep(.ant-btn) {
  min-width: 225px;
}
.detail-actions p {
  margin: 10px 0 0;
  color: #7b879c;
  font-size: 12px;
  line-height: 1.6;
}
.advanced-settings {
  border-top: 1px solid hsl(var(--border));
}
.advanced-label {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  font-size: 14px;
  font-weight: 500;
}
.advanced-label svg {
  width: 20px;
  height: 20px;
}
.advanced-content p,
.modal-help,
.muted {
  color: #7b879c;
  font-size: 13px;
  line-height: 1.7;
}
.advanced-content > div {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  padding: 7px 0;
}
.load-alert {
  margin-top: 15px;
}
.candidate-search {
  margin: 10px 0 15px;
}
.candidate-list {
  max-height: 360px;
  overflow: auto;
}
.candidate {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 16px;
  text-align: left;
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  margin-bottom: 8px;
  cursor: pointer;
}
.candidate.chosen {
  border-color: #1677ff;
  background: #f0f7ff;
}
.candidate > span:first-child {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.candidate strong {
  font-size: 14px;
  overflow-wrap: anywhere;
}
.candidate small,
.candidate > span:nth-child(2) {
  color: #758198;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.candidate > svg {
  width: 20px;
  color: #1677ff;
}
.candidate-capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.candidate-capabilities :deep(.ant-tag) {
  margin: 0;
  font-size: 11px;
}
.binding-scope {
  margin-top: 18px;
}
:global(.dark) .scene-row.selected,
:global(.dark) .candidate.chosen {
  background: #152943;
}
:global(.dark) .detail-icon {
  background: #152943;
}
@media (min-width: 1500px) {
  .scenario-center {
    padding: 36px 48px 18px;
  }
  .scenario-layout {
    min-height: 680px;
  }
  .scene-row {
    min-height: 150px;
  }
}
@media (min-width: 1151px) {
  .scenario-center { padding: 30px 48px 18px; }
  h1 { font-size: 32px; }
  .scenario-layout { grid-template-columns: minmax(0, 1.45fr) minmax(330px, 1fr); min-height: 680px; }
  .scene-row { min-height: 145px; }
  .scene-select { padding-left: 40px; gap: 36px; }
  .scene-icon { width: 40px; height: 40px; }
  .scene-copy strong { font-size: 21px; }
  .scene-copy > span { font-size: 14px; }
  .scene-current { flex-basis: 205px; }
  .scene-current strong { font-size: 16px; }
  .scene-current small { font-size: 13px; }
  .model-properties dt, .model-properties dd, .readiness > div { font-size: 15px; }
}
@media (max-width: 1150px) {
  .scenario-center {
    padding: 24px;
  }
  .scenario-layout {
    grid-template-columns: minmax(0, 1.3fr) minmax(310px, 1fr);
  }
  .scene-list {
    padding-right: 18px;
  }
  .scene-select {
    gap: 14px;
    padding-left: 15px;
    flex-wrap: wrap;
  }
  .scene-copy {
    min-width: 140px;
  }
  .scene-current {
    flex-basis: 100%;
    padding-left: 50px;
  }
  .scene-current small:first-child {
    display: none;
  }
  .scene-row {
    min-height: 150px;
  }
  .scene-detail {
    padding-left: 22px;
  }
}
@media (max-width: 800px) {
  .scenario-center {
    padding: 20px 16px;
  }
  .center-heading {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .scenario-layout {
    grid-template-columns: 1fr;
  }
  .scene-list {
    padding: 12px 0;
  }
  .scene-row {
    min-height: 110px;
  }
  .scene-select {
    flex-wrap: nowrap;
  }
  .scene-current {
    flex-basis: 120px;
    padding-left: 0;
  }
  .scene-current small:first-child {
    display: block;
  }
  .scene-detail {
    padding: 24px 8px;
    border-top: 1px solid hsl(var(--border));
    border-left: 0;
  }
  .detail-actions :deep(.ant-btn) {
    width: 100%;
  }
}
@media (max-width: 480px) {
  h1 {
    font-size: 24px;
  }
  .heading-actions {
    justify-content: space-between;
    width: 100%;
  }
  .scene-select {
    flex-wrap: wrap;
    gap: 10px;
  }
  .scene-copy {
    min-width: 130px;
  }
  .scene-current {
    flex-basis: 100%;
    padding-left: 46px;
  }
  .scene-current small:first-child {
    display: none;
  }
  .scene-copy strong {
    font-size: 17px;
  }
  .scene-icon {
    width: 30px;
    height: 30px;
  }
}
</style>
