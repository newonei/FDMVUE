<script setup lang="ts">
import type { PurchaseReturn, StockIn } from '#/api/fdmplatform/warehouse';

import { computed, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Card,
  message,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { getPurchaseReturns, getStockIns } from '#/api/fdmplatform/warehouse';
import AiReviewStatus from '#/views/fdmaicheck/components/AiReviewStatus.vue';
import { useAiReviewStatuses } from '#/views/fdmaicheck/components/useAiReviewStatuses';

import { errorText } from '../../../data';
import { referenceId } from '../../../documents/navigation';
import {
  inSubject,
  returnSubject,
} from '../../../inventory-center/components/doc-model';
import { money, qty } from '../../warehouse/model';
import PurchaseReturnDialog from '../../warehouse/PurchaseReturnDialog.vue';
import { canReturn, canVoidStockIn } from '../../warehouse/return-model';
import StockInDialog from '../../warehouse/StockInDialog.vue';
import VoidDialog from '../../warehouse/VoidDialog.vue';

import '../../warehouse/warehouse-pages.css';

/** 采购单的「入库与退货」：这张单的入库单（含作废）与采购退货单，可在这里登记入库、退货与作废。 */
const props = defineProps<{
  /** 采购单已结束或取消时不再登记入库 */
  canReceive: boolean;
  contractId: string;
  orderId: string;
  /** 合同里登记、但没有采购入库单的到货（工厂外采到货等） */
  otherArrivals?: Record<string, unknown>[];
}>();
const emit = defineEmits<{ changed: [] }>();

const stockIns = ref<StockIn[]>([]);
const returns = ref<PurchaseReturn[]>([]);
const { statusFor, refresh: refreshReviewStatuses } = useAiReviewStatuses(
  () => [
    ...stockIns.value.map((row) => ({
      docType: 'STOCK_IN' as const,
      docId: row.id,
    })),
    ...returns.value.map((row) => ({
      docType: 'PURCHASE_RETURN' as const,
      docId: row.id,
    })),
    ...(props.otherArrivals ?? []).map((row) => ({
      docType: 'ARRIVAL' as const,
      docId: referenceId(row.id),
    })),
  ],
);
const loading = ref(false);
const error = ref('');
const receiving = ref(false);
const returning = ref<StockIn>();
const voiding = ref<StockIn>();

const sum = (lines: { quantity: unknown }[]) =>
  lines.reduce((value, line) => value + Number(line.quantity ?? 0), 0);
const accepted = (row: StockIn) =>
  row.lines.reduce((value, line) => value + Number(line.acceptedQuantity), 0);
const returnedOf = (row: StockIn) =>
  row.lines.reduce(
    (value, line) =>
      value +
      Number(line.returnedAcceptedQuantity ?? 0) +
      Number(line.returnedExceptionQuantity ?? 0),
    0,
  );
const arrivalReturned = (row: Record<string, unknown>) =>
  Number(row.returnedAcceptedQuantity ?? 0) +
  Number(row.returnedExceptionQuantity ?? 0);
const factoryArrival = (row: Record<string, unknown>) =>
  String(row.evidenceRef ?? '').startsWith('DH');
const effective = computed(() =>
  stockIns.value.filter((row) => row.status !== 'VOIDED'),
);

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const [ins, outs] = await Promise.all([
      getStockIns({ pageNo: 1, pageSize: 100, orderId: props.orderId }),
      getPurchaseReturns({ pageNo: 1, pageSize: 100, orderId: props.orderId }),
    ]);
    stockIns.value = ins.list;
    returns.value = outs.list;
    void refreshReviewStatuses();
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    loading.value = false;
  }
}
function changed(text: string) {
  message.success(text);
  void load();
  emit('changed');
}
watch(() => props.orderId, load, { immediate: true });
</script>

<template>
  <Space direction="vertical" size="middle" style="width: 100%">
    <Alert v-if="error" type="error" :message="error" show-icon />
    <Card size="small">
      <template #title>
        入库单
        <span class="procurement-muted">
          {{ effective.length }} 张有效
          <template v-if="stockIns.length > effective.length">
            · {{ stockIns.length - effective.length }} 张已作废
          </template>
        </span>
      </template>
      <template #extra>
        <Space>
          <Button size="small" :loading="loading" @click="load">刷新</Button>
          <Button
            v-if="canReceive"
            size="small"
            type="primary"
            @click="receiving = true"
          >
            登记入库
          </Button>
        </Space>
      </template>
      <Table
        class="warehouse-page fdm-business-table"
        size="small"
        row-key="id"
        :data-source="stockIns"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: 1030 }"
        :row-class-name="
          (record: StockIn) => (record.status === 'VOIDED' ? 'voided' : '')
        "
        :columns="[
          { title: '入库主题', key: 'subject', width: 190 },
          { title: '入库日期', dataIndex: 'receivedDate', width: 100 },
          { title: '仓库', dataIndex: 'warehouseName', width: 100 },
          { title: '实收 / 合格', key: 'quantity', width: 110, align: 'right' },
          { title: '已退', key: 'returned', width: 70, align: 'right' },
          { title: '金额', key: 'amount', width: 120, align: 'right' },
          { title: 'AI 审核', key: 'aiReview', width: 170 },
          { title: '操作', key: 'action', width: 130 },
        ]"
      >
        <template #emptyText>这张采购单还没有入库</template>
        <template #bodyCell="{ column, record }">
          <div v-if="column.key === 'subject'" class="cell">
            <b>{{ inSubject(record as StockIn) }}</b>
            <Space :size="4">
              <Tag v-if="record.status === 'VOIDED'" :title="record.voidReason">
                已作废
              </Tag>
              <Tag v-if="record.kind === 'FACTORY_PURCHASE'" color="orange">
                工厂收货
              </Tag>
              <Tag
                v-if="record.kind === 'FACTORY_MADE'"
                color="orange"
                title="自家工厂完工登记：货留在工厂库存，要冲回请在工厂排单的完工记录上作废"
              >
                工厂完工 · {{ record.warehouseName }}
              </Tag>
              <Tag v-if="record.directShip" color="blue"> 直发出库 </Tag>
            </Space>
          </div>
          <span v-else-if="column.key === 'quantity'" class="num">
            {{ qty(sum(record.lines)) }} /
            <b>{{ qty(accepted(record as StockIn)) }}</b>
          </span>
          <span v-else-if="column.key === 'returned'" class="num">{{
            returnedOf(record as StockIn)
              ? qty(returnedOf(record as StockIn))
              : '—'
          }}</span>
          <span v-else-if="column.key === 'amount'" class="num">{{
            money(record.amount, record.currency)
          }}</span>
          <AiReviewStatus
            v-else-if="column.key === 'aiReview'"
            :status="statusFor('STOCK_IN', record.id)"
          />
          <div v-else-if="column.key === 'action'" class="row-actions">
            <span
              v-if="record.status === 'VOIDED'"
              class="muted ellipsis"
              :title="record.voidReason"
              >{{ record.voidReason }}</span>
            <template v-else>
              <Button
                v-if="canReturn(record as StockIn)"
                size="small"
                type="link"
                @click="returning = record as StockIn"
              >
                退货
              </Button>
              <Button
                v-if="canVoidStockIn(record as StockIn)"
                danger
                size="small"
                type="link"
                @click="voiding = record as StockIn"
              >
                作废
              </Button>
            </template>
          </div>
        </template>
      </Table>
    </Card>
    <Card v-if="otherArrivals?.length" size="small">
      <template #title>
        其他到货登记
        <span class="procurement-muted">
          {{ otherArrivals.length }} 笔，没有入库单，但计入入库比例
        </span>
      </template>
      <Table
        class="warehouse-page fdm-business-table"
        size="small"
        row-key="id"
        :data-source="otherArrivals"
        :pagination="false"
        :scroll="{ x: 1030 }"
        :columns="[
          { title: '到货凭据', key: 'code', width: 190 },
          { title: '登记时间', key: 'time', width: 140 },
          { title: '实收 / 合格', key: 'quantity', width: 110, align: 'right' },
          { title: '已退', key: 'returned', width: 70, align: 'right' },
          { title: 'AI 审核', key: 'aiReview', width: 170 },
          { title: '说明', key: 'note' },
        ]"
      >
        <template #bodyCell="{ column, record }">
          <b v-if="column.key === 'subject'" class="mono">{{
            record.evidenceRef || '—'
          }}</b>
          <span v-else-if="column.key === 'time'">{{
            String(record.occurredAt ?? '')
              .replace('T', ' ')
              .slice(0, 16)
          }}</span>
          <span v-else-if="column.key === 'quantity'" class="num">
            {{ qty(record.quantity) }} /
            <b>{{ qty(record.acceptedQuantity) }}</b>
          </span>
          <span v-else-if="column.key === 'returned'" class="num">{{
            arrivalReturned(record) ? qty(arrivalReturned(record)) : '—'
          }}</span>
          <AiReviewStatus
            v-else-if="column.key === 'aiReview'"
            :status="statusFor('ARRIVAL', referenceId(record.id))"
          />
          <span v-else-if="column.key === 'note'" class="muted">{{
            factoryArrival(record)
              ? '工厂外采到货，要作废请到工厂「到货入库」的到货记录里作废'
              : '直接登记的合同到货'
          }}</span>
        </template>
      </Table>
    </Card>
    <Card size="small">
      <template #title>
        采购退货单
        <span class="procurement-muted">{{ returns.length }} 张</span>
      </template>
      <Table
        class="warehouse-page fdm-business-table"
        size="small"
        row-key="id"
        :data-source="returns"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: 1030 }"
        :columns="[
          { title: '退货主题', key: 'subject', width: 190 },
          { title: '退货日期', dataIndex: 'returnedDate', width: 100 },
          { title: '原入库单', key: 'stockIn', width: 150 },
          { title: '数量', key: 'quantity', width: 80, align: 'right' },
          { title: '金额', key: 'amount', width: 120, align: 'right' },
          { title: '原因', key: 'reason', width: 220 },
          { title: 'AI 审核', key: 'aiReview', width: 170 },
        ]"
      >
        <template #emptyText>这张采购单没有退过货</template>
        <template #bodyCell="{ column, record }">
          <div v-if="column.key === 'subject'" class="cell">
            <b>{{ returnSubject(record as PurchaseReturn) }}</b>
            <Tag v-if="record.noReplacement" color="orange">不再补货</Tag>
            <Tag v-else color="blue">供应商补发</Tag>
          </div>
          <span v-else-if="column.key === 'stockIn'">关联入库单</span>
          <span v-else-if="column.key === 'quantity'" class="num">{{
            qty(sum(record.lines))
          }}</span>
          <span v-else-if="column.key === 'amount'" class="num">{{
            money(record.amount, record.currency)
          }}</span>
          <span
            v-else-if="column.key === 'reason'"
            class="ellipsis"
            :title="record.reason"
            >{{ record.reason }}</span>
          <AiReviewStatus
            v-else-if="column.key === 'aiReview'"
            :status="statusFor('PURCHASE_RETURN', record.id)"
          />
        </template>
      </Table>
    </Card>
    <StockInDialog
      :open="receiving"
      :contract-id="contractId"
      :order-id="orderId"
      @close="receiving = false"
      @saved="
        (_value, all) => {
          receiving = false;
          changed(`已生成 ${all.length || 1} 张入库单`);
        }
      "
    />
    <PurchaseReturnDialog
      :stock-in="returning"
      @close="returning = undefined"
      @saved="
        () => {
          returning = undefined;
          changed('已办理采购退货');
        }
      "
    />
    <VoidDialog
      :stock-in="voiding"
      @close="voiding = undefined"
      @saved="
        () => {
          voiding = undefined;
          changed('已作废入库单');
        }
      "
    />
  </Space>
</template>
