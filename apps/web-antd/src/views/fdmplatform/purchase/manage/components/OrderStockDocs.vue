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

import { errorText } from '../../../data';
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
}>();
const emit = defineEmits<{ changed: [] }>();

const stockIns = ref<StockIn[]>([]);
const returns = ref<PurchaseReturn[]>([]);
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
        :scroll="{ x: 860 }"
        :row-class-name="
          (record: StockIn) => (record.status === 'VOIDED' ? 'voided' : '')
        "
        :columns="[
          { title: '入库单号', key: 'code', width: 190 },
          { title: '入库日期', dataIndex: 'receivedDate', width: 100 },
          { title: '仓库', dataIndex: 'warehouseName', width: 100 },
          { title: '实收 / 合格', key: 'quantity', width: 110, align: 'right' },
          { title: '已退', key: 'returned', width: 70, align: 'right' },
          { title: '金额', key: 'amount', width: 120, align: 'right' },
          { title: '操作', key: 'action', width: 130 },
        ]"
      >
        <template #emptyText>这张采购单还没有入库</template>
        <template #bodyCell="{ column, record }">
          <div v-if="column.key === 'code'" class="cell">
            <b class="mono">{{ record.code }}</b>
            <Space :size="4">
              <Tag v-if="record.status === 'VOIDED'" :title="record.voidReason">
                已作废
              </Tag>
              <Tag v-if="record.kind === 'FACTORY_PURCHASE'" color="orange">
                工厂收货
              </Tag>
              <Tag v-if="record.directShip" color="blue">
                直发 · {{ record.stockOutCode }}
              </Tag>
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
        :scroll="{ x: 860 }"
        :columns="[
          { title: '退货单号', key: 'code', width: 190 },
          { title: '退货日期', dataIndex: 'returnedDate', width: 100 },
          { title: '原入库单', key: 'stockIn', width: 150 },
          { title: '数量', key: 'quantity', width: 80, align: 'right' },
          { title: '金额', key: 'amount', width: 120, align: 'right' },
          { title: '原因', key: 'reason', width: 220 },
        ]"
      >
        <template #emptyText>这张采购单没有退过货</template>
        <template #bodyCell="{ column, record }">
          <div v-if="column.key === 'code'" class="cell">
            <b class="mono">{{ record.code }}</b>
            <Tag v-if="record.noReplacement" color="orange">不再补货</Tag>
            <Tag v-else color="blue">供应商补发</Tag>
          </div>
          <span v-else-if="column.key === 'stockIn'" class="mono">{{
            record.stockInCode
          }}</span>
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
        </template>
      </Table>
    </Card>
    <StockInDialog
      :open="receiving"
      :contract-id="contractId"
      :order-id="orderId"
      @close="receiving = false"
      @saved="
        (value, all) => {
          receiving = false;
          changed(
            `已入库 ${all.map((entry) => entry.code).join('、') || value.code}`,
          );
        }
      "
    />
    <PurchaseReturnDialog
      :stock-in="returning"
      @close="returning = undefined"
      @saved="
        (value) => {
          returning = undefined;
          changed(`已办理采购退货 ${value.code}`);
        }
      "
    />
    <VoidDialog
      :stock-in="voiding"
      @close="voiding = undefined"
      @saved="
        (code) => {
          voiding = undefined;
          changed(`已作废 ${code}`);
        }
      "
    />
  </Space>
</template>
