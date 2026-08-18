<script lang="ts" setup>
import type { FdmCreativeApi } from '#/api/fdmcreative';

import { ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Empty, Input, Tag, Tooltip } from 'ant-design-vue';

interface Props {
  canEdit?: boolean;
  conversations: FdmCreativeApi.AgentConversation[];
  loading?: boolean;
  selectedConversationId?: FdmCreativeApi.AgentLongId;
}

const props = withDefaults(defineProps<Props>(), {
  canEdit: false,
  loading: false,
  selectedConversationId: undefined,
});

const emit = defineEmits<{
  archive: [conversation: FdmCreativeApi.AgentConversation];
  create: [];
  rename: [conversation: FdmCreativeApi.AgentConversation, title: string];
  select: [conversation: FdmCreativeApi.AgentConversation];
}>();

const editingId = ref<FdmCreativeApi.AgentLongId>();
const editingTitle = ref('');

function startRename(conversation: FdmCreativeApi.AgentConversation) {
  editingId.value = conversation.id;
  editingTitle.value = conversation.title;
}

function saveRename(conversation: FdmCreativeApi.AgentConversation) {
  const title = editingTitle.value.trim();
  if (title && title !== conversation.title) emit('rename', conversation, title);
  editingId.value = undefined;
}

function formatTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  });
}
</script>

<template>
  <section class="agent-conversation-list">
    <header class="conversation-list__header">
      <div>
        <strong>会话</strong>
        <span>{{ conversations.length }}</span>
      </div>
      <Tooltip title="新建会话">
        <Button
          v-access:code="['fdmcreative:agent:use']"
          :disabled="!canEdit || loading"
          size="small"
          type="text"
          @click="emit('create')"
        >
          <IconifyIcon icon="lucide:square-pen" />
        </Button>
      </Tooltip>
    </header>

    <div v-if="conversations.length" class="conversation-list__items">
      <article
        v-for="conversation in conversations"
        :key="conversation.id"
        class="conversation-list__item"
        :class="{ active: selectedConversationId === conversation.id }"
      >
        <div
          class="conversation-list__select"
          role="button"
          tabindex="0"
          @click="emit('select', conversation)"
          @keydown.enter.prevent="emit('select', conversation)"
          @keydown.space.prevent="emit('select', conversation)"
        >
          <span class="conversation-list__icon">
            <IconifyIcon icon="lucide:message-square-text" />
          </span>
          <span class="conversation-list__content">
            <Input
              v-if="editingId === conversation.id"
              v-model:value="editingTitle"
              autofocus
              class="conversation-list__rename"
              :maxlength="100"
              @blur="saveRename(conversation)"
              @click.stop
              @keydown.enter.prevent="saveRename(conversation)"
              @keydown.escape.prevent="editingId = undefined"
            />
            <strong v-else>{{ conversation.title || '未命名会话' }}</strong>
            <small>{{ formatTime(conversation.updateTime || conversation.createTime) }}</small>
          </span>
          <Tag v-if="conversation.lastRunId" :bordered="false">运行</Tag>
        </div>
        <div v-if="canEdit" class="conversation-list__actions">
          <Tooltip title="重命名">
            <Button size="small" type="text" @click.stop="startRename(conversation)">
              <IconifyIcon icon="lucide:pencil" />
            </Button>
          </Tooltip>
          <Tooltip title="归档会话">
            <Button danger size="small" type="text" @click.stop="emit('archive', conversation)">
              <IconifyIcon icon="lucide:archive" />
            </Button>
          </Tooltip>
        </div>
      </article>
    </div>
    <Empty v-else :image-style="{ height: '36px' }" description="新建会话，开始规划画布" />
  </section>
</template>

<style scoped>
.agent-conversation-list {
  display: grid;
  min-height: 0;
  border-bottom: 1px solid hsl(var(--border));
}

.conversation-list__header,
.conversation-list__header > div,
.conversation-list__item,
.conversation-list__select,
.conversation-list__content,
.conversation-list__actions {
  display: flex;
  align-items: center;
}

.conversation-list__header {
  justify-content: space-between;
  padding: 9px 10px 7px;
}

.conversation-list__header > div {
  gap: 6px;
}

.conversation-list__header strong {
  font-size: 12px;
}

.conversation-list__header span {
  display: grid;
  place-items: center;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted));
  border-radius: 999px;
}

.conversation-list__items {
  display: grid;
  gap: 2px;
  max-height: 186px;
  padding: 0 6px 7px;
  overflow-y: auto;
}

.conversation-list__item {
  position: relative;
  min-width: 0;
  border: 1px solid transparent;
  border-radius: 8px;
}

.conversation-list__item:hover,
.conversation-list__item.active {
  background: hsl(var(--primary) / 7%);
  border-color: hsl(var(--primary) / 15%);
}

.conversation-list__select {
  flex: 1;
  gap: 7px;
  min-width: 0;
  padding: 7px;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.conversation-list__icon {
  display: grid;
  flex: none;
  place-content: center;
  width: 26px;
  height: 26px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
  border-radius: 7px;
}

.conversation-list__icon :deep(svg) {
  width: 13px;
  height: 13px;
}

.conversation-list__content {
  display: grid;
  flex: 1;
  gap: 1px;
  min-width: 0;
}

.conversation-list__content strong,
.conversation-list__content small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conversation-list__content strong {
  font-size: 11px;
  font-weight: 600;
}

.conversation-list__content small {
  font-size: 9px;
  color: hsl(var(--muted-foreground));
}

.conversation-list__rename {
  height: 25px;
  font-size: 11px;
}

.conversation-list__select :deep(.ant-tag) {
  margin-inline-end: 0;
  font-size: 9px;
}

.conversation-list__actions {
  gap: 0;
  padding-right: 3px;
}

.conversation-list__actions :deep(.ant-btn) {
  width: 23px;
  height: 23px;
  padding: 0;
}

.agent-conversation-list :deep(.ant-empty) {
  margin: 8px 0 12px;
}

.agent-conversation-list :deep(.ant-empty-description) {
  font-size: 10px;
  color: hsl(var(--muted-foreground));
}
</style>
