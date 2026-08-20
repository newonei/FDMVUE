<script lang="ts" setup>
import type { FdmAiApi } from '#/api/fdmai';
import type { FdmCreativeApi } from '#/api/fdmcreative';

import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';
import { formatDateTime } from '@vben/utils';

import {
  Alert,
  Button,
  Empty,
  Input,
  InputNumber,
  message,
  Modal,
  Popover,
  Select,
  Spin,
  Switch,
  Tag,
  Textarea,
  Tooltip,
} from 'ant-design-vue';

import {
  cancelAgentImageTask,
  generateAgentImage,
  getAgentImageCapability,
  getAgentImageModels,
  getAgentImageTaskPage,
  getCreativeProjectPage,
  refineCreativePrompt,
  retryAgentImageTask,
  syncCreativePrompt,
} from '#/api/fdmcreative';

import AssetLibraryPicker from '../shared/AssetLibraryPicker.vue';
import CreativeShell from '../shared/CreativeShell.vue';
import PromptLibraryPicker from '../shared/PromptLibraryPicker.vue';
import { normalizeModelIdentifier } from '../workbench/editor/model-identifier';
import { supportsNodeModel } from '../workbench/editor/node-model-filter';

defineOptions({ name: 'FdmCreativeImageAgent' });

type SchemaScalar = number | string;

interface PromptLibrarySelection {
  content: string;
  mode: 'append' | 'replace';
}

interface SchemaField {
  description?: string;
  key: string;
  maximum?: number;
  minimum?: number;
  options?: Array<{ label: string; value: SchemaScalar }>;
  required: boolean;
  step?: number;
  title: string;
  type: 'boolean' | 'integer' | 'number' | 'string';
}

const router = useRouter();
const loading = ref(false);
const submitting = ref(false);
const optimizing = ref(false);
const taskLoading = ref(false);
const modelsLoading = ref(false);
const modelLoadError = ref<string>();
const previewAsset = ref<FdmCreativeApi.CreativeAsset>();
const previewOpen = ref(false);
const projects = ref<FdmCreativeApi.Project[]>([]);
const selectedProjectId = ref<number>();
const capability = ref<FdmCreativeApi.AgentImageCapability>({
  enabled: false,
  maxOutputCount: 4,
  maxPromptBytes: 20_000,
  maxReferenceCount: 8,
});
const imageModels = ref<FdmAiApi.ModelOption[]>([]);
const selectedModelId = ref<string>();
const referenceAssets = ref<FdmCreativeApi.CreativeAsset[]>([]);
const tasks = ref<FdmCreativeApi.AgentImageTask[]>([]);
const taskTotal = ref(0);
const modelParameters = ref<Record<string, unknown>>({});
const activeIdempotencyKey = ref<string>();
const form = reactive({
  aspectRatio: '1:1',
  negativePrompt: '',
  outputCount: 1,
  prompt: '',
});

let pollTimer: number | undefined;

const currentProject = computed(() =>
  projects.value.find((project) => project.id === selectedProjectId.value),
);
const canRunCurrentProject = computed(() => {
  const role = currentProject.value?.currentUserRole;
  return role === 'OWNER' || role === 'EDITOR' || role === 'RUNNER';
});
const selectedModel = computed(() =>
  imageModels.value.find(
    (item) => normalizeModelIdentifier(item.id) === selectedModelId.value,
  ),
);
const modelOptions = computed(() =>
  imageModels.value.flatMap((item) => {
    const value = normalizeModelIdentifier(item.id);
    return value ? [{ label: item.name, value }] : [];
  }),
);
const schemaFields = computed(() =>
  parseSchemaFields(selectedModel.value?.parameterSchema),
);
const promptBytes = computed(
  () => new TextEncoder().encode(form.prompt).length,
);
const hasRunningTask = computed(() =>
  tasks.value.some(
    (task) => !['CANCELED', 'FAILED', 'SUCCEEDED'].includes(task.status),
  ),
);
const canSubmit = computed(
  () =>
    capability.value.enabled &&
    canRunCurrentProject.value &&
    Boolean(selectedProjectId.value) &&
    Boolean(selectedModelId.value) &&
    Boolean(form.prompt.trim()) &&
    !modelsLoading.value &&
    !submitting.value,
);

const suggestions = [
  {
    icon: 'lucide:shopping-bag',
    label: '电商主图',
    prompt:
      '为一款简约白色无线耳机生成高质感电商主图，纯净浅灰背景，产品悬浮，柔和棚拍光，留出右侧文案空间，真实材质细节，商业摄影风格。',
  },
  {
    icon: 'lucide:heart-handshake',
    label: '自然美颜情绪',
    prompt:
      '生成一张自然光人像：年轻女性站在窗边回眸微笑，轻盈柔焦，保留真实皮肤质感，暖白色室内，干净高级的生活方式摄影。',
  },
  {
    icon: 'lucide:badge-check',
    label: '角色设定',
    prompt:
      '设计一位东方奇幻冒险者角色设定图：全身正面站姿，深青色旅行斗篷与金属饰件，背负长剑，白色设定稿背景，精细服装结构，概念艺术。',
  },
  {
    icon: 'lucide:panels-top-left',
    label: '社媒封面',
    prompt:
      '生成一张科技感社交媒体封面：蓝紫渐变光影，抽象流体玻璃与粒子，中心留出标题区域，极简、干净、现代品牌视觉，16:9。',
  },
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseSchemaFields(schemaText?: string): SchemaField[] {
  if (!schemaText) return [];
  try {
    const root = asRecord(JSON.parse(schemaText));
    const properties = asRecord(root.properties);
    const required = new Set(
      Array.isArray(root.required) ? root.required.map(String) : [],
    );
    return Object.entries(properties)
      .map(([key, rawProperty]) => {
        const property = asRecord(rawProperty);
        const rawType = Array.isArray(property.type)
          ? property.type.find((item) => item !== 'null')
          : property.type;
        const type = ['boolean', 'integer', 'number', 'string'].includes(
          String(rawType),
        )
          ? (String(rawType) as SchemaField['type'])
          : 'string';
        const enumValues = Array.isArray(property.enum)
          ? property.enum.filter(
              (item): item is SchemaScalar =>
                typeof item === 'string' || typeof item === 'number',
            )
          : [];
        return {
          description:
            typeof property.description === 'string'
              ? property.description
              : undefined,
          key,
          maximum: asNumber(property.maximum),
          minimum: asNumber(property.minimum),
          options:
            enumValues.length > 0
              ? enumValues.map((item) => ({ label: String(item), value: item }))
              : undefined,
          required: required.has(key),
          step: asNumber(property.multipleOf),
          title:
            typeof property.title === 'string' && property.title.trim()
              ? property.title
              : key,
          type,
        } satisfies SchemaField;
      })
      .slice(0, 12);
  } catch {
    return [];
  }
}

function updateModelParameter(key: string, value: unknown) {
  const next =
    value === undefined || value === null || value === ''
      ? Object.fromEntries(
          Object.entries(modelParameters.value).filter(
            ([parameterKey]) => parameterKey !== key,
          ),
        )
      : { ...modelParameters.value, [key]: value };
  modelParameters.value = next;
}

function modelParameterValue(key: string) {
  const value = modelParameters.value[key];
  return typeof value === 'number' || typeof value === 'string'
    ? value
    : undefined;
}

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `agent-image-${crypto.randomUUID()}`;
  }
  return `agent-image-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function mergeLibraryText(selection: PromptLibrarySelection) {
  form.prompt =
    selection.mode === 'replace' || !form.prompt.trim()
      ? selection.content
      : `${form.prompt.trimEnd()}\n${selection.content}`;
}

function applySuggestion(prompt: string) {
  form.prompt = prompt;
}

function selectReferenceAssets(assets: FdmCreativeApi.CreativeAsset[]) {
  const selected = new Map(
    referenceAssets.value.map((asset) => [asset.id, asset]),
  );
  for (const asset of assets) {
    if (asset.kind === 'IMAGE') selected.set(asset.id, asset);
  }
  const limit = capability.value.maxReferenceCount || 8;
  referenceAssets.value = [...selected.values()].slice(0, limit);
  if (selected.size > limit) {
    message.warning(`最多使用 ${limit} 张参考图，已保留前 ${limit} 张`);
  }
}

function removeReferenceAsset(id: number) {
  referenceAssets.value = referenceAssets.value.filter(
    (asset) => asset.id !== id,
  );
}

function modelLabel(model?: FdmAiApi.ModelOption) {
  if (!model) return modelLoadError.value || '正在加载可用模型';
  const capabilities = model.capabilities.includes('IMAGE_TO_IMAGE')
    ? '支持参考图'
    : '文生图';
  return `${model.name} · ${capabilities}`;
}

async function loadModels() {
  modelsLoading.value = true;
  modelLoadError.value = undefined;
  try {
    // Query through the Creative Agent permission boundary, then apply the same local capability
    // rule as the image-generate canvas node. Multiple references additionally require MULTI_REFERENCE.
    const rows = await getAgentImageModels();
    const referenceAssetIds = referenceAssets.value.map((asset) => asset.id);
    imageModels.value = rows.filter(
      (item) =>
        item.enabled &&
        normalizeModelIdentifier(item.id) !== undefined &&
        supportsNodeModel(item, 'image-generate', referenceAssetIds),
    );
    if (
      !imageModels.value.some(
        (item) => normalizeModelIdentifier(item.id) === selectedModelId.value,
      )
    ) {
      selectedModelId.value = normalizeModelIdentifier(
        imageModels.value[0]?.id,
      );
      modelParameters.value = {};
    }
    if (imageModels.value.length === 0) {
      const scenario =
        referenceAssetIds.length > 1
          ? '多参考图'
          : (referenceAssetIds.length > 0 ? '参考图' : '文生图');
      modelLoadError.value = `没有支持${scenario}的可用图片模型，请配置 creative.image.generate.default 路由`;
    }
  } catch (error) {
    imageModels.value = [];
    selectedModelId.value = undefined;
    const detail = error instanceof Error ? error.message.trim() : '';
    modelLoadError.value = detail
      ? `图片模型目录加载失败：${detail}`
      : '图片模型目录加载失败，请检查创作 Agent 查询权限和模型路由配置';
  } finally {
    modelsLoading.value = false;
  }
}

async function loadTasks() {
  if (!selectedProjectId.value) {
    tasks.value = [];
    taskTotal.value = 0;
    return;
  }
  taskLoading.value = true;
  try {
    const page = await getAgentImageTaskPage({
      pageNo: 1,
      pageSize: 24,
      projectId: selectedProjectId.value,
    });
    tasks.value = page.list;
    taskTotal.value = page.total;
  } finally {
    taskLoading.value = false;
  }
}

function upsertTask(next: FdmCreativeApi.AgentImageTask) {
  const index = tasks.value.findIndex((task) => task.id === next.id);
  if (index === -1) {
    tasks.value.unshift(next);
    taskTotal.value += 1;
  } else {
    tasks.value.splice(index, 1, next);
  }
}

async function submit() {
  if (!selectedProjectId.value) {
    message.warning('请先选择一个可运行的工作台项目');
    return;
  }
  if (!canRunCurrentProject.value) {
    message.warning('当前项目没有运行权限，请切换到可运行项目');
    return;
  }
  if (!capability.value.enabled) {
    message.warning('创作 Agent 图片功能尚未启用');
    return;
  }
  if (!form.prompt.trim()) {
    message.warning('请输入图片创作需求');
    return;
  }
  if (promptBytes.value > capability.value.maxPromptBytes) {
    message.warning(`提示词不能超过 ${capability.value.maxPromptBytes} 字节`);
    return;
  }
  submitting.value = true;
  const idempotencyKey = activeIdempotencyKey.value || createIdempotencyKey();
  activeIdempotencyKey.value = idempotencyKey;
  try {
    const task = await generateAgentImage({
      aspectRatio: form.aspectRatio || undefined,
      idempotencyKey,
      logicalModelId: selectedModelId.value,
      modelParameters:
        Object.keys(modelParameters.value).length > 0
          ? modelParameters.value
          : undefined,
      negativePrompt: form.negativePrompt.trim() || undefined,
      outputCount: form.outputCount,
      projectId: selectedProjectId.value,
      prompt: form.prompt.trim(),
      referenceAssetIds: referenceAssets.value.map((asset) => asset.id),
    });
    upsertTask(task);
    activeIdempotencyKey.value = undefined;
    message.success('图片任务已提交，生成结果会自动归档到当前项目素材库');
  } finally {
    submitting.value = false;
  }
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) =>
    window.setTimeout(resolve, milliseconds),
  );
}

async function optimizePrompt() {
  if (!selectedProjectId.value || !form.prompt.trim()) {
    message.warning('先输入一段需要优化的提示词');
    return;
  }
  optimizing.value = true;
  try {
    let result = await refineCreativePrompt({
      projectId: selectedProjectId.value,
      prompt: form.prompt.trim(),
    });
    for (
      let attempt = 0;
      result.status === 'GENERATING' && attempt < 12;
      attempt += 1
    ) {
      await delay(700);
      result = await syncCreativePrompt(result.refinementId);
    }
    if (result.status === 'SUCCEEDED' && result.refinedPrompt?.trim()) {
      form.prompt = result.refinedPrompt.trim();
      message.success('提示词已优化，可继续微调后生成');
    } else {
      message.warning(
        result.errorMessage || '提示词优化仍在处理中，请稍后再试',
      );
    }
  } finally {
    optimizing.value = false;
  }
}

async function cancelTask(task: FdmCreativeApi.AgentImageTask) {
  if (!selectedProjectId.value) return;
  const next = await cancelAgentImageTask({
    projectId: selectedProjectId.value,
    taskId: task.id,
  });
  upsertTask(next);
}

async function retryTask(task: FdmCreativeApi.AgentImageTask) {
  if (!selectedProjectId.value) return;
  const next = await retryAgentImageTask({
    projectId: selectedProjectId.value,
    taskId: task.id,
  });
  upsertTask(next);
  message.success('已创建新的重试任务');
}

function taskStatus(task: FdmCreativeApi.AgentImageTask) {
  const labels: Record<FdmCreativeApi.AgentImageTaskStatus, string> = {
    CANCELED: '已取消',
    CANCEL_REQUESTED: '取消中',
    CREATED: '等待启动',
    FAILED: '生成失败',
    LAUNCHING: '正在提交',
    RUNNING: '生成中',
    SUCCEEDED: '已完成',
  };
  return labels[task.status];
}

function taskStatusColor(status: FdmCreativeApi.AgentImageTaskStatus) {
  return {
    CANCELED: 'default',
    CANCEL_REQUESTED: 'orange',
    CREATED: 'blue',
    FAILED: 'red',
    LAUNCHING: 'processing',
    RUNNING: 'processing',
    SUCCEEDED: 'green',
  }[status];
}

function taskTime(task: FdmCreativeApi.AgentImageTask) {
  return (
    formatDateTime(task.completedTime || task.startedTime || task.createTime) ||
    '刚刚'
  );
}

function openExecution(task: FdmCreativeApi.AgentImageTask) {
  if (!task.executionId) return;
  void router.push({
    path: '/fdmcreative/executions',
    query: { executionId: String(task.executionId) },
  });
}

function openWorkbench() {
  if (selectedProjectId.value) {
    void router.push(`/fdmcreative/workbench/${selectedProjectId.value}`);
  }
}

function showPreview(asset: FdmCreativeApi.CreativeAsset) {
  previewAsset.value = asset;
  previewOpen.value = true;
}

function changeModel(value: unknown) {
  const next = normalizeModelIdentifier(value);
  if (next !== selectedModelId.value) {
    selectedModelId.value = next;
    modelParameters.value = {};
  }
}

async function initialize() {
  loading.value = true;
  try {
    const [projectPage, agentCapability] = await Promise.all([
      getCreativeProjectPage({
        pageNo: 1,
        pageSize: 100,
        status: 'ACTIVE',
      }),
      getAgentImageCapability(),
    ]);
    projects.value = projectPage.list;
    capability.value = agentCapability;
    const runnable = projects.value.find((project) =>
      ['EDITOR', 'OWNER', 'RUNNER'].includes(project.currentUserRole),
    );
    selectedProjectId.value = runnable?.id || projects.value[0]?.id;
    await Promise.all([loadModels(), loadTasks()]);
  } finally {
    loading.value = false;
  }
}

watch(selectedProjectId, (next, previous) => {
  if (!next || next === previous) return;
  referenceAssets.value = [];
  modelParameters.value = {};
  void Promise.all([loadTasks(), loadModels()]);
});

watch(
  () => referenceAssets.value.length,
  () => {
    void loadModels();
  },
);

onMounted(() => {
  void initialize();
  pollTimer = window.setInterval(() => {
    if (selectedProjectId.value && hasRunningTask.value) {
      void loadTasks();
    }
  }, 3000);
});

onBeforeUnmount(() => {
  if (pollTimer !== undefined) window.clearInterval(pollTimer);
});
</script>

<template>
  <CreativeShell
    description="直接描述你的想法，Agent 会通过受控模型路由生成图片并自动保存到项目素材库。"
    title="创作 Agent"
  >
    <template #actions>
      <Button :disabled="!selectedProjectId" @click="openWorkbench">
        <IconifyIcon icon="lucide:workflow" />
        打开画布
      </Button>
    </template>

    <Spin :spinning="loading">
      <Alert
        v-if="!capability.enabled"
        class="agent-release-alert"
        message="创作 Agent 图片功能尚未启用"
        show-icon
        type="warning"
      >
        <template #description>
          管理员需要先执行本次 SQL 补丁，并配置
          <code>FDM_CREATIVE_DIRECT_IMAGE_AGENT_ENABLED=true</code>。在启用前，页面不会提交任何模型调用。
        </template>
      </Alert>

      <section class="agent-studio" aria-label="创作 Agent 图片生成器">
        <div class="agent-studio__intro">
          <span class="eyebrow">CREATIVE IMAGE AGENT</span>
          <h2>从一个想法开始，直接生成图片</h2>
          <p>
            不需要先搭建节点。选择保存项目、写下画面要求，必要时附上项目素材库的参考图。
          </p>
        </div>

        <div class="project-context">
          <div class="project-context__label">
            <IconifyIcon icon="lucide:folder-kanban" />
            <span>保存到项目</span>
          </div>
          <Select
            v-model:value="selectedProjectId"
            class="project-context__select"
            :options="
              projects.map((project) => ({
                label: `${project.name} · ${project.currentUserRole}`,
                value: project.id,
              }))
            "
            placeholder="选择一个工作台项目"
            show-search
          />
          <Tag
            v-if="currentProject"
            :color="canRunCurrentProject ? 'blue' : 'default'"
          >
            {{ canRunCurrentProject ? '可生成' : '只读' }}
          </Tag>
        </div>

        <div v-if="!projects.length" class="no-project-context">
          <IconifyIcon icon="lucide:folder-plus" />
          <span>还没有可访问的工作台项目。请先在“图像视频工作台”中新建项目，再回来直接生成。</span>
          <Button type="link" @click="router.push('/fdmcreative/workbench')">
前往工作台
</Button>
        </div>

        <section
          class="composer"
          :class="{ 'is-disabled': !selectedProjectId }"
        >
          <div v-if="referenceAssets.length" class="reference-strip">
            <div
              v-for="asset in referenceAssets"
              :key="asset.id"
              class="reference-chip"
            >
              <img v-if="asset.url" :alt="asset.name" :src="asset.url" />
              <span v-else class="reference-chip__fallback">
                <IconifyIcon icon="lucide:image" />
              </span>
              <span :title="asset.name">{{ asset.name }}</span>
              <button
                aria-label="移除参考图"
                type="button"
                @click="removeReferenceAsset(asset.id)"
              >
                <IconifyIcon icon="lucide:x" />
              </button>
            </div>
          </div>

          <Textarea
            v-model:value="form.prompt"
            :auto-size="{ minRows: 5, maxRows: 10 }"
            :disabled="!selectedProjectId"
            :maxlength="Math.min(capability.maxPromptBytes, 20_000)"
            placeholder="输入你的创作想法、脚本片段或画面要求。比如：为夏日咖啡新品设计一张清新、有呼吸感的电商海报……"
            @keydown.ctrl.enter.prevent="submit"
          />

          <div class="composer__footer">
            <div class="composer-tools">
              <AssetLibraryPicker
                v-if="selectedProjectId"
                :disabled="!canRunCurrentProject"
                :kinds="['IMAGE']"
                :multiple="true"
                :project-id="selectedProjectId"
                button-text="引用素材"
                @select="selectReferenceAssets"
              />
              <PromptLibraryPicker
                :current-text="form.prompt"
                :disabled="!selectedProjectId"
                button-text="提示词库"
                target-type="IMAGE"
                @select="mergeLibraryText"
              />
              <Tooltip :title="modelLabel(selectedModel)">
                <Select
                  class="model-select"
                  :disabled="!selectedProjectId"
                  :loading="modelsLoading"
                  :not-found-content="modelLoadError || '当前没有可用图片模型'"
                  :options="modelOptions"
                  placeholder="自动选择默认模型"
                  show-search
                  :status="modelLoadError ? 'error' : undefined"
                  :value="selectedModelId"
                  @change="changeModel"
                />
              </Tooltip>
              <Popover placement="topLeft" trigger="click">
                <template #content>
                  <div class="parameter-panel">
                    <label>
                      <span>画面比例</span>
                      <Select
                        v-model:value="form.aspectRatio"
                        :options="[
                          { label: '1:1 方形', value: '1:1' },
                          { label: '3:4 竖图', value: '3:4' },
                          { label: '4:3 横图', value: '4:3' },
                          { label: '9:16 竖屏', value: '9:16' },
                          { label: '16:9 横屏', value: '16:9' },
                        ]"
                      />
                    </label>
                    <label>
                      <span>生成数量</span>
                      <InputNumber
                        v-model:value="form.outputCount"
                        :max="capability.maxOutputCount"
                        :min="1"
                      />
                    </label>
                    <label class="parameter-panel__wide">
                      <span>负向提示词 <small>可选</small></span>
                      <Textarea
                        v-model:value="form.negativePrompt"
                        :maxlength="2000"
                        :rows="3"
                        placeholder="例如：低清晰度、文字水印、畸形手部……"
                      />
                    </label>
                    <template v-if="schemaFields.length">
                      <div class="parameter-panel__caption">模型专属参数</div>
                      <label
                        v-for="field in schemaFields"
                        :key="field.key"
                        class="parameter-panel__field"
                        :class="{
                          'parameter-panel__wide':
                            field.type === 'string' && !field.options,
                        }"
                        :title="field.description"
                      >
                        <span>{{ field.title }}
                          <small v-if="field.required">必填</small></span>
                        <Select
                          v-if="field.options"
                          :options="field.options"
                          :value="modelParameterValue(field.key)"
                          @change="updateModelParameter(field.key, $event)"
                        />
                        <Switch
                          v-else-if="field.type === 'boolean'"
                          :checked="Boolean(modelParameters[field.key])"
                          @change="updateModelParameter(field.key, $event)"
                        />
                        <InputNumber
                          v-else-if="
                            field.type === 'integer' || field.type === 'number'
                          "
                          :max="field.maximum"
                          :min="field.minimum"
                          :precision="field.type === 'integer' ? 0 : undefined"
                          :step="field.step"
                          :value="asNumber(modelParameters[field.key])"
                          @change="updateModelParameter(field.key, $event)"
                        />
                        <Input
                          v-else
                          :value="String(modelParameters[field.key] ?? '')"
                          @change="
                            updateModelParameter(field.key, $event.target.value)
                          "
                        />
                      </label>
                    </template>
                    <p v-else class="parameter-panel__empty">
                      当前模型没有可编辑的专属参数；系统将使用受控路由默认值。
                    </p>
                  </div>
                </template>
                <Button :disabled="!selectedProjectId" size="small">
                  <IconifyIcon icon="lucide:sliders-horizontal" />
                  生成参数
                </Button>
              </Popover>
              <Button
                v-access:code="['fdmcreative:plan:generate']"
                :disabled="!selectedProjectId || !form.prompt.trim()"
                :loading="optimizing"
                size="small"
                @click="optimizePrompt"
              >
                <IconifyIcon icon="lucide:wand-sparkles" />
                优化
              </Button>
            </div>
            <div class="composer-actions">
              <span v-if="modelLoadError" class="model-load-error">{{
                modelLoadError
              }}</span>
              <span class="byte-count">{{ promptBytes }} / {{ capability.maxPromptBytes }} B</span>
              <Button
                v-access:code="['fdmcreative:agent-image:generate']"
                :disabled="!canSubmit"
                :loading="submitting"
                shape="round"
                type="primary"
                @click="submit"
              >
                <IconifyIcon icon="lucide:sparkles" />
                生成图片
              </Button>
            </div>
          </div>
        </section>

        <div class="suggestions" aria-label="快捷创作模板">
          <button
            v-for="item in suggestions"
            :key="item.label"
            type="button"
            @click="applySuggestion(item.prompt)"
          >
            <IconifyIcon :icon="item.icon" />
            {{ item.label }}
          </button>
        </div>
      </section>

      <section class="recent-section" aria-label="最近生成">
        <header class="section-header">
          <div>
            <span class="eyebrow">RECENT GENERATIONS</span>
            <h2>最近生成</h2>
            <p>
              结果自动进入所选项目的素材库；失败任务可查看执行详情或创建一次干净重试。
            </p>
          </div>
          <div class="section-header__actions">
            <span v-if="taskTotal" class="task-count">{{ taskTotal }} 条任务</span>
            <Button :loading="taskLoading" size="small" @click="loadTasks">
              <IconifyIcon icon="lucide:refresh-cw" />
              刷新
            </Button>
          </div>
        </header>

        <Spin :spinning="taskLoading">
          <div v-if="tasks.length" class="task-grid">
            <article v-for="task in tasks" :key="task.id" class="task-card">
              <header class="task-card__header">
                <Tag :color="taskStatusColor(task.status)">
{{
                  taskStatus(task)
                }}
</Tag>
                <time>{{ taskTime(task) }}</time>
              </header>
              <p class="task-card__prompt" :title="task.prompt">
                {{ task.prompt }}
              </p>
              <p
                v-if="task.negativePrompt"
                class="task-card__negative"
                :title="task.negativePrompt"
              >
                负向：{{ task.negativePrompt }}
              </p>
              <div v-if="task.outputAssets.length" class="task-card__assets">
                <button
                  v-for="asset in task.outputAssets"
                  :key="asset.id"
                  class="task-card__asset"
                  type="button"
                  @click="showPreview(asset)"
                >
                  <img
                    v-if="asset.url"
                    :alt="asset.name"
                    loading="lazy"
                    :src="asset.url"
                  />
                  <span v-else><IconifyIcon icon="lucide:image" /></span>
                </button>
              </div>
              <div v-else class="task-card__pending">
                <IconifyIcon
                  :icon="
                    ['RUNNING', 'LAUNCHING', 'CREATED'].includes(task.status)
                      ? 'lucide:loader-circle'
                      : task.status === 'FAILED'
                        ? 'lucide:circle-alert'
                        : 'lucide:image'
                  "
                />
                <span>{{
                  task.status === 'FAILED'
                    ? task.errorMessage || '模型未返回可归档图片'
                    : task.status === 'CANCELED'
                      ? '本次任务已取消'
                      : '正在通过受控模型路由生成…'
                }}</span>
              </div>
              <footer class="task-card__footer">
                <span>#{{ task.id
                  }}<template v-if="task.attemptNo > 1">
                    · 重试 {{ task.attemptNo }}</template></span>
                <div>
                  <Button
                    v-if="task.executionId"
                    size="small"
                    type="link"
                    @click="openExecution(task)"
                  >
                    执行详情
                  </Button>
                  <Button
                    v-access:code="['fdmcreative:agent-image:cancel']"
                    v-if="
                      ['CREATED', 'LAUNCHING', 'RUNNING'].includes(task.status)
                    "
                    danger
                    size="small"
                    type="link"
                    @click="cancelTask(task)"
                  >
                    取消
                  </Button>
                  <Button
                    v-access:code="['fdmcreative:agent-image:retry']"
                    v-if="['FAILED', 'CANCELED'].includes(task.status)"
                    size="small"
                    type="link"
                    @click="retryTask(task)"
                  >
                    重试
                  </Button>
                </div>
              </footer>
            </article>
          </div>
          <Empty v-else class="task-empty" description="还没有直接生成的图片">
            <span>完成首次生成后，图片结果、状态和失败恢复入口会显示在这里。</span>
          </Empty>
        </Spin>
      </section>
    </Spin>

    <Modal
      v-model:open="previewOpen"
      :footer="null"
      :title="previewAsset?.name || '生成图片预览'"
      :width="880"
    >
      <img
        v-if="previewAsset?.url"
        class="asset-preview"
        :alt="previewAsset.name"
        :src="previewAsset.url"
      />
    </Modal>
  </CreativeShell>
</template>

<style scoped>
:deep(.creative-shell__header) {
  background:
    radial-gradient(
      circle at 78% 12%,
      hsl(var(--primary) / 11%),
      transparent 28%
    ),
    linear-gradient(135deg, hsl(var(--card)) 0%, hsl(var(--muted) / 52%) 100%);
  border-color: hsl(var(--border));
}

:deep(.creative-shell__header h1) {
  color: hsl(var(--foreground));
}

:deep(.creative-shell__header p) {
  color: hsl(var(--muted-foreground));
}

.agent-release-alert {
  margin-bottom: 14px;
}

.agent-studio {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: center;
  padding: clamp(8px, 2vw, 28px) 0 clamp(20px, 3vw, 42px);
}

.agent-studio__intro {
  max-width: 720px;
  text-align: center;
}

.eyebrow {
  display: inline-block;
  font-size: 10px;
  font-weight: 750;
  color: hsl(var(--primary));
  letter-spacing: 0.16em;
}

.agent-studio__intro h2,
.section-header h2 {
  margin: 7px 0 0;
  font-size: clamp(20px, 2vw, 27px);
  font-weight: 700;
  color: hsl(var(--foreground));
  letter-spacing: -0.03em;
}

.agent-studio__intro p,
.section-header p {
  margin: 7px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: hsl(var(--muted-foreground));
}

.project-context {
  display: flex;
  gap: 9px;
  align-items: center;
  width: min(100%, 890px);
  padding: 8px 10px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.project-context__label {
  display: inline-flex;
  flex: none;
  gap: 6px;
  align-items: center;
  padding: 0 4px;
  font-size: 12px;
}

.project-context__label :deep(svg) {
  color: hsl(var(--primary));
}

.project-context__select {
  flex: 1;
  min-width: 260px;
}

.project-context :deep(.ant-tag) {
  margin-inline-end: 0;
}

.no-project-context {
  display: flex;
  gap: 8px;
  align-items: center;
  width: min(100%, 890px);
  padding: 12px 14px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted) / 45%);
  border: 1px dashed hsl(var(--border));
  border-radius: 10px;
}

.no-project-context :deep(.ant-btn-link) {
  margin-left: auto;
}

.composer {
  width: min(100%, 890px);
  overflow: hidden;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 18px;
  box-shadow: 0 18px 44px hsl(var(--foreground) / 7%);
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}

.composer:focus-within {
  border-color: hsl(var(--primary) / 62%);
  box-shadow: 0 18px 44px hsl(var(--primary) / 12%);
}

.composer.is-disabled {
  opacity: 0.72;
}

.composer :deep(.ant-input) {
  padding: 18px 20px 10px;
  font-size: 15px;
  line-height: 1.75;
  color: hsl(var(--foreground));
  resize: none;
  background: transparent;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.composer :deep(.ant-input):focus {
  box-shadow: none;
}

.reference-strip {
  display: flex;
  gap: 8px;
  padding: 12px 14px 0;
  overflow-x: auto;
}

.reference-chip {
  display: flex;
  flex: none;
  gap: 6px;
  align-items: center;
  max-width: 220px;
  padding: 4px 6px 4px 4px;
  font-size: 11px;
  color: hsl(var(--foreground));
  background: hsl(var(--primary) / 6%);
  border: 1px solid hsl(var(--primary) / 20%);
  border-radius: 8px;
}

.reference-chip img,
.reference-chip__fallback {
  display: grid;
  flex: none;
  place-items: center;
  width: 26px;
  height: 26px;
  color: hsl(var(--primary));
  object-fit: cover;
  background: hsl(var(--primary) / 10%);
  border-radius: 5px;
}

.reference-chip > span:not(.reference-chip__fallback) {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reference-chip button {
  display: grid;
  flex: none;
  place-items: center;
  padding: 2px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 4px;
}

.reference-chip button:hover {
  color: hsl(var(--destructive));
  background: hsl(var(--destructive) / 9%);
}

.composer__footer {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-top: 1px solid hsl(var(--border) / 80%);
}

.composer-tools,
.composer-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
}

.model-select {
  width: 205px;
}

.model-load-error {
  max-width: 360px;
  font-size: 11px;
  line-height: 1.35;
  color: hsl(var(--destructive));
}

.byte-count {
  font-size: 11px;
  color: hsl(var(--muted-foreground));
}

.suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.suggestions button {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  padding: 7px 11px;
  font-size: 12px;
  color: hsl(var(--foreground));
  cursor: pointer;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 999px;
  transition: all 140ms ease;
}

.suggestions button :deep(svg) {
  color: hsl(var(--primary));
}

.suggestions button:hover {
  border-color: hsl(var(--primary) / 45%);
  box-shadow: 0 3px 10px hsl(var(--primary) / 12%);
  transform: translateY(-1px);
}

.parameter-panel {
  display: grid;
  grid-template-columns: repeat(2, minmax(150px, 1fr));
  gap: 11px;
  width: min(510px, calc(100vw - 48px));
}

.parameter-panel label {
  display: grid;
  gap: 5px;
  min-width: 0;
  font-size: 12px;
  color: hsl(var(--foreground));
}

.parameter-panel label > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.parameter-panel small {
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.parameter-panel__wide,
.parameter-panel__caption,
.parameter-panel__empty {
  grid-column: 1 / -1;
}

.parameter-panel__caption {
  padding-top: 2px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  border-top: 1px solid hsl(var(--border));
}

.parameter-panel__empty {
  margin: 0;
  font-size: 11px;
  line-height: 1.55;
  color: hsl(var(--muted-foreground));
}

.recent-section {
  padding-top: 2px;
}

.section-header {
  display: flex;
  gap: 16px;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-header h2 {
  font-size: 18px;
  letter-spacing: -0.015em;
}

.section-header p {
  max-width: 720px;
  font-size: 12px;
}

.section-header__actions {
  display: flex;
  flex: none;
  gap: 8px;
  align-items: center;
}

.task-count {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.task-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 12px;
}

.task-card {
  display: flex;
  flex-direction: column;
  min-height: 242px;
  overflow: hidden;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
}

.task-card__header,
.task-card__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
}

.task-card__header {
  border-bottom: 1px solid hsl(var(--border) / 70%);
}

.task-card__header :deep(.ant-tag) {
  margin: 0;
}

.task-card__header time,
.task-card__footer > span {
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.task-card__prompt {
  display: -webkit-box;
  min-height: 40px;
  margin: 11px 12px 0;
  overflow: hidden;
  -webkit-line-clamp: 2;
  font-size: 12px;
  line-height: 1.6;
  color: hsl(var(--foreground));
  -webkit-box-orient: vertical;
}

.task-card__negative {
  margin: 4px 12px 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.task-card__assets {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
  gap: 6px;
  padding: 12px;
}

.task-card__asset {
  min-height: 110px;
  padding: 0;
  overflow: hidden;
  cursor: zoom-in;
  background: hsl(var(--muted) / 50%);
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.task-card__asset img {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 110px;
  object-fit: cover;
  transition: transform 180ms ease;
}

.task-card__asset:hover img {
  transform: scale(1.035);
}

.task-card__pending {
  display: flex;
  flex: 1;
  gap: 8px;
  align-items: center;
  justify-content: center;
  min-height: 106px;
  padding: 14px;
  font-size: 11px;
  line-height: 1.6;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.task-card__pending :deep(svg) {
  flex: none;
  color: hsl(var(--primary));
}

.task-card__footer {
  margin-top: auto;
  border-top: 1px solid hsl(var(--border) / 70%);
}

.task-card__footer > div {
  display: flex;
  align-items: center;
}

.task-empty {
  padding: 46px 0;
  background: hsl(var(--card));
  border: 1px dashed hsl(var(--border));
  border-radius: 12px;
}

.task-empty :deep(.ant-empty-description) {
  color: hsl(var(--foreground));
}

.task-empty span {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.asset-preview {
  display: block;
  width: 100%;
  max-height: 72vh;
  object-fit: contain;
}

@media (max-width: 720px) {
  .project-context,
  .composer__footer,
  .section-header {
    flex-direction: column;
    align-items: stretch;
  }

  .project-context__select,
  .model-select {
    width: 100%;
  }

  .composer-actions {
    justify-content: space-between;
  }

  .no-project-context {
    flex-wrap: wrap;
    align-items: flex-start;
  }

  .no-project-context :deep(.ant-btn-link) {
    width: 100%;
    padding-left: 0;
    margin-left: 0;
    text-align: left;
  }

  .section-header__actions {
    justify-content: space-between;
  }
}
</style>
