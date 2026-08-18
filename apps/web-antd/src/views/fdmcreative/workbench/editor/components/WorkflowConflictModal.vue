<script lang="ts" setup>
import type { WorkflowAutosaveSnapshot } from '../use-workflow-autosave';

import type { FdmCreativeApi } from '#/api/fdmcreative';

import { IconifyIcon } from '@vben/icons';

import { Alert, Button, Modal, Tag } from 'ant-design-vue';

defineOptions({ name: 'FdmCreativeWorkflowConflictModal' });

defineProps<{
  loadingServerDraft?: boolean;
  localSnapshot?: WorkflowAutosaveSnapshot;
  open: boolean;
  serverDraft?: FdmCreativeApi.WorkflowDraft;
}>();

const emit = defineEmits<{
  downloadLocal: [];
  keepLocal: [];
  loadServer: [];
  'update:open': [value: boolean];
}>();

function formatTime(value: FdmCreativeApi.WorkflowDraft['savedTime']) {
  if (!value) return '未知';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? String(value) : date.toLocaleString('zh-CN');
}
</script>

<template>
  <Modal
    :footer="null"
    :mask-closable="false"
    :open="open"
    title="画布保存冲突"
    width="620px"
    @update:open="emit('update:open', $event)"
  >
    <Alert
      show-icon
      type="warning"
      message="另一位编辑者或另一个页面已更新画布，自动保存已暂停。"
      description="系统不会自动合并或覆盖服务器版本。你可以先导出本地副本，再明确选择加载服务器版本，或保留本地内容稍后处理。"
    />

    <section class="conflict-state">
      <div class="conflict-state__heading">
        <IconifyIcon icon="lucide:server" />
        <strong>服务器当前草稿</strong>
        <Tag v-if="loadingServerDraft" color="processing">正在获取</Tag>
      </div>
      <dl v-if="serverDraft" class="conflict-state__details">
        <dt>草稿版本</dt>
        <dd>v{{ serverDraft.draftVersion }}</dd>
        <dt>最后保存人</dt>
        <dd>{{ serverDraft.savedByUserId ?? '未知' }}</dd>
        <dt>保存时间</dt>
        <dd>{{ formatTime(serverDraft.savedTime) }}</dd>
      </dl>
      <p v-else class="conflict-state__muted">正在读取可访问的服务器草稿…</p>
    </section>

    <section class="conflict-state conflict-state--local">
      <div class="conflict-state__heading">
        <IconifyIcon icon="lucide:laptop" />
        <strong>本地未保存副本</strong>
        <Tag color="orange">未持久化</Tag>
      </div>
      <dl v-if="localSnapshot" class="conflict-state__details">
        <dt>基于版本</dt>
        <dd>v{{ localSnapshot.expectedDraftVersion }}</dd>
        <dt>节点 / 连线</dt>
        <dd>
          {{ localSnapshot.definition.nodes.length }} / {{
            localSnapshot.definition.edges.length
          }}
        </dd>
        <dt>本地快照</dt>
        <dd>#{{ localSnapshot.sequence }}</dd>
      </dl>
      <p v-else class="conflict-state__muted">本地快照正在准备中。</p>
    </section>

    <div class="conflict-actions">
      <Button :disabled="!localSnapshot" @click="emit('downloadLocal')">
        <IconifyIcon icon="lucide:download" />
        导出本地副本
      </Button>
      <Button @click="emit('keepLocal')">
        <IconifyIcon icon="lucide:clock-3" />
        保留本地，稍后处理
      </Button>
      <Button
        :disabled="!serverDraft"
        danger
        type="primary"
        @click="emit('loadServer')"
      >
        <IconifyIcon icon="lucide:rotate-ccw" />
        加载服务器版本
      </Button>
    </div>
  </Modal>
</template>

<style scoped>
.conflict-state {
  padding: 14px;
  margin-top: 14px;
  background: hsl(var(--muted) / 28%);
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.conflict-state--local {
  border-color: rgb(245 158 11 / 36%);
}

.conflict-state__heading {
  display: flex;
  gap: 7px;
  align-items: center;
  color: hsl(var(--foreground));
}

.conflict-state__heading :deep(svg) {
  width: 15px;
  height: 15px;
  color: hsl(var(--primary));
}

.conflict-state__heading :deep(.ant-tag) {
  margin-left: auto;
}

.conflict-state__details {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 8px 12px;
  padding: 0;
  margin: 13px 0 0;
  font-size: 12px;
}

.conflict-state__details dt {
  color: hsl(var(--muted-foreground));
}

.conflict-state__details dd {
  min-width: 0;
  margin: 0;
  color: hsl(var(--foreground));
  overflow-wrap: anywhere;
}

.conflict-state__muted {
  margin: 12px 0 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.conflict-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 18px;
}
</style>
