<script setup lang="ts">
import type { FdmAiApi } from '#/api/fdmai';

import { computed, ref, watch } from 'vue';

import { Button, Modal } from 'ant-design-vue';

import { getProviderModelSupport } from './model-library';
import {
  CAPABILITIES_BY_MODALITY,
  CAPABILITY_DESCRIPTIONS,
  CAPABILITY_LABELS,
  MODEL_TYPE_OPTIONS,
  MODALITY_LABELS,
} from './model-types';

const props = defineProps<{
  adapter?: FdmAiApi.AdapterDescriptor;
  model?: FdmAiApi.ProviderModelInfo;
  open: boolean;
  providerName?: string;
}>();
const emit = defineEmits<{
  confirm: [selection: { capabilities: FdmAiApi.Capability[]; modality: FdmAiApi.Modality }];
  'update:open': [open: boolean];
}>();

const modality = ref<FdmAiApi.Modality>();
const capabilities = ref<FdmAiApi.Capability[]>([]);
watch(
  () => [props.open, props.model] as const,
  ([open, model]) => {
    if (!open) return;
    modality.value = model?.modality;
    capabilities.value = [...(model?.capabilities ?? [])];
  },
  { immediate: true },
);

const availableCapabilities = computed(() =>
  modality.value ? CAPABILITIES_BY_MODALITY[modality.value] : [],
);
const complete = computed(() =>
  Boolean(
    modality.value &&
    capabilities.value.length &&
    capabilities.value.every((item) => availableCapabilities.value.includes(item)) &&
    (modality.value !== 'TEXT' ||
      capabilities.value.some((item) => item === 'CHAT' || item === 'STRUCTURED_OUTPUT')),
  ),
);
const support = computed(() =>
  getProviderModelSupport(
    {
      ...props.model,
      modality: modality.value,
      capabilities: capabilities.value,
    },
    props.adapter,
  ),
);
const statusTitle = computed(() => {
  if (!modality.value) return '先确认模型类型，再查看渠道支持情况';
  if (support.value.status === 'supported') return '当前渠道支持所选调用方式';
  if (support.value.reason === 'adapter-unavailable') return '尚未获取到当前渠道的能力信息';
  if (support.value.reason === 'modality-unsupported')
    return `当前渠道暂不支持${MODALITY_LABELS[modality.value]}`;
  if (support.value.reason === 'backend-blocked') return '当前渠道暂不可接入这个模型';
  if (support.value.reason === 'capability-unsupported') return '当前渠道尚未支持全部所选能力';
  return '请选择模型实际支持的调用方式';
});
const statusDescription = computed(() => {
  if (support.value.status === 'supported')
    return '确认后返回目录，勾选模型即可接入。实际效果可在接入后测试。';
  if (support.value.reason === 'adapter-unavailable')
    return '可以先确认类型；重新获取渠道能力后再判断能否接入。';
  if (support.value.reason === 'backend-blocked')
    return '类型确认不会解除渠道的接入限制。请使用支持该模型的渠道。';
  if (support.value.reason === 'modality-unsupported')
    return '仍可记录正确类型，模型会留在目录中。接入前需要选择支持该类型的渠道。';
  if (support.value.reason === 'capability-unsupported')
    return `暂不支持：${support.value.unsupportedCapabilities.map((item) => CAPABILITY_LABELS[item]).join('、')}。请按模型的真实能力选择。`;
  return modality.value === 'TEXT' && capabilities.value.includes('IMAGE_INPUT')
    ? '图片理解是附加输入能力，还需选择文本生成或结构化输出。'
    : '按模型的实际能力选择，可以多选；渠道不支持的能力也会保留在分类中。';
});

function modalitySupport(value: FdmAiApi.Modality) {
  if (!props.adapter?.modalities?.length || !props.adapter.capabilities?.length)
    return '待检查渠道';
  return props.adapter.modalities.includes(value) &&
    CAPABILITIES_BY_MODALITY[value].some((item) => props.adapter?.capabilities.includes(item))
    ? '渠道支持'
    : '渠道暂不支持';
}
function selectModality(value: FdmAiApi.Modality) {
  if (value === modality.value) return;
  modality.value = value;
  // Changing the output type does not confirm any of the model's capabilities.
  capabilities.value = [];
}
function toggleCapability(value: FdmAiApi.Capability) {
  capabilities.value = capabilities.value.includes(value)
    ? capabilities.value.filter((item) => item !== value)
    : [...capabilities.value, value];
}
function confirm() {
  if (!complete.value || !modality.value) return;
  emit('confirm', { modality: modality.value, capabilities: [...capabilities.value] });
}
</script>

<template>
  <Modal
    :open="open"
    title="模型类型与接入能力"
    :width="860"
    :mask-closable="false"
    :style="{ top: '32px' }"
    :body-style="{ maxHeight: 'calc(100dvh - 170px)', overflowY: 'auto' }"
    @cancel="emit('update:open', false)"
  >
    <div class="type-review">
      <div class="model-identity">
        <div class="model-identity-main">
          <span class="eyebrow">上游模型</span>
          <strong>{{ model?.name || model?.id || '待选择模型' }}</strong>
          <code v-if="model?.name && model.name !== model.id">{{ model.id }}</code>
        </div>
        <div class="channel-identity">
          <span>当前渠道</span><strong>{{ providerName || '未选择渠道' }}</strong>
        </div>
      </div>

      <fieldset class="review-section">
        <legend><span class="step-number">01</span>模型输出什么？</legend>
        <p class="section-note">选择模型本身的类型，渠道支持情况会单独标注。</p>
        <div class="type-grid">
          <label
            v-for="option in MODEL_TYPE_OPTIONS"
            :key="option.value"
            class="type-card"
            :class="{ selected: modality === option.value }"
          >
            <input
              type="radio"
              name="model-output-type"
              :value="option.value"
              :checked="modality === option.value"
              @change="selectModality(option.value)"
            />
            <svg
              class="type-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path :d="option.icon" />
            </svg>
            <strong>{{ option.label }}</strong>
            <span class="type-description">{{ option.description }}</span>
            <span
              class="type-support"
              :class="{ supported: modalitySupport(option.value) === '渠道支持' }"
            >
              {{ modalitySupport(option.value) }}
            </span>
          </label>
        </div>
      </fieldset>

      <fieldset class="review-section">
        <legend>
          <span class="step-number">02</span>支持哪些调用方式？<span class="legend-hint"
            >可多选</span
          >
        </legend>
        <p class="section-note">仅勾选这个模型实际支持的能力。</p>
        <div v-if="modality" class="capability-grid">
          <label
            v-for="capability in availableCapabilities"
            :key="capability"
            class="capability-card"
            :class="{ selected: capabilities.includes(capability) }"
          >
            <input
              type="checkbox"
              :value="capability"
              :checked="capabilities.includes(capability)"
              @change="toggleCapability(capability)"
            />
            <span class="capability-copy"
              ><strong>{{ CAPABILITY_LABELS[capability] }}</strong>
              <span>{{ CAPABILITY_DESCRIPTIONS[capability] }}</span>
              <small
                v-if="
                  adapter &&
                  (!adapter.modalities.includes(modality) ||
                    !adapter.capabilities.includes(capability))
                "
              >
                当前渠道暂不支持
              </small>
            </span>
          </label>
        </div>
        <div v-else class="capability-empty">选择上方类型后，在这里确认调用方式</div>
      </fieldset>

      <div class="support-result" :class="support.status" role="status">
        <span class="support-symbol" aria-hidden="true">{{
          support.status === 'supported' ? '✓' : 'i'
        }}</span>
        <div>
          <strong>{{ statusTitle }}</strong>
          <p>{{ statusDescription }}</p>
        </div>
      </div>
    </div>
    <template #footer>
      <div class="review-footer">
        <span>类型确认用于本次目录接入</span>
        <div>
          <Button @click="emit('update:open', false)">返回目录</Button>
          <Button type="primary" :disabled="!complete" @click="confirm">
            {{ support.status === 'supported' ? '确认类型，可接入' : '确认类型，保留待接入' }}
          </Button>
        </div>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
.type-review {
  display: flex;
  flex-direction: column;
  gap: 22px;
  padding: 8px 0;
  color: #172033;
}
.model-identity {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  padding: 18px 20px;
  background: #f7f9fc;
  border: 1px solid #e8edf4;
  border-radius: 12px;
}
.model-identity-main {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.model-identity-main strong {
  font-size: 18px;
  overflow-wrap: anywhere;
}
.model-identity-main code {
  color: #64748b;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.eyebrow,
.channel-identity span {
  color: #64748b;
  font-size: 12px;
}
.channel-identity {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  gap: 5px;
  text-align: right;
  max-width: 35%;
  overflow-wrap: anywhere;
}
.channel-identity strong {
  font-size: 13px;
  font-weight: 600;
}
.review-section {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.review-section legend {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  margin: 0 0 6px;
  padding: 0;
  font-size: 15px;
  font-weight: 650;
  border: 0;
}
.step-number {
  color: #1677ff;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 1px;
}
.legend-hint {
  margin-left: auto;
  font-size: 12px;
  font-weight: 400;
  color: #64748b;
}
.section-note {
  margin: 0 0 12px;
  color: #64748b;
  font-size: 12px;
  line-height: 1.6;
}
.type-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.type-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  min-width: 0;
  padding: 14px;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  transition:
    border-color 120ms,
    background 120ms;
}
.type-card:hover,
.capability-card:hover {
  border-color: #91caff;
  background: #fafcff;
}
.type-card.selected,
.capability-card.selected {
  border-color: #1677ff;
  background: #f0f7ff;
  box-shadow: 0 0 0 1px #1677ff inset;
}
.type-card:focus-within,
.capability-card:focus-within {
  outline: 2px solid #91caff;
  outline-offset: 3px;
}
.type-card input {
  position: absolute;
  top: 14px;
  right: 12px;
  accent-color: #1677ff;
}
.type-icon {
  width: 22px;
  height: 22px;
  margin-bottom: 4px;
  color: #475569;
}
.selected .type-icon {
  color: #1677ff;
}
.type-card strong {
  font-size: 14px;
  font-weight: 600;
}
.type-description {
  color: #64748b;
  font-size: 11px;
  line-height: 1.5;
}
.type-support {
  margin-top: 3px;
  color: #697586;
  font-size: 11px;
}
.type-support.supported {
  color: #2870c5;
}
.capability-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.capability-card {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 13px 12px;
  background: #fff;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  cursor: pointer;
}
.capability-card input {
  flex-shrink: 0;
  margin-top: 4px;
  accent-color: #1677ff;
}
.capability-copy {
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.capability-copy strong {
  font-size: 13px;
  font-weight: 600;
}
.capability-copy span {
  color: #64748b;
  font-size: 11px;
  line-height: 1.55;
}
.capability-copy small {
  color: #a15c08;
  font-size: 11px;
}
.capability-empty {
  padding: 20px;
  text-align: center;
  font-size: 13px;
  color: #64748b;
  background: #f8fafc;
  border: 1px dashed #d8e0eb;
  border-radius: 10px;
}
.support-result {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  padding: 15px 16px;
  color: #475569;
  background: #f6f8fb;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}
.support-result.supported {
  color: #16664a;
  background: #f0faf5;
  border-color: #c3e5d3;
}
.support-result.unsupported {
  color: #89510e;
  background: #fffbf2;
  border-color: #f2dfb7;
}
.support-symbol {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 19px;
  height: 19px;
  margin-top: 1px;
  font-size: 12px;
  font-weight: 700;
  border: 1px solid currentColor;
  border-radius: 50%;
}
.support-result strong {
  font-size: 13px;
  font-weight: 600;
}
.support-result p {
  margin: 5px 0 0;
  font-size: 12px;
  line-height: 1.7;
}
.review-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 5px;
}
.review-footer > span {
  color: #64748b;
  font-size: 12px;
}
.review-footer > div {
  display: flex;
  gap: 8px;
}
@media (max-width: 640px) {
  .type-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .capability-grid {
    grid-template-columns: 1fr;
  }
  .model-identity {
    align-items: flex-start;
    padding: 14px;
  }
  .model-identity-main strong {
    font-size: 15px;
  }
  .review-footer {
    flex-direction: column;
    align-items: stretch;
  }
  .review-footer > div {
    justify-content: flex-end;
  }
}
</style>
