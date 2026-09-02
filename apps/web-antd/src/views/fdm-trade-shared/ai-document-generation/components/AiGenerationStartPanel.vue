<script lang="ts" setup>
import type { AiGenerationStartBlocker, AiModelOption } from '../types';

import { computed } from 'vue';

import { Alert, Button, Input } from 'ant-design-vue';

import AiModelPicker from './AiModelPicker.vue';

defineOptions({ name: 'FdmAiGenerationStartPanel' });

const props = withDefaults(
  defineProps<{
    blockers?: readonly AiGenerationStartBlocker[];
    disabled?: boolean;
    instruction?: string;
    loadingModels?: boolean;
    manualDisabled?: boolean;
    manualStarting?: boolean;
    modelError?: string;
    modelId?: string;
    models: readonly AiModelOption[];
    showManualFallback?: boolean;
    sourceDescription: string;
    sourceTitle: string;
    starting?: boolean;
    startLabel?: string;
    targetTitle: string;
  }>(),
  {
    blockers: () => [],
    disabled: false,
    instruction: '',
    loadingModels: false,
    manualDisabled: false,
    manualStarting: false,
    modelError: '',
    modelId: undefined,
    showManualFallback: false,
    starting: false,
    startLabel: undefined,
  },
);

const emit = defineEmits<{
  directStart: [mode: 'MANUAL' | 'RULE'];
  reloadModels: [];
  start: [];
  'update:instruction': [value: string];
  'update:modelId': [value: string | undefined];
}>();

const canStart = computed(
  () =>
    !props.disabled &&
    !props.starting &&
    props.blockers.length === 0 &&
    Boolean(props.modelId),
);
</script>

<template>
  <section class="ai-generation-start">
    <header>
      <span>AI 生成准备</span>
      <h2>{{ sourceTitle }} → {{ targetTitle }}</h2>
      <p>{{ sourceDescription }}</p>
    </header>

    <Alert
      v-for="blocker in blockers"
      :key="blocker.code"
      :message="blocker.message"
      show-icon
      type="error"
    />

    <Alert v-if="modelError" :message="modelError" show-icon type="error">
      <template #action>
        <Button size="small" @click="emit('reloadModels')">重试</Button>
      </template>
    </Alert>

    <Alert
      v-if="showManualFallback && !loadingModels && models.length === 0"
      description="不会填充假库存、假工厂或假采购数量；人工草稿仍需由服务端读取合同快照并执行同一套规则校验。"
      message="暂无支持结构化输出的可用模型"
      show-icon
      type="info"
    >
      <template #action>
        <div class="ai-generation-start__direct-actions">
          <Button
            :disabled="manualDisabled"
            :loading="manualStarting"
            size="small"
            type="primary"
            @click="emit('directStart', 'RULE')"
          >
            规则草稿（推荐）
          </Button>
          <Button
            :disabled="manualDisabled || manualStarting"
            size="small"
            @click="emit('directStart', 'MANUAL')"
          >
            纯人工草稿
          </Button>
        </div>
      </template>
    </Alert>

    <label>
      <strong>生成模型 <b>*</b></strong>
      <AiModelPicker
        :disabled="disabled || starting"
        :loading="loadingModels"
        :models="models"
        :model-value="modelId"
        @update:model-value="emit('update:modelId', $event)"
      />
      <small>仅列出管理员已启用且支持 STRUCTURED_OUTPUT 的模型。</small>
    </label>

    <label>
      <strong>本次生成说明</strong>
      <Input.TextArea
        :auto-size="{ minRows: 3, maxRows: 6 }"
        :disabled="starting || (disabled && manualDisabled)"
        :maxlength="1000"
        placeholder="可补充本次拆分偏好；不能用来绕过库存、数量守恒或权限规则"
        show-count
        :value="instruction"
        @update:value="emit('update:instruction', String($event ?? ''))"
      />
    </label>

    <div class="ai-generation-start__notice">
      <strong>生成只创建建议版本</strong>
      <span>AI 不会自动保存业务草稿，也不会自动提交、审批或创建下游正式单据。</span>
    </div>

    <Button
      :disabled="!canStart"
      :loading="starting"
      size="large"
      type="primary"
      @click="emit('start')"
    >
      {{ startLabel || `开始生成${targetTitle}建议` }}
    </Button>
  </section>
</template>

<style scoped>
.ai-generation-start {
  display: grid;
  gap: 16px;
  max-width: 760px;
  padding: 24px;
  margin: 0 auto;
  background: #fff;
  border: 1px solid #dfe7f0;
  border-radius: 10px;
  box-shadow: 0 10px 30px rgb(15 23 42 / 6%);
}

.ai-generation-start header span,
.ai-generation-start label small,
.ai-generation-start__notice span {
  font-size: 12px;
  color: #64748b;
}

.ai-generation-start header h2 {
  margin: 4px 0;
  font-size: 20px;
  color: #172033;
}

.ai-generation-start header p {
  margin: 0;
  color: #64748b;
}

.ai-generation-start label,
.ai-generation-start__notice {
  display: grid;
  gap: 7px;
}

.ai-generation-start__direct-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ai-generation-start label b {
  color: #ef4444;
}

.ai-generation-start__notice {
  padding: 11px 13px;
  background: #f3f8fd;
  border: 1px solid #dbeaf7;
  border-radius: 7px;
}
</style>
