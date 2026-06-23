<script lang="ts" setup>
import type { FdmxuiClientApi } from '#/api/fdmxui/client';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Empty, message, Modal, Tag } from 'ant-design-vue';

defineOptions({ name: 'FdmxuiClientLinkDetailModal' });

const props = defineProps<{
  client?: FdmxuiClientApi.Client;
  open: boolean;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
}>();

const protocolLinks = computed(() => parseLinks(props.client?.subLinks));

const subscriptionLinks = computed(() =>
  [
    { label: '普通订阅', value: props.client?.subscriptionUrl },
    { label: 'JSON订阅', value: props.client?.jsonSubscriptionUrl },
    { label: 'Clash订阅', value: props.client?.clashSubscriptionUrl },
  ].filter((item): item is { label: string; value: string } => !!item.value),
);

function close() {
  emit('update:open', false);
}

async function copyText(text?: string, label = '内容') {
  if (!text) {
    message.warning(`没有可复制的${label}`);
    return;
  }
  await navigator.clipboard.writeText(text);
  message.success(`${label}已复制`);
}

function parseLinks(value?: string) {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map(String).filter(Boolean);
    }
    if (typeof parsed === 'string') {
      return splitLinks(parsed);
    }
  } catch {
    return splitLinks(value);
  }
  return [];
}

function splitLinks(value: string) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function getProtocol(link: string) {
  const index = link.indexOf('://');
  return index > 0 ? link.slice(0, index).toUpperCase() : 'LINK';
}

function getDisplayName(link: string, index: number) {
  const hashIndex = link.indexOf('#');
  if (hashIndex >= 0 && hashIndex < link.length - 1) {
    try {
      return decodeURIComponent(link.slice(hashIndex + 1));
    } catch {
      return link.slice(hashIndex + 1);
    }
  }
  return `${getProtocol(link)} ${index + 1}`;
}
</script>

<template>
  <Modal
    :footer="null"
    :open="open"
    class="w-[920px] max-w-[calc(100vw-2rem)]"
    title="订阅链接详情"
    @cancel="close"
  >
    <div class="flex max-h-[72vh] min-h-0 flex-col gap-4 overflow-y-auto pr-1">
      <section v-if="subscriptionLinks.length > 0" class="space-y-3">
        <div class="text-sm font-medium text-foreground">订阅入口</div>
        <div class="space-y-2">
          <div
            v-for="item in subscriptionLinks"
            :key="item.label"
            class="grid gap-2 rounded border border-border p-3 md:grid-cols-[88px_minmax(0,1fr)_auto]"
          >
            <Tag class="m-0 w-fit">{{ item.label }}</Tag>
            <div class="min-w-0 break-all font-mono text-xs leading-5">
              {{ item.value }}
            </div>
            <Button size="small" @click="copyText(item.value, item.label)">
              <template #icon>
                <IconifyIcon icon="lucide:copy" />
              </template>
              复制
            </Button>
          </div>
        </div>
      </section>

      <section class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <div class="text-sm font-medium text-foreground">协议链接</div>
          <Button
            :disabled="protocolLinks.length === 0"
            size="small"
            @click="copyText(protocolLinks.join('\n'), '全部协议链接')"
          >
            <template #icon>
              <IconifyIcon icon="lucide:copy" />
            </template>
            复制全部
          </Button>
        </div>

        <Empty v-if="protocolLinks.length === 0" description="暂无协议链接，请先刷新订阅链接" />

        <div v-else class="space-y-3">
          <div
            v-for="(link, index) in protocolLinks"
            :key="`${index}-${link}`"
            class="rounded border border-border p-3"
          >
            <div class="min-w-0 space-y-2">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="flex min-w-0 items-center gap-2">
                  <Tag color="blue" class="m-0">{{ getProtocol(link) }}</Tag>
                  <span class="min-w-0 truncate text-sm font-medium">
                    {{ getDisplayName(link, index) }}
                  </span>
                </div>
                <Button size="small" @click="copyText(link, '协议链接')">
                  <template #icon>
                    <IconifyIcon icon="lucide:copy" />
                  </template>
                  复制
                </Button>
              </div>
              <div class="break-all font-mono text-xs leading-5 text-muted-foreground">
                {{ link }}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  </Modal>
</template>
