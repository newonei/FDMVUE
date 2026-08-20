<script lang="ts" setup>
import type { FdmCreativeApi } from '#/api/fdmcreative';

import { computed, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Checkbox,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Pagination,
  Spin,
  Tag,
  Textarea,
  Tooltip,
} from 'ant-design-vue';

import {
  adoptDramaShotTaskResult,
  cancelDramaShotTask,
  generateDramaShotImage,
  generateDramaShotImages,
  generateDramaShotVideo,
  generateDramaStoryboard,
  getCreativeNodeResultPage,
  getDramaShotPage,
  getDramaShotTaskPage,
  getDramaShotTaskWorkflow,
  lockDramaShot,
  retryDramaShotTask,
  sortDramaShots,
  updateDramaShot,
} from '#/api/fdmcreative';

import PromptLibraryPicker from '../shared/PromptLibraryPicker.vue';
import NodeResultVersionsPanel from '../workbench/editor/components/NodeResultVersionsPanel.vue';
import { mergePromptText } from './drama-script-utils';
import {
  buildSwapSortRequest,
  DRAMA_SHOT_STATUS_META,
  DRAMA_SHOT_TASK_STATUS_META,
  isCancelableDramaShotTask,
  isRetryableDramaShotTask,
  shotDisplayName,
  taskResultVersions,
} from './drama-shot-utils';

defineOptions({ name: 'FdmCreativeDramaShotBoard' });

const props = withDefaults(defineProps<Props>(), {
  assets: () => [],
  canEdit: false,
  currentScriptRevisionId: undefined,
  dramaVersion: undefined,
  mode: 'storyboard',
  projectStatus: 'ACTIVE',
});

const emit = defineEmits<{
  updated: [];
}>();

interface Props {
  assets?: FdmCreativeApi.CreativeAsset[];
  canEdit?: boolean;
  currentScriptRevisionId?: number;
  dramaVersion?: number;
  mode?: 'production' | 'storyboard';
  projectId: number;
  projectStatus?: FdmCreativeApi.ProjectStatus;
}

const router = useRouter();
const loading = ref(false);
const saving = ref(false);
const taskLoading = ref(false);
const resultLoading = ref(false);
const workflowLoading = ref(false);
const keyword = ref('');
const pageNo = ref(1);
const pageSize = ref(12);
const total = ref(0);
const shots = ref<FdmCreativeApi.DramaShot[]>([]);
const selectedShotIds = ref<number[]>([]);
const selectedShot = ref<FdmCreativeApi.DramaShot>();
const tasks = ref<FdmCreativeApi.DramaShotTask[]>([]);
const selectedTask = ref<FdmCreativeApi.DramaShotTask>();
const resultVersions = ref<FdmCreativeApi.NodeResultVersion[]>([]);
const taskDrawerOpen = ref(false);
const editorOpen = ref(false);
const workflowOpen = ref(false);
const workflow = ref<FdmCreativeApi.DramaShotTaskWorkflow>();
const lastStoryboardSummary = ref('');

const shotForm = reactive({
  actionText: '',
  cameraMovement: '',
  continuityGroup: '',
  dialogueText: '',
  durationSeconds: 5,
  expectedVersion: 1,
  framing: '',
  narrationText: '',
  shotId: 0,
  visualPrompt: '',
});

const canOperate = computed(
  () => props.canEdit && props.projectStatus === 'ACTIVE',
);
const canGenerateStoryboard = computed(
  () =>
    canOperate.value &&
    Boolean(props.currentScriptRevisionId) &&
    Boolean(props.dramaVersion),
);
const selectedCount = computed(() => selectedShotIds.value.length);
const assetsById = computed(
  () => new Map(props.assets.map((asset) => [String(asset.id), asset])),
);
const selectedTaskResultVersions = computed(() =>
  taskResultVersions(selectedTask.value, resultVersions.value),
);
const workflowJson = computed(() =>
  workflow.value?.workflow
    ? JSON.stringify(workflow.value.workflow, null, 2)
    : '',
);
const modeCopy = computed(() =>
  props.mode === 'production'
    ? {
        eyebrow: '05 · P5B',
        subtitle: '按镜头推进图片与视频生产；任务、失败和结果版本都可恢复。',
        title: '镜头制作',
      }
    : {
        eyebrow: '04 · P5B',
        subtitle: '分镜由确认剧本稳定生成，之后可以逐镜编辑、锁定和生产。',
        title: '分镜板',
      },
);

function assetFor(id?: number | string) {
  return id === undefined || id === null
    ? undefined
    : assetsById.value.get(String(id));
}

function taskStatusMeta(status: FdmCreativeApi.DramaShotTaskStatus) {
  return DRAMA_SHOT_TASK_STATUS_META[status];
}

function shotStatusMeta(status: FdmCreativeApi.DramaShotStatus) {
  return DRAMA_SHOT_STATUS_META[status];
}

function selectionIncludes(shotId: number) {
  return selectedShotIds.value.includes(shotId);
}

function toggleSelection(shotId: number) {
  selectedShotIds.value = selectionIncludes(shotId)
    ? selectedShotIds.value.filter((id) => id !== shotId)
    : [...selectedShotIds.value, shotId];
}

function selectAllOnPage() {
  selectedShotIds.value =
    selectedShotIds.value.length === shots.value.length
      ? []
      : shots.value.map((shot) => shot.id);
}

function assetSummary(id?: number | string, kind?: 'IMAGE' | 'VIDEO') {
  if (!id) return kind === 'VIDEO' ? '尚未采用视频' : '尚未采用分镜图';
  const asset = assetFor(id);
  return asset?.name || `${kind === 'VIDEO' ? '视频' : '图片'}素材 #${id}`;
}

function selectShotPrompt(selection: {
  content: string;
  mode: 'append' | 'replace';
  prompt: FdmCreativeApi.CreativePrompt;
}) {
  shotForm.visualPrompt = mergePromptText(
    shotForm.visualPrompt,
    selection.content,
    selection.mode,
  );
}

async function loadShots() {
  if (!Number.isFinite(props.projectId) || props.projectId <= 0) return;
  loading.value = true;
  try {
    const page = await getDramaShotPage({
      keyword: keyword.value.trim() || undefined,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      projectId: props.projectId,
    });
    shots.value = page.list;
    total.value = page.total;
    selectedShotIds.value = selectedShotIds.value.filter((id) =>
      shots.value.some((shot) => shot.id === id),
    );
    if (selectedShot.value) {
      selectedShot.value = shots.value.find(
        (shot) => shot.id === selectedShot.value?.id,
      );
    }
  } finally {
    loading.value = false;
  }
}

async function searchShots() {
  pageNo.value = 1;
  await loadShots();
}

function changeShotPage(nextPage: number, nextSize: number) {
  pageNo.value = nextPage;
  pageSize.value = nextSize || pageSize.value;
  void loadShots();
}

async function generateStoryboard() {
  if (!props.currentScriptRevisionId || !props.dramaVersion) {
    message.warning('请先确认剧本，分镜必须基于当前已确认版本生成');
    return;
  }
  saving.value = true;
  try {
    const result = await generateDramaStoryboard({
      expectedDramaVersion: props.dramaVersion,
      projectId: props.projectId,
      scriptRevisionId: props.currentScriptRevisionId,
    });
    const changes = result.diff;
    lastStoryboardSummary.value = `新增 ${changes.added.length} · 更新 ${changes.updated.length} · 移除 ${changes.removed.length} · 保留锁定 ${changes.lockedRetained.length}`;
    message.success('分镜已按稳定 shotKey 生成/刷新');
    pageNo.value = 1;
    selectedShotIds.value = [];
    await loadShots();
    emit('updated');
  } finally {
    saving.value = false;
  }
}

function openEditor(shot: FdmCreativeApi.DramaShot) {
  Object.assign(shotForm, {
    actionText: shot.actionText || '',
    cameraMovement: shot.cameraMovement || '',
    continuityGroup: shot.continuityGroup || '',
    dialogueText: shot.dialogueText || '',
    durationSeconds: shot.durationSeconds,
    expectedVersion: shot.version,
    framing: shot.framing || '',
    narrationText: shot.narrationText || '',
    shotId: shot.id,
    visualPrompt: shot.visualPrompt || '',
  });
  editorOpen.value = true;
}

async function saveShot() {
  if (!shotForm.visualPrompt.trim()) {
    message.warning('镜头提示词不能为空');
    return;
  }
  saving.value = true;
  try {
    await updateDramaShot({
      actionText: shotForm.actionText,
      cameraMovement: shotForm.cameraMovement,
      continuityGroup: shotForm.continuityGroup,
      dialogueText: shotForm.dialogueText,
      durationSeconds: shotForm.durationSeconds,
      expectedVersion: shotForm.expectedVersion,
      framing: shotForm.framing,
      narrationText: shotForm.narrationText,
      projectId: props.projectId,
      shotId: shotForm.shotId,
      visualPrompt: shotForm.visualPrompt,
    });
    editorOpen.value = false;
    message.success('镜头已更新；此前采用的媒体已按版本规则失效');
    await loadShots();
    emit('updated');
  } finally {
    saving.value = false;
  }
}

async function toggleLock(shot: FdmCreativeApi.DramaShot) {
  saving.value = true;
  try {
    await lockDramaShot({
      expectedVersion: shot.version,
      locked: !shot.locked,
      projectId: props.projectId,
      shotId: shot.id,
    });
    message.success(
      shot.locked ? '镜头已解锁' : '镜头已锁定，刷新分镜不会覆盖它',
    );
    await loadShots();
  } finally {
    saving.value = false;
  }
}

async function moveShot(shot: FdmCreativeApi.DramaShot, offset: number) {
  const index = shots.value.findIndex((item) => item.id === shot.id);
  const neighbor = shots.value[index + offset];
  if (!neighbor) {
    message.info(offset < 0 ? '已在当前页首位' : '已在当前页末位');
    return;
  }
  saving.value = true;
  try {
    await sortDramaShots(buildSwapSortRequest(props.projectId, shot, neighbor));
    message.success('镜头排序已保存');
    await loadShots();
  } finally {
    saving.value = false;
  }
}

async function generateImage(shot: FdmCreativeApi.DramaShot) {
  saving.value = true;
  try {
    await generateDramaShotImage({
      expectedShotVersion: shot.version,
      projectId: props.projectId,
      shotId: shot.id,
    });
    message.success('分镜图任务已提交到统一生成队列');
    await openTaskDrawer(shot);
  } finally {
    saving.value = false;
  }
}

async function generateSelectedImages() {
  const selected = shots.value.filter((shot) => selectionIncludes(shot.id));
  if (selected.length === 0) {
    message.warning('请先勾选当前页要生成分镜图的镜头');
    return;
  }
  saving.value = true;
  try {
    await generateDramaShotImages({
      projectId: props.projectId,
      shots: selected.map((shot) => ({
        expectedShotVersion: shot.version,
        shotId: shot.id,
      })),
    });
    message.success(`已提交 ${selected.length} 个可恢复的分镜图任务`);
    await loadShots();
    await openTaskDrawer(selected[0]!);
  } finally {
    saving.value = false;
  }
}

async function generateVideo(shot: FdmCreativeApi.DramaShot) {
  if (!shot.adoptedImageAssetId) {
    message.warning('请先从该镜头的图片结果版本中采用一张当前分镜图');
    return;
  }
  saving.value = true;
  try {
    await generateDramaShotVideo({
      expectedShotVersion: shot.version,
      projectId: props.projectId,
      shotId: shot.id,
    });
    message.success('视频任务已基于当前采用图片提交');
    await openTaskDrawer(shot);
  } finally {
    saving.value = false;
  }
}

async function openTaskDrawer(shot: FdmCreativeApi.DramaShot) {
  selectedShot.value = shot;
  taskDrawerOpen.value = true;
  await loadTasks();
}

async function loadTasks() {
  if (!selectedShot.value) return;
  taskLoading.value = true;
  try {
    const page = await getDramaShotTaskPage({
      pageNo: 1,
      pageSize: 30,
      projectId: props.projectId,
      shotId: selectedShot.value.id,
    });
    tasks.value = page.list;
    const retained = selectedTask.value
      ? tasks.value.find((task) => task.id === selectedTask.value?.id)
      : undefined;
    selectedTask.value = retained || tasks.value[0];
    await loadTaskResultVersions();
  } finally {
    taskLoading.value = false;
  }
}

async function selectTask(task: FdmCreativeApi.DramaShotTask) {
  selectedTask.value = task;
  await loadTaskResultVersions();
}

async function loadTaskResultVersions() {
  const task = selectedTask.value;
  if (!task?.nodeId || !task.nodeRunId) {
    resultVersions.value = [];
    return;
  }
  resultLoading.value = true;
  try {
    const page = await getCreativeNodeResultPage({
      nodeId: task.nodeId,
      pageNo: 1,
      pageSize: 50,
      projectId: props.projectId,
    });
    resultVersions.value = page.list;
  } finally {
    resultLoading.value = false;
  }
}

async function cancelTask(task: FdmCreativeApi.DramaShotTask) {
  saving.value = true;
  try {
    await cancelDramaShotTask({ projectId: props.projectId, taskId: task.id });
    message.success('已请求取消，统一执行器会安全结束可取消的节点');
    await loadTasks();
  } finally {
    saving.value = false;
  }
}

async function retryTask(task: FdmCreativeApi.DramaShotTask) {
  saving.value = true;
  try {
    await retryDramaShotTask({ projectId: props.projectId, taskId: task.id });
    message.success('已创建新的重试任务，原任务和结果仍保留在历史中');
    await loadTasks();
  } finally {
    saving.value = false;
  }
}

async function adoptResult(payload: {
  asset: FdmCreativeApi.NodeResultAsset;
  version: FdmCreativeApi.NodeResultVersion;
}) {
  if (!selectedShot.value || !selectedTask.value || !payload.asset.id) {
    message.warning('当前没有可采用的镜头结果');
    return;
  }
  saving.value = true;
  try {
    const updated = await adoptDramaShotTaskResult({
      assetId: payload.asset.id,
      expectedShotVersion: selectedShot.value.version,
      projectId: props.projectId,
      taskId: selectedTask.value.id,
    });
    selectedShot.value = updated;
    message.success(
      selectedTask.value.taskType === 'GENERATE_VIDEO'
        ? '视频版本已采用为当前镜头成品'
        : '分镜图版本已采用；基于旧图的视频将保留为历史并标记过期',
    );
    await Promise.all([loadShots(), loadTasks()]);
    emit('updated');
  } finally {
    saving.value = false;
  }
}

async function openWorkflow(task: FdmCreativeApi.DramaShotTask) {
  workflowOpen.value = true;
  workflow.value = undefined;
  workflowLoading.value = true;
  try {
    workflow.value = await getDramaShotTaskWorkflow(props.projectId, task.id);
  } finally {
    workflowLoading.value = false;
  }
}

function openExecution(task: FdmCreativeApi.DramaShotTask) {
  if (!task.executionId) {
    message.info('该任务尚未绑定底层执行记录');
    return;
  }
  void router.push({
    path: '/fdmcreative/execution',
    query: { executionId: String(task.executionId) },
  });
}

function openAssetLibrary() {
  message.info('镜头结果已归档在当前项目资产库，可按来源节点继续筛选和复用');
  void router.push('/fdmcreative/assets');
}

watch(
  () => props.projectId,
  () => {
    pageNo.value = 1;
    selectedShotIds.value = [];
    selectedShot.value = undefined;
    tasks.value = [];
    selectedTask.value = undefined;
    resultVersions.value = [];
    void loadShots();
  },
  { immediate: true },
);
</script>

<template>
  <section class="shot-board" data-testid="drama-shot-board">
    <header class="shot-board__header">
      <div>
        <p>{{ modeCopy.eyebrow }}</p>
        <h2>{{ modeCopy.title }}</h2>
        <span>{{ modeCopy.subtitle }}</span>
      </div>
      <div class="shot-board__actions">
        <Button @click="loadShots">
          <IconifyIcon icon="lucide:refresh-cw" /> 刷新
        </Button>
        <Button
          v-if="canOperate"
          v-access:code="['fdmcreative:drama:storyboard-generate']"
          :disabled="!canGenerateStoryboard"
          :loading="saving"
          type="primary"
          @click="generateStoryboard"
        >
          <IconifyIcon icon="lucide:panels-top-left" />
          {{ total ? '刷新分镜' : '生成分镜' }}
        </Button>
      </div>
    </header>

    <p v-if="!currentScriptRevisionId" class="shot-board__notice">
      <IconifyIcon icon="lucide:info" />
      请先在“剧本”阶段确认一个结构化剧本，才能生成稳定分镜。
    </p>
    <p v-else-if="lastStoryboardSummary" class="shot-board__notice is-success">
      <IconifyIcon icon="lucide:git-compare-arrows" /> 上次分镜变更：{{
        lastStoryboardSummary
      }}。
    </p>

    <div class="shot-board__toolbar">
      <Input.Search
        v-model:value="keyword"
        allow-clear
        placeholder="搜索场次、镜头提示词或台词"
        @search="searchShots"
      />
      <span>当前页 {{ shots.length }} / 共 {{ total }} 镜</span>
      <Button size="small" @click="selectAllOnPage">
        {{
          selectedShotIds.length === shots.length && shots.length
            ? '取消全选'
            : '全选本页'
        }}
      </Button>
      <Button
        v-if="canOperate"
        v-access:code="['fdmcreative:drama:shot-generate']"
        :disabled="selectedCount === 0"
        :loading="saving"
        size="small"
        type="primary"
        @click="generateSelectedImages"
      >
        <IconifyIcon icon="lucide:images" /> 批量生成图片（{{ selectedCount }}）
      </Button>
    </div>

    <Spin :spinning="loading">
      <div v-if="shots.length" class="shot-grid">
        <article
          v-for="(shot, index) in shots"
          :key="shot.id"
          class="shot-card"
          :class="{
            selected: selectionIncludes(shot.id),
            'is-locked': shot.locked,
          }"
        >
          <header class="shot-card__head">
            <Checkbox
              :checked="selectionIncludes(shot.id)"
              :disabled="!canOperate"
              @change="toggleSelection(shot.id)"
            />
            <span class="shot-card__serial">{{ shotDisplayName(shot) }}</span>
            <Tag :color="shotStatusMeta(shot.status).color">
              {{ shotStatusMeta(shot.status).label }}
            </Tag>
            <Tooltip
              :title="
                shot.locked
                  ? '锁定镜头不会被重新生成的分镜覆盖'
                  : '锁定后可保护本镜头内容'
              "
            >
              <IconifyIcon
                :icon="
                  shot.locked
                    ? 'lucide:lock-keyhole'
                    : 'lucide:lock-keyhole-open'
                "
              />
            </Tooltip>
          </header>

          <div class="shot-card__title">
            <h3>{{ shot.title || shot.shotKey }}</h3>
            <small>排序 {{ shot.sortOrder + 1 }} · v{{ shot.version }}</small>
          </div>

          <div class="shot-card__prompt">
            <span>提示词</span>
            <p>{{ shot.visualPrompt }}</p>
          </div>
          <p v-if="shot.dialogueText" class="shot-card__dialogue">
            <IconifyIcon icon="lucide:quote" /> {{ shot.dialogueText }}
          </p>

          <dl class="shot-card__specs">
            <div>
              <dt>景别</dt>
              <dd>{{ shot.framing || '—' }}</dd>
            </div>
            <div>
              <dt>运镜</dt>
              <dd>{{ shot.cameraMovement || '—' }}</dd>
            </div>
            <div>
              <dt>时长</dt>
              <dd>{{ shot.durationSeconds }} 秒</dd>
            </div>
          </dl>

          <div class="shot-card__media">
            <div
              class="shot-media"
              :class="{ empty: !shot.adoptedImageAssetId }"
            >
              <img
                v-if="assetFor(shot.adoptedImageAssetId)?.url"
                :alt="assetSummary(shot.adoptedImageAssetId, 'IMAGE')"
                loading="lazy"
                :src="assetFor(shot.adoptedImageAssetId)?.url"
              />
              <IconifyIcon v-else icon="lucide:image" />
              <span>{{ assetSummary(shot.adoptedImageAssetId, 'IMAGE') }}</span>
            </div>
            <div
              class="shot-media"
              :class="{ empty: !shot.adoptedVideoAssetId || shot.videoStale }"
            >
              <IconifyIcon icon="lucide:film" />
              <span>{{
                shot.videoStale
                  ? '旧视频已过期'
                  : assetSummary(shot.adoptedVideoAssetId, 'VIDEO')
              }}</span>
            </div>
          </div>

          <footer class="shot-card__actions">
            <Button size="small" @click="openTaskDrawer(shot)">
              <IconifyIcon icon="lucide:list-video" /> 任务
            </Button>
            <template v-if="canOperate">
              <Button
                v-access:code="['fdmcreative:drama:shot-update']"
                :disabled="shot.locked"
                size="small"
                @click="openEditor(shot)"
              >
                编辑
              </Button>
              <Button
                v-access:code="['fdmcreative:drama:shot-update']"
                size="small"
                @click="toggleLock(shot)"
              >
                {{ shot.locked ? '解锁' : '锁定' }}
              </Button>
              <Button
                v-access:code="['fdmcreative:drama:shot-update']"
                :disabled="index === 0"
                size="small"
                @click="moveShot(shot, -1)"
              >
                <IconifyIcon icon="lucide:arrow-up" />
              </Button>
              <Button
                v-access:code="['fdmcreative:drama:shot-update']"
                :disabled="index === shots.length - 1"
                size="small"
                @click="moveShot(shot, 1)"
              >
                <IconifyIcon icon="lucide:arrow-down" />
              </Button>
              <Button
                v-access:code="['fdmcreative:drama:shot-generate']"
                :loading="saving"
                size="small"
                type="primary"
                @click="generateImage(shot)"
              >
                生成图
              </Button>
              <Button
                v-access:code="['fdmcreative:drama:shot-generate']"
                :disabled="!shot.adoptedImageAssetId"
                :loading="saving"
                size="small"
                @click="generateVideo(shot)"
              >
                生成视频
              </Button>
            </template>
          </footer>
        </article>
      </div>
      <Empty
        v-else
        :description="
          currentScriptRevisionId
            ? '尚未生成分镜。可由已确认剧本生成稳定镜头。'
            : '确认剧本后可生成分镜。'
        "
      />
    </Spin>

    <div v-if="total > pageSize" class="shot-board__pagination">
      <Pagination
        :current="pageNo"
        :page-size="pageSize"
        :show-size-changer="true"
        :total="total"
        @change="changeShotPage"
      />
    </div>
  </section>

  <Modal
    v-model:open="editorOpen"
    :confirm-loading="saving"
    destroy-on-close
    title="编辑镜头"
    width="760px"
    @ok="saveShot"
  >
    <Form layout="vertical">
      <div class="shot-editor__grid">
        <Form.Item label="景别">
          <Input v-model:value="shotForm.framing" :maxlength="128" />
        </Form.Item>
        <Form.Item label="镜头运动">
          <Input v-model:value="shotForm.cameraMovement" :maxlength="128" />
        </Form.Item>
        <Form.Item label="时长（秒）">
          <InputNumber
            v-model:value="shotForm.durationSeconds"
            :max="120"
            :min="1"
            class="full-width"
          />
        </Form.Item>
        <Form.Item label="连续性组">
          <Input v-model:value="shotForm.continuityGroup" :maxlength="128" />
        </Form.Item>
      </div>
      <Form.Item label="视觉提示词" required>
        <Textarea
          v-model:value="shotForm.visualPrompt"
          :maxlength="20000"
          :rows="5"
        />
        <div class="shot-editor__library">
          <PromptLibraryPicker
            button-text="从提示词库填入"
            :current-text="shotForm.visualPrompt"
            target-type="IMAGE"
            @select="selectShotPrompt"
          />
          <span>替换会保留明确选择；追加会以段落分隔。</span>
        </div>
      </Form.Item>
      <Form.Item label="动作">
        <Textarea
          v-model:value="shotForm.actionText"
          :maxlength="20000"
          :rows="3"
        />
      </Form.Item>
      <Form.Item label="台词">
        <Textarea
          v-model:value="shotForm.dialogueText"
          :maxlength="20000"
          :rows="3"
        />
      </Form.Item>
      <Form.Item label="旁白">
        <Textarea
          v-model:value="shotForm.narrationText"
          :maxlength="20000"
          :rows="3"
        />
      </Form.Item>
    </Form>
  </Modal>

  <Drawer
    v-model:open="taskDrawerOpen"
    :width="820"
    title="镜头任务与结果版本"
    @after-open-change="(opened) => opened && loadTasks()"
  >
    <template v-if="selectedShot">
      <div class="shot-task-context">
        <div>
          <strong
            >{{ shotDisplayName(selectedShot) }} ·
            {{ selectedShot.title || selectedShot.shotKey }}</strong
          >
          <span
            >当前图片：{{
              assetSummary(selectedShot.adoptedImageAssetId, 'IMAGE')
            }}</span
          >
          <span
            >当前视频：{{
              selectedShot.videoStale
                ? '旧视频已过期'
                : assetSummary(selectedShot.adoptedVideoAssetId, 'VIDEO')
            }}</span
          >
        </div>
        <Button size="small" @click="loadTasks">
          <IconifyIcon icon="lucide:refresh-cw" /> 刷新
        </Button>
      </div>

      <Spin :spinning="taskLoading">
        <div v-if="tasks.length" class="shot-task-list">
          <button
            v-for="task in tasks"
            :key="task.id"
            :class="{ active: selectedTask?.id === task.id }"
            type="button"
            @click="selectTask(task)"
          >
            <span>
              <strong>{{
                task.taskType === 'GENERATE_VIDEO' ? '视频生成' : '分镜图生成'
              }}</strong>
              <small>#{{ task.id }} · 尝试 {{ task.attemptNo }}</small>
            </span>
            <Tag :color="taskStatusMeta(task.status).color">
              {{ taskStatusMeta(task.status).label }}
            </Tag>
          </button>
        </div>
        <Empty
          v-else
          description="该镜头尚无生成任务。"
          :image-style="{ height: '42px' }"
        />
      </Spin>

      <template v-if="selectedTask">
        <section class="shot-task-detail">
          <header>
            <div>
              <Tag :color="taskStatusMeta(selectedTask.status).color">
                {{ taskStatusMeta(selectedTask.status).label }}
              </Tag>
              <span
                >{{
                  selectedTask.taskType === 'GENERATE_VIDEO'
                    ? '基于图片'
                    : '图片生成'
                }}
                · 任务 #{{ selectedTask.id }}</span
              >
            </div>
            <div class="shot-task-detail__actions">
              <Button size="small" @click="openWorkflow(selectedTask)">
                <IconifyIcon icon="lucide:braces" /> 工作流快照
              </Button>
              <Button
                v-if="selectedTask.executionId"
                size="small"
                @click="openExecution(selectedTask)"
              >
                <IconifyIcon icon="lucide:external-link" /> 执行详情
              </Button>
              <Button
                v-if="
                  canOperate && isCancelableDramaShotTask(selectedTask.status)
                "
                v-access:code="['fdmcreative:drama:shot-cancel']"
                danger
                size="small"
                @click="cancelTask(selectedTask)"
              >
                取消
              </Button>
              <Button
                v-if="
                  canOperate && isRetryableDramaShotTask(selectedTask.status)
                "
                v-access:code="['fdmcreative:drama:shot-retry']"
                size="small"
                type="primary"
                @click="retryTask(selectedTask)"
              >
                重试
              </Button>
            </div>
          </header>
          <p v-if="selectedTask.errorMessage" class="shot-task-detail__error">
            {{ selectedTask.errorMessage }}
          </p>
          <p
            v-else-if="selectedTask.status === 'SUCCEEDED'"
            class="shot-task-detail__hint"
          >
            选择结果版本后“采用此版”才会更新镜头；成功生成不会自动覆盖当前成品。
          </p>

          <NodeResultVersionsPanel
            :can-edit="canOperate"
            :loading="resultLoading"
            pin-label="在资产库查看"
            :versions="selectedTaskResultVersions"
            @adopt="adoptResult"
            @pin="openAssetLibrary"
          />
        </section>
      </template>
    </template>
  </Drawer>

  <Modal
    v-model:open="workflowOpen"
    :footer="null"
    title="底层工作流快照（只读）"
    width="min(920px, calc(100vw - 32px))"
  >
    <Spin :spinning="workflowLoading">
      <p class="workflow-notice">
        <IconifyIcon icon="lucide:shield-check" />
        这是创建镜头任务时固化的执行快照；编辑它不会反向修改镜头真相。
      </p>
      <pre v-if="workflowJson" class="workflow-json">{{ workflowJson }}</pre>
      <Empty v-else description="尚未加载工作流快照" />
    </Spin>
  </Modal>
</template>

<style scoped>
.shot-board {
  display: grid;
  gap: 14px;
}

.shot-board__header,
.shot-board__actions,
.shot-board__toolbar,
.shot-card__head,
.shot-card__title,
.shot-card__actions,
.shot-task-context,
.shot-task-detail > header,
.shot-task-detail__actions,
.shot-editor__library {
  display: flex;
  align-items: center;
}

.shot-board__header {
  gap: 14px;
  justify-content: space-between;
}

.shot-board__header > div:first-child {
  display: grid;
  gap: 3px;
}

.shot-board__header p {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  color: var(--ant-color-primary);
  letter-spacing: 0.12em;
}

.shot-board__header h2 {
  margin: 0;
  font-size: 20px;
}

.shot-board__header span {
  font-size: 13px;
  color: var(--ant-color-text-secondary);
}

.shot-board__actions {
  flex-wrap: wrap;
  gap: 8px;
}

.shot-board__notice {
  display: flex;
  gap: 7px;
  align-items: center;
  padding: 9px 11px;
  margin: 0;
  font-size: 13px;
  color: var(--ant-color-text-secondary);
  background: var(--ant-color-fill-quaternary);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 8px;
}

.shot-board__notice.is-success {
  color: var(--ant-color-success);
  border-color: color-mix(in srgb, var(--ant-color-success) 35%, transparent);
}

.shot-board__toolbar {
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px;
  background: var(--ant-color-fill-quaternary);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 9px;
}

.shot-board__toolbar :deep(.ant-input-search) {
  width: min(420px, 100%);
}

.shot-board__toolbar > span {
  margin-right: auto;
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

.shot-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(305px, 1fr));
  gap: 12px;
}

.shot-card {
  display: grid;
  gap: 11px;
  min-width: 0;
  padding: 13px;
  background: var(--ant-color-bg-container);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 11px;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

.shot-card:hover {
  border-color: color-mix(
    in srgb,
    var(--ant-color-primary) 45%,
    var(--ant-color-border-secondary)
  );
  box-shadow: 0 6px 18px rgb(0 0 0 / 4%);
}

.shot-card.selected {
  border-color: var(--ant-color-primary);
  box-shadow: 0 0 0 2px
    color-mix(in srgb, var(--ant-color-primary) 12%, transparent);
}

.shot-card.is-locked {
  background: linear-gradient(
    135deg,
    color-mix(
      in srgb,
      var(--ant-color-warning) 5%,
      var(--ant-color-bg-container)
    ),
    var(--ant-color-bg-container)
  );
}

.shot-card__head {
  gap: 7px;
  min-width: 0;
}

.shot-card__head .shot-card__serial {
  min-width: 0;
  margin-right: auto;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  font-weight: 600;
  color: var(--ant-color-text-secondary);
  white-space: nowrap;
}

.shot-card__head > svg {
  color: var(--ant-color-text-tertiary);
}

.shot-card__title {
  gap: 8px;
  justify-content: space-between;
}

.shot-card__title h3 {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 15px;
  white-space: nowrap;
}

.shot-card__title small {
  flex: none;
  font-size: 11px;
  color: var(--ant-color-text-tertiary);
}

.shot-card__prompt {
  display: grid;
  gap: 3px;
}

.shot-card__prompt > span {
  font-size: 11px;
  color: var(--ant-color-text-tertiary);
}

.shot-card__prompt p {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  -webkit-line-clamp: 3;
  font-size: 12px;
  line-height: 1.55;
  color: var(--ant-color-text-secondary);
  -webkit-box-orient: vertical;
}

.shot-card__dialogue {
  display: -webkit-box;
  min-height: 20px;
  margin: -2px 0 0;
  overflow: hidden;
  -webkit-line-clamp: 2;
  font-size: 12px;
  line-height: 1.55;
  color: var(--ant-color-text-secondary);
  -webkit-box-orient: vertical;
}

.shot-card__dialogue svg {
  margin-right: 3px;
  color: var(--ant-color-primary);
}

.shot-card__specs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 7px 0;
  margin: 0;
  border-top: 1px solid var(--ant-color-border-secondary);
  border-bottom: 1px solid var(--ant-color-border-secondary);
}

.shot-card__specs div {
  min-width: 0;
}

.shot-card__specs dt {
  font-size: 10px;
  color: var(--ant-color-text-tertiary);
}

.shot-card__specs dd {
  margin: 2px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  white-space: nowrap;
}

.shot-card__media {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}

.shot-media {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 7px;
  align-items: center;
  min-width: 0;
  min-height: 42px;
  overflow: hidden;
  background: var(--ant-color-fill-quaternary);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 7px;
}

.shot-media img {
  width: 36px;
  height: 42px;
  object-fit: cover;
}

.shot-media > svg {
  width: 18px;
  height: 18px;
  margin-left: 9px;
  color: var(--ant-color-primary);
}

.shot-media.empty > svg {
  color: var(--ant-color-text-tertiary);
}

.shot-media span {
  padding-right: 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--ant-color-text-secondary);
  white-space: nowrap;
}

.shot-card__actions {
  flex-wrap: wrap;
  gap: 5px;
}

.shot-card__actions :deep(.ant-btn) {
  padding-inline: 7px;
}

.shot-board__pagination {
  display: flex;
  justify-content: flex-end;
}

.shot-editor__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 12px;
}

.shot-editor__library {
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 7px;
}

.shot-editor__library span {
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

.full-width {
  width: 100%;
}

.shot-task-context {
  gap: 10px;
  justify-content: space-between;
  padding: 9px 10px;
  margin-bottom: 12px;
  background: var(--ant-color-fill-quaternary);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 8px;
}

.shot-task-context > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.shot-task-context span {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--ant-color-text-secondary);
  white-space: nowrap;
}

.shot-task-list {
  display: grid;
  gap: 6px;
  margin-bottom: 12px;
}

.shot-task-list button {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 8px 10px;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: var(--ant-color-bg-container);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 8px;
}

.shot-task-list button.active {
  background: color-mix(in srgb, var(--ant-color-primary) 7%, transparent);
  border-color: var(--ant-color-primary);
}

.shot-task-list button > span {
  display: grid;
  gap: 2px;
}

.shot-task-list small {
  font-size: 11px;
  color: var(--ant-color-text-tertiary);
}

.shot-task-detail {
  overflow: hidden;
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 9px;
}

.shot-task-detail > header {
  gap: 8px;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--ant-color-fill-quaternary);
}

.shot-task-detail > header > div:first-child {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  align-items: center;
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

.shot-task-detail__actions {
  flex-wrap: wrap;
  gap: 5px;
}

.shot-task-detail__error {
  padding: 0 12px;
  font-size: 12px;
  color: var(--ant-color-error);
}

.shot-task-detail__hint {
  padding: 0 12px;
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

.workflow-notice {
  display: flex;
  gap: 7px;
  align-items: center;
  font-size: 13px;
  color: var(--ant-color-text-secondary);
}

.workflow-notice svg {
  color: var(--ant-color-primary);
}

.workflow-json {
  max-height: 65vh;
  padding: 13px;
  overflow: auto;
  font-size: 12px;
  line-height: 1.5;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: var(--ant-color-fill-quaternary);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 8px;
}

@media (max-width: 720px) {
  .shot-board__header,
  .shot-task-context,
  .shot-task-detail > header {
    flex-direction: column;
    align-items: stretch;
  }

  .shot-board__toolbar > span {
    width: 100%;
  }

  .shot-editor__grid {
    grid-template-columns: 1fr;
  }
}
</style>
