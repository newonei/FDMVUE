<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import { computed, reactive, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import {
  Button,
  Form,
  FormItem,
  Input,
  message,
  Select,
  Spin,
  Table,
} from 'ant-design-vue';

import { getDataJustPattern, getDataJustPatternPage } from '#/api/fdmdata/datajustpattern';
import {
  getDataJustSkuPage,
  importCustomCombo,
  previewCustomCombo,
  type CustomComboPreviewResp,
  type FdmdataDataJustSkuApi,
} from '#/api/fdmdata/datajustsku';
import type { FdmdataDataJustPatternApi } from '#/api/fdmdata/datajustpattern';

const emit = defineEmits(['success']);

const loadingOptions = ref(false);
const loadingBlanks = ref(false);
const loadingPreview = ref(false);
const generating = ref(false);
const preview = ref<CustomComboPreviewResp | null>(null);

const formState = reactive({
  /** 任选一条同系列图案 SKU，用于解析「图案名」并加载该系列全部尺寸 */
  patternFamilySeedId: undefined as number | undefined,
  qty: 1,
  salePrice: undefined as number | undefined,
});

const blankRows = ref<FdmdataDataJustSkuApi.DataJustSku[]>([]);
/** 打开弹窗时拉取的完整空白版列表（查询仅在本地筛选，避免重复请求） */
const blankSourceRows = ref<FdmdataDataJustSkuApi.DataJustSku[]>([]);
const blankSelectedIds = ref<number[]>([]);
/** 空白版列表筛选（商品名称仍模糊；款式、分类为下拉，值为精确匹配） */
const blankQuery = reactive({
  productName: '',
  styleCode: undefined as string | undefined,
  categoryName: undefined as string | undefined,
});
const blankStyleOptions = ref<{ label: string; value: string }[]>([]);
const blankCategoryOptions = ref<{ label: string; value: string }[]>([]);
const patternOptions = ref<{ label: string; value: number }[]>([]);
const patternGroupName = ref<string>('');
/** 当前图案系列下全部尺寸行 */
const patternVariantRows = ref<FdmdataDataJustPatternApi.Pattern[]>([]);
const selectedPatternSkuIds = ref<number[]>([]);
const loadingPatternVariants = ref(false);

const patternSizeKeys = computed(() => {
  const keys = new Set<string>();
  for (const id of selectedPatternSkuIds.value) {
    const row = patternVariantRows.value.find((r) => r.id === id);
    const k = extractSizeLWKey(row?.attr1);
    if (k) {
      keys.add(k);
    }
  }
  return [...keys].sort();
});
const patternSizeKeySet = computed(() => new Set(patternSizeKeys.value));

const patternVariantColumns: ColumnsType = [
  { title: '尺寸(attr1)', dataIndex: 'attr1', width: 160, ellipsis: true },
  {
    title: '匹配键(长*宽)',
    key: 'lw',
    width: 110,
    customRender: ({ record }: { record: FdmdataDataJustPatternApi.Pattern }) =>
      extractSizeLWKey(record?.attr1) || '-',
  },
  { title: '商品编码', dataIndex: 'itemCode', width: 180, ellipsis: true },
  { title: '商品名称', dataIndex: 'productName', width: 200, ellipsis: true },
];

function extractSizeLWKey(raw: string | undefined) {
  const s = (raw ?? '').trim();
  if (!s) {
    return '';
  }
  const m = /(\d+(?:\.\d+)?)\s*\*\s*(\d+(?:\.\d+)?)/.exec(s);
  if (!m) {
    return '';
  }
  return `${m[1]}*${m[2]}`;
}

/** 图案系列名（不含尺寸）：如 图案-儿童游戏-185*68cm → 儿童游戏 */
function resolvePatternGroupName(row: Partial<FdmdataDataJustPatternApi.Pattern> | null | undefined) {
  if (!row) {
    return '';
  }
  const style = (row.styleCode ?? '').trim();
  if (style.startsWith('图案-')) {
    const rest = style.slice('图案-'.length).trim();
    if (rest) {
      const first = rest.split('-')[0]?.trim() ?? '';
      if (first) {
        return first;
      }
      return rest;
    }
  }
  return ((row.productShortName ?? '').trim() || (row.productName ?? '').trim() || '');
}

function skuLabel(row: { itemCode?: string; productName?: string }) {
  const code = row.itemCode ?? '';
  const name = row.productName ?? '';
  return `${code}｜${name}`;
}

function selectAllBlanksInList() {
  blankSelectedIds.value = blankRows.value.map((r) => r.id);
}

function clearBlankSelection() {
  blankSelectedIds.value = [];
}

function trimOrUndef(s: string | undefined) {
  if (s == null || s === '') {
    return undefined;
  }
  const t = s.trim();
  return t ? t : undefined;
}

function rebuildBlankFilterOptionsFromSource() {
  const styles = new Set<string>();
  const cats = new Set<string>();
  for (const r of blankSourceRows.value) {
    const sc = (r.styleCode ?? '').trim();
    if (sc) {
      styles.add(sc);
    }
    const cn = (r.categoryName ?? '').trim();
    if (cn) {
      cats.add(cn);
    }
  }
  blankStyleOptions.value = [...styles].sort().map((v) => ({ label: v, value: v }));
  blankCategoryOptions.value = [...cats].sort().map((v) => ({ label: v, value: v }));
}

/** 按当前条件在本地筛选（商品名称包含；款式、分类与下拉值精确一致） */
function applyBlankQueryFilters() {
  let rows = blankSourceRows.value;
  const pn = trimOrUndef(blankQuery.productName);
  if (pn) {
    const low = pn.toLowerCase();
    rows = rows.filter((r) => (r.productName ?? '').toLowerCase().includes(low));
  }
  const sc = trimOrUndef(blankQuery.styleCode);
  if (sc) {
    rows = rows.filter((r) => (r.styleCode ?? '').trim() === sc);
  }
  const cn = trimOrUndef(blankQuery.categoryName);
  if (cn) {
    rows = rows.filter((r) => (r.categoryName ?? '').trim() === cn);
  }
  // 已加载图案系列：须先勾选尺寸；空白版长*宽须落在已选图案尺寸内
  if (patternVariantRows.value.length > 0) {
    if (selectedPatternSkuIds.value.length === 0) {
      rows = [];
    } else {
      rows = rows.filter((r) => {
        const key = extractSizeLWKey(r.attr1);
        return key && patternSizeKeySet.value.has(key);
      });
    }
  }
  blankRows.value = rows;
  const idSet = new Set(blankRows.value.map((r) => r.id!));
  blankSelectedIds.value = blankSelectedIds.value.filter((id) => idSet.has(id));
}

/** 打开弹窗：拉取全部空白版一次，生成下拉项并展示筛选结果 */
async function fetchAllBlanksForModal() {
  loadingBlanks.value = true;
  try {
    const res = await getDataJustSkuPage({
      pageNo: 1,
      pageSize: -1,
      listTab: 'blank',
    } as any);
    blankSourceRows.value = res.list ?? [];
    rebuildBlankFilterOptionsFromSource();
    applyBlankQueryFilters();
  } finally {
    loadingBlanks.value = false;
  }
}

/** 查询：无缓存时先拉全量，否则仅本地筛选 */
async function loadBlankList() {
  if (!blankSourceRows.value.length) {
    await fetchAllBlanksForModal();
    return;
  }
  applyBlankQueryFilters();
}

function resetBlankQuery() {
  blankQuery.productName = '';
  blankQuery.styleCode = undefined;
  blankQuery.categoryName = undefined;
}

async function resetBlankQueryAndReload() {
  resetBlankQuery();
  await loadBlankList();
}

function onBlankRowSelectionChange(keys: (string | number)[]) {
  blankSelectedIds.value = keys.map((k) => Number(k));
}

async function loadPatternOptions(keyword?: string) {
  const kw = (keyword ?? '').trim();
  const res = await getDataJustPatternPage({
    pageNo: 1,
    pageSize: 20,
    itemCode: kw || undefined,
    productName: kw || undefined,
  } as any);
  patternOptions.value = (res.list ?? []).map((r: FdmdataDataJustPatternApi.Pattern) => ({
    label: skuLabel(r),
    value: r.id,
  }));
}

async function loadPatternFamilyVariants(seedId: number | undefined) {
  patternVariantRows.value = [];
  selectedPatternSkuIds.value = [];
  patternGroupName.value = '';
  if (seedId == null || Number.isNaN(seedId)) {
    applyBlankQueryFilters();
    return;
  }
  loadingPatternVariants.value = true;
  try {
    const seed = await getDataJustPattern(seedId);
    const groupName = resolvePatternGroupName(seed);
    patternGroupName.value =
      groupName ||
      (seed?.productShortName ?? '').trim() ||
      (seed?.productName ?? '').trim() ||
      '';
    if (!patternGroupName.value) {
      message.warning('无法解析图案系列，请换一条图案');
      applyBlankQueryFilters();
      return;
    }
    const res = await getDataJustPatternPage({
      pageNo: 1,
      pageSize: -1,
      productName: patternGroupName.value,
    } as any);
    const list = (res.list ?? []).filter(
      (r: FdmdataDataJustPatternApi.Pattern) => resolvePatternGroupName(r) === patternGroupName.value,
    );
    list.sort((a, b) => extractSizeLWKey(a.attr1).localeCompare(extractSizeLWKey(b.attr1)));
    patternVariantRows.value = list;
  } finally {
    loadingPatternVariants.value = false;
    applyBlankQueryFilters();
  }
}

async function handlePatternFamilyChange(v: unknown) {
  const id =
    v == null || v === ''
      ? undefined
      : typeof v === 'number'
        ? v
        : Number(v);
  await loadPatternFamilyVariants(id);
}

function onPatternVariantSelectionChange(keys: (string | number)[]) {
  selectedPatternSkuIds.value = keys.map((k) => Number(k));
  applyBlankQueryFilters();
}

function selectAllPatternVariants() {
  selectedPatternSkuIds.value = patternVariantRows.value.map((r) => r.id!);
  applyBlankQueryFilters();
}

function clearPatternVariantSelection() {
  selectedPatternSkuIds.value = [];
  applyBlankQueryFilters();
}

const previewList = computed(() => preview.value?.rows ?? []);
const willCreate = computed(() => preview.value?.willCreate ?? 0);
const willSkip = computed(() => preview.value?.willSkip ?? 0);

const columns: ColumnsType = [
  { title: '款式编码', dataIndex: ['data', 'styleCode'], key: 'styleCode', width: 220, ellipsis: true },
  { title: '商品名称', dataIndex: ['data', 'productName'], key: 'productName', width: 260, ellipsis: true },
  { title: '商品编码', dataIndex: ['data', 'itemCode'], key: 'itemCode', width: 220, ellipsis: true },
  { title: '分类', dataIndex: ['data', 'categoryName'], key: 'categoryName', width: 120, ellipsis: true },
  {
    title: '状态',
    key: 'st',
    width: 120,
    customRender: ({ record }: any) => (record.existsInDb ? '库中已存在' : '可入库'),
  },
];

async function handlePreview() {
  if (!blankSelectedIds.value.length || !selectedPatternSkuIds.value.length) {
    message.warning('请选择空白版 SKU，并至少勾选一个图案尺寸');
    return;
  }
  loadingPreview.value = true;
  try {
    preview.value = await previewCustomCombo({
      blankSkuIds: blankSelectedIds.value,
      patternSkuIds: selectedPatternSkuIds.value,
      qty: formState.qty || 1,
      salePrice: formState.salePrice,
    });
    message.success(`预览完成：将新增 ${willCreate.value} 条，跳过 ${willSkip.value} 条`);
  } finally {
    loadingPreview.value = false;
  }
}

async function handleGenerate() {
  if (!preview.value || willCreate.value === 0) {
    message.warning('没有可入库的新增行，请先预览');
    return;
  }
  generating.value = true;
  try {
    const res = await importCustomCombo({
      blankSkuIds: blankSelectedIds.value,
      patternSkuIds: selectedPatternSkuIds.value,
      qty: formState.qty || 1,
      salePrice: formState.salePrice,
    });
    message.success(`已入库 ${res.created} 条，跳过 ${res.skipped} 条`);
    emit('success');
    modalApi.close();
  } finally {
    generating.value = false;
  }
}

function reset() {
  preview.value = null;
  formState.patternFamilySeedId = undefined;
  formState.qty = 1;
  formState.salePrice = undefined;
  blankRows.value = [];
  blankSourceRows.value = [];
  blankSelectedIds.value = [];
  resetBlankQuery();
  patternOptions.value = [];
  blankStyleOptions.value = [];
  blankCategoryOptions.value = [];
  patternGroupName.value = '';
  patternVariantRows.value = [];
  selectedPatternSkuIds.value = [];
}

const [VbenModal, modalApi] = useVbenModal({
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      reset();
      return;
    }
    loadingOptions.value = true;
    try {
      await Promise.all([fetchAllBlanksForModal(), loadPatternOptions()]);
    } finally {
      loadingOptions.value = false;
    }
  },
});
</script>

<template>
  <VbenModal
    title="定制组合编码生成（预览）"
    :fullscreen="true"
    :fullscreen-button="false"
    :show-cancel-button="false"
    :show-confirm-button="false"
  >
    <Spin :spinning="loadingOptions || loadingBlanks || loadingPatternVariants">
      <Form layout="vertical" class="mb-3">
        <div class="grid gap-3 lg:grid-cols-2">
          <FormItem required label="选择空白版 SKU（多选）">
            <div class="mb-2 text-xs text-muted-foreground">
              商品名称支持模糊查询；款式编码、分类从下拉选择（可选）；点「查询」加载匹配行（不分页）；勾选表格复选框进行多选。
            </div>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Input
                v-model:value="blankQuery.productName"
                allow-clear
                placeholder="商品名称（模糊）"
                @press-enter="loadBlankList"
              />
              <Select
                v-model:value="blankQuery.styleCode"
                :options="blankStyleOptions"
                allow-clear
                show-search
                option-filter-prop="label"
                placeholder="款式编码"
                class="w-full"
              />
              <Select
                v-model:value="blankQuery.categoryName"
                :options="blankCategoryOptions"
                allow-clear
                show-search
                option-filter-prop="label"
                placeholder="分类"
                class="w-full"
              />
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <Button type="primary" size="small" :loading="loadingBlanks" @click="loadBlankList">
                查询
              </Button>
              <Button size="small" @click="resetBlankQueryAndReload">重置条件</Button>
              <Button size="small" @click="selectAllBlanksInList">全选当前结果</Button>
              <Button size="small" @click="clearBlankSelection">清空勾选</Button>
              <span class="text-xs text-muted-foreground">
                共 {{ blankRows.length }} 条，已选 {{ blankSelectedIds.length }} 条
              </span>
            </div>
            <Table
              class="mt-2"
              size="small"
              :data-source="blankRows"
              :pagination="false"
              :scroll="{ y: 'calc(100vh - 420px)', x: 900 }"
              row-key="id"
              bordered
              :row-selection="{
                selectedRowKeys: blankSelectedIds,
                onChange: onBlankRowSelectionChange,
              }"
              :columns="[
                { title: '款式编码', dataIndex: 'styleCode', width: 200, ellipsis: true },
                { title: '商品名称', dataIndex: 'productName', width: 220, ellipsis: true },
                { title: '商品编码', dataIndex: 'itemCode', width: 180, ellipsis: true },
                { title: '分类', dataIndex: 'categoryName', width: 120, ellipsis: true },
              ]"
            />
          </FormItem>
          <div class="flex flex-col gap-3">
            <FormItem required label="选择图案（系列）">
              <div class="mb-2 text-xs text-muted-foreground">
                搜索并<strong>任选一条</strong>该系列的图案 SKU（仅用于识别图案名）；再在下方勾选要参与组合的<strong>图案尺寸</strong>（可多选）。组合子商品仍为 2 个：空白版 + 对应尺寸的图案 SKU。
              </div>
              <Select
                v-model:value="formState.patternFamilySeedId"
                :options="patternOptions"
                allow-clear
                show-search
                option-filter-prop="label"
                placeholder="搜索商品编码/名称，任选一条同系列图案"
                @search="(v: any) => loadPatternOptions(v)"
                @change="handlePatternFamilyChange"
              />
              <div v-if="patternGroupName" class="mt-2 text-xs text-muted-foreground">
                当前系列：<strong>{{ patternGroupName }}</strong>；已加载 <strong>{{ patternVariantRows.length }}</strong>
                条尺寸行，请勾选参与组合的尺寸（长*宽匹配，忽略厚度）。
              </div>
            </FormItem>
            <FormItem v-if="patternVariantRows.length" required label="图案尺寸（可多选）">
              <div class="mb-2 flex flex-wrap items-center gap-2">
                <Button size="small" @click="selectAllPatternVariants">全选尺寸</Button>
                <Button size="small" @click="clearPatternVariantSelection">清空勾选</Button>
                <span class="text-xs text-muted-foreground">
                  已选 {{ selectedPatternSkuIds.length }} 条，匹配键：
                  <strong>{{ patternSizeKeys.join('、') || '—' }}</strong>
                </span>
              </div>
              <Table
                size="small"
                :data-source="patternVariantRows"
                :pagination="false"
                :scroll="{ y: 240 }"
                row-key="id"
                bordered
                :row-selection="{
                  selectedRowKeys: selectedPatternSkuIds,
                  onChange: onPatternVariantSelectionChange,
                }"
                :columns="patternVariantColumns"
              />
            </FormItem>
          </div>
        </div>
        <!-- 子项数量 / 子项售价：按当前业务规则固定，不在弹窗中暴露 -->
        <div class="flex flex-wrap gap-2">
          <Button type="primary" :loading="loadingPreview" @click="handlePreview">预览</Button>
          <Button type="default" :disabled="!preview || willCreate === 0" :loading="generating" @click="handleGenerate">
            确认入库
          </Button>
        </div>
      </Form>

      <Table
        v-if="previewList.length"
        size="small"
        :columns="columns"
        :data-source="previewList"
        :pagination="false"
        :scroll="{ x: 980, y: 'calc(100vh - 520px)' }"
        row-key="data.id"
        bordered
      />
    </Spin>
  </VbenModal>
</template>

