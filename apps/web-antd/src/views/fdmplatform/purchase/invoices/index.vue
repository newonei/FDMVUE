<script setup lang="ts">
import type { DocumentRow } from '#/api/fdmplatform';
import type { PurchaseInvoice } from '#/api/fdmplatform/procurement';

import { computed, defineAsyncComponent, ref, watch } from 'vue';

import { Page } from '@vben/common-ui';
import { downloadFileFromBlobPart } from '@vben/utils';

import {
  Alert,
  Button,
  Card,
  Input,
  message,
  Modal,
  Select,
  Space,
  Table,
  TableSummary,
  TableSummaryCell,
  TableSummaryRow,
  Tag,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import {
  downloadPurchaseInvoiceFile,
  getPurchaseInvoicePage,
} from '#/api/fdmplatform/procurement';
import { getProcurementFinanceSummary } from '#/api/fdmplatform/procurement-finance';

import { errorText } from '../../data';
import { useRouteOwner } from '../../documents/useRouteOwner';
import InvoiceUpload from '../../finance/procurement/components/InvoiceUpload.vue';
import OrderPicker from '../manage/components/OrderPicker.vue';

/**
 * 付款发票（金智「付款发票」）：所有采购单登记的供应商发票，按收票时间倒序；
 * 点采购单弹出采购单抽屉（与采购订单页同一个），可在这里先选采购单再上传发票。
 */
defineOptions({ name: 'FdmPlatformPurchaseInvoices' });

const PurchaseOrderExecution = defineAsyncComponent(
  () => import('../manage/index.vue'),
);
const TYPE_NAMES: Record<PurchaseInvoice['invoiceType'], string> = {
  SPECIAL: '增值税专票',
  ORDINARY: '增值税普票',
  OTHER: '其他',
};
const active = useRouteOwner();
const rows = ref<PurchaseInvoice[]>([]);
const total = ref(0);
const validTotals = ref<Array<{ amount: unknown; currency: string }>>([]);
const page = ref(1);
const keyword = ref('');
const status = ref<PurchaseInvoice['status']>();
const linked = ref<'NO' | 'YES'>();
const loading = ref(false);
const pageError = ref('');
const pickingOrder = ref(false);
const uploadOrder = ref<{
  contractId: string;
  currency?: string;
  orderId: string;
  payments: Array<{ label: string; value: string }>;
  title: string;
}>();
const openedOrder = ref<{ contractId: string; orderId: string }>();
let sequence = 0;

function money(value: unknown) {
  const amount = new BigNumber(String(value ?? ''));
  return amount.isFinite() ? amount.toFormat(2) : '—';
}
/** 税额 = 价税合计 × 税率 ÷ (1 + 税率)，和金智一样按发票金额推算 */
function taxOf(row: PurchaseInvoice) {
  const rate = new BigNumber(String(row.taxRate ?? ''));
  const amount = new BigNumber(String(row.amount ?? ''));
  if (!rate.isFinite() || !amount.isFinite()) return '—';
  return amount.times(rate).div(rate.plus(100)).toFormat(2);
}
const pageTotal = computed(() => {
  const totals = new Map<string, BigNumber>();
  for (const row of rows.value) {
    if (row.status !== 'VALID') continue;
    const currency = row.currency ?? 'CNY';
    totals.set(
      currency,
      (totals.get(currency) ?? new BigNumber(0)).plus(String(row.amount)),
    );
  }
  return (
    [...totals.entries()]
      .map(([currency, value]) => `${currency} ${value.toFormat(2)}`)
      .join(' / ') || '—'
  );
});
const allTotal = computed(
  () =>
    validTotals.value
      .map((entry) => `${entry.currency} ${money(entry.amount)}`)
      .join(' / ') || '—',
);

async function load() {
  if (!active.value) return;
  const run = ++sequence;
  loading.value = true;
  pageError.value = '';
  try {
    const result = await getPurchaseInvoicePage({
      keyword: keyword.value.trim() || undefined,
      status: status.value,
      linked: linked.value === undefined ? undefined : linked.value === 'YES',
      pageNo: page.value,
      pageSize: 20,
    });
    if (run !== sequence) return;
    rows.value = result.list;
    total.value = result.total;
    validTotals.value = result.validTotals;
  } catch (error) {
    if (run === sequence) pageError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
function search() {
  page.value = 1;
  void load();
}
async function download(row: PurchaseInvoice) {
  try {
    const blob = await downloadPurchaseInvoiceFile(row.id);
    downloadFileFromBlobPart({
      source: blob,
      fileName: row.file?.name ?? `${row.invoiceNo ?? '发票'}.pdf`,
    });
  } catch (error) {
    message.error(errorText(error));
  }
}
function openOrder(row: PurchaseInvoice) {
  const contractId = String(
    (row as unknown as Record<string, unknown>).contractId ?? '',
  );
  openedOrder.value = { contractId, orderId: row.orderId };
}
async function orderPicked(row: DocumentRow) {
  pickingOrder.value = false;
  const orderId = String(row.standaloneId ?? row.id);
  const contractId = row.standaloneId
    ? 'standalone'
    : String(row.contractId ?? '');
  try {
    const summary = await getProcurementFinanceSummary(contractId, orderId);
    const payments = Array.isArray(summary.payments)
      ? (summary.payments as Array<Record<string, unknown>>)
      : [];
    uploadOrder.value = {
      contractId,
      orderId,
      currency: String(summary.currency ?? ''),
      title: String(row.record?.code ?? row.record?.orderCode ?? '采购单'),
      payments: payments
        .filter((entry) =>
          ['CONFIRMED', 'PARTIALLY_REVERSED', 'REVERSED'].includes(
            String(entry.status),
          ),
        )
        .map((entry) => ({
          value: String(entry.id),
          label: `${String(entry.code)} · ${String(entry.paidAt ?? '')} · ${money(entry.amount)}`,
        })),
    };
  } catch (error) {
    message.error(errorText(error));
  }
}
function uploaded() {
  uploadOrder.value = undefined;
  message.success('付款发票已登记');
  void load();
}
watch(active, (value) => value && void load(), { immediate: true });
</script>

<template>
  <Page
    title="付款发票"
    description="供应商开来的发票，挂在采购单和付款记录下。"
  >
    <Card>
      <Space direction="vertical" size="middle" style="width: 100%">
        <Alert v-if="pageError" type="error" :message="pageError" show-icon />
        <Space wrap>
          <Input.Search
            v-model:value="keyword"
            allow-clear
            placeholder="发票号码、采购单号、供应商、付款单号"
            style="width: 300px"
            @search="search"
          />
          <Select
            v-model:value="status"
            allow-clear
            placeholder="全部状态"
            style="width: 120px"
            :options="[
              { value: 'VALID', label: '有效' },
              { value: 'VOID', label: '已作废' },
            ]"
            @change="search"
          />
          <Select
            v-model:value="linked"
            allow-clear
            placeholder="是否挂付款"
            style="width: 140px"
            :options="[
              { value: 'YES', label: '已挂付款记录' },
              { value: 'NO', label: '未挂付款记录' },
            ]"
            @change="search"
          />
          <Button type="primary" @click="pickingOrder = true">
            上传付款发票
          </Button>
          <Button :loading="loading" @click="load">刷新</Button>
        </Space>
        <Table
          class="fdm-business-table"
          size="small"
          row-key="id"
          table-layout="fixed"
          :scroll="{ x: 1250 }"
          :data-source="rows"
          :loading="loading"
          :pagination="{
            current: page,
            pageSize: 20,
            total,
            showSizeChanger: false,
            showTotal: (value: number) => `共 ${value} 张`,
          }"
          :columns="[
            { title: '票据金额', key: 'amount', width: 130, align: 'right' },
            {
              title: '供应商',
              dataIndex: 'supplierName',
              width: 200,
              ellipsis: true,
            },
            { title: '采购单', key: 'order', width: 170 },
            { title: '发票号码', key: 'invoiceNo', width: 190 },
            { title: '开票日期', dataIndex: 'invoiceDate', width: 110 },
            { title: '票据类型', key: 'type', width: 140 },
            { title: '税金', key: 'tax', width: 100, align: 'right' },
            { title: '对应付款', key: 'payment', width: 150 },
            { title: '原件', key: 'file', width: 160, ellipsis: true },
            { title: '状态', key: 'status', width: 80 },
          ]"
          @change="
            (value) => {
              page = value.current ?? 1;
              load();
            }
          "
        >
          <template #emptyText>还没有登记付款发票</template>
          <template #summary>
            <TableSummary v-if="rows.length > 0">
              <TableSummaryRow class="sum-row">
                <TableSummaryCell :index="0" align="right">
                  <span class="num">{{ pageTotal }}</span>
                </TableSummaryCell>
                <TableSummaryCell :index="1" :col-span="9">
                  本页合计（有效发票）
                </TableSummaryCell>
              </TableSummaryRow>
              <TableSummaryRow class="sum-row">
                <TableSummaryCell :index="0" align="right">
                  <span class="num">{{ allTotal }}</span>
                </TableSummaryCell>
                <TableSummaryCell :index="1" :col-span="9">
                  全部合计（有效发票）
                </TableSummaryCell>
              </TableSummaryRow>
            </TableSummary>
          </template>
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'amount'" class="num">
              {{ record.currency ?? '' }} {{ money(record.amount) }}
            </span>
            <Button
              v-else-if="column.key === 'order'"
              type="link"
              size="small"
              @click="openOrder(record as PurchaseInvoice)"
            >
              {{ record.orderCode || '查看采购单' }}
            </Button>
            <span v-else-if="column.key === 'invoiceNo'">{{
              record.invoiceNo || '—'
            }}</span>
            <span v-else-if="column.key === 'type'">
              {{
                TYPE_NAMES[
                  record.invoiceType as PurchaseInvoice['invoiceType']
                ]
              }}{{
                record.taxRate === null || record.taxRate === undefined
                  ? ''
                  : ` | ${record.taxRate}%`
              }}
            </span>
            <span v-else-if="column.key === 'tax'" class="num">{{
              taxOf(record as PurchaseInvoice)
            }}</span>
            <span v-else-if="column.key === 'payment'">{{
              record.paymentCode || '未挂付款'
            }}</span>
            <Button
              v-else-if="column.key === 'file' && record.file"
              type="link"
              size="small"
              :title="record.file.name"
              @click="download(record as PurchaseInvoice)"
            >
              {{ record.file.name }}
            </Button>
            <span v-else-if="column.key === 'file'" class="muted">无原件</span>
            <Tag
              v-else-if="column.key === 'status'"
              :color="record.status === 'VALID' ? 'success' : 'default'"
              :title="record.voidReason"
            >
              {{ record.status === 'VALID' ? '有效' : '已作废' }}
            </Tag>
          </template>
        </Table>
      </Space>
    </Card>
    <OrderPicker
      :open="pickingOrder && active"
      @close="pickingOrder = false"
      @selected="orderPicked"
    />
    <Modal
      :open="!!uploadOrder && active"
      :title="`上传付款发票 · ${uploadOrder?.title ?? ''}`"
      width="760px"
      :footer="null"
      :mask-closable="false"
      destroy-on-close
      @cancel="uploadOrder = undefined"
    >
      <InvoiceUpload
        v-if="uploadOrder"
        :contract-id="uploadOrder.contractId"
        :order-id="uploadOrder.orderId"
        :currency="uploadOrder.currency"
        :payment-options="uploadOrder.payments"
        @saved="uploaded"
      />
    </Modal>
    <PurchaseOrderExecution
      v-if="openedOrder && active"
      :embedded-order="openedOrder"
      @close="openedOrder = undefined"
      @updated="load"
    />
  </Page>
</template>

<style scoped>
.num {
  font-variant-numeric: tabular-nums;
}

.muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.sum-row :deep(td) {
  font-weight: 600;
  background: hsl(var(--accent));
}
</style>
