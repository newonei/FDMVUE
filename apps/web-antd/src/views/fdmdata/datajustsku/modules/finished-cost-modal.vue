<script lang="ts" setup>
import type {
  DataJustFinishedSkuCost,
  FinishedSkuCostMatrixKey,
} from '#/api/fdmdata/datajustsku';

import { computed, ref, watch } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { DICT_TYPE } from '@vben/constants';
import { getDictOptions } from '@vben/hooks';

import {
  Button,
  Checkbox,
  Input,
  InputNumber,
  message,
  Pagination,
  Select,
  Spin,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createDataJustFinishedSkuCost,
  deleteDataJustFinishedSkuCost,
  getDataJustFinishedSkuCostPage,
  getFinishedCostMatrixKeys,
  updateDataJustFinishedSkuCost,
} from '#/api/fdmdata/datajustsku';

function compositeKey(materialKey: string, productType: string, sizeText: string) {
  return `${materialKey}\t${productType}\t${sizeText}`;
}

interface CostMatrixRow {
  rowKey: string;
  materialKey: string;
  materialLabel: string;
  productType: string;
  productTypeLabel: string;
  sizeText: string;
  id?: number;
  costPrice: number | null;
  weightKg: number | null;
  remark: string;
  baselineCost: number | null;
  baselineWeight: number | null;
  baselineRemark: string;
}

function isRowDirty(row: CostMatrixRow) {
  const c = row.costPrice ?? null;
  const bc = row.baselineCost ?? null;
  const costChanged =
    c === null && bc === null
      ? false
      : c === null || bc === null
        ? true
        : Number(c) !== Number(bc);
  const w = row.weightKg ?? null;
  const bw = row.baselineWeight ?? null;
  const weightChanged =
    w === null && bw === null
      ? false
      : w === null || bw === null
        ? true
        : Number(w) !== Number(bw);
  return costChanged || weightChanged || (row.remark ?? '') !== (row.baselineRemark ?? '');
}

const matrixRows = ref<CostMatrixRow[]>([]);
const loading = ref(false);
const saving = ref(false);

/** 筛选 */
const filterMaterialKey = ref<string | undefined>(undefined);
const filterProductType = ref<string | undefined>(undefined);
const filterSizeKeyword = ref('');
const onlyMissingCost = ref(false);

/** 客户端分页 */
const pageNo = ref(1);
const pageSize = ref(50);

const yogaMatDictOptions = computed(() => getDictOptions(DICT_TYPE.YOGA_MAT, 'string'));
const yogaMatLabelMap = computed(() => {
  const m = new Map<string, string>();
  for (const opt of yogaMatDictOptions.value ?? []) {
    if (opt?.value != null && opt?.label) {
      m.set(String(opt.value), String(opt.label));
    }
  }
  return m;
});

function productTypeLabel(code: string) {
  return yogaMatLabelMap.value.get(code) ?? code;
}

const materialDictOptions = computed(() => getDictOptions(DICT_TYPE.MATERIAL_TYPE, 'string'));
const materialLabelMap = computed(() => {
  const m = new Map<string, string>();
  for (const opt of materialDictOptions.value ?? []) {
    if (opt?.value != null && opt?.label) {
      m.set(String(opt.value), String(opt.label));
    }
  }
  return m;
});

function materialLabel(key: string) {
  return materialLabelMap.value.get(key) ?? key;
}

const materialFilterOptions = computed(() => {
  const set = new Set(matrixRows.value.map((r) => r.materialKey).filter(Boolean));
  return [...set].sort().map((x) => ({ label: materialLabel(x), value: x }));
});

const productTypeOptions = computed(() => {
  const set = new Set(matrixRows.value.map((r) => r.productType).filter(Boolean));
  return [...set].sort().map((x) => ({ label: productTypeLabel(x), value: x }));
});

const filteredRows = computed(() => {
  let rows = matrixRows.value;
  if (filterMaterialKey.value) {
    rows = rows.filter((r) => r.materialKey === filterMaterialKey.value);
  }
  if (filterProductType.value) {
    rows = rows.filter((r) => r.productType === filterProductType.value);
  }
  const kw = filterSizeKeyword.value.trim().toLowerCase();
  if (kw) {
    rows = rows.filter((r) => r.sizeText.toLowerCase().includes(kw));
  }
  if (onlyMissingCost.value) {
    rows = rows.filter((r) => r.id == null);
  }
  return rows;
});

const filteredTotal = computed(() => filteredRows.value.length);
const paginatedRows = computed(() => {
  const start = (pageNo.value - 1) * pageSize.value;
  return filteredRows.value.slice(start, start + pageSize.value);
});

const matrixStats = computed(() => {
  const total = matrixRows.value.length;
  const maintained = matrixRows.value.filter((r) => r.id != null).length;
  const dirty = matrixRows.value.filter(isRowDirty).length;
  return { total, maintained, dirty };
});

watch([filteredTotal, pageSize], () => {
  const maxPage = Math.max(1, Math.ceil(filteredTotal.value / pageSize.value) || 1);
  if (pageNo.value > maxPage) {
    pageNo.value = maxPage;
  }
});

watch(
  () => [filterMaterialKey.value, filterProductType.value, filterSizeKeyword.value, onlyMissingCost.value],
  () => {
    pageNo.value = 1;
  },
);

async function loadAllCosts(): Promise<DataJustFinishedSkuCost[]> {
  const all: DataJustFinishedSkuCost[] = [];
  let p = 1;
  const ps = 200;
  for (let i = 0; i < 100; i++) {
    const res = await getDataJustFinishedSkuCostPage({ pageNo: p, pageSize: ps });
    const list = res.list ?? [];
    all.push(...list);
    if (list.length < ps || all.length >= (res.total ?? 0)) {
      break;
    }
    p++;
  }
  return all;
}

function buildMatrix(keys: FinishedSkuCostMatrixKey[], costs: DataJustFinishedSkuCost[]): CostMatrixRow[] {
  const materials = [...materialLabelMap.value.keys()];
  const keySet = new Set(keys.map((k) => `${k.productType}\t${k.sizeText}`));
  const costMap = new Map<string, DataJustFinishedSkuCost>();
  for (const c of costs) {
    const ckKey = `${c.productType}\t${c.sizeText}`;
    if (!keySet.has(ckKey)) continue;
    const ck = compositeKey(c.materialKey, c.productType, c.sizeText);
    costMap.set(ck, c);
  }
  const rows: CostMatrixRow[] = [];
  for (const k of keys) {
    for (const mk of materials) {
      const rowKey = compositeKey(mk, k.productType, k.sizeText);
      const ex = costMap.get(rowKey);
      const cost = ex?.costPrice ?? null;
      const weight = ex?.weightKg ?? null;
      const remark = ex?.remark ?? '';
      rows.push({
        rowKey,
        materialKey: mk,
        materialLabel: materialLabel(mk),
        productType: k.productType,
        productTypeLabel: productTypeLabel(k.productType),
        sizeText: k.sizeText,
        id: ex?.id,
        costPrice: cost,
        weightKg: weight,
        remark,
        baselineCost: cost,
        baselineWeight: weight,
        baselineRemark: remark,
      });
    }
  }
  return rows;
}

async function reloadMatrix() {
  loading.value = true;
  try {
    const [costs, keys] = await Promise.all([loadAllCosts(), getFinishedCostMatrixKeys()]);
    matrixRows.value = buildMatrix(keys ?? [], costs);
    pageNo.value = 1;
  } finally {
    loading.value = false;
  }
}

async function saveDirtyRows() {
  const dirty = matrixRows.value.filter(isRowDirty);
  if (!dirty.length) {
    message.info('没有需要保存的修改');
    return;
  }
  saving.value = true;
  try {
    for (const row of dirty) {
      const hasPrice = row.costPrice !== null && row.costPrice !== undefined;
      const hasWeight = row.weightKg !== null && row.weightKg !== undefined;
      if (!hasPrice && !hasWeight) {
        if (row.id != null) {
          await deleteDataJustFinishedSkuCost(row.id);
          row.id = undefined;
        }
        row.baselineCost = null;
        row.baselineWeight = null;
        row.baselineRemark = row.remark;
        continue;
      }
      const payload: DataJustFinishedSkuCost = {
        id: row.id,
        materialKey: row.materialKey,
        productType: row.productType,
        sizeText: row.sizeText,
        costPrice: (row.costPrice ?? 0) as number,
        weightKg: row.weightKg ?? undefined,
        remark: row.remark || undefined,
      };
      if (row.id != null) {
        await updateDataJustFinishedSkuCost(payload);
      } else {
        const newId = await createDataJustFinishedSkuCost({
          materialKey: row.materialKey,
          productType: row.productType,
          sizeText: row.sizeText,
          costPrice: (row.costPrice ?? 0) as number,
          weightKg: row.weightKg ?? undefined,
          remark: row.remark || undefined,
        });
        row.id = typeof newId === 'number' ? newId : Number(newId);
      }
      row.baselineCost = row.costPrice;
      row.baselineWeight = row.weightKg;
      row.baselineRemark = row.remark;
    }
    message.success(`已保存 ${dirty.length} 条`);
  } finally {
    saving.value = false;
  }
}

const tableBodyMaxHeight = 420;

const columns = [
  { title: '材质', dataIndex: 'materialLabel', key: 'mat', width: 160, ellipsis: true },
  { title: '成品类型', dataIndex: 'productTypeLabel', key: 'ptype', width: 160, ellipsis: true },
  { title: '尺寸', dataIndex: 'sizeText', key: 'sizeText', width: 160, ellipsis: true },
  { title: '成本价', key: 'cost', width: 140 },
  { title: '重量(kg)', key: 'weight', width: 140 },
  { title: '备注', key: 'remark', width: 160, ellipsis: true },
  { title: '状态', key: 'st', width: 88 },
];

const [VbenModal, modalApi] = useVbenModal({
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      matrixRows.value = [];
      filterMaterialKey.value = undefined;
      filterProductType.value = undefined;
      filterSizeKeyword.value = '';
      onlyMissingCost.value = false;
      return;
    }
    modalApi.lock();
    try {
      await reloadMatrix();
    } finally {
      modalApi.unlock();
    }
  },
});

function onPageChange(page: number, ps?: number) {
  pageNo.value = page;
  if (ps) pageSize.value = ps;
}
</script>

<template>
  <VbenModal
    title="成品 SKU 成本对照维护"
    class="w-[min(1280px,calc(100vw-2rem))]"
    :show-cancel-button="false"
    :show-confirm-button="false"
  >
    <Spin :spinning="loading">
      <div class="mb-3 space-y-3">
        <p class="mb-0 text-sm text-muted-foreground">
          列表中的每一行来自<strong>聚水潭 SKU · 成品编码列表</strong>里<strong>已存在</strong>的 SKU（按类型+尺寸去重）。
          请先使用「成品编码生成」入库，再在此填写对应组合的成本价并保存。
          <span class="block mt-1 text-xs">
            已逻辑删除的 SKU 不参与组合；成本表中已逻辑删除的记录不会合并展示。
          </span>
        </p>

        <div
          v-if="matrixStats.total === 0 && !loading"
          class="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
        >
          当前成品主数据中尚无 SKU，无法列出可维护的组合。请先入库成品 SKU 后再维护成本。
        </div>

        <div
          v-else-if="matrixStats.total > 0"
          class="flex flex-wrap items-center gap-2 text-sm text-foreground/80"
        >
          <span>共 {{ matrixStats.total }} 条组合</span>
          <span class="text-muted-foreground">|</span>
          <span>已维护 {{ matrixStats.maintained }} 条</span>
          <span class="text-muted-foreground">|</span>
          <span>未保存修改 {{ matrixStats.dirty }} 条</span>
        </div>

        <div class="flex flex-wrap items-end gap-3">
          <div class="min-w-[180px]">
            <div class="mb-1 text-xs text-muted-foreground">材质</div>
            <Select
              v-model:value="filterMaterialKey"
              :options="materialFilterOptions"
              allow-clear
              placeholder="全部"
              class="w-full min-w-[180px]"
              show-search
              option-filter-prop="label"
            />
          </div>
          <div class="min-w-[180px]">
            <div class="mb-1 text-xs text-muted-foreground">成品类型</div>
            <Select
              v-model:value="filterProductType"
              :options="productTypeOptions"
              allow-clear
              placeholder="全部"
              class="w-full min-w-[180px]"
              show-search
              option-filter-prop="label"
            />
          </div>
          <div class="min-w-[200px] flex-1">
            <div class="mb-1 text-xs text-muted-foreground">尺寸关键字</div>
            <Input v-model:value="filterSizeKeyword" allow-clear placeholder="如 185*61" />
          </div>
          <Checkbox v-model:checked="onlyMissingCost">仅未维护成本</Checkbox>
        </div>

        <div class="flex flex-wrap gap-2">
          <Button type="primary" :loading="saving" @click="saveDirtyRows">保存修改</Button>
          <Button :loading="loading" @click="reloadMatrix">重新加载</Button>
        </div>
      </div>

      <Table
        v-if="matrixStats.total > 0"
        size="small"
        :columns="columns"
        :data-source="paginatedRows"
        :pagination="false"
        :scroll="{ x: 860, y: tableBodyMaxHeight }"
        row-key="rowKey"
        bordered
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'cost'">
            <InputNumber
              v-model:value="record.costPrice"
              :min="0"
              :precision="4"
              class="w-full max-w-[130px]"
              placeholder="未填"
            />
          </template>
          <template v-else-if="column.key === 'weight'">
            <InputNumber
              v-model:value="record.weightKg"
              :min="0"
              :precision="4"
              class="w-full max-w-[130px]"
              placeholder="未填"
            />
          </template>
          <template v-else-if="column.key === 'remark'">
            <Input v-model:value="record.remark" size="small" placeholder="备注" />
          </template>
          <template v-else-if="column.key === 'st'">
            <Tag v-if="isRowDirty(record as any)" color="orange">未保存</Tag>
            <Tag v-else-if="record.id" color="success">已保存</Tag>
            <Tag v-else color="default">未维护</Tag>
          </template>
        </template>
      </Table>

      <div v-if="filteredTotal > 0" class="mt-3 flex justify-end">
        <Pagination
          :current="pageNo"
          :page-size="pageSize"
          :total="filteredTotal"
          :page-size-options="['20', '50', '100', '200']"
          show-size-changer
          @change="onPageChange"
        />
      </div>
    </Spin>

    <div class="mt-4 flex justify-end border-t border-border pt-3">
      <Button @click="modalApi.close()">关闭</Button>
    </div>
  </VbenModal>
</template>

<style scoped>
</style>

