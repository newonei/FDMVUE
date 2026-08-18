<script lang="ts" setup>
import type { FdmCreativeApi } from '#/api/fdmcreative';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Empty, Spin, Tag } from 'ant-design-vue';

interface Props {
  loading?: boolean;
  messages: FdmCreativeApi.AgentMessage[];
  nodes?: FdmCreativeApi.WorkflowNode[];
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  nodes: () => [],
});

const orderedMessages = computed(() =>
  [...props.messages].toSorted(
    (left, right) => Number(left.sequenceNo) - Number(right.sequenceNo),
  ),
);

function roleLabel(role: FdmCreativeApi.AgentMessageRole) {
  return { ASSISTANT: '画布 Agent', SYSTEM: '系统', USER: '你' }[role];
}

function roleIcon(role: FdmCreativeApi.AgentMessageRole) {
  return {
    ASSISTANT: 'lucide:bot',
    SYSTEM: 'lucide:shield-check',
    USER: 'lucide:user-round',
  }[role];
}

function referenceLabel(reference: FdmCreativeApi.AgentReference) {
  if (reference.type === 'NODE') {
    const node = props.nodes.find((item) => item.id === reference.id);
    return `节点 · ${node?.name || reference.id}`;
  }
  return `${reference.type === 'ASSET' ? '素材' : '提示词'} · ${reference.id}`;
}

function formatTime(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
}
</script>

<template>
  <section class="agent-message-list" aria-live="polite">
    <Spin :spinning="loading">
      <div v-if="orderedMessages.length" class="agent-message-list__items">
        <article
          v-for="message in orderedMessages"
          :key="message.id"
          class="agent-message"
          :class="`is-${message.role.toLowerCase()}`"
        >
          <span class="agent-message__avatar">
            <IconifyIcon :icon="roleIcon(message.role)" />
          </span>
          <div class="agent-message__body">
            <header>
              <strong>{{ roleLabel(message.role) }}</strong>
              <time v-if="message.createTime">{{ formatTime(message.createTime) }}</time>
            </header>
            <p>{{ message.content }}</p>
            <div v-if="message.references?.length" class="agent-message__references">
              <Tag v-for="reference in message.references" :key="`${reference.type}:${reference.id}`" :bordered="false">
                <IconifyIcon
                  :icon="
                    reference.type === 'NODE'
                      ? 'lucide:workflow'
                      : reference.type === 'ASSET'
                        ? 'lucide:library'
                        : 'lucide:notebook-tabs'
                  "
                />
                {{ referenceLabel(reference) }}
              </Tag>
            </div>
          </div>
        </article>
      </div>
      <Empty v-else :image-style="{ height: '42px' }" description="描述想要修改的画布，Agent 会先给出可审阅的补丁。" />
    </Spin>
  </section>
</template>

<style scoped>
.agent-message-list {
  min-height: 0;
  padding: 10px;
  overflow: auto;
}

.agent-message-list__items {
  display: grid;
  gap: 12px;
}

.agent-message {
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

.agent-message__avatar {
  display: grid;
  place-content: center;
  width: 26px;
  height: 26px;
  color: #6d5dfc;
  background: #f0efff;
  border-radius: 8px;
}

.agent-message.is-user .agent-message__avatar {
  color: #1677ff;
  background: #eaf3ff;
}

.agent-message.is-system .agent-message__avatar {
  color: #64748b;
  background: #f1f5f9;
}

.agent-message__avatar :deep(svg) {
  width: 14px;
  height: 14px;
}

.agent-message__body {
  min-width: 0;
}

.agent-message__body header {
  display: flex;
  gap: 7px;
  align-items: center;
  margin-bottom: 3px;
}

.agent-message__body strong {
  font-size: 11px;
}

.agent-message__body time {
  font-size: 9px;
  color: hsl(var(--muted-foreground));
}

.agent-message__body p {
  margin: 0;
  font-size: 12px;
  line-height: 1.58;
  color: hsl(var(--foreground) / 87%);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.agent-message__references {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.agent-message__references :deep(.ant-tag) {
  display: inline-flex;
  gap: 3px;
  align-items: center;
  margin-inline-end: 0;
  font-size: 9px;
}

.agent-message-list :deep(.ant-empty) {
  margin: 28px 0;
}

.agent-message-list :deep(.ant-empty-description) {
  max-width: 250px;
  margin: 0 auto;
  font-size: 11px;
  line-height: 18px;
  color: hsl(var(--muted-foreground));
}
</style>
