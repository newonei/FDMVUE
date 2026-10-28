<script setup lang="ts">
import type { Directory } from '#/api/fdmplatform';
import type { StockIn, StockOut } from '#/api/fdmplatform/warehouse';

import { computed, ref, watch } from 'vue';

import { Alert, Button, Space, Tag } from 'ant-design-vue';

import { getDirectory } from '#/api/fdmplatform';
import { FdmResizableDrawer } from '#/components/fdm-resizable-drawer';

import { personName } from '../../directory';
import { money, qty } from '../../purchase/warehouse/model';
import {
  inKindLabel,
  inPartner,
  inRelated,
  inSubject,
  lineSum,
  OUT_KIND_LABELS,
  outPartner,
  outSalesAmount,
  outSubject,
} from './doc-model';

/**
 * 入库单 / 出库单详情（金智同款单据抽屉）：标题「单据类型 + 主题 + 状态」，基本信息两列，产品明细带合计。
 * 作废、退货等操作由打开它的列表决定（actions），点了交回列表处理。
 */
const props = defineProps<{
  actions?: { danger?: boolean; key: string; label: string; title?: string }[];
  /** 不能在这里操作时的说明，例如工厂登记的入库要在工厂作废 */
  hint?: string;
  stockIn?: StockIn;
  stockOut?: StockOut;
}>();
const emit = defineEmits<{ action: [key: string]; close: [] }>();

const directory = ref<Directory>();
const open = computed(() => Boolean(props.stockIn || props.stockOut));
const voided = computed(
  () => (props.stockIn ?? props.stockOut)?.status === 'VOIDED',
);
const subject = computed(() => {
  if (props.stockIn) return inSubject(props.stockIn);
  return props.stockOut ? outSubject(props.stockOut) : '';
});

/** 基本信息：[标签, 值]，空值不显示。 */
const fields = computed<[string, string][]>(() => {
  const name = (id?: number) =>
    id ? personName(directory.value, id) || `#${id}` : '';
  const voidInfo = (doc: StockIn | StockOut): [string, string][] =>
    doc.status === 'VOIDED'
      ? [
          ['作废原因', doc.voidReason ?? ''],
          ['作废人', name(doc.voidedBy)],
          ['作废时间', time(doc.voidedAt)],
        ]
      : [];
  const doc = props.stockIn;
  if (doc) {
    const other = doc.kind === 'OTHER';
    return [
      [other ? '入库来源' : '供应商 / 工厂', inPartner(doc)],
      ['入库日期', doc.receivedDate],
      ['入库仓库', doc.warehouseName],
      ['入库单号', doc.code],
      ['对应单据', inRelated(doc)],
      [
        '关联合同',
        [doc.contractCode, doc.customerName].filter(Boolean).join(' · '),
      ],
      ['送货单号', doc.deliveryNo ?? ''],
      ['直发出库单', doc.directShip ? (doc.stockOutCode ?? '') : ''],
      ['单据类型', inKindLabel(doc)],
      ['入库状态', voided.value ? '已作废' : '已入库'],
      ['经办人', name(doc.createdBy)],
      ['确认时间', time(doc.createdAt)],
      ['备注', doc.remark ?? ''],
      ...voidInfo(doc),
    ].filter(([, value]) => value) as [string, string][];
  }
  const out = props.stockOut;
  if (!out) return [];
  return [
    [out.kind === 'OTHER' ? '出库去向' : '客户', outPartner(out)],
    ['出库日期', out.shippedDate],
    ['出库仓库', out.warehouseName],
    ['出库单号', out.code],
    ['对应单据', out.contractCode ?? ''],
    ['直发入库单', out.kind === 'DIRECT' ? (out.stockInCode ?? '') : ''],
    ['单据类型', OUT_KIND_LABELS[out.kind] ?? ''],
    ['出库状态', voided.value ? '已作废' : '已出库'],
    ['经办人', name(out.createdBy)],
    ['确认时间', time(out.createdAt)],
    ['备注', out.remark ?? ''],
    ...voidInfo(out),
  ].filter(([, value]) => value) as [string, string][];
});

function time(value?: string) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function amountOf(price: unknown, quantity: unknown) {
  const p = Number(price);
  const q = Number(quantity);
  return Number.isFinite(p) && price !== null && price !== undefined
    ? (p * q).toFixed(2)
    : undefined;
}

watch(open, async (value) => {
  if (!value || directory.value) return;
  try {
    directory.value = await getDirectory(0);
  } catch {
    // 只影响经办人显示
  }
});
</script>

<template>
  <FdmResizableDrawer
    resize-key="stock-doc"
    :open="open"
    width="min(1080px, 96vw)"
    :destroy-on-close="true"
    @close="emit('close')"
  >
    <template #title>
      <div class="doc-title">
        <Tag color="blue">{{ stockIn ? '入库单' : '出库单' }}</Tag>
        <span class="doc-subject" :class="{ voided }">{{ subject }}</span>
        <Tag v-if="voided">已作废</Tag>
        <Tag v-else color="green">{{ stockIn ? '已入库' : '已出库' }}</Tag>
      </div>
    </template>
    <template #extra>
      <Space>
        <Button
          v-for="item in actions ?? []"
          :key="item.key"
          :danger="item.danger"
          :title="item.title"
          @click="emit('action', item.key)"
        >
          {{ item.label }}
        </Button>
      </Space>
    </template>
    <div class="stock-doc">
      <Alert v-if="hint" type="info" show-icon :message="hint" />
      <section class="doc-card">
        <dl class="doc-fields">
          <div v-for="[label, value] in fields" :key="label">
            <dt>{{ label }}</dt>
            <dd>{{ value }}</dd>
          </div>
        </dl>
      </section>

      <section class="doc-card">
        <h4>产品明细</h4>
        <div class="doc-table-wrap">
          <table v-if="stockIn" class="doc-lines">
            <thead>
              <tr>
                <th>产品名称</th>
                <th>产品编号</th>
                <th>规格</th>
                <th>单位</th>
                <th class="num">
                  {{ stockIn.kind === 'OTHER' ? '数量' : '实收' }}
                </th>
                <th v-if="stockIn.kind !== 'OTHER'" class="num">合格</th>
                <th v-if="stockIn.kind !== 'OTHER'">不合格原因</th>
                <th v-if="stockIn.kind !== 'OTHER'">批次</th>
                <th class="num">
                  {{ stockIn.kind === 'OTHER' ? '成本单价' : '采购单价' }}
                </th>
                <th class="num">金额</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(line, index) in stockIn.lines"
                :key="line.orderLineId ?? index"
              >
                <td>{{ line.productName }}</td>
                <td class="mono">{{ line.productCode }}</td>
                <td>{{ line.specification }}</td>
                <td>{{ line.unit }}</td>
                <td class="num">{{ qty(line.quantity) }}</td>
                <td v-if="stockIn.kind !== 'OTHER'" class="num">
                  {{ qty(line.acceptedQuantity) }}
                  <span
                    v-if="
                      Number(line.returnedAcceptedQuantity ?? 0) > 0 ||
                      Number(line.returnedExceptionQuantity ?? 0) > 0
                    "
                    class="muted"
                  >
                    已退 {{ qty(line.returnedAcceptedQuantity ?? 0) }} /
                    {{ qty(line.returnedExceptionQuantity ?? 0) }}
                  </span>
                </td>
                <td v-if="stockIn.kind !== 'OTHER'">
                  {{ line.exceptionReason ?? '' }}
                </td>
                <td v-if="stockIn.kind !== 'OTHER'">
                  {{ line.batchNo ?? '' }}
                </td>
                <td class="num">{{ qty(line.unitPrice) }}</td>
                <td class="num">{{ money(line.amount, stockIn.currency) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colspan="4">合计（{{ stockIn.lines.length }} 项）</td>
                <td class="num">
                  {{ qty(lineSum(stockIn.lines, (line) => line.quantity)) }}
                </td>
                <td v-if="stockIn.kind !== 'OTHER'" class="num">
                  {{
                    qty(lineSum(stockIn.lines, (line) => line.acceptedQuantity))
                  }}
                </td>
                <td v-if="stockIn.kind !== 'OTHER'" colspan="2"></td>
                <td></td>
                <td class="num">
                  {{ money(stockIn.amount, stockIn.currency) }}
                </td>
              </tr>
            </tfoot>
          </table>

          <table v-else-if="stockOut" class="doc-lines">
            <thead>
              <tr>
                <th>产品名称</th>
                <th>产品编号</th>
                <th>规格</th>
                <th>单位</th>
                <th class="num">数量</th>
                <th v-if="stockOut.kind !== 'OTHER'" class="num">销售单价</th>
                <th v-if="stockOut.kind !== 'OTHER'" class="num">销售金额</th>
                <th class="num">成本单价</th>
                <th class="num">成本金额</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(line, index) in stockOut.lines"
                :key="line.contractItemId ?? line.stockId ?? index"
              >
                <td>{{ line.productName }}</td>
                <td class="mono">{{ line.productCode }}</td>
                <td>{{ line.specification }}</td>
                <td>{{ line.unit }}</td>
                <td class="num">{{ qty(line.quantity) }}</td>
                <td v-if="stockOut.kind !== 'OTHER'" class="num">
                  {{ qty(line.salesUnitPrice) }}
                </td>
                <td v-if="stockOut.kind !== 'OTHER'" class="num">
                  {{ qty(amountOf(line.salesUnitPrice, line.quantity)) }}
                </td>
                <td class="num">{{ qty(line.unitCost) }}</td>
                <td class="num">{{ money(line.costAmount) }}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td colspan="4">合计（{{ stockOut.lines.length }} 项）</td>
                <td class="num">
                  {{ qty(lineSum(stockOut.lines, (line) => line.quantity)) }}
                </td>
                <td v-if="stockOut.kind !== 'OTHER'"></td>
                <td v-if="stockOut.kind !== 'OTHER'" class="num">
                  {{ qty(outSalesAmount(stockOut)) }}
                </td>
                <td></td>
                <td class="num">{{ money(stockOut.costAmount) }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>
    </div>
  </FdmResizableDrawer>
</template>

<style scoped>
.doc-title {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.doc-subject {
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 600;
  white-space: nowrap;
}

.doc-subject.voided {
  text-decoration: line-through;
}

.stock-doc {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.doc-card {
  padding: 12px 16px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.doc-card h4 {
  margin: 0 0 8px;
  font-weight: 600;
}

.doc-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 24px;
  margin: 0;
}

.doc-fields > div {
  display: flex;
  gap: 12px;
  min-width: 0;
}

.doc-fields dt {
  flex: 0 0 88px;
  color: hsl(var(--muted-foreground));
}

.doc-fields dd {
  margin: 0;
  overflow-wrap: anywhere;
}

.doc-table-wrap {
  overflow-x: auto;
}

.doc-lines {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
}

.doc-lines th,
.doc-lines td {
  padding: 6px 8px;
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid hsl(var(--border));
}

.doc-lines th {
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--accent));
}

.doc-lines tfoot td {
  font-weight: 600;
  border-bottom: none;
}

.doc-lines .num {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.doc-lines .mono {
  font-family: ui-monospace, 'SF Mono', Menlo, monospace;
}

.doc-lines .muted {
  margin-left: 4px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

@media (max-width: 640px) {
  .doc-fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
