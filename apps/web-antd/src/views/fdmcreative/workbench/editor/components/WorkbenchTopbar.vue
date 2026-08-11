<script lang="ts" setup>
import { IconifyIcon } from '@vben/icons';

import { Button, Space, Tooltip } from 'ant-design-vue';

defineOptions({ name: 'FdmCreativeWorkbenchTopbar' });

withDefaults(
  defineProps<{
    canEdit?: boolean;
    canRun?: boolean;
    dirty?: boolean;
    projectName?: string;
    publishing?: boolean;
    roleLabel?: string;
    saveStatus: string;
    saving?: boolean;
    zoomPercent: number;
  }>(),
  {
    canEdit: true,
    canRun: true,
    dirty: false,
    projectName: '',
    publishing: false,
    roleLabel: '',
    saving: false,
  },
);

const emit = defineEmits<{
  back: [];
  fit: [];
  publish: [];
  redo: [];
  run: [];
  save: [];
  undo: [];
  zoomBy: [delta: number];
}>();
</script>

<template>
  <header class="topbar">
    <div class="topbar__start">
      <Tooltip title="返回项目列表">
        <Button class="icon-button" type="text" @click="emit('back')">
          <IconifyIcon icon="lucide:arrow-left" />
        </Button>
      </Tooltip>
      <strong class="workbench-title">节点式图像视频工作台</strong>
      <div class="project-name">
        <span>{{ projectName || '未命名项目' }}</span>
      </div>
      <span v-if="roleLabel" class="role-badge">{{ roleLabel }}</span>
      <button
        v-if="canEdit"
        v-access:code="['fdmcreative:workflow:update']"
        class="save-state"
        :class="{ dirty }"
        :disabled="saving"
        :title="dirty ? '点击保存当前草稿' : '草稿已保存，点击可再次保存'"
        type="button"
        @click="emit('save')"
      >
        <i></i>{{ saveStatus }}
      </button>
    </div>
    <Space class="canvas-controls" :size="2">
      <Tooltip title="撤销">
        <Button
          class="icon-button"
          :disabled="!canEdit"
          type="text"
          @click="emit('undo')"
        >
          <IconifyIcon icon="lucide:undo-2" />
        </Button>
      </Tooltip>
      <Tooltip title="重做">
        <Button
          class="icon-button"
          :disabled="!canEdit"
          type="text"
          @click="emit('redo')"
        >
          <IconifyIcon icon="lucide:redo-2" />
        </Button>
      </Tooltip>
      <Tooltip title="缩小">
        <Button class="icon-button" type="text" @click="emit('zoomBy', -0.1)">
          <IconifyIcon icon="lucide:minus" />
        </Button>
      </Tooltip>
      <span class="zoom-value">{{ zoomPercent }}%</span>
      <Tooltip title="放大">
        <Button class="icon-button" type="text" @click="emit('zoomBy', 0.1)">
          <IconifyIcon icon="lucide:plus" />
        </Button>
      </Tooltip>
      <Tooltip title="适配画布">
        <Button class="icon-button" type="text" @click="emit('fit')">
          <IconifyIcon icon="lucide:scan" />
        </Button>
      </Tooltip>
    </Space>
    <Space>
      <Button
        v-access:code="['fdmcreative:execution:run']"
        :disabled="!canRun"
        @click="emit('run')"
      >
        <IconifyIcon icon="lucide:play" />
        试运行
      </Button>
      <Button
        v-access:code="['fdmcreative:workflow:publish']"
        :disabled="!canEdit"
        :loading="publishing"
        type="primary"
        @click="emit('publish')"
      >
        <IconifyIcon icon="lucide:workflow" />
        发布任务
      </Button>
    </Space>
  </header>
</template>

<style scoped>
.topbar {
  z-index: 5;
  display: grid;
  grid-template-columns: minmax(500px, 1fr) auto minmax(420px, 1fr);
  gap: 16px;
  align-items: center;
  padding: 0 20px;
  color: hsl(var(--foreground));
  background: hsl(var(--card));
  border-bottom: 1px solid hsl(var(--border));
  box-shadow: 0 2px 10px hsl(var(--foreground) / 4%);
}

.topbar > :last-child {
  justify-self: end;
}

.topbar__start,
.project-name {
  display: flex;
  align-items: center;
}

.topbar__start {
  gap: 10px;
  min-width: 0;
}

.workbench-title {
  flex: none;
  font-size: 15px;
  font-weight: 650;
  white-space: nowrap;
}

.project-name {
  gap: 8px;
  min-width: 0;
  height: 34px;
  padding: 0 12px;
  color: hsl(var(--foreground) / 86%);
  background: hsl(var(--muted) / 38%);
  border: 1px solid hsl(var(--border));
  border-radius: 9px;
}

.project-name span {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  white-space: nowrap;
}

.project-name :deep(svg) {
  width: 13px;
  height: 13px;
  color: hsl(var(--muted-foreground));
}

.role-badge {
  flex: none;
  padding: 3px 7px;
  font-size: 10px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
  border: 1px solid hsl(var(--primary) / 18%);
  border-radius: 999px;
}

.save-state {
  display: inline-flex;
  flex: none;
  gap: 5px;
  align-items: center;
  padding: 4px 6px;
  font-size: 10px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: transparent;
  border: 0;
  border-radius: 6px;
}

.save-state:hover {
  background: hsl(var(--muted) / 38%);
}

.save-state i {
  width: 8px;
  height: 8px;
  background: #16a34a;
  border-radius: 999px;
}

.save-state.dirty {
  color: #d97706;
}

.save-state.dirty i {
  background: #f59e0b;
}

.icon-button :deep(svg) {
  width: 17px;
  height: 17px;
}

.canvas-controls {
  height: 36px;
  padding: 0 4px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 9px;
  box-shadow: 0 2px 8px hsl(var(--foreground) / 4%);
}

.zoom-value {
  min-width: 44px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

@media (max-width: 1500px) {
  .topbar {
    grid-template-columns: minmax(390px, 1fr) auto minmax(380px, 1fr);
  }
}

@media (max-width: 1200px) {
  .topbar {
    grid-template-columns: minmax(260px, 1fr) auto minmax(330px, 1fr);
    padding: 0 10px;
  }

  .save-state,
  .topbar__start .project-name {
    display: none;
  }
}
</style>
