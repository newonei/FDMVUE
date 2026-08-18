<script lang="ts" setup>
import type { FdmCreativeApi } from '#/api/fdmcreative';

import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import { Button, Select, Tag } from 'ant-design-vue';

import AssetLibraryPicker from '../../../shared/AssetLibraryPicker.vue';
import PromptLibraryPicker from '../../../shared/PromptLibraryPicker.vue';
import {
  agentReferenceKey,
  createAgentReferenceMention,
  displayAgentReferenceMention,
} from '../agent-reference-mention';

interface Props {
  currentNode?: FdmCreativeApi.WorkflowNode;
  disabled?: boolean;
  modelValue: FdmCreativeApi.AgentReference[];
  nodes: FdmCreativeApi.WorkflowNode[];
  projectId: number;
  uploadAsset?: (file: File) => Promise<FdmCreativeApi.CreativeAsset>;
  uploading?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  currentNode: undefined,
  disabled: false,
  uploadAsset: undefined,
  uploading: false,
});

const emit = defineEmits<{
  error: [message: string];
  'update:modelValue': [references: FdmCreativeApi.AgentReference[]];
}>();

const uploadInput = ref<HTMLInputElement>();
const nodeCandidate = ref<string>();
const referenceAliases = ref(new Map<string, string>());
const nodeOptions = computed(() =>
  props.nodes.map((node) => ({
    label: `${node.name || node.type} · ${node.id}`,
    value: node.id,
  })),
);
const referencesByKey = computed(
  () => new Map(props.modelValue.map((item) => [agentReferenceKey(item), item])),
);

function append(reference: FdmCreativeApi.AgentReference, alias?: string) {
  const key = agentReferenceKey(reference);
  if (alias) {
    const aliases = new Map(referenceAliases.value);
    aliases.set(key, alias);
    referenceAliases.value = aliases;
  }
  if (referencesByKey.value.has(key)) return;
  emit('update:modelValue', [...props.modelValue, reference]);
}

function remove(reference: FdmCreativeApi.AgentReference) {
  const key = agentReferenceKey(reference);
  const aliases = new Map(referenceAliases.value);
  aliases.delete(key);
  referenceAliases.value = aliases;
  emit(
    'update:modelValue',
    props.modelValue.filter((item) => agentReferenceKey(item) !== key),
  );
}

function addNodeReference() {
  const nodeId = nodeCandidate.value;
  if (!nodeId) return;
  const node = props.nodes.find((item) => item.id === nodeId);
  const mention = createAgentReferenceMention('NODE', nodeId, node?.name || nodeId);
  append(mention.reference, mention.alias);
  nodeCandidate.value = undefined;
}

function addCurrentNodeReference() {
  if (!props.currentNode) return;
  const mention = createAgentReferenceMention(
    'NODE',
    props.currentNode.id,
    props.currentNode.name,
  );
  append(mention.reference, mention.alias);
}

function addAssets(assets: FdmCreativeApi.CreativeAsset[]) {
  assets.forEach((asset) => {
    const mention = createAgentReferenceMention('ASSET', asset.id, asset.name);
    append(mention.reference, mention.alias);
  });
}

function addPrompt(selection: { prompt: FdmCreativeApi.CreativePrompt }) {
  const mention = createAgentReferenceMention(
    'PROMPT',
    selection.prompt.id,
    selection.prompt.name,
  );
  append(mention.reference, mention.alias);
}

function chooseFiles() {
  if (!props.disabled && !props.uploading) uploadInput.value?.click();
}

async function uploadFiles(files: File[]) {
  if (!props.uploadAsset || props.disabled || files.length === 0) return;
  try {
    for (const file of files) {
      const asset = await props.uploadAsset(file);
      const mention = createAgentReferenceMention('ASSET', asset.id, asset.name);
      append(mention.reference, mention.alias);
    }
  } catch (error) {
    emit(
      'error',
      error instanceof Error ? error.message : '素材上传失败，请重试',
    );
  }
}

function handleFileInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = input.files ? [...input.files] : [];
  input.value = '';
  void uploadFiles(files);
}

function handleDrop(event: DragEvent) {
  event.preventDefault();
  void uploadFiles(event.dataTransfer?.files ? [...event.dataTransfer.files] : []);
}

function handlePaste(event: ClipboardEvent) {
  const files = [...(event.clipboardData?.files ?? [])];
  if (files.length === 0) return;
  event.preventDefault();
  void uploadFiles(files);
}

function referenceLabel(reference: FdmCreativeApi.AgentReference) {
  const alias = referenceAliases.value.get(agentReferenceKey(reference));
  if (alias) {
    return displayAgentReferenceMention({ alias, reference });
  }
  if (reference.type === 'NODE') {
    const node = props.nodes.find((item) => item.id === reference.id);
    return `节点 · ${node?.name || reference.id}`;
  }
  return `${reference.type === 'ASSET' ? '素材' : '提示词'} · ${reference.id}`;
}

function referenceIcon(type: FdmCreativeApi.AgentReferenceType) {
  return {
    ASSET: 'lucide:library',
    NODE: 'lucide:workflow',
    PROMPT: 'lucide:notebook-tabs',
  }[type];
}
</script>

<template>
  <section class="agent-reference-picker">
    <div class="reference-picker__toolbar">
      <Select
        v-model:value="nodeCandidate"
        allow-clear
        class="reference-picker__node-select"
        :disabled="disabled"
        :options="nodeOptions"
        placeholder="引用画布节点"
        show-search
      />
      <Button :disabled="disabled || !nodeCandidate" size="small" @click="addNodeReference">
        <IconifyIcon icon="lucide:at-sign" /> @画布节点
      </Button>
      <Button
        v-if="currentNode"
        :disabled="disabled"
        size="small"
        @click="addCurrentNodeReference"
      >
        <IconifyIcon icon="lucide:crosshair" /> @当前节点
      </Button>
      <AssetLibraryPicker
        button-text="@资产"
        :disabled="disabled"
        multiple
        :project-id="projectId"
        @select="addAssets"
      />
      <PromptLibraryPicker
        button-text="@提示词"
        :disabled="disabled"
        @select="addPrompt"
      />
    </div>

    <div
      class="reference-picker__dropzone"
      :class="{ 'is-disabled': disabled || !uploadAsset, 'is-uploading': uploading }"
      role="button"
      tabindex="0"
      @click="chooseFiles"
      @dragenter.prevent
      @dragover.prevent
      @drop="handleDrop"
      @keydown.enter.prevent="chooseFiles"
      @keydown.space.prevent="chooseFiles"
      @paste="handlePaste"
    >
      <IconifyIcon :icon="uploading ? 'lucide:loader-circle' : 'lucide:paperclip'" />
      <span>{{ uploading ? '正在转存为当前项目私有素材…' : '拖入、粘贴或点击上传素材' }}</span>
      <small>上传后只提交 FDM 素材 ID，不会把临时链接交给 Agent。</small>
      <input
        ref="uploadInput"
        accept="image/*,video/*,audio/*"
        class="reference-picker__file-input"
        multiple
        type="file"
        @change="handleFileInput"
      />
    </div>

    <div v-if="modelValue.length" class="reference-picker__selected">
      <Tag v-for="reference in modelValue" :key="agentReferenceKey(reference)" :closable="!disabled" @close.prevent="remove(reference)">
        <IconifyIcon :icon="referenceIcon(reference.type)" />
        {{ referenceLabel(reference) }}
      </Tag>
    </div>
  </section>
</template>

<style scoped>
.agent-reference-picker {
  display: grid;
  gap: 8px;
}

.reference-picker__toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}

.reference-picker__node-select {
  width: min(100%, 188px);
}

.reference-picker__dropzone {
  position: relative;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  column-gap: 7px;
  align-items: center;
  min-height: 54px;
  padding: 8px 10px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: hsl(var(--muted) / 40%);
  border: 1px dashed hsl(var(--border));
  border-radius: 8px;
}

.reference-picker__dropzone:hover,
.reference-picker__dropzone:focus-visible {
  color: hsl(var(--primary));
  outline: none;
  background: hsl(var(--primary) / 6%);
  border-color: hsl(var(--primary) / 52%);
}

.reference-picker__dropzone > svg {
  width: 16px;
  height: 16px;
}

.reference-picker__dropzone small {
  grid-column: 2;
  font-size: 10px;
  line-height: 15px;
  color: hsl(var(--muted-foreground));
}

.reference-picker__dropzone.is-disabled {
  cursor: not-allowed;
  opacity: 0.56;
}

.reference-picker__dropzone.is-uploading > svg {
  animation: agent-reference-spin 900ms linear infinite;
}

.reference-picker__file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  pointer-events: none;
  opacity: 0;
}

.reference-picker__selected {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.reference-picker__selected :deep(.ant-tag) {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

@keyframes agent-reference-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
