<script setup lang="ts">
import type { DocumentRow } from '#/api/fdmplatform';
import type {
  InvoicePaymentStatus,
  InvoiceSourceOrder,
  PurchaseInvoice,
} from '#/api/fdmplatform/procurement';

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
  getOrderInvoices,
  getPurchaseInvoicePage,
} from '#/api/fdmplatform/procurement';
import { getProcurementFinanceSummary } from '#/api/fdmplatform/procurement-finance';

import { errorText } from '../../data';
import { useRouteOwner } from '../../documents/useRouteOwner';
import FinanceDocument from '../../finance/procurement/components/FinanceDocument.vue';
import InvoiceSourcesDialog from '../../finance/procurement/components/InvoiceSourcesDialog.vue';
import InvoiceUpload from '../../finance/procurement/components/InvoiceUpload.vue';
import PaymentRecordDialog from '../../finance/procurement/components/PaymentRecordDialog.vue';
import { confirmVoidInvoice } from '../../finance/procurement/components/void-invoice';
import {
  invoicePaymentLimit,
  invoicePaymentStates,
} from '../../finance/procurement/invoice-model';
import OrderPicker from '../manage/components/OrderPicker.vue';
import InvoiceDetail from './components/InvoiceDetail.vue';

/**
 * 付款发票（金智「付款发票」）：所有采购单登记的供应商发票，按收票时间倒序；
 * 点采购单弹出采购单抽屉（与采购订单页同一个），可在这里先选采购单再上传发票；
 * 集中收票（多张采购单合开一张）在采购订单列表勾选后办理，这里显示「N 个采购单 · 查看来源」。
 * 收票不等于付款：「增加付款」新建一张付款记录挂在这张发票上，已付、未付、付款状态由付款记录汇总。
 * 识别错、录错的发票在这里直接作废后重传（已有付款的须先冲销付款）。
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
const paymentStatus = ref<InvoicePaymentStatus>();
/** 查看来源 / 详情 / 增加付款 / 打开付款记录 */
const sourceInvoice = ref<PurchaseInvoice>();
const detailId = ref<string>();
const detailReload = ref(0);
const paying = ref<PurchaseInvoice>();
const openedPayment = ref<string>();
const loading = ref(false);
const pageError = ref('');
const pickingOrder = ref(false);
const uploadOrder = ref<{
  contractId: string;
  currency?: string;
  /** 修改这张发票；为空是新登记 */
  invoice?: PurchaseInvoice;
  orderId: string;
  payments: Array<{ label: string; value: string }>;
  remaining?: string;
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
      paymentStatus: paymentStatus.value,
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
  await openUpload(
    row.standaloneId ? 'standalone' : String(row.contractId ?? ''),
    String(row.standaloneId ?? row.id),
    String(row.record?.code ?? row.record?.orderCode ?? '采购单'),
  );
}
function openSourceOrder(order: InvoiceSourceOrder) {
  openedOrder.value = { contractId: order.contractId, orderId: order.orderId };
}
function addPayment(row: PurchaseInvoice) {
  paying.value = row;
}
function paid() {
  message.success('付款已登记');
  paying.value = undefined;
  detailReload.value += 1;
  void load();
}
function edit(row: PurchaseInvoice) {
  // 集中收票的发票：分配表用发票上已关联的采购单，不再按单张单取未收票
  if ((row.orders?.length ?? 0) > 1) {
    uploadOrder.value = {
      contractId: row.orders![0]!.contractId || 'standalone',
      orderId: row.orderId,
      currency: row.currency,
      invoice: row,
      title: `${row.orderCount} 个采购单`,
      payments: [],
    };
    return;
  }
  // 独立采购单的发票 contractId 存的是空串
  const contractId =
    String((row as unknown as Record<string, unknown>).contractId ?? '') ||
    'standalone';
  void openUpload(contractId, row.orderId, row.orderCode ?? '采购单', row);
}
/** 登记 / 修改发票前取采购单的币种、付款记录和未收票金额 */
async function openUpload(
  contractId: string,
  orderId: string,
  title: string,
  invoice?: PurchaseInvoice,
) {
  try {
    const [summary, invoices] = await Promise.all([
      getProcurementFinanceSummary(contractId, orderId),
      getOrderInvoices(contractId, orderId),
    ]);
    const orderAmount = new BigNumber(String(summary.orderAmount ?? ''));
    const payments = Array.isArray(summary.payments)
      ? (summary.payments as Array<Record<string, unknown>>)
      : [];
    uploadOrder.value = {
      contractId,
      orderId,
      currency: String(summary.currency ?? ''),
      invoice,
      title,
      remaining: orderAmount.isFinite()
        ? orderAmount.minus(String(invoices.invoicedAmount)).toFixed(2)
        : undefined,
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
function remove(row: PurchaseInvoice) {
  confirmVoidInvoice(row, load);
}
function uploaded() {
  message.success(uploadOrder.value?.invoice ? '发票已修改' : '付款发票已登记');
  uploadOrder.value = undefined;
  detailReload.value += 1;
  void load();
}
watch(active, (value) => value && void load(), { immediate: true });
</script>

<template>
  <Page
    title="付款发票"
    description="供应商开来的发票，挂在采购单上；集中收票一张发票可关联多张采购单。收票不等于付款，付款从「增加付款」登记。"
  >
    <Card>
      <Space direction="vertical" size="middle" style="width: 100%">
        <Alert v-if="pageError" type="error" :message="pageError" show-icon />
        <Space wrap>
          <Input.Search
            v-model:value="keyword"
            allow-clear
            placeholder="发票编号、号码、采购单号、供应商、付款单号"
            style="width: 320px"
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
            v-model:value="paymentStatus"
            allow-clear
            placeholder="付款状态"
            style="width: 120px"
            :options="
              Object.entries(invoicePaymentStates).map(([value, state]) => ({
                value,
                label: state.label,
              }))
            "
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
          <span class="muted">集中收票：在采购订单列表勾选同一供应商的采购单后办理</span>
        </Space>
        <Table
          class="fdm-business-table"
          size="small"
          row-key="id"
          table-layout="fixed"
          :scroll="{ x: 1780 }"
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
            { title: '发票金额', key: 'amount', width: 130, align: 'right' },
            { title: '已付款', key: 'paid', width: 110, align: 'right' },
            { title: '未付款', key: 'unpaid', width: 110, align: 'right' },
            { title: '付款状态', key: 'paymentStatus', width: 90 },
            {
              title: '供应商',
              dataIndex: 'supplierName',
              width: 190,
              ellipsis: true,
            },
            { title: '关联采购单', key: 'order', width: 190 },
            { title: '发票编号 / 号码', key: 'invoiceNo', width: 200 },
            { title: '收票日期', key: 'receivedAt', width: 100 },
            { title: '开票日期', dataIndex: 'invoiceDate', width: 100 },
            { title: '票据类型', key: 'type', width: 130 },
            { title: '税金', key: 'tax', width: 90, align: 'right' },
            { title: '经手人', dataIndex: 'createdByName', width: 80 },
            { title: '对应付款', key: 'payment', width: 140 },
            { title: '原件', key: 'file', width: 140, ellipsis: true },
            { title: '状态', key: 'status', width: 70 },
            { title: '操作', key: 'action', width: 200, fixed: 'right' },
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
                <TableSummaryCell :index="1" :col-span="14">
                  本页合计（有效发票）
                </TableSummaryCell>
                <TableSummaryCell :index="15" />
              </TableSummaryRow>
              <TableSummaryRow class="sum-row">
                <TableSummaryCell :index="0" align="right">
                  <span class="num">{{ allTotal }}</span>
                </TableSummaryCell>
                <TableSummaryCell :index="1" :col-span="14">
                  全部合计（有效发票）
                </TableSummaryCell>
                <TableSummaryCell :index="15" />
              </TableSummaryRow>
            </TableSummary>
          </template>
          <template #bodyCell="{ column, record }">
            <span v-if="column.key === 'amount'" class="num">
              {{ record.currency ?? '' }} {{ money(record.amount) }}
            </span>
            <span v-else-if="column.key === 'paid'" class="num">
              {{ record.status === 'VALID' ? money(record.paidAmount) : '—' }}
            </span>
            <span v-else-if="column.key === 'unpaid'" class="num">
              {{ record.status === 'VALID' ? money(record.unpaidAmount) : '—' }}
            </span>
            <template v-else-if="column.key === 'paymentStatus'">
              <Tag
                v-if="record.paymentStatus"
                :color="
                  invoicePaymentStates[
                    record.paymentStatus as InvoicePaymentStatus
                  ].color
                "
              >
                {{
                  invoicePaymentStates[
                    record.paymentStatus as InvoicePaymentStatus
                  ].label
                }}
              </Tag>
              <span v-else class="muted">—</span>
            </template>
            <Button
              v-else-if="column.key === 'order' && (record.orderCount ?? 1) > 1"
              type="link"
              size="small"
              @click="sourceInvoice = record as PurchaseInvoice"
            >
              {{ record.orderCount }} 个采购单 · 查看来源
            </Button>
            <Button
              v-else-if="column.key === 'order'"
              type="link"
              size="small"
              @click="openOrder(record as PurchaseInvoice)"
            >
              {{ record.orderCode || '查看采购单' }}
            </Button>
            <span v-else-if="column.key === 'invoiceNo'" class="stack">
              <span>{{ record.code || '—' }}</span>
              <span class="muted">{{ record.invoiceNo || '无号码' }}</span>
            </span>
            <span v-else-if="column.key === 'receivedAt'">
              {{ String(record.createdAt ?? '').slice(0, 10) || '—' }}
            </span>
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
              record.paymentCode || '—'
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
            <span v-else-if="column.key === 'action'" class="actions">
              <Button
                type="link"
                size="small"
                @click="detailId = String(record.id)"
              >
                详情
              </Button>
              <template v-if="record.status === 'VALID'">
                <Button
                  type="link"
                  size="small"
                  :disabled="!(Number(record.unpaidAmount ?? 0) > 0)"
                  @click="addPayment(record as PurchaseInvoice)"
                >
                  增加付款
                </Button>
                <Button
                  type="link"
                  size="small"
                  @click="edit(record as PurchaseInvoice)"
                >
                  修改
                </Button>
                <Button
                  type="link"
                  size="small"
                  danger
                  @click="remove(record as PurchaseInvoice)"
                >
                  作废
                </Button>
              </template>
            </span>
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
      :title="`${uploadOrder?.invoice ? '修改' : '上传'}付款发票 · ${uploadOrder?.title ?? ''}`"
      width="760px"
      :footer="null"
      :mask-closable="false"
      destroy-on-close
      @cancel="uploadOrder = undefined"
    >
      <InvoiceUpload
        v-if="uploadOrder"
        :invoice="uploadOrder.invoice"
        :contract-id="uploadOrder.contractId"
        :order-id="uploadOrder.orderId"
        :currency="uploadOrder.currency"
        :payment-options="uploadOrder.payments"
        :remaining="uploadOrder.remaining"
        @saved="uploaded"
      />
    </Modal>
    <InvoiceSourcesDialog
      :open="!!sourceInvoice && active"
      :invoice-id="sourceInvoice?.id"
      @close="sourceInvoice = undefined"
      @open-order="openSourceOrder"
    />
    <InvoiceDetail
      :open="!!detailId && active"
      :invoice-id="detailId"
      :reload="detailReload"
      @close="detailId = undefined"
      @add-payment="addPayment"
      @open-order="openSourceOrder"
      @open-payment="(id) => (openedPayment = id)"
    />
    <PaymentRecordDialog
      :open="!!paying && active"
      contract-id=""
      order-id=""
      :currency="paying?.currency"
      :supplier-name="paying?.supplierName"
      :available="invoicePaymentLimit(paying?.unpaidAmount)?.toFixed(2)"
      :invoice="
        paying
          ? {
              id: paying.id,
              code: paying.code,
              invoiceNo: paying.invoiceNo,
              amount: paying.amount,
              paidAmount: paying.paidAmount,
              unpaidAmount: paying.unpaidAmount,
              orderCount: paying.orderCount,
              supplierName: paying.supplierName,
            }
          : undefined
      "
      @close="paying = undefined"
      @saved="paid"
    />
    <FinanceDocument
      :open="!!openedPayment && active"
      type="PAYMENT"
      :record-id="openedPayment"
      @close="openedPayment = undefined"
      @updated="
        () => {
          detailReload += 1;
          load();
        }
      "
    />
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

.actions {
  white-space: nowrap;
}

.stack {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
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
