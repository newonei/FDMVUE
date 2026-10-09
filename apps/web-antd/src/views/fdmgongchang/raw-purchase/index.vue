<script lang="ts" setup>
import type { TablePaginationConfig } from 'ant-design-vue';

import type { FdmgongchangRawPurchaseApi as Api } from '#/api/fdmgongchang/raw-purchase';
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Button,
  Input,
  message,
  Modal,
  Segmented,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  cancelRawPurchase,
  closeRawPurchase,
  getRawPurchaseMaterials,
  getRawPurchasePage,
} from '#/api/fdmgongchang/raw-purchase';

import { formatDate, formatQty, toNumber } from '../stage-stock/model';
import { formatMoney, isClosable, isUntouched, STATUS_COLORS, STATUS_LABELS } from './model';
import PurchaseDrawer from './modules/purchase-drawer.vue';

/**
 * 采购部门 · 原材料采购：向供应商订购 TPE 粒子、发泡剂、色母等原材料。
 * 到货由工厂在「工序库存 · 到货入库」收货，进原材料库存并回写这里的到货数量。
 */
defineOptions({ name: 'FdmGongchangRawPurchase' });

const { hasAccessByCodes } = useAccess();
const canCreate = computed(() => hasAccessByCodes(['fdmgongchang:raw-purchase:create']));
const canCancel = computed(() => hasAccessByCodes(['fdmgongchang:raw-purchase:cancel']));

const materials = ref<StockApi.RawMaterialOption[]>([]);
const rows = ref<Api.Purchase[]>([]);
const total = ref(0);
const pageNo = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const status = ref<'' | Api.Status>('');
const keyword = ref('');

const statusOptions = [
  { label: '全部', value: '' },
  ...(['ORDERED', 'PARTIAL', 'RECEIVED', 'CLOSED', 'CANCELLED'] as Api.Status[]).map((s) => ({
    label: STATUS_LABELS[s],
    value: s,
  })),
];

const drawerOpen = ref(false);
const editing = ref<Api.Purchase>();

const closing = ref<{ mode: 'cancel' | 'close'; purchase: Api.Purchase }>();
const closeReason = ref('');
const closeSaving = ref(false);

async function load() {
  loading.value = true;
  try {
    const page = await getRawPurchasePage({
      keyword: keyword.value.trim() || undefined,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      status: status.value || undefined,
    });
    rows.value = page.list;
    total.value = page.total;
  } finally {
    loading.value = false;
  }
}

onMounted(async () => {
  await load();
  materials.value = await getRawPurchaseMaterials();
});

watch(status, () => {
  pageNo.value = 1;
  load();
});
let timer: ReturnType<typeof setTimeout> | undefined;
watch(keyword, () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    pageNo.value = 1;
    load();
  }, 300);
});
onBeforeUnmount(() => clearTimeout(timer));

function onPage(pagination: TablePaginationConfig) {
  pageNo.value = pagination.current ?? 1;
  pageSize.value = pagination.pageSize ?? 20;
  load();
}

function openCreate() {
  editing.value = undefined;
  drawerOpen.value = true;
}

function openEdit(purchase: Api.Purchase) {
  editing.value = purchase;
  drawerOpen.value = true;
}

async function onSaved(text: string) {
  message.success(text);
  await load();
}

function openClose(mode: 'cancel' | 'close', purchase: Api.Purchase) {
  closing.value = { mode, purchase };
  closeReason.value = '';
}

async function confirmClose() {
  if (!closing.value) return;
  if (!closeReason.value.trim()) {
    message.warning('请填写原因');
    return;
  }
  const { mode, purchase } = closing.value;
  closeSaving.value = true;
  try {
    const data = { id: purchase.id, reason: closeReason.value.trim() };
    await (mode === 'cancel' ? cancelRawPurchase(data) : closeRawPurchase(data));
    message.success(`采购单 ${purchase.purchaseNo} 已${mode === 'cancel' ? '取消' : '关闭'}`);
    closing.value = undefined;
    await load();
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    closeSaving.value = false;
  }
}

function received(purchase: Api.Purchase) {
  const all = purchase.lines.reduce((t, l) => t + (toNumber(l.quantity) ?? 0), 0);
  const got = purchase.lines.reduce((t, l) => t + (toNumber(l.receivedQuantity) ?? 0), 0);
  return { all, got };
}

const columns = [
  { key: 'no', title: '采购单 / 下单日期' },
  { key: 'supplier', title: '供应商' },
  { key: 'lines', title: '原材料（已到 / 采购 kg）' },
  { align: 'right' as const, key: 'amount', title: '金额（元）' },
  { key: 'expected', title: '预计到货' },
  { key: 'status', title: '状态' },
  { align: 'right' as const, key: 'actions', title: '', width: 120 },
];
</script>

<template>
  <Page>
    <div class="flex flex-col gap-4">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0">
          <h1 class="m-0 text-xl font-semibold tracking-tight">原材料采购</h1>
          <p class="m-0 mt-1 text-sm text-muted-foreground">
            向供应商订购原材料。到货由工厂在「工序库存 · 到货入库」收货，进原材料库存并回写到货数量。
          </p>
        </div>
        <Button v-if="canCreate" type="primary" @click="openCreate">＋ 新建采购单</Button>
      </header>

      <section class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <Segmented v-model:value="status" :options="statusOptions" />
          <Input
            id="rp-search"
            v-model:value="keyword"
            allow-clear
            class="w-60"
            placeholder="搜采购单号或供应商"
            size="small"
          />
        </div>
        <Table
          :columns="columns"
          :data-source="rows"
          :loading="loading"
          :pagination="{ current: pageNo, pageSize, total, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 单` }"
          :scroll="{ x: 'max-content' }"
          row-key="id"
          size="small"
          @change="onPage"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'no'">
              <div class="flex flex-col">
                <span class="font-mono text-xs">{{ record.purchaseNo }}</span>
                <span class="whitespace-nowrap text-xs text-muted-foreground">
                  {{ formatDate(record.orderDate) }} · {{ record.operatorName || '—' }}
                </span>
              </div>
            </template>
            <template v-else-if="column.key === 'supplier'">
              <span class="text-sm">{{ record.supplierName }}</span>
            </template>
            <template v-else-if="column.key === 'lines'">
              <div class="flex min-w-[240px] flex-col gap-0.5 text-xs">
                <span v-for="line in record.lines" :key="line.id" class="flex items-baseline justify-between gap-3">
                  <span>{{ line.rawMaterialName }}</span>
                  <span class="whitespace-nowrap tabular-nums">
                    <b :class="(toNumber(line.remainingQuantity) ?? 0) > 0 ? '' : 'text-success'">{{ formatQty(line.receivedQuantity) }}</b>
                    / {{ formatQty(line.quantity) }}
                  </span>
                </span>
              </div>
            </template>
            <template v-else-if="column.key === 'amount'">
              <span class="tabular-nums">{{ formatMoney(record.totalAmount) }}</span>
            </template>
            <template v-else-if="column.key === 'expected'">
              <span class="whitespace-nowrap text-xs">{{ formatDate(record.expectedDate) || '—' }}</span>
            </template>
            <template v-else-if="column.key === 'status'">
              <div class="flex flex-col gap-0.5">
                <Tag :color="STATUS_COLORS[record.status as Api.Status]" class="m-0 w-fit">
                  {{ STATUS_LABELS[record.status as Api.Status] }}
                </Tag>
                <span v-if="record.status === 'PARTIAL'" class="whitespace-nowrap text-xs text-muted-foreground">
                  到货 {{ Math.round((received(record as Api.Purchase).got / (received(record as Api.Purchase).all || 1)) * 100) }}%
                </span>
                <span v-if="record.closeReason" class="max-w-[160px] text-xs text-muted-foreground">{{ record.closeReason }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'actions'">
              <span class="inline-flex gap-3 whitespace-nowrap text-xs">
                <button
                  v-if="canCreate && isUntouched(record as Api.Purchase)"
                  type="button"
                  class="text-primary hover:underline"
                  @click="openEdit(record as Api.Purchase)"
                >
                  修改
                </button>
                <button
                  v-if="canCancel && isUntouched(record as Api.Purchase)"
                  type="button"
                  class="text-destructive hover:underline"
                  @click="openClose('cancel', record as Api.Purchase)"
                >
                  取消
                </button>
                <button
                  v-if="canCancel && isClosable(record as Api.Purchase)"
                  type="button"
                  class="text-primary hover:underline"
                  @click="openClose('close', record as Api.Purchase)"
                >
                  关闭
                </button>
              </span>
            </template>
          </template>
          <template #emptyText>
            <div class="py-6 text-sm text-muted-foreground">
              还没有原材料采购单。<template v-if="canCreate">点「新建采购单」下单。</template>
            </div>
          </template>
        </Table>
      </section>
    </div>

    <PurchaseDrawer
      v-model:open="drawerOpen"
      :materials="materials"
      :purchase="editing"
      @saved="onSaved"
    />
    <Modal
      :open="!!closing"
      :confirm-loading="closeSaving"
      :ok-text="closing?.mode === 'cancel' ? '确认取消' : '确认关闭'"
      :title="closing?.mode === 'cancel' ? `取消采购单 ${closing?.purchase.purchaseNo ?? ''}` : `关闭采购单 ${closing?.purchase.purchaseNo ?? ''}`"
      cancel-text="返回"
      @cancel="closing = undefined"
      @ok="confirmClose"
    >
      <div class="flex flex-col gap-2 py-2">
        <p class="m-0 text-sm text-muted-foreground">
          <template v-if="closing?.mode === 'cancel'">取消后这张采购单不再到货，也不能再修改。</template>
          <template v-else>已到货的部分保留在原材料库存里，剩下的不再到货。</template>
        </p>
        <label for="rp-close-reason" class="flex flex-col gap-1 text-xs text-muted-foreground">
          原因
          <Input id="rp-close-reason" v-model:value="closeReason" :maxlength="255" placeholder="例如 供应商缺货、改用其他供应商" />
        </label>
      </div>
    </Modal>
  </Page>
</template>
