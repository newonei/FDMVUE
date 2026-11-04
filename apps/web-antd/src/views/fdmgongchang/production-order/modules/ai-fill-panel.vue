<script setup lang="ts">
import type { UploadProps } from 'ant-design-vue';

import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Alert, Button, Input, Upload } from 'ant-design-vue';

import { getDefaultFillPrompt, getDemandFill, submitDemandFill } from '#/api/fdmgongchang/production-order';

/**
 * 提生产需求的「AI 识别」：上传附件（Excel、Word、PDF、图片、文本）或粘贴聊天文字，连同提示词交给 AI，
 * 识别出交期、用途和产品明细后交给弹窗回填，人工核对后再提交。提示词默认用工厂设置里的，可以当场改。
 */
const props = defineProps<{ factoryId?: number }>();
const emit = defineEmits<{ filled: [result: NonNullable<Api.Fill['result']>] }>();

const MAX_FILES = 5;
const MAX_MB = 20;
const ACCEPT = '.xlsx,.xlsm,.xls,.docx,.doc,.pdf,.png,.jpg,.jpeg,.webp,.csv,.txt';

const files = ref<File[]>([]);
const text = ref('');
const prompt = ref('');
const defaultPrompt = ref('');
const showPrompt = ref(false);
const running = ref(false);
const error = ref('');
const fill = ref<Api.Fill>();

const fileList = computed<UploadProps['fileList']>(() =>
  files.value.map((f, i) => ({ name: f.name, status: 'done', uid: `${i}-${f.name}` })),
);
const promptChanged = computed(() => prompt.value.trim() !== defaultPrompt.value.trim());
const problemFiles = computed(() => (fill.value?.files ?? []).filter((f) => f.status !== 'READ'));

/** 换工厂时取那家工厂的默认提示词；下单人改过的不覆盖。 */
let promptSeq = 0;
watch(
  () => props.factoryId,
  async (id) => {
    const mine = ++promptSeq;
    try {
      const value = await getDefaultFillPrompt(id);
      if (mine !== promptSeq) return;
      if (!promptChanged.value || !prompt.value) prompt.value = value;
      defaultPrompt.value = value;
    } catch {
      // 取不到默认提示词时后端会用系统默认
    }
  },
  { immediate: true },
);

const beforeUpload: UploadProps['beforeUpload'] = (file) => {
  error.value = '';
  if (files.value.length >= MAX_FILES) {
    error.value = `一次最多上传 ${MAX_FILES} 个附件`;
  } else if (file.size > MAX_MB * 1024 * 1024) {
    error.value = `「${file.name}」超过 ${MAX_MB}MB`;
  } else {
    files.value = [...files.value, file as File];
  }
  return false;
};

function removeFile(file: { uid: string }) {
  const index = Number(file.uid.split('-')[0]);
  files.value = files.value.filter((_, i) => i !== index);
}

let timer: ReturnType<typeof setTimeout> | undefined;
let runSeq = 0;
onBeforeUnmount(() => {
  clearTimeout(timer);
  runSeq++;
});

async function run() {
  error.value = '';
  if (!props.factoryId) {
    error.value = '请先选择工厂';
    return;
  }
  if (files.value.length === 0 && !text.value.trim()) {
    error.value = '请上传附件，或把需求文字粘贴进来';
    return;
  }
  const mine = ++runSeq;
  running.value = true;
  fill.value = undefined;
  try {
    const id = await submitDemandFill({
      factoryId: props.factoryId,
      files: files.value,
      prompt: promptChanged.value ? prompt.value.trim() : undefined,
      text: text.value.trim() || undefined,
    });
    await poll(id, mine);
  } catch {
    if (mine === runSeq) running.value = false;
  }
}

async function poll(id: number, mine: number) {
  if (mine !== runSeq) return;
  let result: Api.Fill;
  try {
    result = await getDemandFill(id);
  } catch {
    if (mine === runSeq) running.value = false;
    return;
  }
  if (mine !== runSeq) return;
  fill.value = result;
  if (result.status === 'GENERATING') {
    timer = setTimeout(() => void poll(id, mine), 2500);
    return;
  }
  running.value = false;
  if (result.status === 'DONE' && result.result) emit('filled', result.result);
}

/** 弹窗重新打开时清空。 */
function reset() {
  clearTimeout(timer);
  runSeq++;
  files.value = [];
  text.value = '';
  prompt.value = defaultPrompt.value;
  showPrompt.value = false;
  running.value = false;
  error.value = '';
  fill.value = undefined;
}

defineExpose({ reset });
</script>

<template>
  <section class="flex flex-col gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 p-3">
    <h3 class="m-0 text-sm font-semibold">
      AI 识别<span class="ml-2 text-xs font-normal text-muted-foreground">上传客户订单、Excel、截图，或粘贴聊天文字，AI 帮你填到下面，核对后再提交</span>
    </h3>
    <Upload.Dragger
      :accept="ACCEPT"
      :before-upload="beforeUpload"
      :file-list="fileList"
      :multiple="true"
      @remove="removeFile"
    >
      <p class="m-0 py-1 text-xs text-muted-foreground">
        点击或拖进来（最多 {{ MAX_FILES }} 个，每个不超过 {{ MAX_MB }}MB；Excel、Word、PDF、图片、文本）
      </p>
    </Upload.Dragger>
    <Input.TextArea
      id="po-ai-text"
      v-model:value="text"
      :auto-size="{ minRows: 2, maxRows: 6 }"
      :maxlength="20000"
      placeholder="选填：粘贴客户发来的文字，例如「183*61*0.6 米白 500 条，月底要」"
    />
    <div class="flex flex-wrap items-center gap-2">
      <Button :disabled="!factoryId" :loading="running" type="primary" @click="run">
        {{ running ? 'AI 识别中…' : 'AI 识别并回填' }}
      </Button>
      <button class="text-xs text-primary hover:underline" type="button" @click="showPrompt = !showPrompt">
        {{ showPrompt ? '收起提示词' : '查看 / 修改提示词' }}{{ promptChanged ? '（已改）' : '' }}
      </button>
      <span v-if="!factoryId" class="text-xs text-muted-foreground">先选工厂</span>
    </div>
    <div v-if="showPrompt" class="flex flex-col gap-1">
      <Input.TextArea
        id="po-ai-prompt"
        v-model:value="prompt"
        :auto-size="{ minRows: 4, maxRows: 12 }"
        :maxlength="4000"
      />
      <span class="flex items-center gap-3 text-xs text-muted-foreground">
        只对这一次生效；要改默认的，请在「工厂设置」里改。
        <button v-if="promptChanged" class="text-primary hover:underline" type="button" @click="prompt = defaultPrompt">
          恢复默认
        </button>
      </span>
    </div>
    <p v-if="error" class="m-0 text-xs text-destructive">{{ error }}</p>
    <Alert v-if="fill?.status === 'FAILED'" :message="fill.errorMessage || 'AI 识别失败，请重试'" show-icon type="error" />
    <Alert
      v-if="problemFiles.length > 0"
      :message="problemFiles.map((f) => `「${f.name}」${f.note || (f.status === 'SKIPPED' ? '没有读取' : '只读了一部分')}`).join('；')"
      show-icon
      type="warning"
    />
  </section>
</template>
