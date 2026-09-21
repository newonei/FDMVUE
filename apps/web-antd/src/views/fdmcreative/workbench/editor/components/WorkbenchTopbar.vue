<script lang="ts" setup>
import { computed, ref } from 'vue';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';

import { Button, Dropdown, Menu, Space, Tooltip } from 'ant-design-vue';

defineOptions({ name: 'FdmCreativeWorkbenchTopbar' });

type RunScope = 'DOWNSTREAM' | 'FULL' | 'NODE';

const props = withDefaults(
  defineProps<{
    busy?: boolean;
    canEdit?: boolean;
    canExport?: boolean;
    canImport?: boolean;
    canRedo?: boolean;
    canRun?: boolean;
    canRunSelected?: boolean;
    canUndo?: boolean;
    dirty?: boolean;
    exporting?: boolean;
    importing?: boolean;
    projectName?: string;
    publishing?: boolean;
    roleLabel?: string;
    running?: boolean;
    saveStatus: string;
    saving?: boolean;
    selectedNodeName?: string;
    selectedNodeType?: string;
    zoomPercent: number;
  }>(),
  {
    busy: false,
    canEdit: true,
    canExport: true,
    canImport: true,
    canRedo: false,
    canRun: true,
    canRunSelected: false,
    canUndo: false,
    dirty: false,
    exporting: false,
    importing: false,
    projectName: '',
    publishing: false,
    roleLabel: '',
    running: false,
    saving: false,
    selectedNodeName: '',
    selectedNodeType: '',
  },
);

const emit = defineEmits<{
  back: [];
  export: [];
  fit: [];
  help: [];
  import: [];
  publish: [];
  redo: [];
  run: [scope: RunScope];
  save: [];
  undo: [];
  zoomBy: [delta: number];
}>();

const runScope = ref<RunScope>('FULL');
const selectedScopeAvailable = computed(
  () => props.canRunSelected && Boolean(props.selectedNodeName.trim()),
);
const runDisabled = computed(
  () =>
    props.busy ||
    props.running ||
    (runScope.value === 'FULL' ? !props.canRun : !selectedScopeAvailable.value),
);
const isPlanPreview = computed(
  () =>
    runScope.value === 'NODE' && props.selectedNodeType === 'content-planner',
);
const runLabel = computed(() => {
  if (props.busy) return '提交中';
  if (props.running) return '运行中';
  if (isPlanPreview.value) return '预览方案';
  if (runScope.value === 'NODE') return '仅运行此节点';
  if (runScope.value === 'DOWNSTREAM') return '运行所选及下游';
  return '从头运行画布';
});
const runTooltip = computed(() => {
  if (props.busy) return '正在提交运行请求，请稍候';
  if (props.running) return '当前任务正在运行，结束后可以再次运行';
  if (runScope.value === 'FULL')
    return '从头执行整张画布，会重新执行全部节点的生成任务';
  if (!selectedScopeAvailable.value) return '请先选中一个可运行节点';
  if (isPlanPreview.value)
    return `为「${props.selectedNodeName}」生成方案预览，确认后再应用到画布`;
  if (runScope.value === 'NODE')
    return `仅运行「${props.selectedNodeName}」，使用已连接上游的现有结果，不重新执行其他节点`;
  return `运行「${props.selectedNodeName}」及其下游节点，会实际执行生成任务`;
});
const saveFailed = computed(() => /失败|冲突/.test(props.saveStatus));
const { hasAccessByCodes } = useAccess();
const canExportWorkflow = computed(() =>
  hasAccessByCodes(['fdmcreative:workflow:query']),
);
const canImportWorkflow = computed(() =>
  hasAccessByCodes(['fdmcreative:workflow:update']),
);
const canPublishWorkflow = computed(() =>
  hasAccessByCodes(['fdmcreative:workflow:publish']),
);
const hasMoreActions = computed(
  () =>
    canExportWorkflow.value ||
    canImportWorkflow.value ||
    canPublishWorkflow.value,
);

function run() {
  if (!runDisabled.value) emit('run', runScope.value);
}
</script>

<template>
  <header class="topbar">
    <div class="topbar__start">
      <Tooltip title="返回项目列表">
        <Button
          aria-label="返回项目列表"
          class="icon-button"
          type="text"
          @click="emit('back')"
        >
          <IconifyIcon icon="lucide:arrow-left" />
        </Button>
      </Tooltip>
      <div class="project-heading">
        <strong class="project-name" :title="projectName || '未命名项目'">{{
          projectName || '未命名项目'
        }}</strong>
        <span
          v-if="canEdit"
          v-access:code="['fdmcreative:workflow:update']"
          class="save-state"
          :class="{ dirty, 'is-error': saveFailed }"
          :aria-label="`画布保存状态：${saveStatus}`"
          aria-live="polite"
          ><i></i>{{ saveStatus }}</span
        >
      </div>
      <span v-if="roleLabel" class="role-badge">{{ roleLabel }}</span>
    </div>
    <Space class="canvas-controls" :size="2">
      <Tooltip title="撤销">
        <Button
          aria-label="撤销"
          class="icon-button"
          :disabled="!canEdit || !canUndo"
          type="text"
          @click="emit('undo')"
          ><IconifyIcon icon="lucide:undo-2"
        /></Button>
      </Tooltip>
      <Tooltip title="重做">
        <Button
          aria-label="重做"
          class="icon-button"
          :disabled="!canEdit || !canRedo"
          type="text"
          @click="emit('redo')"
          ><IconifyIcon icon="lucide:redo-2"
        /></Button>
      </Tooltip>
      <Tooltip title="缩小">
        <Button
          aria-label="缩小画布"
          class="icon-button"
          type="text"
          @click="emit('zoomBy', -0.1)"
          ><IconifyIcon icon="lucide:minus"
        /></Button>
      </Tooltip>
      <span class="zoom-value">{{ zoomPercent }}%</span>
      <Tooltip title="放大">
        <Button
          aria-label="放大画布"
          class="icon-button"
          type="text"
          @click="emit('zoomBy', 0.1)"
          ><IconifyIcon icon="lucide:plus"
        /></Button>
      </Tooltip>
      <Tooltip title="适配画布">
        <Button
          aria-label="适配画布"
          class="icon-button"
          type="text"
          @click="emit('fit')"
          ><IconifyIcon icon="lucide:scan"
        /></Button>
      </Tooltip>
    </Space>
    <div class="topbar__actions">
      <Tooltip
        :title="`当前：${saveStatus}。立即保存当前画布；发布版本时也会先自动保存`"
      >
        <Button
          v-if="canEdit"
          v-access:code="['fdmcreative:workflow:update']"
          aria-label="保存草稿"
          class="save-draft-button"
          :disabled="saving"
          :loading="saving"
          @click="emit('save')"
        >
          <IconifyIcon icon="lucide:save" /><span>保存草稿</span>
        </Button>
      </Tooltip>
      <div v-access:code="['fdmcreative:execution:run']" class="run-controls">
        <select
          v-model="runScope"
          aria-label="运行范围"
          class="run-scope"
          :disabled="busy || running"
        >
          <option value="FULL" :disabled="!canRun">从头运行画布</option>
          <option value="NODE" :disabled="!selectedScopeAvailable">
            仅运行此节点
          </option>
          <option value="DOWNSTREAM" :disabled="!selectedScopeAvailable">
            所选及下游
          </option>
        </select>
        <Tooltip :title="runTooltip">
          <Button
            class="run-button"
            :disabled="runDisabled"
            :loading="busy || running"
            type="primary"
            @click="run"
            ><IconifyIcon v-if="!running" icon="lucide:play" />{{
              runLabel
            }}</Button
          >
        </Tooltip>
      </div>
      <Dropdown v-if="hasMoreActions" :trigger="['click']">
        <Button aria-label="更多画布操作" class="icon-button more-button"
          ><IconifyIcon icon="lucide:ellipsis"
        /></Button>
        <template #overlay>
          <Menu>
            <Menu.Item
              key="export"
              v-if="canExportWorkflow"
              :disabled="!canExport || exporting"
              @click="emit('export')"
            >
              <IconifyIcon icon="lucide:download" />{{
                exporting ? '正在导出…' : '导出工作流'
              }}
            </Menu.Item>
            <Menu.Item
              key="import"
              v-if="canImportWorkflow"
              :disabled="!canEdit || !canImport || importing"
              @click="emit('import')"
            >
              <IconifyIcon icon="lucide:upload" />{{
                importing ? '正在导入…' : '导入工作流'
              }}
            </Menu.Item>
            <Menu.Item
              key="publish"
              v-if="canPublishWorkflow"
              :disabled="!canEdit || publishing"
              @click="emit('publish')"
            >
              <IconifyIcon icon="lucide:workflow" />{{
                publishing ? '正在发布…' : '发布版本'
              }}
            </Menu.Item>
          </Menu>
        </template>
      </Dropdown>
      <Tooltip title="操作帮助与快捷键">
        <Button
          aria-label="操作帮助与快捷键"
          class="icon-button help-button"
          type="text"
          @click="emit('help')"
          ><IconifyIcon icon="lucide:circle-help"
        /></Button>
      </Tooltip>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  align-items: center;
  min-width: 0;
  padding: 9px 16px;
  color: hsl(var(--foreground));
  background: hsl(var(--card));
  border-bottom: 1px solid hsl(var(--border));
}

.topbar__start {
  display: flex;
  flex: 1 1 200px;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.project-heading {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.project-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.role-badge {
  flex: none;
  padding: 2px 6px;
  font-size: 11px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
  border-radius: 5px;
}

.save-state {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  overflow-wrap: anywhere;
}

.save-state i {
  flex: none;
  width: 6px;
  height: 6px;
  background: #16a34a;
  border-radius: 50%;
}

.save-state.dirty {
  color: #d97706;
}

.save-state.dirty i {
  background: #f59e0b;
}

.save-state.is-error {
  color: hsl(var(--destructive));
}

.save-state.is-error i {
  background: currentColor;
}

.icon-button {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  padding-inline: 7px;
}

.icon-button :deep(svg) {
  width: 17px;
  height: 17px;
}

.canvas-controls {
  flex: none;
  padding: 0 3px;
  border: 1px solid hsl(var(--border));
  border-radius: 7px;
}

.zoom-value {
  display: inline-block;
  min-width: 40px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.topbar__actions,
.run-controls {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.topbar__actions {
  margin-left: auto;
}

.run-scope {
  min-width: 0;
  height: 32px;
  padding: 0 5px;
  font: inherit;
  font-size: 12px;
  color: hsl(var(--foreground));
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.run-scope:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.run-button,
.save-draft-button {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  justify-content: center;
}

@media (max-width: 1200px) {
  .topbar {
    gap: 8px 10px;
    padding: 8px 10px;
  }

  .save-draft-button span {
    display: none;
  }
}

@media (max-width: 600px) {
  .topbar__start,
  .topbar__actions {
    flex-basis: 100%;
  }

  .topbar__actions {
    margin-left: 0;
  }

  .canvas-controls {
    margin-right: auto;
  }
}
</style>
