<script lang="ts" setup>
import type {
  ComboPlatformPriceMatrixKey,
  ComboPlatformPriceRow,
} from '#/api/fdmdata/datajustsku';

import { computed, h, ref, watch } from 'vue';

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
  getComboPlatformPriceMatrixKeys,
  getComboPlatformPricePage,
  upsertComboPlatformPrice,
} from '#/api/fdmdata/datajustsku';

function compositeKey(materialKey: string, specText: string, productType: string) {
  return `${materialKey}\t${specText}\t${productType}`;
}

interface MatrixRow {
  rowKey: string;
  materialKey: string;
  materialLabel: string;
  specText: string;
  productType: string;
  id?: number;
  tmallPrice: number | null;
  pddPrice: number | null;
  douyinPrice: number | null;
  sphPrice: number | null;
  xhsPrice: number | null;
  remark: string;
  baselineTmall: number | null;
  baselinePdd: number | null;
  baselineDouyin: number | null;
  baselineSph: number | null;
  baselineXhs: number | null;
  baselineRemark: string;
}

function numDirty(a: number | null | undefined, b: number | null | undefined) {
  const na = a ?? null;
  const nb = b ?? null;
  if (na === null && nb === null) return false;
  if (na === null || nb === null) return true;
  return Number(na) !== Number(nb);
}

function isRowDirty(row: MatrixRow) {
  return (
    numDirty(row.tmallPrice, row.baselineTmall) ||
    numDirty(row.pddPrice, row.baselinePdd) ||
    numDirty(row.douyinPrice, row.baselineDouyin) ||
    numDirty(row.sphPrice, row.baselineSph) ||
    numDirty(row.xhsPrice, row.baselineXhs) ||
    (row.remark ?? '') !== (row.baselineRemark ?? '')
  );
}

const matrixRows = ref<MatrixRow[]>([]);
const loading = ref(false);
const saving = ref(false);

/** 筛选 */
const filterMaterialKey = ref<string | undefined>(undefined);
const filterSpecKeyword = ref('');
const filterTypeKeyword = ref('');
const onlyDirty = ref(false);

/** 客户端分页 */
const pageNo = ref(1);
const pageSize = ref(50);

// 复用现有“材质”字典（与成品成本对照维护一致）
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

const materialOptions = computed(() => {
  return (yogaMatDictOptions.value ?? []).map((o) => ({
    label: String(o.label ?? o.value),
    value: String(o.value),
  }));
});

const filteredRows = computed(() => {
  let rows = matrixRows.value ?? [];
  const mk = (filterMaterialKey.value ?? '').trim();
  if (mk) {
    rows = rows.filter((r) => (r.materialKey ?? '').toUpperCase() === mk.toUpperCase());
  }
  const sk = (filterSpecKeyword.value ?? '').trim().toLowerCase();
  if (sk) {
    rows = rows.filter((r) => (r.specText ?? '').toLowerCase().includes(sk));
  }
  const tk = (filterTypeKeyword.value ?? '').trim().toLowerCase();
  if (tk) {
    rows = rows.filter((r) => (r.productType ?? '').toLowerCase().includes(tk));
  }
  if (onlyDirty.value) {
    rows = rows.filter((r) => isRowDirty(r));
  }
  return rows;
});

const total = computed(() => filteredRows.value.length);
const pageRows = computed(() => {
  const start = (pageNo.value - 1) * pageSize.value;
  return filteredRows.value.slice(start, start + pageSize.value);
});

watch([filterMaterialKey, filterSpecKeyword, filterTypeKeyword, onlyDirty], () => {
  pageNo.value = 1;
});

async function loadMatrix() {
  loading.value = true;
  try {
    const keys: ComboPlatformPriceMatrixKey[] = await getComboPlatformPriceMatrixKeys();
    // 已维护的价格行（一次拉全量，前端做合并；数据量过大再考虑改服务端 join）
    const page = await getComboPlatformPricePage({ pageNo: 1, pageSize: -1 } as any);
    const exists = page?.list ?? [];
    const index = new Map<string, ComboPlatformPriceRow>();
    for (const r of exists) {
      if (!r?.materialKey || !r?.specText || !r?.productType) continue;
      index.set(compositeKey(r.materialKey, r.specText, r.productType), r);
    }

    const rows: MatrixRow[] = [];
    for (const k of keys ?? []) {
      const materialKey = String(k.materialKey ?? '').trim();
      const specText = String(k.specText ?? '').trim();
      const productType = String(k.productType ?? '').trim();
      if (!materialKey || !specText || !productType) continue;
      const hit = index.get(compositeKey(materialKey, specText, productType));
      const materialLabel = yogaMatLabelMap.value.get(materialKey) ?? materialKey;
      const tmall = (hit?.tmallPrice ?? null) as any;
      const pdd = (hit?.pddPrice ?? null) as any;
      const dy = (hit?.douyinPrice ?? null) as any;
      const sph = (hit?.sphPrice ?? null) as any;
      const xhs = (hit?.xhsPrice ?? null) as any;
      const remark = String(hit?.remark ?? '');
      rows.push({
        rowKey: compositeKey(materialKey, specText, productType),
        materialKey,
        materialLabel,
        specText,
        productType,
        id: hit?.id,
        tmallPrice: tmall === undefined ? null : tmall,
        pddPrice: pdd === undefined ? null : pdd,
        douyinPrice: dy === undefined ? null : dy,
        sphPrice: sph === undefined ? null : sph,
        xhsPrice: xhs === undefined ? null : xhs,
        remark,
        baselineTmall: tmall === undefined ? null : tmall,
        baselinePdd: pdd === undefined ? null : pdd,
        baselineDouyin: dy === undefined ? null : dy,
        baselineSph: sph === undefined ? null : sph,
        baselineXhs: xhs === undefined ? null : xhs,
        baselineRemark: remark,
      });
    }
    matrixRows.value = rows;
  } finally {
    loading.value = false;
  }
}

async function saveAllDirty() {
  const dirty = (matrixRows.value ?? []).filter((r) => isRowDirty(r));
  if (!dirty.length) {
    message.info('没有需要保存的修改');
    return;
  }
  saving.value = true;
  try {
    for (const r of dirty) {
      await upsertComboPlatformPrice({
        materialKey: r.materialKey,
        specText: r.specText,
        productType: r.productType,
        tmallPrice: r.tmallPrice,
        pddPrice: r.pddPrice,
        douyinPrice: r.douyinPrice,
        sphPrice: r.sphPrice,
        xhsPrice: r.xhsPrice,
        remark: r.remark,
      });
      r.baselineTmall = r.tmallPrice ?? null;
      r.baselinePdd = r.pddPrice ?? null;
      r.baselineDouyin = r.douyinPrice ?? null;
      r.baselineSph = r.sphPrice ?? null;
      r.baselineXhs = r.xhsPrice ?? null;
      r.baselineRemark = r.remark ?? '';
    }
    message.success(`已保存 ${dirty.length} 条`);
  } finally {
    saving.value = false;
  }
}

function resetFilters() {
  filterMaterialKey.value = undefined;
  filterSpecKeyword.value = '';
  filterTypeKeyword.value = '';
  onlyDirty.value = false;
  pageNo.value = 1;
}

const columns = [
  { title: '材质', dataIndex: 'materialLabel', key: 'materialLabel', width: 120, ellipsis: true },
  { title: '规格', dataIndex: 'specText', key: 'specText', width: 140, ellipsis: true },
  { title: '类型', dataIndex: 'productType', key: 'productType', width: 160, ellipsis: true },
  {
    title: '天猫价',
    dataIndex: 'tmallPrice',
    key: 'tmallPrice',
    width: 120,
  },
  {
    title: '拼多多价',
    dataIndex: 'pddPrice',
    key: 'pddPrice',
    width: 120,
  },
  {
    title: '抖音价',
    dataIndex: 'douyinPrice',
    key: 'douyinPrice',
    width: 120,
  },
  {
    title: '商品号价',
    dataIndex: 'sphPrice',
    key: 'sphPrice',
    width: 120,
  },
  {
    title: '小红书价',
    dataIndex: 'xhsPrice',
    key: 'xhsPrice',
    width: 120,
  },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 220, ellipsis: true },
  {
    title: '状态',
    key: 'dirty',
    width: 90,
    customRender: ({ record }: any) =>
      isRowDirty(record)
        ? h(Tag, { color: 'warning' }, { default: () => '未保存' })
        : '-',
  },
] as any[];

const [Modal, modalApi] = useVbenModal({
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      matrixRows.value = [];
      resetFilters();
      return;
    }
    await loadMatrix();
  },
});
</script>

<template>
  <Modal
    title="电商平台价格对照（组合）"
    :show-confirm-button="false"
    class="w-[1280px] max-w-[calc(100vw-2rem)]"
  >
    <div class="px-4">
      <div class="mb-3 flex flex-wrap items-center gap-2">
        <Select
          v-model:value="filterMaterialKey"
          allow-clear
          placeholder="材质"
          style="width: 160px"
          :options="materialOptions"
        />
        <Input
          v-model:value="filterSpecKeyword"
          allow-clear
          placeholder="规格关键字（如 185*70*1cm）"
          style="width: 220px"
        />
        <Input
          v-model:value="filterTypeKeyword"
          allow-clear
          placeholder="类型关键字（如 瑕疵麂皮绒）"
          style="width: 220px"
        />
        <Checkbox v-model:checked="onlyDirty">只看未保存</Checkbox>

        <div class="ml-auto flex items-center gap-2">
          <Button :loading="loading" @click="loadMatrix">刷新</Button>
          <Button :loading="saving" type="primary" @click="saveAllDirty">保存全部修改</Button>
        </div>
      </div>

      <Spin :spinning="loading || saving">
        <Table
          :columns="columns"
          :data-source="pageRows"
          :pagination="false"
          row-key="rowKey"
          size="small"
          bordered
          :scroll="{ x: 1580, y: 640 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'tmallPrice'">
              <InputNumber
                v-model:value="record.tmallPrice"
                :min="0"
                :precision="2"
                style="width: 110px"
              />
            </template>
            <template v-else-if="column.key === 'pddPrice'">
              <InputNumber
                v-model:value="record.pddPrice"
                :min="0"
                :precision="2"
                style="width: 110px"
              />
            </template>
            <template v-else-if="column.key === 'douyinPrice'">
              <InputNumber
                v-model:value="record.douyinPrice"
                :min="0"
                :precision="2"
                style="width: 110px"
              />
            </template>
            <template v-else-if="column.key === 'sphPrice'">
              <InputNumber
                v-model:value="record.sphPrice"
                :min="0"
                :precision="2"
                style="width: 110px"
              />
            </template>
            <template v-else-if="column.key === 'xhsPrice'">
              <InputNumber
                v-model:value="record.xhsPrice"
                :min="0"
                :precision="2"
                style="width: 110px"
              />
            </template>
            <template v-else-if="column.key === 'remark'">
              <Input v-model:value="record.remark" allow-clear placeholder="备注" />
            </template>
          </template>
        </Table>

        <div class="mt-3 flex items-center justify-between">
          <div class="text-sm text-muted-foreground">
            共 {{ total }} 条
          </div>
          <Pagination
            v-model:current="pageNo"
            v-model:page-size="pageSize"
            :total="total"
            :show-size-changer="true"
            :show-total="(t) => `共 ${t} 条`"
          />
        </div>
      </Spin>
    </div>
  </Modal>
</template>

