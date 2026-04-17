<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import { computed, reactive, ref, watch } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { Button, Form, FormItem, Image, Input, Select, message, Spin, Table } from 'ant-design-vue';

import type { PatternGenReq, PatternPreviewResp, PatternOptions } from '#/api/fdmdata/datajustsku';

import {
  getPatternEncodeOptions,
  importPatternEncode,
  previewPatternEncode,
} from '#/api/fdmdata/datajustpattern';

import {
  getDataJustPatternCostPage,
  type FdmdataDataJustPatternApi,
} from '#/api/fdmdata/datajustpattern';

import ImageUpload from '#/components/upload/image-upload.vue';

const emit = defineEmits(['success']);

const loadingPreview = ref(false);
const generating = ref(false);
const preview = ref<PatternPreviewResp | null>(null);

const formRef = ref();
const formState = reactive<PatternGenReq & { patternCostId?: number }>({
  type: '',
  patternName: '',
  itemCodeAbbr: '',
  picUrl: undefined,
  sizeTextBlock: '',
  patternCostId: undefined,
});

const optionsLoading = ref(false);
const options = ref<PatternOptions | null>(null);
const selectedLengths = ref<string[]>([]);
const selectedWidths = ref<string[]>([]);

const patternCostLoading = ref(false);
const patternCostList = ref<FdmdataDataJustPatternApi.PatternCost[]>([]);
// 选择的图案 ID 写入 formState.patternCostId，便于表单校验
const patternKeyword = ref('');

const columns: ColumnsType = [
  { title: '类型', dataIndex: 'type', key: 'type', width: 120 },
  { title: '尺寸', dataIndex: 'sizeText', key: 'sizeText', width: 140 },
  { title: '款式编码', dataIndex: 'styleCode', key: 'styleCode', width: 200 },
  { title: '商品名称', dataIndex: 'productName', key: 'productName', width: 260 },
  { title: '分类', dataIndex: 'categoryName', key: 'categoryName', width: 100 },
  { title: '商品编码', dataIndex: 'itemCode', key: 'itemCode', width: 140 },
  { title: '图片', key: 'pic', width: 90 },
];

const previewList = computed(() => preview.value?.rows ?? []);
const willCreate = computed(() => preview.value?.willCreate ?? 0);
const willSkip = computed(() => preview.value?.willSkip ?? 0);

function normalizeItemCodeAbbr(raw: string) {
  return (raw ?? '').trim().toUpperCase();
}

function syncPatternFromSelectedId() {
  const id = formState.patternCostId;
  const row = patternCostList.value.find((r) => r.id === id);
  formState.patternName = row?.patternName ?? '';
  formState.itemCodeAbbr = row?.itemCode ?? '';
  formState.picUrl = row?.picUrl;
}

function buildSizeTextBlockFromSelections() {
  const lens = selectedLengths.value ?? [];
  const wids = selectedWidths.value ?? [];
  if (!lens.length || !wids.length) {
    return '';
  }
  const lines: string[] = [];
  for (const l of lens) {
    for (const w of wids) {
      const lText = (l ?? '').trim();
      const wText = (w ?? '').trim();
      if (!lText || !wText) continue;
      // 尺寸展示：185*61cm（如果字典值本身带 cm，则不重复追加）
      const hasCm = /cm$/i.test(lText) || /cm$/i.test(wText);
      lines.push(`${lText}*${wText}${hasCm ? '' : 'cm'}`);
    }
  }
  return Array.from(new Set(lines)).join('\n');
}

watch([selectedLengths, selectedWidths], () => {
  formState.sizeTextBlock = buildSizeTextBlockFromSelections();
});

watch(
  () => formState.patternCostId,
  () => {
  syncPatternFromSelectedId();
  },
);

async function loadOptions() {
  optionsLoading.value = true;
  try {
    options.value = await getPatternEncodeOptions();
  } finally {
    optionsLoading.value = false;
  }
}

async function loadPatternCostList(keyword?: string) {
  patternCostLoading.value = true;
  try {
    const kw = (keyword ?? '').trim();
    const page = await getDataJustPatternCostPage({
      pageNo: 1,
      pageSize: 20,
      itemCode: kw || undefined,
      patternName: kw || undefined,
    });
    patternCostList.value = page?.list ?? [];
  } finally {
    patternCostLoading.value = false;
  }
}

async function loadPreview() {
  await formRef.value?.validate?.();
  loadingPreview.value = true;
  try {
    const payload: PatternGenReq = {
      type: (formState.type ?? '').trim(),
      patternName: (formState.patternName ?? '').trim(),
      itemCodeAbbr: normalizeItemCodeAbbr(formState.itemCodeAbbr),
      picUrl: formState.picUrl,
      sizeTextBlock: (formState.sizeTextBlock ?? '').trim(),
    };
    preview.value = await previewPatternEncode(payload);
  } finally {
    loadingPreview.value = false;
  }
}

async function handleGenerate() {
  if (!willCreate.value) {
    message.info('没有可生成的图案商品');
    return;
  }
  generating.value = true;
  const hide = message.loading({ content: '正在生成图案商品…', duration: 0 });
  try {
    await formRef.value?.validate?.();
    const payload: PatternGenReq = {
      type: (formState.type ?? '').trim(),
      patternName: (formState.patternName ?? '').trim(),
      itemCodeAbbr: normalizeItemCodeAbbr(formState.itemCodeAbbr),
      picUrl: formState.picUrl,
      sizeTextBlock: (formState.sizeTextBlock ?? '').trim(),
    };
    const res = await importPatternEncode(payload);
    message.success(`生成完成：新增 ${res?.created ?? 0} 条，跳过 ${res?.skipped ?? 0} 条`);
    emit('success');
    await loadPreview();
  } finally {
    hide();
    generating.value = false;
  }
}

const [VbenModal, modalApi] = useVbenModal({
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      preview.value = null;
      return;
    }
    // 打开时不自动预览：先填写表单
    preview.value = null;
    selectedLengths.value = [];
    selectedWidths.value = [];
    formState.patternCostId = undefined;
    patternCostList.value = [];
    patternKeyword.value = '';
    formState.sizeTextBlock = '';
    formState.patternName = '';
    formState.itemCodeAbbr = '';
    formState.picUrl = undefined;
    await loadOptions();
    await loadPatternCostList();
  },
});
</script>

<template>
  <VbenModal
    title="图案编码生成（预览）"
    class="w-[min(1200px,calc(100vw-2rem))]"
    :show-cancel-button="false"
    :show-confirm-button="false"
  >
    <Form ref="formRef" :model="formState" layout="vertical">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FormItem
          label="类型"
          name="type"
          :rules="[{ required: true, message: '请选择/填写类型' }]"
        >
          <Select
            v-model:value="formState.type"
            :loading="optionsLoading"
            :options="(options?.types ?? []).map((o) => ({ value: o.key, label: o.label }))"
            placeholder="请选择类型"
            show-search
            option-filter-prop="label"
          />
        </FormItem>

        <FormItem
          label="图案"
          name="patternCostId"
          :rules="[{ required: true, message: '请选择图案' }]"
        >
          <Select
            v-model:value="formState.patternCostId"
            :loading="patternCostLoading"
            :options="
              patternCostList.map((p) => ({
                value: p.id,
                label: `${p.patternName}（${p.itemCode}）`,
              }))
            "
            placeholder="请选择已维护的图案（图案名称/对照编码）"
            show-search
            option-filter-prop="label"
            :filter-option="false"
            @search="(val: string) => { patternKeyword.value = val; loadPatternCostList(val); }"
            @dropdownVisibleChange="(open: boolean) => { if (open) loadPatternCostList(patternKeyword.value); }"
          />
        </FormItem>

        <FormItem
          label="对照编码"
        >
          <Input :value="formState.itemCodeAbbr" disabled placeholder="选择图案后自动带出" />
        </FormItem>

        <FormItem label="图片" name="picUrl">
          <div class="flex items-center gap-2">
            <Image
              v-if="formState.picUrl"
              :src="formState.picUrl"
              :width="48"
              :height="48"
              class="rounded object-cover"
            />
            <span v-else class="text-muted-foreground">选择图案后自动带出</span>
          </div>
        </FormItem>
      </div>

      <FormItem
        label="尺寸"
        name="sizeTextBlock"
        :rules="[{ required: true, message: '请选择长度和宽度' }]"
      >
        <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <div class="mb-1 text-sm text-foreground/80">长度</div>
            <Select
              v-model:value="selectedLengths"
              mode="multiple"
              :loading="optionsLoading"
              :options="(options?.sizeLengths ?? []).map((o) => ({ value: o.key, label: o.label }))"
              placeholder="请选择长度（可多选）"
              show-search
              option-filter-prop="label"
            />
          </div>
          <div>
            <div class="mb-1 text-sm text-foreground/80">宽度</div>
            <Select
              v-model:value="selectedWidths"
              mode="multiple"
              :loading="optionsLoading"
              :options="(options?.sizeWidths ?? []).map((o) => ({ value: o.key, label: o.label }))"
              placeholder="请选择宽度（可多选）"
              show-search
              option-filter-prop="label"
            />
          </div>
        </div>
        <!-- 用于表单校验与提交：由长度/宽度选择自动生成 -->
        <Input v-model:value="formState.sizeTextBlock" class="hidden" />
        <div class="mt-2 text-xs text-muted-foreground">
          将按「长度×宽度」自动组合生成多条尺寸（每行一条），用于预览与入库。
        </div>
      </FormItem>
    </Form>

    <Spin :spinning="loadingPreview">
      <div
        v-if="preview"
        class="mb-3 mt-3 flex flex-wrap items-center gap-2 text-sm text-foreground/80"
      >
        <span>将新增 {{ willCreate }} 条</span>
        <span class="text-muted-foreground">|</span>
        <span>将跳过 {{ willSkip }} 条</span>
      </div>

      <Table
        v-if="previewList.length > 0"
        class="mt-2"
        size="small"
        :columns="columns"
        :data-source="previewList"
        :pagination="false"
        :scroll="{ x: 980, y: 360 }"
        row-key="itemCode"
        bordered
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'pic'">
            <Image
              v-if="record.picUrl"
              :src="record.picUrl"
              :width="48"
              :height="48"
              class="rounded object-cover"
            />
            <span v-else class="text-muted-foreground">-</span>
          </template>
        </template>
      </Table>
    </Spin>

    <div class="mt-4 flex justify-end gap-2 border-t border-border pt-3">
      <Button :loading="loadingPreview" @click="loadPreview">重新预览</Button>
      <Button type="primary" :loading="generating" :disabled="willCreate === 0" @click="handleGenerate">
        确认生成
      </Button>
      <Button @click="modalApi.close()">关闭</Button>
    </div>
  </VbenModal>
</template>

