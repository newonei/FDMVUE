<script lang="ts" setup>
import type { FdmAiApi } from '#/api/fdmai';
import type { FdmCreativeApi } from '#/api/fdmcreative';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, message, Modal, Spin, Tag, Tooltip } from 'ant-design-vue';

import {
  applyCreativeAgentRun,
  archiveCreativeAgentConversation,
  cancelCreativeAgentRun,
  createCreativeAgentConversation,
  createCreativeAgentRun,
  executeCreativeAgentRun,
  getCreativeAgentCapability,
  getCreativeAgentConversationPage,
  getCreativeAgentMessagePage,
  getCreativeAgentRun,
  renameCreativeAgentConversation,
  retryCreativeAgentRun,
} from '#/api/fdmcreative';

import { isAgentRunActive } from '../agent-run-state';
import { normalizeCreativeLongId } from '../creative-long-id';
import { useAgentEventStream } from '../use-agent-event-stream';
import AgentComposer from './AgentComposer.vue';
import AgentConversationList from './AgentConversationList.vue';
import AgentMessageList from './AgentMessageList.vue';
import AgentRunProgress from './AgentRunProgress.vue';
import CanvasPatchPreview from './CanvasPatchPreview.vue';

interface Props {
  canEdit?: boolean;
  canRun?: boolean;
  currentNode?: FdmCreativeApi.WorkflowNode;
  currentUserRole?: FdmCreativeApi.ProjectMemberRole;
  draftVersion: number;
  modelOptions?: FdmAiApi.ModelOption[];
  nodes: FdmCreativeApi.WorkflowNode[];
  prepareCanvasMutation?: () => Promise<boolean>;
  projectId: number;
  uploadAsset?: (file: File) => Promise<FdmCreativeApi.CreativeAsset>;
  width?: number;
}

const props = withDefaults(defineProps<Props>(), {
  canEdit: false,
  canRun: false,
  currentNode: undefined,
  currentUserRole: undefined,
  modelOptions: () => [],
  prepareCanvasMutation: undefined,
  uploadAsset: undefined,
  width: 480,
});

const emit = defineEmits<{
  close: [];
  draftApplied: [payload: {
    affectedNodeIds: string[];
    draft: FdmCreativeApi.WorkflowDraft;
  }];
  executionCreated: [executionId: FdmCreativeApi.AgentLongId];
  resize: [width: number];
}>();

const loading = ref(false);
const conversationLoading = ref(false);
const messageLoading = ref(false);
const submitting = ref(false);
const applying = ref(false);
const cancelling = ref(false);
const retrying = ref(false);
const executing = ref(false);
const uploading = ref(false);
const composerResetKey = ref(0);
const capability = ref<FdmCreativeApi.AgentCapability>();
const conversations = ref<FdmCreativeApi.AgentConversation[]>([]);
const messages = ref<FdmCreativeApi.AgentMessage[]>([]);
const selectedConversationId = ref<FdmCreativeApi.AgentLongId>();
const activeRun = ref<FdmCreativeApi.AgentRun>();
let generation = 0;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
let resizeAbort: AbortController | undefined;

const selectedConversation = computed(() =>
  conversations.value.find((item) => item.id === selectedConversationId.value),
);
const activeRunId = computed(() =>
  activeRun.value && isAgentRunActive(activeRun.value.status)
    ? activeRun.value.id
    : undefined,
);
const agentEnabled = computed(() => capability.value?.enabled === true);
const statusLabel = computed(() => {
  if (!capability.value) return '检查中';
  return capability.value.enabled ? '已启用' : '未启用';
});

const { state: streamState } = useAgentEventStream({
  agentRunId: () => activeRunId.value,
  onError: (_error, context) => {
    if (!context.reconnecting) scheduleRunRefresh(700);
  },
  onEvent: () => scheduleRunRefresh(120),
  onReady: () => scheduleRunRefresh(120),
});

function asLongId(value: unknown, fieldName: string) {
  const normalized = normalizeCreativeLongId(value);
  if (!normalized) throw new Error(`${fieldName} 返回格式无效，请刷新后重试`);
  return normalized;
}

function idempotencyKey() {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return `canvas-agent-${random}`;
  return `canvas-agent-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function clearRefreshTimer() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = undefined;
}

function scheduleRunRefresh(delay = 3000) {
  clearRefreshTimer();
  const runId = activeRun.value?.id;
  const targetGeneration = generation;
  if (!runId || !isAgentRunActive(activeRun.value?.status)) return;
  refreshTimer = setTimeout(() => {
    if (targetGeneration !== generation || runId !== activeRun.value?.id) return;
    void refreshRun(runId, targetGeneration).finally(() => {
      if (targetGeneration === generation) scheduleRunRefresh(3000);
    });
  }, delay);
}

async function loadConversations(targetGeneration = generation) {
  conversationLoading.value = true;
  try {
    const page = await getCreativeAgentConversationPage({
      pageNo: 1,
      pageSize: 50,
      projectId: props.projectId,
      status: 'ACTIVE',
    });
    if (targetGeneration !== generation) return;
    conversations.value = page.list;
    if (
      !selectedConversationId.value ||
      !page.list.some((item) => item.id === selectedConversationId.value)
    ) {
      selectedConversationId.value = page.list[0]?.id;
    }
  } finally {
    if (targetGeneration === generation) conversationLoading.value = false;
  }
}

async function loadMessages(
  conversationId: FdmCreativeApi.AgentLongId,
  targetGeneration = generation,
) {
  messageLoading.value = true;
  try {
    const page = await getCreativeAgentMessagePage({
      afterSequence: '0',
      conversationId,
      pageNo: 1,
      pageSize: 200,
    });
    if (
      targetGeneration === generation &&
      selectedConversationId.value === conversationId
    ) {
      messages.value = page.list;
    }
  } finally {
    if (targetGeneration === generation) messageLoading.value = false;
  }
}

async function refreshRun(
  runId = activeRun.value?.id,
  targetGeneration = generation,
) {
  if (!runId) return;
  const run = await getCreativeAgentRun(runId);
  if (targetGeneration !== generation || activeRun.value?.id !== runId) return;
  activeRun.value = run;
  if (selectedConversationId.value === run.conversationId) {
    await loadMessages(run.conversationId, targetGeneration);
  }
}

async function selectConversation(
  conversation: FdmCreativeApi.AgentConversation,
) {
  if (selectedConversationId.value === conversation.id && messages.value.length > 0) return;
  selectedConversationId.value = conversation.id;
  activeRun.value = undefined;
  clearRefreshTimer();
  const targetGeneration = generation;
  await loadMessages(conversation.id, targetGeneration);
  if (!conversation.lastRunId || targetGeneration !== generation) return;
  try {
    const run = await getCreativeAgentRun(conversation.lastRunId);
    if (
      targetGeneration !== generation ||
      selectedConversationId.value !== conversation.id
    ) {
      return;
    }
    activeRun.value = run;
    scheduleRunRefresh();
  } catch {
    // A historical run may have been pruned or be temporarily unavailable; conversation remains usable.
  }
}

async function initialize() {
  const targetGeneration = ++generation;
  clearRefreshTimer();
  loading.value = true;
  messages.value = [];
  activeRun.value = undefined;
  selectedConversationId.value = undefined;
  try {
    const [capabilityResult] = await Promise.all([
      getCreativeAgentCapability(),
      loadConversations(targetGeneration),
    ]);
    if (targetGeneration !== generation) return;
    capability.value = capabilityResult;
    const first = selectedConversation.value;
    if (first) await selectConversation(first);
  } catch (error) {
    if (targetGeneration === generation) {
      capability.value = { enabled: false, routeKey: 'creative.agent.default' };
      message.error(error instanceof Error ? error.message : '加载 Agent 工作台失败');
    }
  } finally {
    if (targetGeneration === generation) loading.value = false;
  }
}

async function createConversation() {
  if (!props.canEdit || !agentEnabled.value) return;
  try {
    const id = asLongId(
      await createCreativeAgentConversation({
        projectId: props.projectId,
        title: '新的画布方案',
      }),
      '会话编号',
    );
    await loadConversations();
    const conversation = conversations.value.find((item) => item.id === id);
    if (conversation) await selectConversation(conversation);
  } catch (error) {
    message.error(error instanceof Error ? error.message : '新建会话失败');
  }
}

async function renameConversation(
  conversation: FdmCreativeApi.AgentConversation,
  title: string,
) {
  try {
    await renameCreativeAgentConversation({ conversationId: conversation.id, title });
    conversations.value = conversations.value.map((item) =>
      item.id === conversation.id ? { ...item, title } : item,
    );
  } catch (error) {
    message.error(error instanceof Error ? error.message : '重命名会话失败');
  }
}

function archiveConversation(conversation: FdmCreativeApi.AgentConversation) {
  Modal.confirm({
    cancelText: '保留',
    content: '归档后不会删除审计记录，可在后续版本的会话筛选中查看。',
    okText: '归档会话',
    onOk: async () => {
      await archiveCreativeAgentConversation(conversation.id);
      if (selectedConversationId.value === conversation.id) {
        selectedConversationId.value = undefined;
        messages.value = [];
        activeRun.value = undefined;
      }
      await loadConversations();
      const first = selectedConversation.value;
      if (first) await selectConversation(first);
    },
    title: `归档“${conversation.title || '未命名会话'}”？`,
  });
}

async function ensureConversation() {
  if (selectedConversation.value) return selectedConversation.value;
  await createConversation();
  if (!selectedConversation.value) throw new Error('无法创建 Agent 会话');
  return selectedConversation.value;
}

async function submitMessage(payload: {
  content: string;
  logicalModelId?: FdmCreativeApi.AgentLongId;
  references: FdmCreativeApi.AgentReference[];
}) {
  if (!props.canEdit || !agentEnabled.value || submitting.value) return;
  if (props.prepareCanvasMutation && !(await props.prepareCanvasMutation())) return;
  submitting.value = true;
  try {
    const conversation = await ensureConversation();
    const run = await createCreativeAgentRun({
      ...payload,
      conversationId: conversation.id,
      idempotencyKey: idempotencyKey(),
      projectId: props.projectId,
    });
    activeRun.value = run;
    composerResetKey.value += 1;
    await Promise.all([loadMessages(conversation.id), loadConversations()]);
    scheduleRunRefresh(650);
    message.success('Agent 已开始规划，完成后请审阅 CanvasPatch。');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '提交 Agent 规划失败');
  } finally {
    submitting.value = false;
  }
}

async function applyPatch(
  approveDestructive: boolean,
  runAfterApply: boolean,
) {
  const run = activeRun.value;
  if (!run || applying.value || !props.canEdit) return;
  if (props.prepareCanvasMutation && !(await props.prepareCanvasMutation())) return;
  applying.value = true;
  try {
    const response = await applyCreativeAgentRun({
      approveDestructive,
      expectedDraftVersion: props.draftVersion,
      projectId: props.projectId,
      runId: run.id,
    });
    activeRun.value = response.run;
    await Promise.all([loadMessages(run.conversationId), loadConversations()]);
    if (response.status === 'APPLIED' && response.draft) {
      emit('draftApplied', {
        affectedNodeIds: response.affectedNodeIds ?? [],
        draft: response.draft,
      });
      message.success('CanvasPatch 已通过服务端校验并应用到画布。');
      if (runAfterApply) {
        const suggestion =
          response.run.suggestedRunScope &&
          response.run.suggestedRunScope !== 'NONE'
            ? {
                scope: response.run.suggestedRunScope,
                startNodeId: response.run.suggestedStartNodeId,
              }
            : (response.run.patch?.suggestedRun?.scope &&
                response.run.patch.suggestedRun.scope !== 'NONE'
              ? {
                  scope: response.run.patch.suggestedRun.scope,
                  startNodeId: response.run.patch.suggestedRun.startNodeId,
                }
              : undefined);
        if (suggestion) {
          await executeAppliedRun(response.run, suggestion, response.draft.draftVersion);
        }
      }
    } else if (response.status === 'CONFLICT') {
      message.warning('画布已发生并发更新，补丁未应用；请刷新草稿后重新规划。');
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : '应用 CanvasPatch 失败');
  } finally {
    applying.value = false;
  }
}

async function cancelRun() {
  const run = activeRun.value;
  if (!run || cancelling.value || !props.canEdit) return;
  cancelling.value = true;
  try {
    await cancelCreativeAgentRun(run.id);
    await refreshRun(run.id);
  } catch (error) {
    message.error(error instanceof Error ? error.message : '取消规划失败');
  } finally {
    cancelling.value = false;
  }
}

async function retryRun() {
  const run = activeRun.value;
  if (!run || retrying.value || !props.canEdit) return;
  retrying.value = true;
  try {
    activeRun.value = await retryCreativeAgentRun(run.id);
    await Promise.all([loadMessages(run.conversationId), loadConversations()]);
    scheduleRunRefresh(650);
  } catch (error) {
    message.error(error instanceof Error ? error.message : '重新规划失败');
  } finally {
    retrying.value = false;
  }
}

async function executeAppliedRun(
  run: FdmCreativeApi.AgentRun,
  request: {
    scope: Exclude<FdmCreativeApi.CanvasPatchSuggestedRunScope, 'NONE'>;
    startNodeId?: string;
  },
  expectedDraftVersion = props.draftVersion,
) {
  if (executing.value || !props.canRun) return;
  executing.value = true;
  try {
    const executionId = asLongId(
      await executeCreativeAgentRun({
        expectedDraftVersion,
        projectId: props.projectId,
        runId: run.id,
        ...request,
      }),
      '执行编号',
    );
    emit('executionCreated', executionId);
    await refreshRun(run.id);
    message.success('已交由既有执行器运行，可在画布任务面板查看进度。');
  } catch (error) {
    message.error(error instanceof Error ? error.message : '提交执行失败，请检查执行记录');
  } finally {
    executing.value = false;
  }
}

async function executeSuggested(request: {
  scope: Exclude<FdmCreativeApi.CanvasPatchSuggestedRunScope, 'NONE'>;
  startNodeId?: string;
}) {
  const run = activeRun.value;
  if (!run) return;
  await executeAppliedRun(run, request);
}

async function uploadReferenceAsset(file: File) {
  if (!props.uploadAsset) throw new Error('当前未配置素材上传能力');
  uploading.value = true;
  try {
    return await props.uploadAsset(file);
  } finally {
    uploading.value = false;
  }
}

function startResize(event: PointerEvent) {
  if (event.button !== 0) return;
  resizeAbort?.abort();
  const controller = new AbortController();
  resizeAbort = controller;
  const startX = event.clientX;
  const startWidth = props.width;
  const resize = (moveEvent: PointerEvent) => {
    emit('resize', Math.max(360, Math.min(680, startWidth + startX - moveEvent.clientX)));
  };
  window.addEventListener('pointermove', resize, { signal: controller.signal });
  window.addEventListener('pointerup', () => controller.abort(), {
    once: true,
    signal: controller.signal,
  });
}

watch(
  () => props.projectId,
  () => void initialize(),
  { immediate: true },
);

onBeforeUnmount(() => {
  generation += 1;
  clearRefreshTimer();
  resizeAbort?.abort();
});
</script>

<template>
  <section class="canvas-agent-panel" data-testid="canvas-agent-panel">
    <div
      aria-label="拖动以调整 Agent 面板宽度"
      class="canvas-agent-panel__resize"
      role="separator"
      tabindex="0"
      @pointerdown="startResize"
    ></div>
    <header class="canvas-agent-panel__header">
      <span>
        <span class="canvas-agent-panel__logo"><IconifyIcon icon="lucide:bot" /></span>
        <span>
          <strong>画布 Agent</strong>
          <small>方案先审阅，修改再确认</small>
        </span>
      </span>
      <span class="canvas-agent-panel__header-actions">
        <Tag :color="agentEnabled ? 'green' : 'default'">{{ statusLabel }}</Tag>
        <Tooltip title="关闭 Agent 面板">
          <Button aria-label="关闭 Agent 面板" size="small" type="text" @click="emit('close')">
            <IconifyIcon icon="lucide:x" />
          </Button>
        </Tooltip>
      </span>
    </header>

    <Spin :spinning="loading" class="canvas-agent-panel__content">
      <AgentConversationList
        :can-edit="canEdit && agentEnabled"
        :conversations="conversations"
        :loading="conversationLoading"
        :selected-conversation-id="selectedConversationId"
        @archive="archiveConversation"
        @create="createConversation"
        @rename="renameConversation"
        @select="selectConversation"
      />
      <AgentMessageList
        :loading="messageLoading"
        :messages="messages"
        :nodes="nodes"
      />
      <AgentRunProgress
        :can-edit="canEdit"
        :can-run="canRun"
        :cancelling="cancelling"
        :executing="executing"
        :retrying="retrying"
        :run="activeRun"
        :stream-state="streamState"
        @cancel="cancelRun"
        @execute="executeSuggested"
        @retry="retryRun"
      />
      <CanvasPatchPreview
        :applying="applying"
        :can-edit="canEdit"
        :can-run="canRun"
        :draft-version="draftVersion"
        :run="activeRun"
        @apply="applyPatch"
      />
      <AgentComposer
        :can-edit="canEdit"
        :current-node="currentNode"
        :draft-version="draftVersion"
        :enabled="agentEnabled"
        :model-options="modelOptions"
        :nodes="nodes"
        :project-id="projectId"
        :reset-key="composerResetKey"
        :submitting="submitting"
        :upload-asset="uploadReferenceAsset"
        :uploading="uploading"
        @submit="submitMessage"
      />
    </Spin>
  </section>
</template>

<style scoped>
.canvas-agent-panel {
  position: relative;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  color: hsl(var(--foreground));
  background: hsl(var(--card));
}

.canvas-agent-panel__resize {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -4px;
  z-index: 5;
  width: 8px;
  cursor: col-resize;
}

.canvas-agent-panel__resize::after {
  position: absolute;
  top: 50%;
  left: 2px;
  width: 2px;
  height: 36px;
  content: '';
  background: transparent;
  border-radius: 99px;
  transform: translateY(-50%);
}

.canvas-agent-panel__resize:hover::after,
.canvas-agent-panel__resize:focus-visible::after {
  outline: none;
  background: hsl(var(--primary));
}

.canvas-agent-panel__header,
.canvas-agent-panel__header > span,
.canvas-agent-panel__header-actions {
  display: flex;
  align-items: center;
}

.canvas-agent-panel__header {
  justify-content: space-between;
  min-height: 56px;
  padding: 9px 10px 9px 13px;
  border-bottom: 1px solid hsl(var(--border));
}

.canvas-agent-panel__header > span:first-child {
  gap: 8px;
}

.canvas-agent-panel__logo {
  display: grid;
  place-content: center;
  width: 31px;
  height: 31px;
  color: #6d5dfc;
  background: linear-gradient(135deg, #efedff, #e8f4ff);
  border: 1px solid #dcd8ff;
  border-radius: 9px;
}

.canvas-agent-panel__logo :deep(svg) {
  width: 17px;
  height: 17px;
}

.canvas-agent-panel__header > span:first-child > span:last-child {
  display: grid;
  gap: 1px;
}

.canvas-agent-panel__header strong {
  font-size: 13px;
}

.canvas-agent-panel__header small {
  font-size: 9px;
  color: hsl(var(--muted-foreground));
}

.canvas-agent-panel__header-actions {
  gap: 4px;
}

.canvas-agent-panel__header-actions :deep(.ant-tag) {
  margin-inline-end: 0;
  font-size: 9px;
}

.canvas-agent-panel__content,
.canvas-agent-panel__content :deep(.ant-spin-container) {
  height: 100%;
  min-height: 0;
}

.canvas-agent-panel__content :deep(.ant-spin-container) {
  display: grid;
  grid-template-rows: auto minmax(130px, 1fr) auto auto auto;
}

@media (max-width: 700px) {
  .canvas-agent-panel__resize {
    display: none;
  }
}
</style>
