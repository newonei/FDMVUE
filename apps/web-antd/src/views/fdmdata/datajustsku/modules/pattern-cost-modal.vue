<script lang="ts" setup>
import type {
  DataJustPatternSkuCost,
  PatternSkuCostMatrixKey,
} from '#/api/fdmdata/datajustsku';

import { computed, ref, watch } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import {
  Button,
  Checkbox,
  Input,
  InputNumber,
  message,
  Pagination,
  Spin,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createDataJustPatternSkuCost,
  deleteDataJustPatternSkuCost,
  getDataJustPatternSkuCostPage,
  getPatternCostMatrixKeys,
  updateDataJustPatternSkuCost,
} from '#/api/fdmdata/datajustsku';

function rowKeyOf(sizeText: string) {
  return sizeText;
}

interface PatternCostMatrixRow {
  rowKey: string;
  sizeText: string;
  id?: number;
  costPrice: number | null;
  remark: string;
  baselineCost: number | null;
  baselineRemark: string;
}

function isRowDirty(row: PatternCostMatrixRow) {
  const c = row.costPrice ?? null;
  const bc = row.baselineCost ?? null;
  const costChanged =
    c === null && bc === null
      ? false
      : c === null || bc === null
        ? true
        : Number(c) !== Number(bc);
  return costChanged || (row.remark ?? '') !== (row.baselineRemark ?? '');
}

const matrixRows = ref<PatternCostMatrixRow[]>([]);
const loading = ref(false);
const saving = ref(false);

const filterSizeKeyword = ref('');
const onlyMissingCost = ref(false);

const pageNo = ref(1);
const pageSize = ref(50);

const filteredRows = computed(() => {
  let rows = matrixRows.value;
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

watch([filterSizeKeyword, onlyMissingCost], () => {
  pageNo.value = 1;
});

async function loadAllPatternCosts(): Promise<DataJustPatternSkuCost[]> {
  const all: DataJustPatternSkuCost[] = [];
  let p = 1;
  const ps = 200;
  for (let i = 0; i < 100; i++) {
    const res = await getDataJustPatternSkuCostPage({ pageNo: p, pageSize: ps });
    const list = res.list ?? [];
    all.push(...list);
    if (list.length < ps || all.length >= (res.total ?? 0)) {
      break;
    }
    p++;
  }
  return all;
}

function buildMatrixFromKeys(
  keys: PatternSkuCostMatrixKey[],
  costs: DataJustPatternSkuCost[],
): PatternCostMatrixRow[] {
  const keySet = new Set(keys.map((k) => k.sizeText));
  const costMap = new Map<string, DataJustPatternSkuCost>();
  for (const c of costs) {
    if (!keySet.has(c.sizeText)) {
      continue;
    }
    costMap.set(c.sizeText, c);
  }
  return keys.map((k) => {
    const ex = costMap.get(k.sizeText);
    const cost = ex?.costPrice ?? null;
    const remark = ex?.remark ?? '';
    return {
      rowKey: rowKeyOf(k.sizeText),
      sizeText: k.sizeText,
      id: ex?.id,
      costPrice: cost,
      remark,
      baselineCost: cost,
      baselineRemark: remark,
    };
  });
}

async function reloadMatrix() {
  loading.value = true;
  try {
    const [costs, keys] = await Promise.all([
      loadAllPatternCosts(),
      getPatternCostMatrixKeys(),
    ]);
    matrixRows.value = buildMatrixFromKeys(keys ?? [], costs);
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
      if (!hasPrice) {
        if (row.id != null) {
          await deleteDataJustPatternSkuCost(row.id);
          row.id = undefined;
        }
        row.baselineCost = null;
        row.baselineRemark = row.remark;
        continue;
      }
      const payload: DataJustPatternSkuCost = {
        id: row.id,
        sizeText: row.sizeText,
        costPrice: (row.costPrice ?? 0) as number,
        remark: row.remark || undefined,
      };
      if (row.id != null) {
        await updateDataJustPatternSkuCost(payload);
      } else {
        const newId = await createDataJustPatternSkuCost({
          sizeText: row.sizeText,
          costPrice: (row.costPrice ?? 0) as number,
          remark: row.remark || undefined,
        });
        row.id = typeof newId === 'number' ? newId : Number(newId);
      }
      row.baselineCost = row.costPrice;
      row.baselineRemark = row.remark;
    }
    message.success(`已保存 ${dirty.length} 条`);
  } finally {
    saving.value = false;
  }
}

const tableBodyMaxHeight = 420;

const columns = [
  {
    title: '尺寸',
    dataIndex: 'sizeText',
    key: 'sizeText',
    width: 200,
    ellipsis: true,
  },
  { title: '成本价', key: 'cost', width: 140 },
  { title: '备注', key: 'remark', width: 160, ellipsis: true },
  { title: '状态', key: 'st', width: 88 },
];

const [VbenModal, modalApi] = useVbenModal({
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      matrixRows.value = [];
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
  if (ps) {
    pageSize.value = ps;
  }
}
</script>

<template>
  <VbenModal
    title="图案 SKU 成本对照维护（按尺寸）"
    class="w-[min(960px,calc(100vw-2rem))]"
    :show-cancel-button="false"
    :show-confirm-button="false"
  >
    <Spin :spinning="loading">
      <div class="mb-3 space-y-3">
        <p class="mb-0 text-sm text-muted-foreground">
          每一行尺寸来自<strong>聚水潭 SKU · 图案列表</strong>中已存在 SKU 的<strong>其它属性1（尺寸）</strong>去重。
          维护后，图案列表的成本价与同步聚水潭的成本价按<strong>尺寸原文完全一致</strong>匹配（须与 SKU 的 attr1 一致）。
        </p>
        <div
          v-if="matrixStats.total === 0 && !loading"
          class="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
        >
          当前图案列表中尚无 SKU，或 SKU 未填写尺寸(attr1)。请先用「图案编码生成」入库后再维护。
        </div>
        <div
          v-else-if="matrixStats.total > 0"
          class="flex flex-wrap items-center gap-2 text-sm text-foreground/80"
        >
          <span>共 {{ matrixStats.total }} 条尺寸</span>
          <span class="text-muted-foreground">|</span>
          <span>已维护 {{ matrixStats.maintained }} 条</span>
          <span class="text-muted-foreground">|</span>
          <span>未保存修改 {{ matrixStats.dirty }} 条</span>
        </div>

        <div class="flex flex-wrap items-end gap-3">
          <div class="min-w-[220px] flex-1">
            <div class="mb-1 text-xs text-muted-foreground">尺寸关键字</div>
            <Input
              v-model:value="filterSizeKeyword"
              allow-clear
              placeholder="如 40*60cm"
            />
          </div>
          <Checkbox v-model:checked="onlyMissingCost">仅未维护成本</Checkbox>
        </div>

        <div class="flex flex-wrap gap-2">
          <Button type="primary" :loading="saving" @click="saveDirtyRows">
            保存修改
          </Button>
          <Button :loading="loading" @click="reloadMatrix">重新加载</Button>
        </div>
      </div>

      <Table
        v-if="matrixStats.total > 0"
        size="small"
        :columns="columns"
        :data-source="paginatedRows"
        :pagination="false"
        :scroll="{ x: 620, y: tableBodyMaxHeight }"
        row-key="rowKey"
        bordered
        class="pattern-cost-matrix-table"
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
          <template v-else-if="column.key === 'remark'">
            <Input
              v-model:value="record.remark"
              size="small"
              placeholder="备注"
            />
          </template>
          <template v-else-if="column.key === 'st'">
            <Tag v-if="isRowDirty(record as PatternCostMatrixRow)" color="orange">
              未保存
            </Tag>
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
.pattern-cost-matrix-table :deep(.ant-input-number-input) {
  text-align: left;
}
</style>
