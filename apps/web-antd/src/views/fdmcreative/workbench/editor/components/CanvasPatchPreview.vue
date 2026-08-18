<script lang="ts" setup>
import type { FdmCreativeApi } from '#/api/fdmcreative';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Alert, Button, Empty, Modal, Tag } from 'ant-design-vue';

import {
  CANVAS_PATCH_OPERATION_LABEL,
  suggestedExecutionRequest,
} from '../agent-run-state';
import {
  canApplyCanvasPatch,
  groupCanvasPatchOperations,
  patchHasDestructiveOperation,
} from '../canvas-patch-preview-state';

interface Props {
  applying?: boolean;
  canEdit?: boolean;
  canRun?: boolean;
  draftVersion: number;
  run?: FdmCreativeApi.AgentRun;
}

const props = withDefaults(defineProps<Props>(), {
  applying: false,
  canEdit: false,
  canRun: false,
  run: undefined,
});

const emit = defineEmits<{
  apply: [approveDestructive: boolean, runAfterApply: boolean];
}>();

const patch = computed(() => props.run?.patch);
const destructive = computed(() => patchHasDestructiveOperation(patch.value));
const suggestedExecution = computed(() =>
  props.run ? suggestedExecutionRequest(props.run) : undefined,
);
const groups = computed(() => groupCanvasPatchOperations(patch.value));
const canApply = computed(() =>
  canApplyCanvasPatch(props.run, props.draftVersion, props.canEdit),
);

function operationTarget(operation: FdmCreativeApi.CanvasPatchOperation) {
  if (operation.type === 'CONNECT' || operation.type === 'DISCONNECT') {
    return `${operation.sourceNodeId || '未知节点'} → ${operation.targetNodeId || '未知节点'}`;
  }
  if (operation.type === 'ADD_NODE') {
    return operation.name || operation.nodeType || operation.nodeId || '新节点';
  }
  return operation.name || operation.nodeId || '节点';
}

function operationDetail(operation: FdmCreativeApi.CanvasPatchOperation) {
  if (operation.type === 'UPDATE_NODE_CONFIG') {
    const fields = Object.keys(operation.config ?? {});
    return fields.length > 0 ? `更新：${fields.join('、')}` : '更新已授权的节点配置';
  }
  if (operation.type === 'MOVE_NODE') {
    return operation.relativeToNodeId
      ? `相对于 ${operation.relativeToNodeId} 定位`
      : `定位至 ${Math.round(operation.x ?? 0)}, ${Math.round(operation.y ?? 0)}`;
  }
  if (operation.type === 'RENAME_NODE') return '变更显示名称';
  return CANVAS_PATCH_OPERATION_LABEL[operation.type];
}

function requestApply(runAfterApply = false) {
  if (!patch.value || props.run?.status !== 'READY') return;
  if (!destructive.value) {
    emit('apply', false, runAfterApply);
    return;
  }
  Modal.confirm({
    cancelText: '继续审阅',
    content:
      '本次补丁包含删除节点或断开连线。确认后服务端会重新校验当前草稿版本、节点端口和权限，再原子应用。',
    okButtonProps: { danger: true },
    okText: '确认应用破坏性变更',
    onOk: () => emit('apply', true, runAfterApply),
    title: '确认应用破坏性画布修改？',
  });
}
</script>

<template>
  <section class="canvas-patch-preview">
    <header>
      <span>
        <IconifyIcon icon="lucide:git-pull-request-arrow" />
        <strong>CanvasPatch 预览</strong>
      </span>
      <Tag v-if="patch" :color="run?.status === 'READY' ? 'blue' : undefined">
        v{{ patch.schemaVersion }}
      </Tag>
    </header>
    <template v-if="patch">
      <p v-if="patch.summary" class="canvas-patch-preview__summary">{{ patch.summary }}</p>
      <div class="canvas-patch-preview__version">
        基于草稿 v{{ patch.baseDraftVersion }}
        <span :class="{ conflict: patch.baseDraftVersion !== draftVersion }">
          {{ patch.baseDraftVersion === draftVersion ? '当前版本匹配' : `当前为 v${draftVersion}，应用时将进行并发校验` }}
        </span>
      </div>
      <Alert
        v-for="warning in patch.warnings || []"
        :key="warning"
        class="canvas-patch-preview__warning"
        :description="warning"
        show-icon
        type="warning"
      />
      <Alert
        v-if="destructive"
        class="canvas-patch-preview__warning"
        description="包含删除节点或断开连线。必须在下方明确确认后，服务端才会应用补丁。"
        message="存在破坏性操作"
        show-icon
        type="warning"
      />
      <div class="canvas-patch-preview__groups">
        <section v-for="group in groups" :key="group.key" :class="`is-${group.key}`">
          <h4>{{ group.label }} <span>{{ group.operations.length }}</span></h4>
          <article v-for="operation in group.operations" :key="operation.operationId">
            <IconifyIcon
              :icon="
                group.key === 'delete' || group.key === 'disconnect'
                  ? 'lucide:triangle-alert'
                  : group.key === 'connect'
                    ? 'lucide:git-merge'
                    : group.key === 'add'
                      ? 'lucide:plus-circle'
                      : 'lucide:pencil-line'
              "
            />
            <div>
              <strong>{{ operationTarget(operation) }}</strong>
              <small>{{ operationDetail(operation) }}</small>
            </div>
          </article>
        </section>
      </div>
      <div class="canvas-patch-preview__actions">
        <Button
          v-if="run?.status === 'READY'"
          v-access:code="['fdmcreative:agent:apply']"
          :disabled="!canApply"
          :loading="applying"
          type="primary"
          @click="requestApply(false)"
        >
          <IconifyIcon icon="lucide:check-check" />
          {{ destructive ? '确认并仅应用补丁' : '仅应用到画布' }}
        </Button>
        <Button
          v-if="run?.status === 'READY' && suggestedExecution"
          v-access:code="['fdmcreative:agent:apply']"
          :disabled="!canApply || !canRun"
          :loading="applying"
          @click="requestApply(true)"
        >
          <IconifyIcon icon="lucide:play" />
          应用并运行{{ suggestedExecution.scope === 'NODE' ? '节点' : suggestedExecution.scope === 'DOWNSTREAM' ? '下游' : '全部流程' }}
        </Button>
        <span v-else-if="run?.status === 'APPLIED'">该补丁已经原子应用到草稿。</span>
        <span v-else>等待 Agent 完成或重新规划后显示可应用方案。</span>
      </div>
    </template>
    <Empty v-else :image-style="{ height: '36px' }" description="Agent 完成规划后会在这里展示差异，不会直接改动画布。" />
  </section>
</template>

<style scoped>
.canvas-patch-preview {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid hsl(var(--border));
}

.canvas-patch-preview > header,
.canvas-patch-preview > header > span,
.canvas-patch-preview__actions {
  display: flex;
  align-items: center;
}

.canvas-patch-preview > header {
  justify-content: space-between;
}

.canvas-patch-preview > header > span {
  gap: 6px;
}

.canvas-patch-preview > header svg {
  width: 15px;
  height: 15px;
  color: hsl(var(--primary));
}

.canvas-patch-preview > header strong {
  font-size: 12px;
}

.canvas-patch-preview__summary {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}

.canvas-patch-preview__version {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.canvas-patch-preview__version span {
  color: #15803d;
}

.canvas-patch-preview__version span.conflict {
  color: #d97706;
}

.canvas-patch-preview__warning {
  font-size: 10px;
}

.canvas-patch-preview__warning :deep(.ant-alert-description) {
  font-size: 10px;
  line-height: 16px;
}

.canvas-patch-preview__groups {
  display: grid;
  gap: 7px;
  max-height: 245px;
  overflow: auto;
}

.canvas-patch-preview__groups section {
  padding: 7px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.canvas-patch-preview__groups section.is-delete,
.canvas-patch-preview__groups section.is-disconnect {
  background: rgb(220 38 38 / 4%);
  border-color: rgb(220 38 38 / 20%);
}

.canvas-patch-preview__groups h4 {
  display: flex;
  gap: 5px;
  align-items: center;
  margin: 0 0 5px;
  font-size: 10px;
}

.canvas-patch-preview__groups h4 span {
  display: grid;
  place-items: center;
  min-width: 15px;
  height: 15px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted));
  border-radius: 999px;
}

.canvas-patch-preview__groups article {
  display: grid;
  grid-template-columns: 15px minmax(0, 1fr);
  gap: 6px;
  align-items: start;
  padding: 4px 2px;
}

.canvas-patch-preview__groups article > svg {
  width: 13px;
  height: 13px;
  margin-top: 1px;
  color: hsl(var(--muted-foreground));
}

.is-delete article > svg,
.is-disconnect article > svg {
  color: #dc2626;
}

.canvas-patch-preview__groups article div {
  display: grid;
  gap: 1px;
  min-width: 0;
}

.canvas-patch-preview__groups article strong,
.canvas-patch-preview__groups article small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.canvas-patch-preview__groups article strong {
  font-size: 10px;
  font-weight: 600;
}

.canvas-patch-preview__groups article small {
  font-size: 9px;
  color: hsl(var(--muted-foreground));
}

.canvas-patch-preview__actions {
  justify-content: flex-end;
  min-height: 27px;
}

.canvas-patch-preview__actions > span {
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}

.canvas-patch-preview :deep(.ant-empty) {
  margin: 12px 0;
}

.canvas-patch-preview :deep(.ant-empty-description) {
  font-size: 10px;
  line-height: 16px;
  color: hsl(var(--muted-foreground));
}
</style>
