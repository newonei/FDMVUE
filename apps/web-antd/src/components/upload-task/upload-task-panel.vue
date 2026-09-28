<script lang="ts" setup>
import type { UploadTask, UploadTaskStatus } from '#/store/upload-task';

import { computed, onBeforeUnmount, onMounted } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import { Modal, Tooltip } from 'ant-design-vue';

import { isUploadTaskActive, useUploadTaskStore } from '#/store/upload-task';

import { formatBytes, formatSpeed } from './format';
import UploadTaskProgress from './upload-task-progress.vue';

defineOptions({ name: 'UploadTaskPanel' });

const store = useUploadTaskStore();
const router = useRouter();

const STATUS_ORDER: Record<UploadTaskStatus, number> = {
  canceled: 4,
  error: 2,
  processing: 0,
  queued: 1,
  success: 3,
  uploading: 0,
};

const sortedTasks = computed(() =>
  [...store.tasks].sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      a.createdAt - b.createdAt,
  ),
);

const overallPercent = computed(() => {
  const { loadedBytes, totalBytes } = store.summary;
  return totalBytes > 0 ? Math.floor((loadedBytes / totalBytes) * 100) : 0;
});

const headerIcon = computed(() => {
  if (store.hasActive) return 'lucide:loader-circle';
  if (store.summary.failed > 0) return 'lucide:circle-alert';
  return 'lucide:circle-check';
});

const headerTitle = computed(() => {
  const { active, failed, success, total } = store.summary;
  if (active > 0) return `正在上传 ${active} 个文件`;
  if (failed > 0) return `${failed} 个文件上传失败`;
  if (success === total) return `${total} 个文件上传完成`;
  return '上传已结束';
});

const headerDescription = computed(() => {
  const { active, failed, processing, speed, success, total } = store.summary;
  const parts: string[] = [];
  if (active > 0) {
    parts.push(`${overallPercent.value}%`);
    if (speed > 0) parts.push(formatSpeed(speed));
    if (processing > 0) parts.push(`${processing} 个服务器处理中`);
  }
  parts.push(`完成 ${success}/${total}`);
  if (active > 0 && failed > 0) parts.push(`失败 ${failed}`);
  return parts.join(' · ');
});

const hasFinished = computed(() =>
  store.tasks.some((task) => !isUploadTaskActive(task)),
);

function toggleCollapsed() {
  store.collapsed = !store.collapsed;
}

function handleClose() {
  if (!store.hasActive) {
    store.clearFinished();
    return;
  }
  Modal.confirm({
    title: `还有 ${store.summary.active} 个文件正在上传，确定全部取消吗？`,
    content: '取消后需要重新选择文件上传。',
    okText: '全部取消',
    okButtonProps: { danger: true },
    cancelText: '继续上传',
    onOk() {
      store.cancelAll();
      store.clearFinished();
    },
  });
}

async function handleOpen(task: UploadTask) {
  if (task.link) await router.push(task.link);
  store.getOpenHandler(task.id)?.();
}

// 文件拖到上传区域之外时，浏览器默认会直接打开该文件并离开当前页面，正在上传的任务会丢失
function hasDraggedFiles(event: DragEvent) {
  return [...(event.dataTransfer?.types ?? [])].includes('Files');
}

function preventFileNavigation(event: DragEvent) {
  if (hasDraggedFiles(event)) event.preventDefault();
}

onMounted(() => {
  window.addEventListener('dragover', preventFileNavigation);
  window.addEventListener('drop', preventFileNavigation);
});

onBeforeUnmount(() => {
  window.removeEventListener('dragover', preventFileNavigation);
  window.removeEventListener('drop', preventFileNavigation);
});
</script>

<template>
  <div v-if="store.tasks.length > 0" class="upload-task-panel">
    <div class="upload-task-panel__header" @click="toggleCollapsed">
      <IconifyIcon
        class="upload-task-panel__status-icon"
        :class="{
          'is-spinning': store.hasActive,
          'is-error': !store.hasActive && store.summary.failed > 0,
          'is-success': !store.hasActive && store.summary.failed === 0,
        }"
        :icon="headerIcon"
      />
      <div class="min-w-0 flex-1">
        <div class="upload-task-panel__title">{{ headerTitle }}</div>
        <div class="upload-task-panel__description">
          {{ headerDescription }}
        </div>
      </div>
      <Tooltip :title="store.collapsed ? '展开' : '收起'">
        <button class="upload-task-panel__icon-button" type="button">
          <IconifyIcon
            :icon="store.collapsed ? 'lucide:chevron-up' : 'lucide:chevron-down'"
          />
        </button>
      </Tooltip>
      <Tooltip :title="store.hasActive ? '取消全部' : '关闭'">
        <button
          class="upload-task-panel__icon-button"
          type="button"
          @click.stop="handleClose"
        >
          <IconifyIcon icon="lucide:x" />
        </button>
      </Tooltip>
    </div>

    <div v-if="store.hasActive" class="upload-task-panel__overall">
      <div
        class="upload-task-panel__overall-bar"
        :style="{ width: `${overallPercent}%` }"
      ></div>
    </div>

    <template v-if="!store.collapsed">
      <div class="upload-task-panel__list">
        <div
          v-for="task in sortedTasks"
          :key="task.id"
          class="upload-task-panel__item"
        >
          <IconifyIcon class="upload-task-panel__file-icon" icon="lucide:file-image" />
          <div class="min-w-0 flex-1">
            <div class="flex items-baseline gap-2">
              <span class="upload-task-panel__name" :title="task.name">
                {{ task.name }}
              </span>
              <span class="upload-task-panel__meta">
                {{ formatBytes(task.size) }}
              </span>
            </div>
            <div v-if="task.source" class="upload-task-panel__meta">
              {{ task.source }}
            </div>
            <UploadTaskProgress class="mt-1" :task="task" />
          </div>
          <div class="upload-task-panel__actions">
            <Tooltip v-if="task.openable" title="查看">
              <button
                class="upload-task-panel__icon-button"
                type="button"
                @click="handleOpen(task)"
              >
                <IconifyIcon icon="lucide:external-link" />
              </button>
            </Tooltip>
            <Tooltip v-if="isUploadTaskActive(task)" title="取消">
              <button
                class="upload-task-panel__icon-button"
                type="button"
                @click="store.cancel(task.id)"
              >
                <IconifyIcon icon="lucide:circle-x" />
              </button>
            </Tooltip>
            <Tooltip
              v-if="task.status === 'error' || task.status === 'canceled'"
              title="重试"
            >
              <button
                class="upload-task-panel__icon-button"
                type="button"
                @click="store.retry(task.id)"
              >
                <IconifyIcon icon="lucide:rotate-cw" />
              </button>
            </Tooltip>
            <Tooltip v-if="!isUploadTaskActive(task)" title="从列表移除">
              <button
                class="upload-task-panel__icon-button"
                type="button"
                @click="store.remove(task.id)"
              >
                <IconifyIcon icon="lucide:trash-2" />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
      <div v-if="hasFinished" class="upload-task-panel__footer">
        <button type="button" @click="store.clearFinished()">
          清除已结束的任务
        </button>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 低于弹窗层级（2000）：新增弹窗打开时由弹窗内展示进度，最小化后面板再露出来 */
.upload-task-panel {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  width: 400px;
  max-width: calc(100vw - 32px);
  overflow: hidden;
  color: hsl(var(--foreground));
  background: hsl(var(--popover));
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  box-shadow:
    0 12px 32px hsl(0deg 0% 0% / 12%),
    0 2px 6px hsl(0deg 0% 0% / 8%);
}

.upload-task-panel__header {
  display: flex;
  gap: 10px;
  align-items: center;
  padding: 12px 12px 12px 16px;
  cursor: pointer;
}

.upload-task-panel__status-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  color: hsl(var(--primary));
}

.upload-task-panel__status-icon.is-spinning {
  animation: upload-task-spin 1s linear infinite;
}

.upload-task-panel__status-icon.is-error {
  color: hsl(var(--destructive));
}

.upload-task-panel__status-icon.is-success {
  color: hsl(var(--success));
}

.upload-task-panel__title {
  font-size: 14px;
  font-weight: 600;
  line-height: 20px;
}

.upload-task-panel__description {
  overflow: hidden;
  font-size: 12px;
  line-height: 18px;
  color: hsl(var(--muted-foreground));
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-task-panel__overall {
  height: 2px;
  background: hsl(var(--muted));
}

.upload-task-panel__overall-bar {
  height: 100%;
  background: hsl(var(--primary));
  transition: width 0.3s ease;
}

.upload-task-panel__list {
  max-height: min(420px, 50vh);
  overflow-y: auto;
  border-top: 1px solid hsl(var(--border));
}

.upload-task-panel__item {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding: 10px 12px 10px 16px;
}

.upload-task-panel__item + .upload-task-panel__item {
  border-top: 1px solid hsl(var(--border) / 60%);
}

.upload-task-panel__file-icon {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  color: hsl(var(--muted-foreground));
}

.upload-task-panel__name {
  min-width: 0;
  overflow: hidden;
  font-size: 13px;
  line-height: 20px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.upload-task-panel__meta {
  flex-shrink: 0;
  font-size: 12px;
  line-height: 18px;
  color: hsl(var(--muted-foreground));
}

.upload-task-panel__actions {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
}

.upload-task-panel__icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.upload-task-panel__icon-button:hover {
  color: hsl(var(--foreground));
  background: hsl(var(--accent));
}

.upload-task-panel__footer {
  padding: 8px 16px;
  text-align: right;
  border-top: 1px solid hsl(var(--border));
}

.upload-task-panel__footer button {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: transparent;
  border: 0;
}

.upload-task-panel__footer button:hover {
  color: hsl(var(--primary));
}

@keyframes upload-task-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
