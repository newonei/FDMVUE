<script setup lang="ts">
import type {
  InvoiceSourceOrder,
  PurchaseInvoice,
} from '#/api/fdmplatform/procurement';

import { computed, ref, watch } from 'vue';

import { downloadFileFromBlobPart } from '@vben/utils';

import {
  Alert,
  Button,
  Descriptions,
  DescriptionsItem,
  message,
  Spin,
  Table,
  Tag,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import {
  downloadPurchaseInvoiceFile,
  getPurchaseInvoiceDetail,
} from '#/api/fdmplatform/procurement';
import { FdmResizableDrawer } from '#/components/fdm-resizable-drawer';

import { errorText } from '../../../data';
import InvoiceSourceTable from '../../../finance/procurement/components/InvoiceSourceTable.vue';
import { invoicePaymentStates } from '../../../finance/procurement/invoice-model';
import { financeStatus } from '../../../finance/procurement/model';

/**
 * 付款发票详情：发票信息、来源采购单（含本发票关联金额与合计）、这张发票的付款记录；
 * 底部是发票金额、累计已付、剩余未付，可在这里「增加付款」（新建付款记录，不改发票）。
 */
const props = defineProps<{
  invoiceId?: string;
  open: boolean;
  reload?: number;
}>();
const emit = defineEmits<{
  addPayment: [invoice: PurchaseInvoice];
  close: [];
  openOrder: [order: InvoiceSourceOrder];
  openPayment: [id: string];
}>();

type Detail = Awaited<ReturnType<typeof getPurchaseInvoiceDetail>>;
const TYPE_NAMES: Record<PurchaseInvoice['invoiceType'], string> = {
  SPECIAL: '增值税专票',
  ORDINARY: '增值税普票',
  OTHER: '其他',
};
const detail = ref<Detail>();
const loading = ref(false);
const error = ref('');

function money(value: unknown) {
  const amount = new BigNumber(String(value ?? ''));
  return amount.isFinite() ? amount.toFormat(2) : '—';
}
const unpaid = computed(
  () => new BigNumber(String(detail.value?.unpaidAmount ?? 0)),
);

async function load() {
  if (!props.open || !props.invoiceId) return;
  loading.value = true;
  error.value = '';
  try {
    detail.value = await getPurchaseInvoiceDetail(props.invoiceId);
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    loading.value = false;
  }
}
watch(() => [props.open, props.invoiceId, props.reload], load, {
  immediate: true,
});

async function download() {
  if (!detail.value) return;
  try {
    const blob = await downloadPurchaseInvoiceFile(detail.value.id);
    downloadFileFromBlobPart({
      source: blob,
      fileName:
        detail.value.file?.name ?? `${detail.value.invoiceNo ?? '发票'}.pdf`,
    });
  } catch (error_) {
    message.error(errorText(error_));
  }
}
</script>

<template>
  <FdmResizableDrawer
    resize-key="purchase-invoice"
    :open="open"
    :title="`付款发票 · ${detail?.code ?? detail?.invoiceNo ?? ''}`"
    width="min(1180px,97vw)"
    @close="emit('close')"
  >
    <Alert v-if="error" type="error" :message="error" show-icon />
    <Spin :spinning="loading">
      <div v-if="detail" class="detail">
        <section>
          <h4>发票信息</h4>
          <Descriptions size="small" bordered :column="3">
            <DescriptionsItem label="发票编号">
              {{ detail.code ?? '—' }}
            </DescriptionsItem>
            <DescriptionsItem label="供应商">
              {{ detail.supplierName ?? '—' }}
            </DescriptionsItem>
            <DescriptionsItem label="发票号码">
              {{ detail.invoiceNo ?? '—' }}
            </DescriptionsItem>
            <DescriptionsItem label="发票金额">
              <span class="num">{{ detail.currency ?? '' }} {{ money(detail.amount) }}</span>
            </DescriptionsItem>
            <DescriptionsItem label="收票日期">
              {{ detail.createdAt?.slice(0, 10) ?? '—' }}
            </DescriptionsItem>
            <DescriptionsItem label="开票日期">
              {{ detail.invoiceDate ?? '—' }}
            </DescriptionsItem>
            <DescriptionsItem label="票据类型">
              {{ TYPE_NAMES[detail.invoiceType] }}
            </DescriptionsItem>
            <DescriptionsItem label="税率">
              {{
                detail.taxRate === null || detail.taxRate === undefined
                  ? '—'
                  : `${detail.taxRate}%`
              }}
            </DescriptionsItem>
            <DescriptionsItem label="经手人">
              {{ detail.createdByName ?? '—' }}
            </DescriptionsItem>
            <DescriptionsItem label="附件">
              <Button
                v-if="detail.file"
                type="link"
                size="small"
                @click="download"
              >
                {{ detail.file.name }}
              </Button>
              <span v-else>无原件</span>
            </DescriptionsItem>
            <DescriptionsItem label="状态">
              <Tag v-if="detail.status === 'VOID'">已作废</Tag>
              <Tag
                v-else-if="detail.paymentStatus"
                :color="invoicePaymentStates[detail.paymentStatus].color"
              >
                {{ invoicePaymentStates[detail.paymentStatus].label }}
              </Tag>
            </DescriptionsItem>
            <DescriptionsItem label="备注">
              {{ detail.remark ?? '—' }}
            </DescriptionsItem>
          </Descriptions>
        </section>
        <section>
          <h4>来源采购单</h4>
          <InvoiceSourceTable
            :orders="detail.sources"
            :currency="detail.currency"
            @open="(order) => emit('openOrder', order)"
          />
        </section>
        <section>
          <div class="head">
            <h4>付款记录</h4>
            <Button
              v-if="detail.status === 'VALID'"
              type="primary"
              size="small"
              :disabled="!unpaid.gt(0)"
              @click="emit('addPayment', detail)"
            >
              增加付款
            </Button>
          </div>
          <Table
            class="fdm-business-table"
            size="small"
            row-key="id"
            :pagination="false"
            :data-source="detail.payments"
            :columns="[
              { title: '付款单号', key: 'code', width: 200 },
              { title: '付款日期', dataIndex: 'paidAt', width: 110 },
              {
                title: '本次付款金额',
                key: 'amount',
                width: 140,
                align: 'right',
              },
              { title: '付款方式', key: 'method', width: 240, ellipsis: true },
              { title: '经手人', dataIndex: 'createdByName', width: 100 },
              { title: '状态', key: 'status', width: 130 },
            ]"
          >
            <template #emptyText>还没有付款</template>
            <template #bodyCell="{ column, record }">
              <Button
                v-if="column.key === 'code'"
                type="link"
                size="small"
                @click="emit('openPayment', String(record.id))"
              >
                {{ record.code }}
              </Button>
              <span v-else-if="column.key === 'amount'" class="num">
                {{ money(record.amount) }}
              </span>
              <span v-else-if="column.key === 'method'">
                {{
                  [record.paymentMethod, record.payerAccount]
                    .filter(Boolean)
                    .join(' · ') || '—'
                }}
              </span>
              <span v-else-if="column.key === 'status'">
                {{ financeStatus(record.status) }}
              </span>
            </template>
          </Table>
          <div class="totals">
            <span>发票金额 <b class="num">{{ money(detail.amount) }}</b></span>
            <span>累计已付 <b class="num">{{ money(detail.paidAmount) }}</b></span>
            <span>剩余未付
              <b class="num">{{ money(detail.unpaidAmount) }}</b></span>
            <span class="muted">已付只算已确认的付款，扣除退款 / 冲销</span>
          </div>
        </section>
      </div>
    </Spin>
  </FdmResizableDrawer>
</template>

<style scoped>
.detail {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

h4 {
  margin: 0 0 8px;
  font-weight: 600;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.head h4 {
  margin: 0;
}

.totals {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 20px;
  align-items: center;
  padding: 8px 12px;
  margin-top: 8px;
  font-size: 13px;
  background: hsl(var(--accent));
  border-radius: 6px;
}

.num {
  font-variant-numeric: tabular-nums;
}

.muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>
