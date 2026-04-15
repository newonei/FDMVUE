<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import { computed, reactive, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { DICT_TYPE } from '@vben/constants';
import { getDictOptions } from '@vben/hooks';

import {
  Button,
  Form,
  FormItem,
  Image,
  Popover,
  Input,
  Select,
  message,
  Spin,
  Table,
} from 'ant-design-vue';

import {
  getYogaBlankOptions,
  importFinished,
  previewFinished,
  type PatternPreviewResp,
  type YogaBlankOptions,
} from '#/api/fdmdata/datajustsku';
import {
  getDataJustPatternCostPage,
  type FdmdataDataJustPatternApi,
} from '#/api/fdmdata/datajustpattern';

const emit = defineEmits(['success']);

const formRef = ref();
const patternCostLoading = ref(false);
const patternCostList = ref<FdmdataDataJustPatternApi.PatternCost[]>([]);
const patternKeyword = ref('');

const loadingPreview = ref(false);
const generating = ref(false);
const preview = ref<PatternPreviewResp | null>(null);

/** 与空白版弹窗同源：长/宽/厚字典选项 */
const blankOptions = ref<YogaBlankOptions | null>(null);
const sizeLengths = ref<string[]>([]);
const sizeWidths = ref<string[]>([]);
const sizeThicknesses = ref<string[]>([]);

type SizeTemplate = {
  name: string;
  lengths: string[];
  widths: string[];
  thicknesses: string[];
  updatedAt: number;
};

const SIZE_TEMPLATE_STORAGE_KEY = 'fdm:sizeTemplates:v1';
const sizeTemplates = ref<SizeTemplate[]>([]);
const selectedSizeTemplateName = ref<string | undefined>(undefined);
const newTemplateName = ref('');

function loadSizeTemplatesFromLocal() {
  try {
    const raw = localStorage.getItem(SIZE_TEMPLATE_STORAGE_KEY);
    if (!raw) {
      sizeTemplates.value = [];
      return;
    }
    const parsed = JSON.parse(raw);
    const list = Array.isArray(parsed) ? parsed : [];
    sizeTemplates.value = list
      .filter((x) => x && typeof x.name === 'string')
      .map((x) => ({
        name: String(x.name),
        lengths: Array.isArray(x.lengths) ? x.lengths.map(String) : [],
        widths: Array.isArray(x.widths) ? x.widths.map(String) : [],
        thicknesses: Array.isArray(x.thicknesses) ? x.thicknesses.map(String) : [],
        updatedAt: typeof x.updatedAt === 'number' ? x.updatedAt : Date.now(),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  } catch {
    sizeTemplates.value = [];
  }
}

function persistSizeTemplatesToLocal() {
  localStorage.setItem(SIZE_TEMPLATE_STORAGE_KEY, JSON.stringify(sizeTemplates.value));
}

const sizeTemplateOptions = computed(() =>
  sizeTemplates.value.map((t) => ({
    label: t.name,
    value: t.name,
  })),
);

function applySizeTemplateByName(name?: string) {
  const n = (name ?? '').trim();
  if (!n) return;
  const tpl = sizeTemplates.value.find((t) => t.name === n);
  if (!tpl) return;
  sizeLengths.value = [...tpl.lengths];
  sizeWidths.value = [...tpl.widths];
  sizeThicknesses.value = [...tpl.thicknesses];
}

function saveCurrentSizeAsTemplate() {
  const name = newTemplateName.value.trim();
  if (!name) {
    message.warning('请输入模板名称');
    return;
  }
  if (!sizeLengths.value.length || !sizeWidths.value.length || !sizeThicknesses.value.length) {
    message.warning('请先为长、宽、厚各至少选择一项，再保存模板');
    return;
  }
  const now = Date.now();
  const existingIndex = sizeTemplates.value.findIndex((t) => t.name === name);
  const next: SizeTemplate = {
    name,
    lengths: [...sizeLengths.value],
    widths: [...sizeWidths.value],
    thicknesses: [...sizeThicknesses.value],
    updatedAt: now,
  };
  if (existingIndex >= 0) {
    sizeTemplates.value.splice(existingIndex, 1, next);
  } else {
    sizeTemplates.value.unshift(next);
  }
  // 重新按更新时间排序
  sizeTemplates.value = [...sizeTemplates.value].sort((a, b) => b.updatedAt - a.updatedAt);
  persistSizeTemplatesToLocal();
  selectedSizeTemplateName.value = name;
  message.success('尺寸模板已保存到本地');
}

function deleteSelectedTemplate() {
  const name = (selectedSizeTemplateName.value ?? '').trim();
  if (!name) {
    message.warning('请先选择一个模板');
    return;
  }
  const idx = sizeTemplates.value.findIndex((t) => t.name === name);
  if (idx < 0) {
    message.warning('模板不存在');
    return;
  }
  sizeTemplates.value.splice(idx, 1);
  persistSizeTemplatesToLocal();
  selectedSizeTemplateName.value = undefined;
  message.success('已删除本地模板');
}

const formState = reactive({
  productType: '',
  category: '',
  patternCostId: undefined as number | undefined,
  colors: [] as string[],
});

const typeOptions = computed(() => getDictOptions(DICT_TYPE.YOGA_MAT, 'string'));
const categoryOptions = computed(() =>
  getDictOptions(DICT_TYPE.FDM_YOGA_CATEGORY, 'string'),
);
const colorOptions = computed(() => getDictOptions(DICT_TYPE.FDM_COLOR, 'string'));

const previewList = computed(() => preview.value?.rows ?? []);
const willCreate = computed(() => preview.value?.willCreate ?? 0);
const willSkip = computed(() => preview.value?.willSkip ?? 0);

const selectedPatternCost = computed(() => {
  const id = formState.patternCostId;
  if (id == null) return null;
  return patternCostList.value.find((p) => p.id === id) ?? null;
});

/** 长×宽×厚 笛卡尔积 → 与空白版相同的每行「长*宽*厚cm」文本块 */
function buildSizeTextBlock(): string {
  const numSort = (a: string, b: string) => Number(a) - Number(b);
  const lens = [...sizeLengths.value].sort(numSort);
  const wids = [...sizeWidths.value].sort(numSort);
  const thks = [...sizeThicknesses.value].sort(numSort);
  const lines: string[] = [];
  for (const len of lens) {
    for (const wid of wids) {
      for (const thk of thks) {
        lines.push(`${len}*${wid}*${thk}cm`);
      }
    }
  }
  return lines.join('\n');
}

const sizeComboCount = computed(() => {
  const a = sizeLengths.value.length;
  const b = sizeWidths.value.length;
  const c = sizeThicknesses.value.length;
  if (!a || !b || !c) return 0;
  return a * b * c;
});

const sizeLengthSelectOptions = computed(() =>
  (blankOptions.value?.sizeLengths ?? []).map((x) => ({
    label: x.label,
    value: x.key,
  })),
);
const sizeWidthSelectOptions = computed(() =>
  (blankOptions.value?.sizeWidths ?? []).map((x) => ({
    label: x.label,
    value: x.key,
  })),
);
const sizeThicknessSelectOptions = computed(() =>
  (blankOptions.value?.sizeThicknesses ?? []).map((x) => ({
    label: x.label,
    value: x.key,
  })),
);

const popoverLeaveDelay = 0.35;

const columns: ColumnsType = [
  { title: '成品类型', dataIndex: 'type', key: 'type', width: 100 },
  { title: '分类', dataIndex: 'categoryName', key: 'categoryName', width: 100 },
  { title: '颜色', dataIndex: 'colorLabel', key: 'color', width: 88 },
  { title: '规格', dataIndex: 'sizeText', key: 'sizeText', width: 130 },
  { title: '款式编码', dataIndex: 'styleCode', key: 'styleCode', width: 200 },
  { title: '商品名称', dataIndex: 'productName', key: 'productName', width: 260 },
  { title: '商品编码', dataIndex: 'itemCode', key: 'itemCode', width: 200 },
  { title: '图片', key: 'pic', width: 90 },
];

/** 与图案编码生成弹窗同源：/fdmdata/data-just-pattern-cost/page */
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

function onPatternSearch(val: string) {
  patternKeyword.value = val;
  loadPatternCostList(val);
}

function onPatternDropdownOpen(open: boolean) {
  if (open) {
    loadPatternCostList(patternKeyword.value);
  }
}

const [VbenModal, modalApi] = useVbenModal({
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      preview.value = null;
      formState.productType = '';
      formState.category = '';
      formState.patternCostId = undefined;
      formState.colors = [];
      patternCostList.value = [];
      patternKeyword.value = '';
      blankOptions.value = null;
      sizeLengths.value = [];
      sizeWidths.value = [];
      sizeThicknesses.value = [];
      selectedSizeTemplateName.value = undefined;
      newTemplateName.value = '';
      return;
    }
    modalApi.lock();
    try {
      loadSizeTemplatesFromLocal();
      const [, opts] = await Promise.all([
        loadPatternCostList(),
        getYogaBlankOptions(),
      ]);
      blankOptions.value = opts;
    } finally {
      modalApi.unlock();
    }
  },
});

async function loadPreview() {
  if (
    !sizeLengths.value.length ||
    !sizeWidths.value.length ||
    !sizeThicknesses.value.length
  ) {
    message.warning('请为长、宽、厚各至少选择一项');
    return;
  }
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  const sizeTextBlock = buildSizeTextBlock();
  loadingPreview.value = true;
  try {
    preview.value = await previewFinished({
      productType: formState.productType,
      category: formState.category,
      sizeTextBlock,
      patternCostId: formState.patternCostId!,
      colors: formState.colors,
    });
  } finally {
    loadingPreview.value = false;
  }
}

async function handleGenerate() {
  if (willCreate.value === 0) {
    message.warning('没有可入库的新增行，请先预览');
    return;
  }
  if (
    !sizeLengths.value.length ||
    !sizeWidths.value.length ||
    !sizeThicknesses.value.length
  ) {
    message.warning('请为长、宽、厚各至少选择一项');
    return;
  }
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  const sizeTextBlock = buildSizeTextBlock();
  generating.value = true;
  try {
    const res = await importFinished({
      productType: formState.productType,
      category: formState.category,
      sizeTextBlock,
      patternCostId: formState.patternCostId!,
      colors: formState.colors,
    });
    message.success(`已入库 ${res.created} 条，跳过 ${res.skipped} 条`);
    emit('success');
    modalApi.close();
  } finally {
    generating.value = false;
  }
}
</script>

<template>
  <VbenModal
    title="成品编码生成（预览）"
    class="w-[min(1100px,calc(100vw-2rem))]"
    :show-cancel-button="false"
    :show-confirm-button="false"
  >
    <p class="mb-3 text-sm text-muted-foreground">
      图案与<strong>图案编码生成</strong>弹窗一致，来自接口
      <code class="rounded bg-muted px-1">GET /fdmdata/data-just-pattern-cost/page</code>
     （已维护的图案对照）。成品类型 <code class="rounded bg-muted px-1">YogaMat</code>；分类
      <code class="rounded bg-muted px-1">fdm_yoga_category</code>（飞德慕成品分类，与成品类型独立）；尺寸与<strong>空白版生成</strong>相同：长/宽/厚三列多选（字典
      <code class="rounded bg-muted px-1">fdm_yoga_blank_size_length</code>等），笛卡尔积生成规格；颜色
      <code class="rounded bg-muted px-1">fdm_color</code>。
    </p>

    <Form ref="formRef" :model="formState" layout="vertical">
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <FormItem
          label="成品类型"
          name="productType"
          :rules="[{ required: true, message: '请选择成品类型' }]"
        >
          <Select
            v-model:value="formState.productType"
            allow-clear
            placeholder="请选择（字典 YogaMat）"
            :options="typeOptions"
            show-search
            option-filter-prop="label"
          />
        </FormItem>

        <FormItem
          label="图案（已维护）"
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
            placeholder="请选择已维护的图案（可搜索）"
            show-search
            option-filter-prop="label"
            :filter-option="false"
            @search="onPatternSearch"
            @dropdown-visible-change="onPatternDropdownOpen"
          />
        </FormItem>

        <FormItem
          label="分类"
          name="category"
          class="md:col-span-2"
          :rules="[{ required: true, message: '请选择成品分类' }]"
        >
          <Select
            v-model:value="formState.category"
            allow-clear
            placeholder="请选择（字典 fdm_yoga_category）"
            :options="categoryOptions"
            show-search
            option-filter-prop="label"
          />
        </FormItem>
      </div>

      <div v-if="selectedPatternCost?.picUrl" class="mb-3 flex items-center gap-2">
        <span class="text-sm text-muted-foreground">图案预览</span>
        <Image
          :src="selectedPatternCost.picUrl"
          :width="48"
          :height="48"
          class="rounded object-cover"
        />
      </div>

      <FormItem required>
        <template #label>
          <span class="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>尺寸（长、宽、厚多选）</span>
            <Popover
              trigger="hover"
              placement="topLeft"
              :mouse-leave-delay="popoverLeaveDelay"
              overlay-class-name="yoga-blank-help-popover"
            >
              <template #content>
                <div
                  class="max-h-[min(360px,50vh)] max-w-[min(100vw-48px,480px)] space-y-2 overflow-auto text-sm leading-relaxed"
                >
                  <p class="mb-0 text-foreground/90">
                    与空白版弹窗一致：选项来自
                    <code class="rounded bg-muted px-1 font-mono text-xs">fdm_yoga_blank_size_length</code>
                    /
                    <code class="rounded bg-muted px-1 font-mono text-xs">fdm_yoga_blank_size_width</code>
                    /
                    <code class="rounded bg-muted px-1 font-mono text-xs">fdm_yoga_blank_size_thickness</code>
                    ，所选数值做长×宽×厚全部组合，每行格式
                    <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">长*宽*厚cm</code>。
                  </p>
                </div>
              </template>
              <button
                type="button"
                class="cursor-help border-0 bg-transparent p-0 text-xs text-primary underline-offset-2 hover:underline"
              >
                尺寸说明
              </button>
            </Popover>
          </span>
        </template>
        <div class="space-y-3">
          <div class="flex flex-wrap items-end gap-2">
            <div class="min-w-[220px] flex-1">
              <div class="mb-1 text-xs text-muted-foreground">尺寸模板（本地）</div>
              <Select
                v-model:value="selectedSizeTemplateName"
                :options="sizeTemplateOptions"
                allow-clear
                show-search
                option-filter-prop="label"
                placeholder="选择模板后自动回填长/宽/厚"
                @change="(v: any) => applySizeTemplateByName(v as any)"
              />
            </div>
            <div class="min-w-[200px] flex-1">
              <div class="mb-1 text-xs text-muted-foreground">模板名称</div>
              <Input v-model:value="newTemplateName" allow-clear placeholder="例如：常用-185/61/0.6" />
            </div>
            <Button @click="saveCurrentSizeAsTemplate">保存模板</Button>
            <Button danger :disabled="!selectedSizeTemplateName" @click="deleteSelectedTemplate">
              删除模板
            </Button>
          </div>

          <p v-if="sizeComboCount > 0" class="mb-0 text-xs text-muted-foreground">
            将生成 {{ sizeComboCount }} 种尺寸组合（所选长、宽、厚笛卡尔积）
          </p>
          <div class="grid gap-3 sm:grid-cols-3">
            <div>
              <div class="mb-1.5 text-sm leading-none text-foreground">长（cm）</div>
              <Select
                v-model:value="sizeLengths"
                mode="multiple"
                :options="sizeLengthSelectOptions"
                placeholder="多选长度"
                allow-clear
                class="w-full"
              />
            </div>
            <div>
              <div class="mb-1.5 text-sm leading-none text-foreground">宽（cm）</div>
              <Select
                v-model:value="sizeWidths"
                mode="multiple"
                :options="sizeWidthSelectOptions"
                placeholder="多选宽度"
                allow-clear
                class="w-full"
              />
            </div>
            <div>
              <div class="mb-1.5 text-sm leading-none text-foreground">厚（cm）</div>
              <Select
                v-model:value="sizeThicknesses"
                mode="multiple"
                :options="sizeThicknessSelectOptions"
                placeholder="多选厚度"
                allow-clear
                class="w-full"
              />
            </div>
          </div>
        </div>
      </FormItem>

      <FormItem
        label="颜色"
        name="colors"
        :rules="[
          {
            type: 'array',
            required: true,
            min: 1,
            message: '请至少选择一种颜色',
          },
        ]"
      >
        <Select
          v-model:value="formState.colors"
          mode="multiple"
          allow-clear
          placeholder="可多选（字典 fdm_color）"
          :options="colorOptions"
          show-search
          option-filter-prop="label"
        />
      </FormItem>
    </Form>

    <Spin :spinning="loadingPreview">
      <div
        v-if="preview"
        class="mb-3 mt-1 flex flex-wrap items-center gap-2 text-sm text-foreground/80"
      >
        <span>将新增 {{ willCreate }} 条</span>
        <span class="text-muted-foreground">|</span>
        <span>将跳过 {{ willSkip }} 条（已存在商品编码）</span>
      </div>

      <Table
        v-if="previewList.length > 0"
        class="mt-2"
        size="small"
        :columns="columns"
        :data-source="previewList"
        :pagination="false"
        :scroll="{ x: 1100, y: 360 }"
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
      <Button :loading="loadingPreview" @click="loadPreview">预览</Button>
      <Button type="primary" :loading="generating" :disabled="willCreate === 0" @click="handleGenerate">
        确认生成
      </Button>
      <Button @click="modalApi.close()">关闭</Button>
    </div>
  </VbenModal>
</template>
