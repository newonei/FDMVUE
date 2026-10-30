<script setup lang="ts">
import type { MainlineAction } from './contract-mainline';

import type { Contract } from '#/api/fdmplatform';

import { computed } from 'vue';

import { Button, Tag, Tooltip } from 'ant-design-vue';

import {
  contractMainline,
  contractNextStep,
  mainlineStateLabels,
} from './contract-mainline';
import { contractWorkboard } from './contract-workboard';

const props = defineProps<{
  busy?: boolean;
  contract: Contract;
  disabled?: boolean;
  loading?: boolean;
}>();
const emit = defineEmits<{ next: [value: MainlineAction] }>();
const stages = computed(() => contractMainline(props.contract));
const next = computed(() =>
  contractNextStep(
    props.contract,
    stages.value,
    contractWorkboard(props.contract),
  ),
);
function run() {
  const action = next.value.action;
  if (action && !props.disabled && !props.loading) emit('next', action);
}
</script>
<template>
  <section class="mainline" aria-label="合同办理主线">
    <ol class="mainline-steps">
      <li
        v-for="(stage, index) in stages"
        :key="stage.key"
        class="mainline-step"
        :class="[`is-${stage.state}`]"
        :data-stage="stage.key"
      >
        <Tooltip placement="bottom">
          <template #title>
            <div v-for="line in stage.details" :key="line">{{ line }}</div>
          </template>
          <div class="mainline-step-body" tabindex="0">
            <div class="mainline-step-head">
              <span class="mainline-dot">{{
                stage.state === 'done' ? '✓' : index + 1
              }}</span><strong>{{ stage.title }}</strong><span class="mainline-state">{{
                mainlineStateLabels[stage.state]
              }}</span>
            </div>
            <div class="mainline-bar">
              <i :style="{ width: `${stage.percent ?? 0}%` }"></i>
            </div>
            <span class="mainline-summary">{{
              loading
                ? '正在读取…'
                : stage.percent === undefined || stage.key === 'contract'
                  ? stage.summary
                  : `${stage.percent}% · ${stage.summary}`
            }}</span>
          </div>
        </Tooltip>
      </li>
    </ol>
    <div class="mainline-next" data-next-step>
      <div class="mainline-next-text">
        <span class="mainline-next-label">下一步</span><strong>{{ next.title }}</strong><Tag v-if="next.department">{{ next.department }}</Tag>
        <p>{{ next.description }}</p>
      </div>
      <Button
        v-if="next.button && next.action"
        type="primary"
        :loading="busy"
        :disabled="disabled || loading"
        @click="run"
      >
        {{ next.button }}
      </Button>
    </div>
  </section>
</template>
<style scoped>
.mainline {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.mainline-steps {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 10px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.mainline-step-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  cursor: help;
  outline: none;
}

.mainline-step-head {
  display: flex;
  gap: 6px;
  align-items: center;
  min-width: 0;
}

.mainline-dot {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  border: 1px solid hsl(var(--border));
  border-radius: 50%;
}

.mainline-state {
  margin-left: auto;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.mainline-bar {
  height: 6px;
  overflow: hidden;
  background: hsl(var(--muted));
  border-radius: 3px;
}

.mainline-bar > i {
  display: block;
  height: 100%;
  background: hsl(var(--primary));
  border-radius: 3px;
}

.mainline-summary {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.is-done .mainline-dot {
  color: hsl(var(--success));
  border-color: hsl(var(--success));
}

.is-done .mainline-bar > i {
  background: hsl(var(--success));
}

.is-active .mainline-dot {
  color: hsl(var(--primary));
  border-color: hsl(var(--primary));
}

.is-active .mainline-state {
  color: hsl(var(--primary));
}

.is-unknown .mainline-state {
  color: hsl(var(--warning));
}

.mainline-next {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding-top: 12px;
  border-top: 1px dashed hsl(var(--border));
}

.mainline-next-text strong {
  margin-right: 8px;
}

.mainline-next-label {
  margin-right: 8px;
  font-size: 12px;
  color: hsl(var(--primary));
}

.mainline-next-text p {
  margin: 4px 0 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.mainline-next > button {
  flex-shrink: 0;
}

@media (max-width: 760px) {
  .mainline-steps {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .mainline-next {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
