<script lang="ts" setup>
import type { FdmAiApi } from '#/api/fdmai';
import type { FdmCreativeApi } from '#/api/fdmcreative';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Alert, Button, Select, Textarea, Tooltip } from 'ant-design-vue';

import AgentReferencePicker from './AgentReferencePicker.vue';

interface Props {
  canEdit?: boolean;
  currentNode?: FdmCreativeApi.WorkflowNode;
  draftVersion: number;
  enabled?: boolean;
  modelOptions?: FdmAiApi.ModelOption[];
  nodes: FdmCreativeApi.WorkflowNode[];
  projectId: number;
  resetKey?: number;
  submitting?: boolean;
  uploadAsset?: (file: File) => Promise<FdmCreativeApi.CreativeAsset>;
  uploading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  canEdit: false,
  currentNode: undefined,
  enabled: false,
  modelOptions: () => [],
  resetKey: 0,
  submitting: false,
  uploadAsset: undefined,
  uploading: false,
});

const emit = defineEmits<{
  submit: [payload: {
    content: string;
    logicalModelId?: FdmCreativeApi.AgentLongId;
    references: FdmCreativeApi.AgentReference[];
  }];
}>();

const content = ref('');
const references = ref<FdmCreativeApi.AgentReference[]>([]);
const logicalModelId = ref<string>();
const error = ref<string>();
const supportedModels = computed(() =>
  props.modelOptions.filter(
    (model) =>
      model.enabled &&
      model.modality === 'TEXT' &&
      model.capabilities.includes('STRUCTURED_OUTPUT'),
  ),
);
const modelSelectOptions = computed(() => [
  {
    label: '自动选择（creative.agent.default）',
    value: '__AUTO__',
  },
  ...supportedModels.value.map((model) => ({
    label: `${model.name} · ${model.code}`,
    value: String(model.id),
  })),
]);

watch(
  () => props.resetKey,
  () => {
    content.value = '';
    references.value = [];
    error.value = undefined;
  },
);

function send() {
  const normalized = content.value.trim();
  if (!normalized) {
    error.value = '请先描述想要新增、修改或连接的节点。';
    return;
  }
  if (normalized.length > 50_000) {
    error.value = '消息不能超过 50,000 个字符。';
    return;
  }
  error.value = undefined;
  emit('submit', {
    content: normalized,
    logicalModelId:
      logicalModelId.value && logicalModelId.value !== '__AUTO__'
        ? logicalModelId.value
        : undefined,
    references: references.value,
  });
}

function handleKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
    event.preventDefault();
    send();
  }
}
</script>

<template>
  <section class="agent-composer">
    <Alert
      v-if="!enabled"
      class="agent-composer__notice"
      description="管理员尚未启用创作 Agent 或未配置默认路由。你仍可查看已有会话和补丁记录。"
      message="Agent 当前不可用"
      show-icon
      type="warning"
    />
    <Alert
      v-else-if="!canEdit"
      class="agent-composer__notice"
      description="当前角色可以查看会话与补丁；需要编辑者或所有者权限才能提交、取消和应用 Agent 规划。"
      message="当前为只读协作角色"
      show-icon
      type="info"
    />
    <template v-if="canEdit">
      <Textarea
        v-model:value="content"
        :auto-size="{ minRows: 3, maxRows: 7 }"
        :disabled="!enabled || submitting"
        :maxlength="50_000"
        placeholder="例如：以当前产品图为参考，在右侧新增一个图片生成节点，并连接到现有图片集合节点。"
        @keydown="handleKeydown"
      />
      <AgentReferencePicker
        v-model="references"
        :current-node="currentNode"
        :disabled="!enabled || submitting"
        :nodes="nodes"
        :project-id="projectId"
        :upload-asset="uploadAsset"
        :uploading="uploading"
        @error="error = $event"
      />
      <div class="agent-composer__footer">
        <Select
          v-model:value="logicalModelId"
          class="agent-composer__model"
          :disabled="!enabled || submitting"
          :options="modelSelectOptions"
          placeholder="自动选择默认模型"
        />
        <span>基于草稿 v{{ draftVersion }}</span>
        <Tooltip title="发送后只会生成受限 CanvasPatch，不会直接修改或执行画布。快捷键 Ctrl / ⌘ + Enter">
          <Button
            v-access:code="['fdmcreative:agent:use']"
            :disabled="!enabled"
            :loading="submitting"
            type="primary"
            @click="send"
          >
            <IconifyIcon icon="lucide:sparkles" />
            生成方案
          </Button>
        </Tooltip>
      </div>
      <p v-if="error" class="agent-composer__error">{{ error }}</p>
    </template>
  </section>
</template>

<style scoped>
.agent-composer {
  display: grid;
  gap: 8px;
  padding: 10px;
  border-top: 1px solid hsl(var(--border));
}

.agent-composer__notice {
  font-size: 11px;
}

.agent-composer__notice :deep(.ant-alert-message) {
  font-size: 11px;
}

.agent-composer__notice :deep(.ant-alert-description) {
  font-size: 10px;
  line-height: 16px;
}

.agent-composer :deep(textarea) {
  font-size: 12px;
  line-height: 1.55;
  resize: none;
}

.agent-composer__footer {
  display: flex;
  gap: 7px;
  align-items: center;
}

.agent-composer__model {
  flex: 1;
  min-width: 0;
}

.agent-composer__footer > span {
  flex: none;
  font-size: 9px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.agent-composer__footer :deep(.ant-btn) {
  flex: none;
}

.agent-composer__error {
  margin: 0;
  font-size: 10px;
  color: #dc2626;
}
</style>
