<script lang="ts" setup>
import type { FdmCreativeApi } from '#/api/fdmcreative';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';
import { formatDateTime } from '@vben/utils';

import {
  Button,
  Divider,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Spin,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  archiveDramaProject,
  confirmDramaScript,
  generateDramaEntityReference,
  generateDramaScript,
  getCreativeAssetPage,
  getDramaEntityPage,
  getDramaProject,
  getDramaScript,
  getDramaScriptPage,
  lockDramaEntity,
  previewDramaScript,
  syncDramaScript,
  updateDramaEntity,
  updateDramaProject,
} from '#/api/fdmcreative';

import AssetLibraryPicker from '../shared/AssetLibraryPicker.vue';
import CreativeShell from '../shared/CreativeShell.vue';
import PromptLibraryPicker from '../shared/PromptLibraryPicker.vue';
import {
  createEmptyDramaScript,
  mergePromptText,
  selectPromptReference,
} from './drama-script-utils';
import DramaShotBoard from './DramaShotBoard.vue';
import DramaTimelineBoard from './DramaTimelineBoard.vue';
import { useDramaScriptEventStream } from './use-drama-script-event-stream';

defineOptions({ name: 'FdmCreativeDramaDetail' });

type DramaStage =
  | 'assets'
  | 'compose'
  | 'production'
  | 'script'
  | 'settings'
  | 'storyboard';

const route = useRoute();
const router = useRouter();
const projectId = computed(() => Number(route.params.projectId));
const loading = ref(false);
const saving = ref(false);
const project = ref<FdmCreativeApi.DramaProject>();
const scriptRevisions = ref<FdmCreativeApi.DramaScriptRevision[]>([]);
const currentScript = ref<FdmCreativeApi.DramaScriptRevision>();
const scriptDraft = ref<FdmCreativeApi.DramaScript>();
const entities = ref<FdmCreativeApi.DramaEntity[]>([]);
const assets = ref<FdmCreativeApi.CreativeAsset[]>([]);
const activeStage = ref<DramaStage>('settings');
const generateOpen = ref(false);
const entityOpen = ref(false);
const selectedEntity = ref<FdmCreativeApi.DramaEntity>();
const generation = reactive({
  prompt: '',
  promptIds: [] as number[],
  referenceAssetIds: [] as number[],
});
const settings = reactive({
  aspectRatio: '9:16',
  description: '',
  dramaType: 'SERIES',
  language: 'zh-CN',
  name: '',
  targetDurationSeconds: 300,
  visualStyle: '',
  version: 1,
});
const entityForm = reactive({
  adoptedAssetId: undefined as number | undefined,
  description: '',
  expectedVersion: 1,
  name: '',
  prompt: '',
});
const activeScriptRevisionId = computed(() => currentScript.value?.id);
let scriptEventRefreshPending = false;
const scriptEventStream = useDramaScriptEventStream({
  projectId,
  scriptRevisionId: activeScriptRevisionId,
  onEvent(event) {
    if (
      event.eventType === 'SCRIPT_FAILED' ||
      event.eventType === 'SCRIPT_PREVIEW_READY' ||
      event.eventType === 'SCRIPT_CONFIRMED'
    ) {
      void refreshFromScriptEvent(event.eventType === 'SCRIPT_CONFIRMED');
    }
  },
});
const scriptEventStreamState = scriptEventStream.state;
const scriptEventStreamError = scriptEventStream.error;

const stages: Array<{
  icon: string;
  key: DramaStage;
  label: string;
  phase: string;
}> = [
  {
    icon: 'lucide:settings-2',
    key: 'settings',
    label: '项目设定',
    phase: 'P5A',
  },
  { icon: 'lucide:book-open-text', key: 'script', label: '剧本', phase: 'P5A' },
  {
    icon: 'lucide:library-big',
    key: 'assets',
    label: '项目资产',
    phase: 'P5A',
  },
  {
    icon: 'lucide:panels-top-left',
    key: 'storyboard',
    label: '分镜',
    phase: 'P5B',
  },
  { icon: 'lucide:film', key: 'production', label: '制作', phase: 'P5B' },
  { icon: 'lucide:rows-3', key: 'compose', label: '合成', phase: 'P5C' },
];

const canEdit = computed(() => {
  const role = project.value?.currentUserRole;
  return role === 'EDITOR' || role === 'OWNER';
});

const assetOptions = computed(() =>
  assets.value
    .filter((asset) => asset.kind === 'IMAGE')
    .map((asset) => ({
      label: `${asset.name} (#${asset.id})`,
      value: asset.id,
    })),
);

function emptyScript(): FdmCreativeApi.DramaScript {
  return createEmptyDramaScript(project.value?.name);
}

function cloneScript(
  script?: FdmCreativeApi.DramaScript,
): FdmCreativeApi.DramaScript {
  if (!script) return emptyScript();
  return JSON.parse(JSON.stringify(script)) as FdmCreativeApi.DramaScript;
}

function applyProjectSettings(value: FdmCreativeApi.DramaProject) {
  Object.assign(settings, {
    aspectRatio: value.aspectRatio,
    description: value.description || '',
    dramaType: value.dramaType,
    language: value.language,
    name: value.name,
    targetDurationSeconds: value.targetDurationSeconds,
    version: value.version,
    visualStyle: value.visualStyle || '',
  });
}

async function loadAuxiliaryData() {
  const assetPage = await getCreativeAssetPage({
    pageNo: 1,
    pageSize: 100,
    projectId: projectId.value,
  });
  assets.value = assetPage.list;
}

async function loadScripts() {
  const page = await getDramaScriptPage({
    pageNo: 1,
    pageSize: 50,
    projectId: projectId.value,
  });
  scriptRevisions.value = page.list;
  const target = project.value?.currentScriptRevisionId || page.list[0]?.id;
  currentScript.value = target
    ? await getDramaScript(projectId.value, target)
    : undefined;
  scriptDraft.value = cloneScript(currentScript.value?.script);
}

async function loadEntities() {
  const page = await getDramaEntityPage({
    pageNo: 1,
    pageSize: 100,
    projectId: projectId.value,
  });
  entities.value = page.list;
}

async function refreshFromScriptEvent(refreshEntities: boolean) {
  if (scriptEventRefreshPending) return;
  scriptEventRefreshPending = true;
  try {
    await loadScripts();
    if (refreshEntities) {
      await Promise.all([loadEntities(), loadAuxiliaryData()]);
    }
  } finally {
    scriptEventRefreshPending = false;
  }
}

async function load() {
  if (!Number.isFinite(projectId.value) || projectId.value <= 0) {
    message.error('短剧项目编号无效');
    await router.replace('/fdmcreative/drama');
    return;
  }
  loading.value = true;
  try {
    project.value = await getDramaProject(projectId.value);
    applyProjectSettings(project.value);
    await Promise.all([loadScripts(), loadEntities(), loadAuxiliaryData()]);
  } finally {
    loading.value = false;
  }
}

async function saveSettings() {
  if (!project.value || !settings.name.trim()) {
    message.warning('项目名称不能为空');
    return;
  }
  saving.value = true;
  try {
    await updateDramaProject({
      ...settings,
      description: settings.description.trim() || undefined,
      expectedVersion: settings.version,
      name: settings.name.trim(),
      projectId: project.value.projectId,
      visualStyle: settings.visualStyle.trim() || undefined,
    });
    message.success('项目设定已保存');
    await load();
  } finally {
    saving.value = false;
  }
}

async function archiveProject() {
  if (!project.value) return;
  await archiveDramaProject({
    expectedVersion: project.value.version,
    projectId: project.value.projectId,
  });
  message.success('项目已归档');
  await load();
}

function openGenerator() {
  generation.prompt = '';
  generation.promptIds = [];
  generation.referenceAssetIds = [];
  generateOpen.value = true;
}

function mergeProjectAssets(selected: FdmCreativeApi.CreativeAsset[]) {
  const byId = new Map(assets.value.map((asset) => [asset.id, asset]));
  selected.forEach((asset) => byId.set(asset.id, asset));
  assets.value = [...byId.values()];
}

function selectScriptPrompt(selection: {
  content: string;
  mode: 'append' | 'replace';
  prompt: FdmCreativeApi.CreativePrompt;
}) {
  generation.promptIds = selectPromptReference(
    generation.promptIds,
    selection.prompt.id,
    selection.mode,
  );
}

function selectScriptReferenceAssets(selected: FdmCreativeApi.CreativeAsset[]) {
  generation.referenceAssetIds = selected.map((asset) => asset.id);
  mergeProjectAssets(selected);
}

function selectEntityPrompt(selection: {
  content: string;
  mode: 'append' | 'replace';
  prompt: FdmCreativeApi.CreativePrompt;
}) {
  entityForm.prompt = mergePromptText(
    entityForm.prompt,
    selection.content,
    selection.mode,
  );
}

function selectEntityReferenceAsset(selected: FdmCreativeApi.CreativeAsset[]) {
  const asset = selected[0];
  if (!asset) return;
  entityForm.adoptedAssetId = asset.id;
  mergeProjectAssets(selected);
}

async function generateScript() {
  if (!generation.prompt.trim()) {
    message.warning('请描述你想创作的短剧');
    return;
  }
  saving.value = true;
  try {
    currentScript.value = await generateDramaScript({
      projectId: projectId.value,
      prompt: generation.prompt.trim(),
      promptIds: generation.promptIds,
      referenceAssetIds: generation.referenceAssetIds,
    });
    scriptDraft.value = cloneScript(currentScript.value.script);
    generateOpen.value = false;
    activeStage.value = 'script';
    message.success('剧本任务已提交，可使用“刷新状态”查看结构化预览');
    await loadScripts();
  } finally {
    saving.value = false;
  }
}

async function refreshScript() {
  if (!currentScript.value) return;
  saving.value = true;
  try {
    currentScript.value = await syncDramaScript(
      projectId.value,
      currentScript.value.id,
    );
    if (currentScript.value.script) {
      scriptDraft.value = cloneScript(currentScript.value.script);
    }
    await loadScripts();
  } finally {
    saving.value = false;
  }
}

async function saveScriptPreview() {
  if (!scriptDraft.value) return;
  saving.value = true;
  try {
    currentScript.value = await previewDramaScript({
      projectId: projectId.value,
      script: scriptDraft.value,
    });
    scriptDraft.value = cloneScript(currentScript.value.script);
    message.success('已创建不可变剧本预览，请确认后更新项目实体');
    await loadScripts();
  } finally {
    saving.value = false;
  }
}

async function confirmScript() {
  if (!project.value || !currentScript.value) return;
  if (currentScript.value.status !== 'PREVIEW') {
    message.warning('请先等待或保存一个状态为 PREVIEW 的剧本版本');
    return;
  }
  saving.value = true;
  try {
    currentScript.value = await confirmDramaScript({
      expectedDramaVersion: project.value.version,
      projectId: project.value.projectId,
      scriptRevisionId: currentScript.value.id,
    });
    message.success('剧本已确认，未锁定的角色、场景和道具已按稳定 key 更新');
    await load();
  } finally {
    saving.value = false;
  }
}

function selectRevision(revisionId: number) {
  void (async () => {
    currentScript.value = await getDramaScript(projectId.value, revisionId);
    scriptDraft.value = cloneScript(currentScript.value.script);
  })();
}

function addStoryScene() {
  if (!scriptDraft.value) return;
  const number = scriptDraft.value.storyScenes.length + 1;
  const sceneEntityKey =
    scriptDraft.value.scenes[0]?.entityKey || `scene-${number}`;
  if (
    !scriptDraft.value.scenes.some(
      (scene) => scene.entityKey === sceneEntityKey,
    )
  ) {
    scriptDraft.value.scenes.push({
      description: `第 ${number} 场场景`,
      entityKey: sceneEntityKey,
      name: `场景 ${number}`,
      prompt: '',
      referenceAssetIds: [],
    });
  }
  scriptDraft.value.storyScenes.push({
    action: '',
    dialogues: [],
    estimatedDurationSeconds: 15,
    narration: '',
    sceneEntityKey,
    sceneKey: `story-scene-${number}`,
    sceneNo: number,
    title: `第 ${number} 场`,
  });
}

function addDialogue(scene: FdmCreativeApi.DramaStoryScene) {
  scene.dialogues.push({
    action: '',
    characterKey: scriptDraft.value?.characters[0]?.entityKey || '',
    narration: '',
    text: '',
  });
}

function openEntity(entity: FdmCreativeApi.DramaEntity) {
  selectedEntity.value = entity;
  Object.assign(entityForm, {
    adoptedAssetId: entity.adoptedAssetId,
    description: entity.description,
    expectedVersion: entity.version,
    name: entity.name,
    prompt: entity.prompt || '',
  });
  entityOpen.value = true;
}

async function saveEntity() {
  if (!selectedEntity.value) return;
  saving.value = true;
  try {
    await updateDramaEntity({
      adoptedAssetId: entityForm.adoptedAssetId,
      description: entityForm.description,
      entityId: selectedEntity.value.id,
      expectedVersion: entityForm.expectedVersion,
      name: entityForm.name,
      projectId: projectId.value,
      prompt: entityForm.prompt,
    });
    entityOpen.value = false;
    message.success('实体已保存');
    await loadEntities();
  } finally {
    saving.value = false;
  }
}

async function toggleLock(entity: FdmCreativeApi.DramaEntity) {
  await lockDramaEntity({
    entityId: entity.id,
    expectedVersion: entity.version,
    locked: !entity.locked,
    projectId: projectId.value,
  });
  message.success(entity.locked ? '实体已解锁' : '实体已锁定');
  await loadEntities();
}

async function generateReference(entity: FdmCreativeApi.DramaEntity) {
  const executionId = await generateDramaEntityReference({
    entityId: entity.id,
    expectedEntityVersion: entity.version,
    projectId: projectId.value,
  });
  message.success(`参考图任务已进入统一生成任务：#${executionId}`);
}

function gotoWorkbenchAssets() {
  void router.push('/fdmcreative/assets');
}

onMounted(() => {
  void load();
});
</script>

<template>
  <CreativeShell
    :description="
      project?.description ||
      '通过阶段化流程推进短剧生产，不把短剧业务与底层资产、执行体系分离。'
    "
    :title="project?.name || '短剧生产'"
  >
    <template #actions>
      <Button @click="router.push('/fdmcreative/drama')">
        <IconifyIcon icon="lucide:arrow-left" />
        返回项目
      </Button>
      <Tag
        v-if="project"
        :color="project.status === 'ACTIVE' ? 'blue' : 'default'"
      >
        {{ project.status === 'ACTIVE' ? '进行中' : '已归档' }} · v{{
          project.version
        }}
      </Tag>
    </template>

    <Spin :spinning="loading">
      <div v-if="project" class="drama-detail">
        <nav class="stage-nav" aria-label="短剧生产阶段">
          <button
            v-for="stage in stages"
            :key="stage.key"
            :class="{ active: activeStage === stage.key }"
            type="button"
            @click="activeStage = stage.key"
          >
            <IconifyIcon :icon="stage.icon" />
            <span>{{ stage.label }}</span>
            <small>{{ stage.phase }}</small>
          </button>
        </nav>

        <section
          v-if="activeStage === 'settings'"
          class="stage-panel settings-panel"
        >
          <div class="stage-title">
            <div>
              <p>01 · P5A</p>
              <h2>项目设定</h2>
              <span>设定会为后续剧本、分镜和时间线提供明确的边界。</span>
            </div>
            <Button
              v-if="canEdit && project.status === 'ACTIVE'"
              v-access:code="['fdmcreative:drama:archive']"
              danger
              @click="archiveProject"
            >
              归档项目
            </Button>
          </div>
          <Form layout="vertical">
            <div class="settings-grid">
              <Form.Item label="项目名称" required>
                <Input v-model:value="settings.name" :disabled="!canEdit" />
              </Form.Item>
              <Form.Item label="目标时长（秒）">
                <InputNumber
                  v-model:value="settings.targetDurationSeconds"
                  :disabled="!canEdit"
                  :max="10800"
                  :min="1"
                  class="full-width"
                />
              </Form.Item>
              <Form.Item label="类型">
                <Input
                  v-model:value="settings.dramaType"
                  :disabled="!canEdit"
                />
              </Form.Item>
              <Form.Item label="语言">
                <Input v-model:value="settings.language" :disabled="!canEdit" />
              </Form.Item>
              <Form.Item label="画幅">
                <Select
                  v-model:value="settings.aspectRatio"
                  :disabled="!canEdit"
                  :options="[
                    { label: '竖屏 9:16', value: '9:16' },
                    { label: '横屏 16:9', value: '16:9' },
                    { label: '方形 1:1', value: '1:1' },
                  ]"
                />
              </Form.Item>
              <Form.Item label="视觉风格">
                <Input
                  v-model:value="settings.visualStyle"
                  :disabled="!canEdit"
                />
              </Form.Item>
            </div>
            <Form.Item label="故事说明">
              <Textarea
                v-model:value="settings.description"
                :disabled="!canEdit"
                :rows="4"
              />
            </Form.Item>
            <Button
              v-if="canEdit"
              v-access:code="['fdmcreative:drama:update']"
              :loading="saving"
              type="primary"
              @click="saveSettings"
            >
              保存设定
            </Button>
          </Form>
        </section>

        <section
          v-else-if="activeStage === 'script'"
          class="stage-panel script-panel"
        >
          <div class="stage-title">
            <div>
              <p>02 · P5A</p>
              <h2>剧本与结构化预览</h2>
              <span>模型生成只产生预览；确认后才用稳定 key 更新未锁定实体。</span>
            </div>
            <div class="script-actions">
              <Button
                v-if="canEdit"
                v-access:code="['fdmcreative:drama:script-generate']"
                type="primary"
                @click="openGenerator"
              >
                <IconifyIcon icon="lucide:sparkles" />
                AI 生成剧本
              </Button>
              <Button
                v-if="canEdit && currentScript"
                :loading="saving"
                @click="refreshScript"
              >
                <IconifyIcon icon="lucide:refresh-cw" />
                刷新状态
              </Button>
            </div>
          </div>

          <div
            v-if="scriptRevisions.length"
            class="revision-strip"
            aria-label="剧本版本"
          >
            <button
              v-for="revision in scriptRevisions"
              :key="revision.id"
              :class="{ selected: revision.id === currentScript?.id }"
              type="button"
              @click="selectRevision(revision.id)"
            >
              <strong>v{{ revision.revisionNo }}</strong>
              <Tag
                :color="
                  revision.status === 'CONFIRMED'
                    ? 'green'
                    : revision.status === 'PREVIEW'
                      ? 'blue'
                      : 'default'
                "
              >
                {{ revision.status }}
              </Tag>
            </button>
          </div>

          <div v-if="currentScript" class="script-status">
            <Tag
              :color="
                currentScript.status === 'FAILED'
                  ? 'error'
                  : currentScript.status === 'PREVIEW'
                    ? 'blue'
                    : 'default'
              "
            >
              {{ currentScript.status }}
            </Tag>
            <span
              v-if="
                currentScript.status === 'CREATED' ||
                currentScript.status === 'GENERATING'
              "
            >
              实时状态：{{
                scriptEventStreamState === 'open'
                  ? '已连接'
                  : scriptEventStreamState === 'reconnecting'
                    ? '正在重连'
                    : '正在连接'
              }}
            </span>
            <span v-if="currentScript.errorMessage">{{
              currentScript.errorMessage
            }}</span>
            <span v-else-if="currentScript.invocationId">FDM AI 调用：{{ currentScript.invocationId }}</span>
            <span v-if="currentScript.diff">
              变更：+{{
                currentScript.diff.addedEntityKeys.length +
                currentScript.diff.addedSceneKeys.length
              }}
              / ~{{
                currentScript.diff.changedEntityKeys.length +
                currentScript.diff.changedSceneKeys.length
              }}
              / -{{
                currentScript.diff.removedEntityKeys.length +
                currentScript.diff.removedSceneKeys.length
              }}
            </span>
            <span v-if="scriptEventStreamError" class="script-status__warning">
              实时状态暂不可用，可使用“刷新状态”恢复。
            </span>
          </div>

          <div v-if="scriptDraft" class="script-editor">
            <div class="script-overview">
              <Form layout="vertical">
                <Form.Item label="标题" required>
                  <Input
                    v-model:value="scriptDraft.title"
                    :disabled="!canEdit"
                  />
                </Form.Item>
                <Form.Item label="主题">
                  <Input
                    v-model:value="scriptDraft.theme"
                    :disabled="!canEdit"
                  />
                </Form.Item>
                <Form.Item label="梗概" required>
                  <Textarea
                    v-model:value="scriptDraft.synopsis"
                    :disabled="!canEdit"
                    :rows="4"
                  />
                </Form.Item>
              </Form>
            </div>

            <div class="script-entities">
              <div
                v-for="group in [
                  {
                    key: 'characters',
                    label: '角色',
                    values: scriptDraft.characters,
                  },
                  { key: 'scenes', label: '场景', values: scriptDraft.scenes },
                  { key: 'props', label: '道具', values: scriptDraft.props },
                ]"
                :key="group.key"
                class="entity-column"
              >
                <h3>
                  {{ group.label }} <small>{{ group.values.length }}</small>
                </h3>
                <div
                  v-for="entity in group.values"
                  :key="entity.entityKey"
                  class="script-entity-row"
                >
                  <code>{{ entity.entityKey }}</code>
                  <Input
                    v-model:value="entity.name"
                    :disabled="!canEdit"
                    placeholder="名称"
                  />
                  <Textarea
                    v-model:value="entity.description"
                    :disabled="!canEdit"
                    :rows="2"
                    placeholder="描述"
                  />
                  <Textarea
                    v-model:value="entity.prompt"
                    :disabled="!canEdit"
                    :rows="2"
                    placeholder="参考图提示词"
                  />
                </div>
              </div>
            </div>

            <Divider orientation="left">场次、动作、台词与旁白</Divider>
            <div class="story-scene-list">
              <article
                v-for="scene in scriptDraft.storyScenes"
                :key="scene.sceneKey"
                class="story-scene"
              >
                <div class="story-scene__head">
                  <code>{{ scene.sceneKey }}</code>
                  <Input v-model:value="scene.title" :disabled="!canEdit" />
                  <InputNumber
                    v-model:value="scene.estimatedDurationSeconds"
                    :disabled="!canEdit"
                    :min="1"
                    :max="300"
                  />
                </div>
                <Select
                  v-model:value="scene.sceneEntityKey"
                  :disabled="!canEdit"
                  :options="
                    scriptDraft.scenes.map((item) => ({
                      label: item.name,
                      value: item.entityKey,
                    }))
                  "
                  placeholder="选择场景实体"
                />
                <Textarea
                  v-model:value="scene.action"
                  :disabled="!canEdit"
                  :rows="2"
                  placeholder="动作与镜头事件"
                />
                <Textarea
                  v-model:value="scene.narration"
                  :disabled="!canEdit"
                  :rows="2"
                  placeholder="旁白（可选）"
                />
                <div class="dialogue-list">
                  <div
                    v-for="(dialogue, index) in scene.dialogues"
                    :key="`${scene.sceneKey}-${index}`"
                    class="dialogue-row"
                  >
                    <Select
                      v-model:value="dialogue.characterKey"
                      :disabled="!canEdit"
                      :options="
                        scriptDraft.characters.map((item) => ({
                          label: item.name,
                          value: item.entityKey,
                        }))
                      "
                      placeholder="角色"
                    />
                    <Input
                      v-model:value="dialogue.text"
                      :disabled="!canEdit"
                      placeholder="台词"
                    />
                    <Input
                      v-model:value="dialogue.action"
                      :disabled="!canEdit"
                      placeholder="动作（可选）"
                    />
                  </div>
                  <Button
                    v-if="canEdit"
                    size="small"
                    type="dashed"
                    @click="addDialogue(scene)"
                    >
添加台词
</Button>
                </div>
              </article>
              <Button v-if="canEdit" type="dashed" @click="addStoryScene">
添加场次
</Button>
            </div>

            <div v-if="canEdit" class="script-footer">
              <Button :loading="saving" @click="saveScriptPreview">
保存为预览
</Button>
              <Button
                v-access:code="['fdmcreative:drama:script-confirm']"
                :disabled="currentScript?.status !== 'PREVIEW'"
                :loading="saving"
                type="primary"
                @click="confirmScript"
              >
                确认此剧本
              </Button>
            </div>
          </div>
          <Empty
            v-else
            description="尚未生成剧本。可用 AI 生成，或直接开始编辑一个结构化预览。"
          >
            <Button v-if="canEdit" @click="scriptDraft = emptyScript()">
新建结构化剧本
</Button>
          </Empty>
        </section>

        <section v-else-if="activeStage === 'assets'" class="stage-panel">
          <div class="stage-title">
            <div>
              <p>03 · P5A</p>
              <h2>项目资产与实体</h2>
              <span>实体只保存 FDM
                assetId；选择其他项目的资产时由后端复制到当前项目。</span>
            </div>
            <Button @click="gotoWorkbenchAssets">
              打开资产库
              <IconifyIcon icon="lucide:external-link" />
            </Button>
          </div>
          <div class="entity-grid">
            <article
              v-for="entity in entities"
              :key="entity.id"
              class="entity-card"
            >
              <div class="entity-card__head">
                <Tag>{{ entity.entityType }}</Tag>
                <span>{{
                  entity.locked ? '已锁定' : `v${entity.version}`
                }}</span>
              </div>
              <h3>{{ entity.name }}</h3>
              <code>{{ entity.entityKey }}</code>
              <p>{{ entity.description }}</p>
              <small>{{
                entity.adoptedAssetId
                  ? `采用素材 #${entity.adoptedAssetId}`
                  : '尚未采用参考素材'
              }}</small>
              <div v-if="canEdit" class="entity-card__actions">
                <Button size="small" @click="openEntity(entity)">编辑</Button>
                <Button size="small" @click="toggleLock(entity)">
{{
                  entity.locked ? '解锁' : '锁定'
                }}
</Button>
                <Button
                  v-access:code="['fdmcreative:drama:entity-generate']"
                  size="small"
                  type="primary"
                  @click="generateReference(entity)"
                >
                  生成参考图
                </Button>
              </div>
            </article>
            <Empty
              v-if="entities.length === 0"
              description="确认剧本后会在这里出现角色、场景和道具。"
            />
          </div>

          <Divider orientation="left">当前项目资产</Divider>
          <div class="asset-list">
            <div v-for="asset in assets" :key="asset.id" class="asset-row">
              <Tag>{{ asset.kind }}</Tag>
              <strong>{{ asset.name }}</strong>
              <span>#{{ asset.id }}</span>
              <span>{{
                asset.createTime ? formatDateTime(asset.createTime) : '—'
              }}</span>
            </div>
            <Empty
              v-if="assets.length === 0"
              description="当前项目尚无可用资产。"
            />
          </div>
        </section>

        <section
          v-else-if="
            activeStage === 'storyboard' || activeStage === 'production'
          "
          class="stage-panel shot-production-panel"
        >
          <DramaShotBoard
            :assets="assets"
            :can-edit="canEdit"
            :current-script-revision-id="project.currentScriptRevisionId"
            :drama-version="project.version"
            :mode="activeStage"
            :project-id="project.projectId"
            :project-status="project.status"
            @updated="load"
          />
        </section>

        <section
          v-else-if="activeStage === 'compose'"
          class="stage-panel timeline-stage-panel"
        >
          <DramaTimelineBoard
            :assets="assets"
            :can-edit="canEdit"
            :project-id="project.projectId"
            :project-status="project.status"
            @updated="load"
          />
        </section>

        <section v-else class="stage-panel future-stage">
          <IconifyIcon icon="lucide:construction" />
          <h2>
            {{ stages.find((stage) => stage.key === activeStage)?.label }}
          </h2>
          <p>
            该阶段已预留在短剧导航中；P5B 将接入可恢复的分镜与镜头生产，P5C
            将接入 frame 时间线、字幕和合成。
            已确认的剧本、稳定实体、项目资产和统一执行记录会直接作为后续输入。
          </p>
        </section>
      </div>
    </Spin>

    <Modal
      v-model:open="generateOpen"
      :confirm-loading="saving"
      title="AI 生成结构化剧本"
      width="680px"
      @ok="generateScript"
    >
      <Form layout="vertical">
        <Form.Item label="创作需求" required>
          <Textarea
            v-model:value="generation.prompt"
            :maxlength="20000"
            :rows="6"
            placeholder="描述故事、角色关系、主题、受众、时长和任何不能改变的限制"
          />
        </Form.Item>
        <Form.Item label="提示词库参考">
          <div class="library-control">
            <PromptLibraryPicker
              button-text="从提示词库添加"
              target-type="GENERAL"
              @select="selectScriptPrompt"
            />
            <span v-if="generation.promptIds.length">
              已选
              {{
                generation.promptIds.length
              }}
              条，服务端会在提交前重新校验访问权限。
            </span>
            <span v-else>可选：复用已有提示词，不复制内容到短剧数据。</span>
          </div>
        </Form.Item>
        <Form.Item label="图片资产参考">
          <div class="library-control">
            <AssetLibraryPicker
              button-text="从资产库选择图片"
              :kinds="['IMAGE']"
              multiple
              :project-id="projectId"
              @select="selectScriptReferenceAssets"
            />
            <span v-if="generation.referenceAssetIds.length">
              已选
              {{
                generation.referenceAssetIds.length
              }}
              张图片；跨项目素材会先安全复制到当前项目。
            </span>
            <span v-else>可选：仅向模型传递由 FDM 私有资产生成的临时读取地址。</span>
          </div>
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      v-model:open="entityOpen"
      :confirm-loading="saving"
      title="编辑项目实体"
      width="640px"
      @ok="saveEntity"
    >
      <Form layout="vertical">
        <Form.Item label="名称">
<Input v-model:value="entityForm.name" />
</Form.Item>
        <Form.Item label="描述">
<Textarea v-model:value="entityForm.description" :rows="3" />
</Form.Item>
        <Form.Item label="参考图提示词">
<Textarea v-model:value="entityForm.prompt" :rows="4" />
</Form.Item>
        <div class="entity-library-actions">
          <PromptLibraryPicker
            button-text="从提示词库填入"
            :current-text="entityForm.prompt"
            target-type="IMAGE"
            @select="selectEntityPrompt"
          />
          <AssetLibraryPicker
            button-text="从资产库选择参考图"
            :kinds="['IMAGE']"
            :project-id="projectId"
            @select="selectEntityReferenceAsset"
          />
        </div>
        <Form.Item label="采用项目资产">
          <Select
            v-model:value="entityForm.adoptedAssetId"
            allow-clear
            :options="assetOptions"
            placeholder="已导入的当前项目图片"
          />
        </Form.Item>
      </Form>
    </Modal>
  </CreativeShell>
</template>

<style scoped>
.drama-detail {
  display: grid;
  gap: 16px;
}

.stage-nav {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  overflow: hidden;
  background: var(--ant-color-bg-container);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 12px;
}

.stage-nav button {
  display: grid;
  grid-template-rows: 1fr auto;
  grid-template-columns: auto 1fr;
  gap: 2px 7px;
  min-height: 64px;
  padding: 10px;
  color: var(--ant-color-text-secondary);
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
  border-right: 1px solid var(--ant-color-border-secondary);
}

.stage-nav button:last-child {
  border-right: 0;
}

.stage-nav button:hover,
.stage-nav button.active {
  color: var(--ant-color-primary);
  background: color-mix(in srgb, var(--ant-color-primary) 8%, transparent);
}

.stage-nav svg {
  grid-row: span 2;
  align-self: center;
}

.stage-nav span {
  font-weight: 600;
}

.stage-nav small {
  font-size: 10px;
  color: var(--ant-color-text-tertiary);
}

.stage-panel {
  padding: 22px;
  background: var(--ant-color-bg-container);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 12px;
}

.shot-production-panel {
  padding: 18px;
}

.timeline-stage-panel {
  padding: 18px;
}

.stage-title {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
}

.stage-title p {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 700;
  color: var(--ant-color-primary);
  letter-spacing: 0.12em;
}

.stage-title h2 {
  margin: 0 0 4px;
  font-size: 20px;
}

.stage-title span {
  font-size: 13px;
  color: var(--ant-color-text-secondary);
}

.script-actions,
.script-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}

.full-width {
  width: 100%;
}

.library-control,
.entity-library-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.library-control > span {
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

.entity-library-actions {
  margin: -6px 0 14px;
}

.revision-strip {
  display: flex;
  gap: 8px;
  padding-bottom: 10px;
  overflow-x: auto;
}

.revision-strip button {
  display: flex;
  gap: 7px;
  align-items: center;
  padding: 7px 10px;
  cursor: pointer;
  background: var(--ant-color-bg-container);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 8px;
}

.revision-strip button.selected {
  background: color-mix(in srgb, var(--ant-color-primary) 8%, transparent);
  border-color: var(--ant-color-primary);
}

.script-status {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin: 4px 0 14px;
  font-size: 13px;
  color: var(--ant-color-text-secondary);
}

.script-status__warning {
  color: var(--ant-color-warning);
}

.script-editor {
  display: grid;
  gap: 16px;
}

.script-overview {
  max-width: 860px;
}

.script-entities {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.entity-column {
  padding: 12px;
  background: var(--ant-color-fill-quaternary);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 10px;
}

.entity-column h3 {
  display: flex;
  justify-content: space-between;
  margin: 0 0 10px;
  font-size: 14px;
}

.entity-column h3 small {
  font-weight: 400;
  color: var(--ant-color-text-tertiary);
}

.script-entity-row {
  display: grid;
  gap: 6px;
  padding: 9px 0;
  border-top: 1px solid var(--ant-color-border-secondary);
}

.script-entity-row:first-of-type {
  border-top: 0;
}

.script-entity-row code,
.story-scene code,
.entity-card code {
  font-size: 11px;
  color: var(--ant-color-text-tertiary);
}

.story-scene-list {
  display: grid;
  gap: 10px;
}

.story-scene {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 10px;
}

.story-scene__head {
  display: grid;
  grid-template-columns: 120px 1fr 130px;
  gap: 8px;
  align-items: center;
}

.dialogue-list {
  display: grid;
  gap: 6px;
  padding: 9px;
  border-left: 2px solid
    color-mix(in srgb, var(--ant-color-primary) 35%, transparent);
}

.dialogue-row {
  display: grid;
  grid-template-columns: 160px 1fr 1fr;
  gap: 7px;
}

.entity-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 10px;
}

.entity-card {
  display: grid;
  gap: 7px;
  padding: 14px;
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 10px;
}

.entity-card__head {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

.entity-card h3,
.entity-card p {
  margin: 0;
}

.entity-card p {
  min-height: 40px;
  font-size: 13px;
  color: var(--ant-color-text-secondary);
}

.entity-card small {
  color: var(--ant-color-text-tertiary);
}

.entity-card__actions {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 4px;
}

.asset-list {
  display: grid;
  overflow: hidden;
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 10px;
}

.asset-row {
  display: grid;
  grid-template-columns: auto minmax(160px, 1fr) 90px 170px;
  gap: 9px;
  align-items: center;
  padding: 9px 12px;
  font-size: 13px;
  border-bottom: 1px solid var(--ant-color-border-secondary);
}

.asset-row:last-child {
  border-bottom: 0;
}

.asset-row > span {
  color: var(--ant-color-text-secondary);
}

.future-stage {
  display: grid;
  place-content: center;
  justify-items: center;
  max-width: 860px;
  min-height: 290px;
  margin: 0 auto;
  text-align: center;
}

.future-stage svg {
  width: 34px;
  height: 34px;
  color: var(--ant-color-primary);
}

.future-stage h2 {
  margin: 12px 0 4px;
}

.future-stage p {
  max-width: 640px;
  margin: 0;
  color: var(--ant-color-text-secondary);
}

@media (max-width: 1100px) {
  .stage-nav {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .stage-nav button:nth-child(3) {
    border-right: 0;
  }

  .stage-nav button:nth-child(-n + 3) {
    border-bottom: 1px solid var(--ant-color-border-secondary);
  }

  .script-entities {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .stage-nav {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .stage-nav button {
    border-bottom: 1px solid var(--ant-color-border-secondary);
  }

  .stage-nav button:nth-child(2n) {
    border-right: 0;
  }

  .stage-title {
    display: grid;
  }

  .settings-grid,
  .story-scene__head,
  .dialogue-row,
  .asset-row {
    grid-template-columns: 1fr;
  }

  .stage-panel {
    padding: 15px;
  }
}
</style>
