<script setup lang="ts">
import type {
  Experience,
  ExperienceInput,
  ExperienceSeed,
} from '#/api/fdmmcp/experience';

import { reactive, ref } from 'vue';

import { Button, Input, Modal } from 'ant-design-vue';
import dayjs from 'dayjs';

import { extractReport, lengths } from './report';

const props = defineProps<{
  busy: boolean;
  error: string;
  item?: Experience;
  kind: 'capture' | 'edit' | 'manual' | 'report';
  question?: string;
  seed?: ExperienceSeed;
}>();
const emit = defineEmits<{
  close: [];
  save: [
    data: ExperienceInput &
      ({ id: string; version: number } | { sourceKey: string }),
  ];
}>();
const original = ref('');
const date = ref(dayjs().format('YYYY-MM-DD'));
const sourceKey = ref(
  props.kind === 'report'
    ? ''
    : (props.seed?.sourceKey ?? `manual:${crypto.randomUUID()}`),
);
const extracting = ref(false);
const warning = ref('');
const fields = reactive<ExperienceInput>({
  title: props.item?.title ?? props.seed?.fields.title ?? '',
  scenario:
    props.item?.scenario ?? props.seed?.fields.scenario ?? props.question ?? '',
  method: props.item?.method ?? props.seed?.fields.method ?? '',
  exception: props.item?.exception ?? props.seed?.fields.exception ?? '',
  source: props.item?.source ?? props.seed?.fields.source ?? '',
});
const definitions = [
  {
    key: 'title',
    label: '经验名称',
    rows: 1,
    hint: '给这条做法起一个下次找得到的名字',
  },
  {
    key: 'scenario',
    label: '适用场景',
    rows: 2,
    hint: '通常在什么情况下遇到这个问题？',
  },
  {
    key: 'method',
    label: '具体做法',
    rows: 3,
    hint: '你先看什么、怎么判断、接着怎么做？',
  },
  {
    key: 'exception',
    label: '例外情况（选填）',
    rows: 2,
    hint: '出现什么情况需要换做法或请人确认？',
  },
  {
    key: 'source',
    label: '可共享的来源说明',
    rows: 1,
    hint: '这条经验在哪次工作或哪份资料中得到验证？',
  },
] as const;
async function extract() {
  warning.value = '';
  extracting.value = true;
  try {
    const prepared = await extractReport(date.value, original.value);
    Object.assign(fields, prepared.fields);
    sourceKey.value = prepared.sourceKey;
  } catch (error) {
    warning.value =
      error instanceof Error ? error.message : '请核对日报内容后重试。';
  } finally {
    extracting.value = false;
  }
}
function save() {
  const input = { ...fields };
  for (const { key } of definitions) input[key] = input[key].trim();
  if (!input.title || !input.scenario || !input.method || !input.source) {
    warning.value = '请填写名称、适用场景、做法和来源说明。';
    return;
  }
  warning.value = '';
  emit('save', {
    ...input,
    ...(props.item
      ? { id: props.item.id, version: props.item.version }
      : { sourceKey: sourceKey.value }),
  });
}
</script>
<template>
  <Modal
    :open="true"
    :title="
      kind === 'report'
        ? '从日报提炼个人经验'
        : item || kind === 'edit'
          ? '编辑个人经验'
          : seed
            ? seed.title
            : question
              ? '补充我处理这个问题的经验'
              : '记一条个人经验'
    "
    :footer="null"
    :mask-closable="!busy"
    :closable="!busy"
    @cancel="!busy && emit('close')"
  >
    <div v-if="kind === 'report'" class="editor-fields">
      <label>日报日期<input
          v-model="date"
          type="date"
          required
          :disabled="extracting || !!sourceKey"
      /></label>
      <label>本人日报原文<Input.TextArea
          v-model:value="original"
          :rows="4"
          :maxlength="12000"
          :disabled="extracting || !!sourceKey"
          placeholder="粘贴工作片段，可按场景、做法、例外分行填写"
      /></label>
      <small>原文仅在本次编辑中预览，保存前可修改下方经验字段。</small>
      <Button
        v-if="!sourceKey"
        type="primary"
        :loading="extracting"
        @click="extract"
      >
        提炼并核对
      </Button>
    </div>
    <form v-if="sourceKey" class="editor-fields" @submit.prevent="save">
      <label v-for="field in definitions" :key="field.key">{{ field.label }}
        <Input
          v-if="field.rows === 1"
          v-model:value="fields[field.key]"
          :placeholder="field.hint"
          :maxlength="lengths[field.key]"
          :disabled="busy"
        />
        <Input.TextArea
          v-else
          v-model:value="fields[field.key]"
          :placeholder="field.hint"
          :rows="field.rows"
          :maxlength="lengths[field.key]"
          :disabled="busy"
        />
      </label>
      <div class="editor-actions">
        <Button :disabled="busy" @click="emit('close')">取消</Button><Button type="primary" html-type="submit" :loading="busy">
          确认存为个人经验
        </Button>
      </div>
    </form>
    <p v-if="warning || error" class="editor-error" role="alert">
      {{ warning || error }}
    </p>
  </Modal>
</template>
<style scoped>
.editor-fields {
  display: grid;
  gap: 12px;
  margin-top: 16px;
}

.editor-fields label {
  display: grid;
  gap: 4px;
}

.editor-fields small {
  color: hsl(var(--muted-foreground));
}

.editor-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.editor-error {
  margin-top: 8px;
  color: var(--ant-color-error, #cf1322);
}
</style>
