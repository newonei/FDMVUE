<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import { computed, h, reactive, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import {
  Button,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Select,
  Spin,
  Table,
} from 'ant-design-vue';

import { getDataJustAccessoryPage } from '#/api/fdmdata/datajustaccessory';
import { getFinishedSkuPageForComboPicker, importStandardCombo, previewStandardCombo } from '#/api/fdmdata/datajustsku';
import type { CustomComboPreviewResp, FdmdataDataJustSkuApi, StandardComboGenReq } from '#/api/fdmdata/datajustsku';
import type { FdmdataDataJustAccessoryApi } from '#/api/fdmdata/datajustaccessory';
import { listStandardComboSpecMatchRows } from '#/api/fdmdata/standard-combo-spec-template';
import type { StandardComboSpecTemplateApi } from '#/api/fdmdata/standard-combo-spec-template';

const emit = defineEmits(['success']);

const SPEC_RE =
  /(\d+(?:\.\d+)?)\s*\*\s*(\d+(?:\.\d+)?)(?:\s*\*\s*(\d+(?:\.\d+)?))?/;
const BUNDLE_RE = /(\d+)条装/;

/** 组合弹窗单次查询条数上限（框架分页最大 200） */
const COMBO_PICKER_PAGE_SIZE = 200;

const loadingSpecRows = ref(false);
const loadingFinished = ref(false);
const loadingPreview = ref(false);
const generating = ref(false);
const preview = ref<CustomComboPreviewResp | null>(null);

const finishedRows = ref<FdmdataDataJustSkuApi.DataJustSku[]>([]);
const finishedSourceRows = ref<FdmdataDataJustSkuApi.DataJustSku[]>([]);
const finishedSelectedIds = ref<number[]>([]);
const finishedQuery = reactive({
  productName: '',
  styleCode: undefined as string | undefined,
  categoryName: undefined as string | undefined,
});
const finishedStyleOptions = ref<{ label: string; value: string }[]>([]);
const finishedCategoryOptions = ref<{ label: string; value: string }[]>([]);

const accessoryRows = ref<FdmdataDataJustAccessoryApi.Accessory[]>([]);
const accessorySourceRows = ref<FdmdataDataJustAccessoryApi.Accessory[]>([]);
const accessorySelectedIds = ref<number[]>([]);
/** 已勾选配件的数量（默认 1），随预览/入库以 accessoryPicks 提交 */
const accessoryQtyById = reactive<Record<number, number>>({});
const accessoryQuery = reactive({
  productName: '',
  itemCode: '',
});
const loadingAccessory = ref(false);
/** 标准组合规格对照（与后端预览一致） */
const specMatchRows = ref<StandardComboSpecTemplateApi.MatchRow[]>([]);

/** 与后端一致：仅解析括号内文本（可多段），无括号时再解析整段；字段顺序 商品名称 → attr1 → 颜色及规格 */
function listParenContents(s: string): string[] {
  const out: string[] = [];
  const reAscii = /\(([^)]*)\)/g;
  let m: RegExpExecArray | null;
  while ((m = reAscii.exec(s)) !== null) {
    out.push(m[1] ?? '');
  }
  const reFull = /（([^）]*)）/g;
  while ((m = reFull.exec(s)) !== null) {
    out.push(m[1] ?? '');
  }
  return out;
}

function extractSpecFullFromPlain(raw: string) {
  const s = (raw ?? '').trim();
  if (!s) {
    return '';
  }
  const m = SPEC_RE.exec(s);
  if (!m) {
    return '';
  }
  const a = m[1];
  const b = m[2];
  const c = m[3]?.trim();
  if (!a || !b) {
    return '';
  }
  return c ? `${a}*${b}*${c}` : `${a}*${b}`;
}

function extractSpecLwFromPlain(raw: string) {
  const s = (raw ?? '').trim();
  if (!s) {
    return '';
  }
  const m = SPEC_RE.exec(s);
  if (!m) {
    return '';
  }
  const a = m[1];
  const b = m[2];
  if (!a || !b) {
    return '';
  }
  return `${a}*${b}`;
}

function trySpecKeysFromOneField(field: string | undefined) {
  if (!field?.trim()) {
    return null;
  }
  const t = field.trim();
  const inners = listParenContents(t);
  if (inners.length) {
    for (const inner of inners) {
      const full = extractSpecFullFromPlain(inner);
      const lw = extractSpecLwFromPlain(inner);
      if (full || lw) {
        return { full, lw };
      }
    }
    return null;
  }
  const full = extractSpecFullFromPlain(t);
  const lw = extractSpecLwFromPlain(t);
  if (full || lw) {
    return { full, lw };
  }
  return null;
}

function resolveSpecKeysForRow(row: {
  attr1?: string;
  colorSpec?: string;
  productName?: string;
}) {
  for (const field of [row.productName, row.attr1, row.colorSpec]) {
    const k = trySpecKeysFromOneField(field);
    if (k && (k.full || k.lw)) {
      return k;
    }
  }
  return { full: '', lw: '' };
}

function extractBundleCountFromRow(row: {
  attr1?: string;
  colorSpec?: string;
  productName?: string;
}) {
  const s = [row.productName, row.attr1, row.colorSpec]
    .filter(Boolean)
    .join(' ');
  const m = BUNDLE_RE.exec(s);
  return m ? Number.parseInt(m[1]!, 10) : null;
}

function specPairMatch(
  f: { full: string; lw: string },
  a: { full: string; lw: string },
) {
  const aHasSpec = !!(a.full || a.lw);
  if (!aHasSpec) {
    return true;
  }
  const fHasSpec = !!(f.full || f.lw);
  if (!fHasSpec) {
    return false;
  }
  // 配件解析出含厚（长*宽*厚）时：只按三键全等匹配，避免纸箱(200*130*1.5)配到 200*130*0.6 垫子
  if (a.full) {
    return !!(f.full && f.full === a.full);
  }
  return !!(f.lw && a.lw && f.lw === a.lw);
}

function specMatchesTemplate(
  fKeys: { full: string; lw: string },
  accessoryId: number,
) {
  for (const row of specMatchRows.value) {
    if (row.accessoryId !== accessoryId) {
      continue;
    }
    const tk = {
      full: (row.specFullKey ?? '').trim(),
      lw: (row.specLwKey ?? '').trim(),
    };
    if (!tk.full && !tk.lw) {
      continue;
    }
    if (specPairMatch(fKeys, tk)) {
      return true;
    }
  }
  return false;
}

function specWidthCm(keys: { full: string; lw: string }) {
  const raw = keys.lw || keys.full;
  const parts = raw.split('*');
  if (parts.length < 2) {
    return null;
  }
  const n = Number.parseFloat(parts[1]!);
  return Number.isFinite(n) ? n : null;
}

function configuredSpecKeys(full?: string, lw?: string) {
  const f = resolveSpecKeysForRow({ productName: full }).full;
  const l =
    resolveSpecKeysForRow({ productName: lw }).lw ||
    (f ? f.split('*').slice(0, 2).join('*') : '');
  return { full: f && f.split('*').length >= 3 ? f : '', lw: l };
}

function specSetMatches(
  fKeys: { full: string; lw: string },
  ruleJson?: string,
) {
  if (!ruleJson?.trim()) {
    return false;
  }
  let specs: string[] = [];
  try {
    const parsed = JSON.parse(ruleJson);
    if (Array.isArray(parsed)) {
      specs = parsed.map((v) => String(v));
    }
  } catch {
    specs = ruleJson
      .split(/[,;\n]/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return specs.some((spec) => specPairMatch(fKeys, configuredSpecKeys(spec)));
}

function accessoryMatchesFinished(
  fRow: FdmdataDataJustSkuApi.DataJustSku,
  aRow: FdmdataDataJustAccessoryApi.Accessory,
) {
  const fKeys = resolveSpecKeysForRow(fRow);
  const mt = (aRow.matchType ?? '').trim();
  if (!mt) {
    // 老数据未维护规则时不在前端强过滤，最终以后端预览为准。
    return true;
  }
  if (mt === 'UNIVERSAL') {
    return true;
  }
  if (mt === 'SPEC_EXACT') {
    return specPairMatch(
      fKeys,
      configuredSpecKeys(aRow.matchSpecFullKey, aRow.matchSpecLwKey),
    );
  }
  if (mt === 'WIDTH_EXACT') {
    const w = specWidthCm(fKeys);
    return (
      w != null && aRow.matchWidthCm != null && w === Number(aRow.matchWidthCm)
    );
  }
  if (mt === 'WIDTH_MAX') {
    const w = specWidthCm(fKeys);
    return (
      w != null &&
      aRow.matchWidthMaxCm != null &&
      w <= Number(aRow.matchWidthMaxCm)
    );
  }
  if (mt === 'SPEC_SET') {
    return specSetMatches(fKeys, aRow.matchRuleJson);
  }
  const aKeys = resolveSpecKeysForRow(aRow);
  return specPairMatch(fKeys, aKeys) || specMatchesTemplate(fKeys, aRow.id!);
}

function normalizeAccessoryQty(raw: number | undefined | null): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) {
    return 1;
  }
  return Math.min(99_999, n);
}

function buildStandardComboPayload(): StandardComboGenReq {
  const body: StandardComboGenReq = {
    finishedSkuIds: finishedSelectedIds.value,
  };
  if (accessorySelectedIds.value.length) {
    body.accessoryPicks = accessorySelectedIds.value.map((id) => ({
      accessoryId: id,
      qty: normalizeAccessoryQty(accessoryQtyById[id]),
    }));
  }
  return body;
}

function accessoryNumericId(record: { id?: number | string }) {
  const n = Number(record?.id);
  return Number.isFinite(n) ? n : 0;
}

function onAccessoryQtyInput(id: number, v: number | string | null) {
  if (!id || !accessorySelectedIds.value.includes(id)) {
    return;
  }
  accessoryQtyById[id] = normalizeAccessoryQty(
    v === '' || v === null ? undefined : Number(v),
  );
}

function finishedMatchesSelectedAccessories(
  row: FdmdataDataJustSkuApi.DataJustSku,
) {
  if (!accessorySelectedIds.value.length) {
    return true;
  }
  for (const id of accessorySelectedIds.value) {
    const a = accessorySourceRows.value.find((r) => r.id === id);
    if (!a) {
      continue;
    }
    if (accessoryMatchesFinished(row, a)) {
      return true;
    }
  }
  return false;
}

/** 数量列用列插槽 slots.customRender（与 vc-table 一致），避免仅 #bodyCell 嵌套 template 时单元格不渲染 */
const accessoryColumns = computed<ColumnsType>(() => [
  {
    title: '商品名称',
    dataIndex: 'productName',
    key: 'productName',
    width: 200,
    ellipsis: true,
    fixed: 'left',
  },
  {
    title: '数量',
    key: 'accessoryQty',
    width: 120,
    align: 'center',
    fixed: 'left',
    slots: { customRender: 'accessoryQty' },
  },
  {
    title: '匹配类型',
    dataIndex: 'matchType',
    key: 'matchType',
    width: 110,
    ellipsis: true,
  },
  {
    title: '条装',
    key: 'bundle',
    width: 72,
    customRender: ({
      record,
    }: {
      record: FdmdataDataJustAccessoryApi.Accessory;
    }) => {
      const n = extractBundleCountFromRow(record);
      return n != null ? `${n}条` : '-';
    },
  },
  {
    title: '规格(attr1)',
    dataIndex: 'attr1',
    key: 'attr1',
    width: 160,
    ellipsis: true,
  },
  {
    title: '匹配键(长*宽)',
    key: 'lw',
    width: 110,
    customRender: ({
      record,
    }: {
      record: FdmdataDataJustAccessoryApi.Accessory;
    }) => resolveSpecKeysForRow(record).lw || '-',
  },
  {
    title: '匹配键(含厚)',
    key: 'full',
    width: 120,
    customRender: ({
      record,
    }: {
      record: FdmdataDataJustAccessoryApi.Accessory;
    }) => resolveSpecKeysForRow(record).full || '-',
  },
  {
    title: '商品编码',
    dataIndex: 'itemCode',
    key: 'itemCode',
    width: 180,
    ellipsis: true,
  },
]);

function selectAllFinishedInList() {
  finishedSelectedIds.value = finishedRows.value.map((r) => r.id!);
}

function clearFinishedSelection() {
  finishedSelectedIds.value = [];
}

function trimOrUndef(s: string | undefined) {
  if (s == null || s === '') {
    return undefined;
  }
  const t = s.trim();
  return t ? t : undefined;
}

function rebuildFinishedFilterOptionsFromSource() {
  const styles = new Set<string>();
  const cats = new Set<string>();
  for (const r of finishedSourceRows.value) {
    const sc = (r.styleCode ?? '').trim();
    if (sc) {
      styles.add(sc);
    }
    const cn = (r.categoryName ?? '').trim();
    if (cn) {
      cats.add(cn);
    }
  }
  finishedStyleOptions.value = [...styles]
    .toSorted()
    .map((v) => ({ label: v, value: v }));
  finishedCategoryOptions.value = [...cats]
    .toSorted()
    .map((v) => ({ label: v, value: v }));
}

/** 在已查询到的成品源数据上，按已选配件做规格匹配筛选（名称/款式/分类已由服务端查询） */
function applyAccessoryFinishedFilter() {
  const afterBasicFilters = finishedSourceRows.value;
  let rows = afterBasicFilters.filter((r) =>
    finishedMatchesSelectedAccessories(r),
  );
  if (
    accessorySelectedIds.value.length > 0 &&
    rows.length === 0 &&
    afterBasicFilters.length > 0
  ) {
    message.warning(
      '已选配件解析出的规格键（或条装）与当前成品列表均不匹配，左侧暂显示「仅搜索条件」下的全部成品以便核对。魔术扣等名称里若含误导性尺寸，请在「标准组合规格对照」维护该配件允许的成品规格；预览/入库仍以服务端规则为准。',
    );
    rows = afterBasicFilters;
  }
  finishedRows.value = rows;
  const idSet = new Set(finishedRows.value.map((r) => r.id!));
  finishedSelectedIds.value = finishedSelectedIds.value.filter((id) =>
    idSet.has(id),
  );
}

function applyAccessoryQueryFilters() {
  accessoryRows.value = accessorySourceRows.value;
  applyAccessoryFinishedFilter();
}

async function fetchFinishedByQuery() {
  loadingFinished.value = true;
  try {
    const res = await getFinishedSkuPageForComboPicker({
      pageNo: 1,
      pageSize: COMBO_PICKER_PAGE_SIZE,
      productName: trimOrUndef(finishedQuery.productName),
      styleCode: trimOrUndef(finishedQuery.styleCode),
      categoryName: trimOrUndef(finishedQuery.categoryName),
    });
    finishedSourceRows.value = res.list ?? [];
    const total = res.total ?? finishedSourceRows.value.length;
    if (total > finishedSourceRows.value.length) {
      message.warning(
        `成品共 ${total} 条，当前仅加载 ${finishedSourceRows.value.length} 条，请填写商品名称/款式/分类缩小范围后再查询`,
      );
    }
    rebuildFinishedFilterOptionsFromSource();
    applyAccessoryFinishedFilter();
  } finally {
    loadingFinished.value = false;
  }
}

async function loadFinishedList() {
  await fetchFinishedByQuery();
}

async function fetchAccessoriesByQuery() {
  loadingAccessory.value = true;
  try {
    const res = await getDataJustAccessoryPage({
      pageNo: 1,
      pageSize: COMBO_PICKER_PAGE_SIZE,
      productName: trimOrUndef(accessoryQuery.productName),
      itemCode: trimOrUndef(accessoryQuery.itemCode),
    } as any);
    accessorySourceRows.value = res.list ?? [];
    const total = res.total ?? accessorySourceRows.value.length;
    if (total > accessorySourceRows.value.length) {
      message.warning(
        `配件共 ${total} 条，当前仅加载 ${accessorySourceRows.value.length} 条，请填写筛选条件后再查询`,
      );
    }
    applyAccessoryQueryFilters();
  } finally {
    loadingAccessory.value = false;
  }
}

async function loadAccessoryList() {
  await fetchAccessoriesByQuery();
}

function resetFinishedQuery() {
  finishedQuery.productName = '';
  finishedQuery.styleCode = undefined;
  finishedQuery.categoryName = undefined;
}

async function resetFinishedQueryAndReload() {
  resetFinishedQuery();
  await loadFinishedList();
}

function onFinishedRowSelectionChange(keys: (string | number)[]) {
  finishedSelectedIds.value = keys.map((k) => Number(k));
}

/** 当前表格可见的配件 id（筛选后）；勾选变更时需与「列表外仍保留的已选」合并 */
function visibleAccessoryIdNums() {
  return accessoryRows.value
    .map((r) => accessoryNumericId(r))
    .filter((id) => id > 0);
}

function onAccessoryRowSelectionChange(keys: (string | number)[]) {
  const visibleSet = new Set(visibleAccessoryIdNums());
  const visiblePicked = keys
    .map((k) => Number(k))
    .filter((id) => Number.isFinite(id));
  const offScreenPicked = accessorySelectedIds.value.filter(
    (id) => !visibleSet.has(id),
  );
  const merged = [...new Set([...offScreenPicked, ...visiblePicked])];

  const prev = new Set(accessorySelectedIds.value);
  const next = new Set(merged);
  for (const id of prev) {
    if (!next.has(id)) {
      delete accessoryQtyById[id];
    }
  }
  for (const id of merged) {
    if (!(id in accessoryQtyById) || (accessoryQtyById[id] ?? 0) < 1) {
      accessoryQtyById[id] = 1;
    }
  }
  accessorySelectedIds.value = merged;
  applyAccessoryFinishedFilter();
}

function selectAllAccessoriesInList() {
  const visibleSet = new Set(visibleAccessoryIdNums());
  const offScreenPicked = accessorySelectedIds.value.filter(
    (id) => !visibleSet.has(id),
  );
  const allVisible = visibleAccessoryIdNums();
  accessorySelectedIds.value = [
    ...new Set([...offScreenPicked, ...allVisible]),
  ];
  for (const id of accessorySelectedIds.value) {
    if (!(id in accessoryQtyById) || (accessoryQtyById[id] ?? 0) < 1) {
      accessoryQtyById[id] = 1;
    }
  }
  applyAccessoryFinishedFilter();
}

function clearAccessorySelection() {
  accessorySelectedIds.value = [];
  for (const k of Object.keys(accessoryQtyById)) {
    delete accessoryQtyById[Number(k)];
  }
  applyAccessoryFinishedFilter();
}

const previewList = computed(() => preview.value?.rows ?? []);
const willCreate = computed(() => preview.value?.willCreate ?? 0);
const willUpdate = computed(() => preview.value?.willUpdate ?? 0);
const willSkip = computed(() => preview.value?.willSkip ?? 0);

/** 预览表：配件列展示为「编码」换行「名称」（多条配件纵向排列） */
function renderAccessoryCodeNameBlocks(
  codes: string[] | undefined,
  names: (string | undefined)[] | undefined,
  qtys?: number[] | undefined,
) {
  const list = codes ?? [];
  if (!list.length) {
    return '-';
  }
  return h(
    'div',
    { class: 'space-y-1.5' },
    list.map((c, i) => {
      const q = qtys?.[i] ?? 1;
      const codeLine = q > 1 ? `${c}×${q}` : c;
      const name = (names?.[i] ?? '').trim();
      return h('div', { key: `${c}-${i}`, class: 'leading-snug' }, [
        h('div', codeLine),
        name
          ? h('div', { class: 'text-xs text-muted-foreground' }, name)
          : null,
      ]);
    }),
  );
}

const columns: ColumnsType = [
  {
    title: '款式编码',
    dataIndex: ['data', 'styleCode'],
    key: 'styleCode',
    width: 220,
    ellipsis: true,
  },
  {
    title: '商品名称',
    dataIndex: ['data', 'productName'],
    key: 'productName',
    width: 260,
    ellipsis: true,
  },
  {
    title: '商品编码',
    dataIndex: ['data', 'itemCode'],
    key: 'itemCode',
    width: 220,
    ellipsis: true,
  },
  {
    title: '分类',
    dataIndex: ['data', 'categoryName'],
    key: 'categoryName',
    width: 120,
    ellipsis: true,
  },
  {
    title: '将加入配件',
    key: 'matchedAccessories',
    width: 300,
    customRender: ({ record }: any) =>
      renderAccessoryCodeNameBlocks(
        record.matchedAccessoryItemCodes,
        record.matchedAccessoryNames,
        record.matchedAccessoryQtys,
      ),
  },
  {
    title: '跳过配件',
    key: 'skippedAccessories',
    width: 260,
    customRender: ({ record }: any) =>
      renderAccessoryCodeNameBlocks(
        record.skippedAccessoryItemCodes,
        record.skippedAccessoryNames,
      ),
  },
  {
    title: '状态',
    key: 'st',
    width: 150,
    customRender: ({ record }: any) =>
      record.message || (record.existsInDb ? '将覆盖子商品' : '可入库'),
  },
];

async function handlePreview() {
  if (!finishedSelectedIds.value.length) {
    message.warning('请选择成品 SKU');
    return;
  }
  loadingPreview.value = true;
  try {
    preview.value = await previewStandardCombo(buildStandardComboPayload());
    message.success(
      `预览完成：将新增 ${willCreate.value} 条，覆盖 ${willUpdate.value} 条，跳过 ${willSkip.value} 条`,
    );
  } finally {
    loadingPreview.value = false;
  }
}

async function handleGenerate() {
  if (!preview.value || willCreate.value + willUpdate.value === 0) {
    message.warning('没有可入库的新增行，请先预览');
    return;
  }
  generating.value = true;
  try {
    const res = await importStandardCombo(buildStandardComboPayload());
    message.success(
      `已新增 ${res.created} 条，覆盖 ${res.updated ?? 0} 条，跳过 ${res.skipped} 条`,
    );
    emit('success');
    modalApi.close();
  } finally {
    generating.value = false;
  }
}

function reset() {
  preview.value = null;
  finishedRows.value = [];
  finishedSourceRows.value = [];
  finishedSelectedIds.value = [];
  resetFinishedQuery();
  finishedStyleOptions.value = [];
  finishedCategoryOptions.value = [];
  accessoryRows.value = [];
  accessorySourceRows.value = [];
  accessorySelectedIds.value = [];
  for (const k of Object.keys(accessoryQtyById)) {
    delete accessoryQtyById[Number(k)];
  }
  accessoryQuery.productName = '';
  accessoryQuery.itemCode = '';
  specMatchRows.value = [];
}

const [VbenModal, modalApi] = useVbenModal({
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      reset();
      return;
    }
    loadingSpecRows.value = true;
    try {
      specMatchRows.value = (await listStandardComboSpecMatchRows()) ?? [];
    } finally {
      loadingSpecRows.value = false;
    }
  },
});
</script>

<template>
  <VbenModal
    title="组合商品编码生成（预览）"
    :fullscreen="true"
    :fullscreen-button="false"
    :show-cancel-button="false"
    :show-confirm-button="false"
  >
    <Spin :spinning="loadingSpecRows || loadingFinished || loadingAccessory">
      <Form layout="vertical" class="mb-3">
        <div class="grid gap-3 lg:grid-cols-2">
          <FormItem required label="选择成品 SKU（多选）">
            <div class="mb-2 text-xs text-muted-foreground">
              来源：成品编码列表。打开弹窗不会自动拉全表；请填写条件后点「查询」（单次最多
              {{ COMBO_PICKER_PAGE_SIZE }}
              条）。勾选配件后，仅保留能匹配至少一个配件的成品行。
            </div>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Input
                v-model:value="finishedQuery.productName"
                allow-clear
                placeholder="商品名称（模糊）"
                @press-enter="loadFinishedList"
              />
              <Select
                v-model:value="finishedQuery.styleCode"
                :options="finishedStyleOptions"
                allow-clear
                show-search
                option-filter-prop="label"
                placeholder="款式编码"
                class="w-full"
              />
              <Select
                v-model:value="finishedQuery.categoryName"
                :options="finishedCategoryOptions"
                allow-clear
                show-search
                option-filter-prop="label"
                placeholder="分类"
                class="w-full"
              />
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="primary"
                size="small"
                :loading="loadingFinished"
                @click="loadFinishedList"
              >
                查询
              </Button>
              <Button size="small" @click="resetFinishedQueryAndReload"
                >重置条件</Button
              >
              <Button size="small" @click="selectAllFinishedInList"
                >全选当前结果</Button
              >
              <Button size="small" @click="clearFinishedSelection"
                >清空勾选</Button
              >
              <span class="text-xs text-muted-foreground">
                共 {{ finishedRows.length }} 条，已选
                {{ finishedSelectedIds.length }} 条
              </span>
            </div>
            <Table
              class="mt-2"
              size="small"
              :data-source="finishedRows"
              :pagination="false"
              :scroll="{ y: 'calc(100vh - 420px)', x: 900 }"
              row-key="id"
              bordered
              :row-selection="{
                selectedRowKeys: finishedSelectedIds,
                onChange: onFinishedRowSelectionChange,
              }"
              :columns="[
                {
                  title: '款式编码',
                  dataIndex: 'styleCode',
                  width: 200,
                  ellipsis: true,
                },
                {
                  title: '商品名称',
                  dataIndex: 'productName',
                  width: 220,
                  ellipsis: true,
                },
                {
                  title: '商品编码',
                  dataIndex: 'itemCode',
                  width: 180,
                  ellipsis: true,
                },
                {
                  title: '匹配键(长*宽)',
                  key: 'lw',
                  width: 110,
                  customRender: ({
                    record,
                  }: {
                    record: FdmdataDataJustSkuApi.DataJustSku;
                  }) => resolveSpecKeysForRow(record).lw || '-',
                },
                {
                  title: '匹配键(含厚)',
                  key: 'full',
                  width: 120,
                  customRender: ({
                    record,
                  }: {
                    record: FdmdataDataJustSkuApi.DataJustSku;
                  }) => resolveSpecKeysForRow(record).full || '-',
                },
              ]"
            />
          </FormItem>
          <FormItem label="选择配件（多选，可不选）">
            <div class="mb-2 text-xs text-muted-foreground">
              来源：配件列表。请点「查询」加载（单次最多
              {{ COMBO_PICKER_PAGE_SIZE }} 条）。勾选后可编辑数量（默认
              1）；带规格规则的配件需与成品规格匹配成功才会加入组合。
            </div>
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Input
                v-model:value="accessoryQuery.productName"
                allow-clear
                placeholder="商品名称（模糊）"
                @press-enter="loadAccessoryList"
              />
              <Input
                v-model:value="accessoryQuery.itemCode"
                allow-clear
                placeholder="商品编码（模糊）"
                @press-enter="loadAccessoryList"
              />
            </div>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <Button
                type="primary"
                size="small"
                :loading="loadingAccessory"
                @click="loadAccessoryList"
              >
                查询
              </Button>
              <Button size="small" @click="selectAllAccessoriesInList"
                >全选当前结果</Button
              >
              <Button size="small" @click="clearAccessorySelection"
                >清空勾选</Button
              >
              <span class="text-xs text-muted-foreground">
                共 {{ accessoryRows.length }} 条，已选
                {{ accessorySelectedIds.length }}
                条（换查询条件不会清空已选；未出现在当前列表中的已选仍计入）
              </span>
            </div>
            <Table
              class="mt-2"
              size="small"
              :data-source="accessoryRows"
              :pagination="false"
              :scroll="{ y: 'calc(100vh - 420px)', x: 1180 }"
              row-key="id"
              bordered
              :row-selection="{
                selectedRowKeys: accessorySelectedIds,
                onChange: onAccessoryRowSelectionChange,
              }"
              :columns="accessoryColumns"
            >
              <template #accessoryQty="{ record }">
                <InputNumber
                  :min="1"
                  :max="99_999"
                  :precision="0"
                  :disabled="
                    !accessorySelectedIds.includes(accessoryNumericId(record))
                  "
                  size="small"
                  class="w-full min-w-[96px]"
                  :value="accessoryQtyById[accessoryNumericId(record)] ?? 1"
                  @update:value="
                    (v) => onAccessoryQtyInput(accessoryNumericId(record), v)
                  "
                />
              </template>
            </Table>
          </FormItem>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button
            type="primary"
            :loading="loadingPreview"
            @click="handlePreview"
            >预览</Button
          >
          <Button
            type="default"
            :disabled="!preview || willCreate + willUpdate === 0"
            :loading="generating"
            @click="handleGenerate"
          >
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
        :row-key="(_row, index) => String(index)"
        bordered
      />
    </Spin>
  </VbenModal>
</template>
