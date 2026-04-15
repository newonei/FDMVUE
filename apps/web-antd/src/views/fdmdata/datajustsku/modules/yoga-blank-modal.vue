<script lang="ts" setup>
import type {
  YogaBlankGenReq,
  YogaBlankOptions,
  YogaBlankPreviewResp,
} from '#/api/fdmdata/datajustsku';

import { computed, reactive, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import {
  Button,
  Form,
  FormItem,
  message,
  Popover,
  Input,
  Select,
  Table,
} from 'ant-design-vue';

import {
  getYogaBlankOptions,
  importYogaBlank,
  previewYogaBlank,
} from '#/api/fdmdata/datajustsku';

/** 颜色缩写：来自 options 接口（字典 fdm_color 的 value 大写），不写死 */
function colorAbbr(row: { abbr?: string; code?: string }) {
  return row.abbr ?? row.code ?? '';
}

const emit = defineEmits(['success']);

const options = ref<YogaBlankOptions | null>(null);
const preview = ref<YogaBlankPreviewResp | null>(null);
const loadingPreview = ref(false);
const loadingImport = ref(false);

const form = reactive<YogaBlankGenReq>({
  materialKey: '',
  sizeTextBlock: '',
  colors: [],
  productType: '',
});

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

// 与「成品编码生成（预览）」弹窗一致：本地尺寸模板（长/宽/厚三列多选）
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

/** 长×宽×厚 笛卡尔积，生成与原先「每行一条」相同的文本块（各维度按数值升序，顺序稳定） */
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
  if (!a || !b || !c) {
    return 0;
  }
  return a * b * c;
});

/** 材质来自后端接口（后端读字典 material_type），与生成逻辑一致 */
const materialRows = computed(() => options.value?.materials ?? []);

/** 空白版类型来自后端接口（后端读字典 BlankYogaMat），与生成逻辑一致 */
const productTypeRows = computed(() => options.value?.productTypes ?? []);

/** 长/宽/厚多选：字典 fdm_yoga_blank_size_length | _width | _thickness */
const sizeLengthSelectOptions = computed(() =>
  (options.value?.sizeLengths ?? []).map((x) => ({
    label: x.label,
    value: x.key,
  })),
);
const sizeWidthSelectOptions = computed(() =>
  (options.value?.sizeWidths ?? []).map((x) => ({
    label: x.label,
    value: x.key,
  })),
);
const sizeThicknessSelectOptions = computed(() =>
  (options.value?.sizeThicknesses ?? []).map((x) => ({
    label: x.label,
    value: x.key,
  })),
);

const materialSelectOptions = computed(() =>
  materialRows.value.map((m) => ({
    label: m.abbr ? `${m.label}（${m.abbr}）` : m.label,
    value: m.key,
  })),
);

const typeSelectOptions = computed(() =>
  (options.value?.productTypes ?? []).map((t) => ({
    label: t.abbr ? `${t.label}（${t.abbr}）` : t.label,
    value: t.key,
  })),
);

const colorSelectOptions = computed(() =>
  (options.value?.colors ?? []).map((c) => {
    const abbr = colorAbbr(c);
    return {
      label: abbr ? `${c.label}（${abbr}）` : c.label,
      value: c.key,
    };
  }),
);

const tableRows = computed(() => {
  const rows = preview.value?.rows ?? [];
  return rows.map((r, index) => ({
    key: String(index),
    itemCode: r.data?.itemCode,
    styleCode: r.data?.styleCode,
    productName: r.data?.productName,
    colorSpec: r.data?.colorSpec,
    categoryName: r.data?.categoryName,
    costPrice: r.data?.costPrice,
    existsInDb: r.existsInDb,
    duplicateInPreview: r.duplicateInPreview,
    costMissing: r.costMissing,
  }));
});

const columns = [
  { title: '商品编码', dataIndex: 'itemCode', width: 200, ellipsis: true },
  { title: '款式编码', dataIndex: 'styleCode', width: 180, ellipsis: true },
  { title: '商品名称', dataIndex: 'productName', ellipsis: true },
  { title: '颜色及规格', dataIndex: 'colorSpec', width: 200, ellipsis: true },
  { title: '分类', dataIndex: 'categoryName', width: 120 },
  { title: '成本价', dataIndex: 'costPrice', width: 100 },
  {
    title: '状态',
    key: 'flags',
    width: 200,
    customRender: ({ record }: any) => {
      const parts: string[] = [];
      if (record.duplicateInPreview) {
        parts.push('批次重复');
      }
      if (record.existsInDb) {
        parts.push('库中已存在');
      }
      if (record.costMissing) {
        parts.push('未配成本');
      }
      return parts.length ? parts.join(' / ') : '可入库';
    },
  },
];

const canImport = computed(
  () =>
    !!preview.value &&
    (preview.value.insertableCount ?? 0) > 0 &&
    !loadingPreview.value,
);

async function handlePreview() {
  if (!form.materialKey || !form.productType) {
    message.warning('请选择飞德慕材质与空白版类型');
    return;
  }
  if (!sizeLengths.value.length || !sizeWidths.value.length || !sizeThicknesses.value.length) {
    message.warning('请为长、宽、厚各至少选择一项');
    return;
  }
  form.sizeTextBlock = buildSizeTextBlock();
  if (!form.colors?.length) {
    message.warning('请选择至少一种颜色');
    return;
  }
  loadingPreview.value = true;
  try {
    preview.value = await previewYogaBlank({ ...form });
    message.success(`已生成 ${preview.value.totalCount} 行，可入库 ${preview.value.insertableCount} 行`);
  } finally {
    loadingPreview.value = false;
  }
}

async function handleImport() {
  if (!canImport.value) {
    return;
  }
  form.sizeTextBlock = buildSizeTextBlock();
  loadingImport.value = true;
  try {
    const res = await importYogaBlank({ ...form });
    message.success(
      `入库完成：成功 ${res.inserted} 条；跳过已存在 ${res.skippedExists}；跳过批次重复 ${res.skippedDuplicate}`,
    );
    await modalApi.close();
    emit('success');
  } finally {
    loadingImport.value = false;
  }
}

function resetState() {
  preview.value = null;
  form.materialKey = '';
  form.sizeTextBlock = '';
  form.colors = [];
  form.productType = '';
  sizeLengths.value = [];
  sizeWidths.value = [];
  sizeThicknesses.value = [];
  selectedSizeTemplateName.value = undefined;
  newTemplateName.value = '';
}

/** 悬停说明：略延迟收起，便于移入浮层内滚动阅读 */
const popoverLeaveDelay = 0.35;

const [VbenModal, modalApi] = useVbenModal({
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      resetState();
      options.value = null;
      return;
    }
    modalApi.lock();
    try {
      options.value = await getYogaBlankOptions();
      loadSizeTemplatesFromLocal();
    } finally {
      modalApi.unlock();
    }
  },
});
</script>

<template>
  <VbenModal
    title="空白版瑜伽垫生成"
    class="w-[1160px] max-w-[calc(100vw-2rem)]"
    :show-cancel-button="false"
    :show-confirm-button="false"
  >
    <div class="max-h-[72vh] overflow-auto pr-1">
      <Form layout="vertical" class="mb-4">
        <FormItem required>
          <template #label>
            <span class="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>飞德慕材质</span>
              <Popover
                trigger="hover"
                placement="topLeft"
                :mouse-leave-delay="popoverLeaveDelay"
                overlay-class-name="yoga-blank-help-popover"
              >
                <template #content>
                  <div
                    class="max-h-[min(360px,50vh)] max-w-[min(100vw-48px,400px)] space-y-2 overflow-auto text-sm leading-relaxed"
                  >
                    <div class="font-medium text-foreground">
                      材质缩写（商品编码首段）
                    </div>
                    <p class="mb-0 text-xs text-foreground/90">
                      列表由后端读取字典
                      <code class="rounded bg-muted px-1 font-mono">material_type</code>
                      返回；提交时传字典「字典值」（与下拉一致），须为 3 位大写字母缩写；字典标签用于款式展示名。
                    </p>
                    <div
                      v-if="materialRows.length"
                      class="overflow-x-auto rounded border border-border"
                    >
                      <table class="w-full min-w-[260px] border-collapse text-left text-xs">
                        <thead>
                          <tr class="bg-muted/80">
                            <th class="border-b border-border px-2 py-1.5 font-medium">
                              飞德慕材质
                            </th>
                            <th class="border-b border-border px-2 py-1.5 font-medium">
                              材质缩写
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="row in materialRows" :key="row.key">
                            <td class="border-b border-border px-2 py-1.5">
                              {{ row.label }}
                            </td>
                            <td class="border-b border-border px-2 py-1.5 font-mono">
                              {{ row.abbr || '—' }}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p v-else class="mb-0 text-xs text-muted-foreground">
                      打开弹窗后将加载选项；若仍为空，请在系统管理维护字典 material_type。
                    </p>
                  </div>
                </template>
                <button
                  type="button"
                  class="cursor-help border-0 bg-transparent p-0 text-xs text-primary underline-offset-2 hover:underline"
                >
                  ⓘ 材质缩写对照
                </button>
              </Popover>
            </span>
          </template>
          <Select
            v-model:value="form.materialKey"
            :options="materialSelectOptions"
            placeholder="请选择飞德慕材质"
            allow-clear
            show-search
            option-filter-prop="label"
            class="w-full"
          />
        </FormItem>
        <FormItem required>
          <template #label>
            <span class="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>飞德慕空白版类型</span>
              <Popover
                trigger="hover"
                placement="topLeft"
                :mouse-leave-delay="popoverLeaveDelay"
                overlay-class-name="yoga-blank-help-popover"
              >
                <template #content>
                  <div
                    class="max-h-[min(360px,50vh)] max-w-[min(100vw-48px,400px)] space-y-2 overflow-auto text-sm leading-relaxed"
                  >
                    <div class="font-medium text-foreground">
                      类型编码（商品编码第二段）
                    </div>
                    <p class="mb-0 text-xs text-foreground/90">
                      列表由后端读取字典
                      <code class="rounded bg-muted px-1 font-mono">BlankYogaMat</code>
                      返回；提交时传字典「字典值」（与下拉一致），用于货号类型段；字典标签用于款式/品名/分类展示。
                    </p>
                    <div
                      v-if="productTypeRows.length"
                      class="overflow-x-auto rounded border border-border"
                    >
                      <table class="w-full min-w-[260px] border-collapse text-left text-xs">
                        <thead>
                          <tr class="bg-muted/80">
                            <th class="border-b border-border px-2 py-1.5 font-medium">
                              飞德慕空白版类型
                            </th>
                            <th class="border-b border-border px-2 py-1.5 font-medium">
                              类型编码
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="row in productTypeRows" :key="row.key">
                            <td class="border-b border-border px-2 py-1.5">
                              {{ row.label }}
                            </td>
                            <td class="border-b border-border px-2 py-1.5 font-mono">
                              {{ row.abbr || '—' }}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p v-else class="mb-0 text-xs text-muted-foreground">
                      打开弹窗后将加载选项；若仍为空，请在系统管理维护字典 BlankYogaMat。
                    </p>
                  </div>
                </template>
                <button
                  type="button"
                  class="cursor-help border-0 bg-transparent p-0 text-xs text-primary underline-offset-2 hover:underline"
                >
                  ⓘ 类型编码对照
                </button>
              </Popover>
            </span>
          </template>
          <Select
            v-model:value="form.productType"
            :options="typeSelectOptions"
            placeholder="请选择类型（字典 BlankYogaMat）"
            allow-clear
            show-search
            option-filter-prop="label"
            class="w-full"
          />
        </FormItem>
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
                    class="max-h-[min(420px,55vh)] max-w-[min(100vw-48px,520px)] space-y-2 overflow-auto text-sm leading-relaxed"
                  >
                    <div class="font-medium text-foreground">
                      商品编码中的尺寸段为固定 8 位数字
                    </div>
                    <p class="mb-0 text-foreground/90">
                      长、宽、厚选项来自字典
                      <code class="rounded bg-muted px-1 font-mono text-xs">fdm_yoga_blank_size_length</code>
                      /
                      <code class="rounded bg-muted px-1 font-mono text-xs">fdm_yoga_blank_size_width</code>
                      /
                      <code class="rounded bg-muted px-1 font-mono text-xs">fdm_yoga_blank_size_thickness</code>
                      。下方三个多选框所选数值会做
                      <span class="font-medium">长×宽×厚</span>
                      全部组合，每条组合对应一行，格式为
                      <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                        长*宽*厚cm
                      </code>
                      （如
                      <code class="font-mono text-xs">185*61*0.6cm</code>）。
                    </p>
                    <div class="overflow-x-auto rounded border border-border">
                      <table class="w-full min-w-[480px] border-collapse text-left text-xs">
                        <thead>
                          <tr class="bg-muted/80">
                            <th class="border-b border-border px-2 py-1.5 font-medium">
                              段位
                            </th>
                            <th class="border-b border-border px-2 py-1.5 font-medium">
                              含义
                            </th>
                            <th class="border-b border-border px-2 py-1.5 font-medium">
                              格式
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td class="border-b border-border px-2 py-1.5">前 3 位</td>
                            <td class="border-b border-border px-2 py-1.5">长度（cm）</td>
                            <td class="border-b border-border px-2 py-1.5">
                              整数，不足左补 0（如 185）
                            </td>
                          </tr>
                          <tr>
                            <td class="border-b border-border px-2 py-1.5">中 3 位</td>
                            <td class="border-b border-border px-2 py-1.5">宽度（cm）</td>
                            <td class="border-b border-border px-2 py-1.5">
                              整数，不足左补 0（如 061、090、100）
                            </td>
                          </tr>
                          <tr>
                            <td class="px-2 py-1.5">后 2 位</td>
                            <td class="px-2 py-1.5">厚度</td>
                            <td class="px-2 py-1.5">
                              厚度(cm)×10 后四舍五入取整，再格式化为 2 位（如 0.6→06，1→10）
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p class="mb-0 text-xs text-muted-foreground">
                      示例：<span class="font-mono text-foreground">185*61*0.6cm</span>
                      → <span class="font-mono text-foreground">18506106</span>；
                      <span class="font-mono text-foreground">185*90*1cm</span>
                      → <span class="font-mono text-foreground">18509010</span>；
                      <span class="font-mono text-foreground">195*100*1cm</span>
                      → <span class="font-mono text-foreground">19510010</span>
                    </p>
                  </div>
                </template>
                <button
                  type="button"
                  class="cursor-help border-0 bg-transparent p-0 text-xs text-primary underline-offset-2 hover:underline"
                >
                  ⓘ 尺寸编码规则
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

            <p
              v-if="sizeComboCount > 0"
              class="mb-0 text-xs text-muted-foreground"
            >
              将生成 {{ sizeComboCount }} 种尺寸组合（所选长、宽、厚笛卡尔积）
            </p>
            <div class="grid gap-3 sm:grid-cols-3">
              <div>
                <div class="mb-1.5 text-sm leading-none text-foreground">
                  长（cm）
                </div>
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
                <div class="mb-1.5 text-sm leading-none text-foreground">
                  宽（cm）
                </div>
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
                <div class="mb-1.5 text-sm leading-none text-foreground">
                  厚（cm）
                </div>
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
        <FormItem required>
          <template #label>
            <span class="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>颜色（多选）</span>
              <Popover
                trigger="hover"
                placement="topLeft"
                :mouse-leave-delay="popoverLeaveDelay"
                overlay-class-name="yoga-blank-help-popover"
              >
                <template #content>
                  <div
                    class="max-h-[min(360px,50vh)] max-w-[min(100vw-48px,360px)] space-y-2 overflow-auto text-sm leading-relaxed"
                  >
                    <div class="font-medium text-foreground">
                      商品编码中的颜色段为固定字母缩写
                    </div>
                    <p class="mb-0 text-foreground/90">
                      数据来自字典
                      <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">fdm_color</code>
                      ：标签为颜色名称，字典值为货号颜色段（须为 2 位字母，如 MB）。生成
                      <code class="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                        材质-类型-颜色-尺寸
                      </code>
                      时，颜色位置使用字典值对应的大写缩写。
                    </p>
                    <div
                      v-if="options?.colors?.length"
                      class="overflow-x-auto rounded border border-border"
                    >
                      <table class="w-full min-w-[260px] border-collapse text-left text-xs">
                        <thead>
                          <tr class="bg-muted/80">
                            <th class="border-b border-border px-2 py-1.5 font-medium">
                              颜色名称
                            </th>
                            <th class="border-b border-border px-2 py-1.5 font-medium">
                              编码缩写
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr v-for="row in options.colors" :key="row.key">
                            <td class="border-b border-border px-2 py-1.5">
                              {{ row.label }}
                            </td>
                            <td class="border-b border-border px-2 py-1.5 font-mono">
                              {{ colorAbbr(row) || '—' }}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <p v-else class="mb-0 text-xs text-muted-foreground">
                      打开弹窗加载选项后显示；若为空请在系统管理维护字典 fdm_color。
                    </p>
                  </div>
                </template>
                <button
                  type="button"
                  class="cursor-help border-0 bg-transparent p-0 text-xs text-primary underline-offset-2 hover:underline"
                >
                  ⓘ 颜色缩写对照
                </button>
              </Popover>
            </span>
          </template>
          <Select
            v-model:value="form.colors"
            mode="multiple"
            :options="colorSelectOptions"
            placeholder="请选择颜色（选项中括号内为编码缩写）"
            allow-clear
            class="w-full"
          />
        </FormItem>
      </Form>

      <div class="mb-3 flex flex-wrap gap-2">
        <Button type="primary" :loading="loadingPreview" @click="handlePreview">
          预览生成
        </Button>
        <Button @click="resetState">清空预览</Button>
      </div>

      <Table
        v-if="preview"
        size="small"
        :columns="columns"
        :data-source="tableRows"
        :pagination="false"
        :scroll="{ x: 1200 }"
        bordered
      />

      <div class="mt-4 flex justify-end gap-2 border-t border-border pt-3">
        <Button @click="modalApi.close()">关闭</Button>
        <Button
          type="primary"
          :disabled="!canImport"
          :loading="loadingImport"
          @click="handleImport"
        >
          确认入库
        </Button>
      </div>
    </div>
  </VbenModal>
</template>
