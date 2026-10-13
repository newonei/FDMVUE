<script setup lang="ts">
import type { BusinessRecord } from '#/api/fdmplatform';
import type { ProcurementOrderView } from '#/api/fdmplatform/procurement';

import { computed } from 'vue';

import { Table } from 'ant-design-vue';

import { rows } from '../../../data';
import { procurementLineAmount } from '../../../finance/procurement/model';
import { snapshotShape } from '../model';

/**
 * 采购单产品明细：放在供应商信息下方、页签上方，切换页签时一直可见。
 */
const props = defineProps<{ view: ProcurementOrderView }>();
const productLines = computed(() =>
  rows(props.view.order.lines).map((line) => ({
    ...line,
    unit:
      (line.specificationSnapshot as Record<string, unknown>)?.unit ??
      line.unit,
    amount: procurementLineAmount(line, String(props.view.order.currency)),
  })),
);
</script>
<template>
  <section class="order-lines">
    <h3>
      产品明细
      <span class="muted">{{ productLines.length }} 项</span>
      <span class="muted">
        产品、数量和单价以下单时为准，不直接覆盖已下单的资料；剩余不再采购的数量可在「更多操作」里结束余额。
      </span>
    </h3>
    <Table
      :data-source="productLines"
      row-key="id"
      size="small"
      :pagination="false"
      :scroll="{ x: 1000 }"
      :columns="[
        { key: 'product', title: '产品 / 规格', width: 270 },
        { key: 'shape', title: '形状' },
        { key: 'quantity', dataIndex: 'quantity', title: '订购数量' },
        { key: 'unit', dataIndex: 'unit', title: '单位' },
        { key: 'unitPrice', dataIndex: 'unitPrice', title: '单价' },
        { key: 'amount', dataIndex: 'amount', title: '有效金额' },
        {
          key: 'arrivedQuantity',
          dataIndex: 'arrivedQuantity',
          title: '已到货',
        },
        {
          key: 'returnedQuantity',
          dataIndex: 'returnedQuantity',
          title: '已退货',
        },
      ]"
    >
      <template #emptyText>采购单没有产品明细</template>
      <template #bodyCell="{ column, record }">
        <div v-if="column.key === 'product'">
          {{
            record.skuName ?? record.specificationSnapshot?.skuName ?? '产品'
          }}
          <div class="muted">
            {{
              record.specificationSnapshot?.specification ??
              record.specification ??
              '—'
            }}
          </div>
        </div>
        <span v-else-if="column.key === 'shape'">{{
          snapshotShape(record as BusinessRecord)
        }}</span>
      </template>
    </Table>
  </section>
</template>
<style scoped>
.order-lines {
  padding: 12px 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.order-lines h3 {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  align-items: baseline;
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}

.muted {
  font-size: 12px;
  font-weight: normal;
  color: hsl(var(--muted-foreground));
}
</style>
