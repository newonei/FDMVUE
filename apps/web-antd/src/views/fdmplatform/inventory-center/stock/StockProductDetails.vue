<script setup lang="ts">
import type { ProductStock } from './model';

import type { StockBalance } from '#/api/fdmplatform/warehouse';

import { computed } from 'vue';
import { RouterLink, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';

import { entityTarget, navigationRoute } from '../../documents/navigation';
import { averageCost, money, qty } from '../../purchase/warehouse/model';
import { stockSpecification } from './model';

const props = defineProps<{ product: ProductStock | StockBalance }>();

const router = useRouter();
const { hasAccessByCodes } = useAccess();
const stocks = computed(() =>
  'stocks' in props.product ? props.product.stocks : [props.product],
);
const productRoute = computed(() => {
  if (!hasAccessByCodes(['fdmplatform:products:query'])) return undefined;
  const target = entityTarget('product', stocks.value[0]?.skuId);
  if (!target) return undefined;
  const location = navigationRoute(target);
  return router.getRoutes().some(({ path }) => path === location.path)
    ? location
    : undefined;
});
const fields = computed(() => {
  const { productCode, productName, specification, unit } = props.product;
  const parsed = stockSpecification(specification);
  return [
    [
      { label: '产品名称', value: productName },
      { label: '产品编号', value: productCode },
    ],
    [
      { label: '型号', value: parsed.model },
      { label: '规格', value: parsed.specification },
    ],
    [
      { label: '计量单位', value: unit },
      { label: '库存规格原文', value: specification },
    ],
  ];
});
</script>

<template>
  <div class="stock-details">
    <div class="detail-heading">
      <h3>产品信息</h3>
      <RouterLink v-if="productRoute" :to="productRoute">
        打开产品档案
      </RouterLink>
    </div>
    <table class="detail-table product-fields" aria-label="产品信息">
      <tbody>
        <tr v-for="pair in fields" :key="pair[0]?.label">
          <template v-for="field in pair" :key="field.label">
            <th scope="row">{{ field.label }}</th>
            <td>{{ field.value || '—' }}</td>
          </template>
        </tr>
      </tbody>
    </table>
    <h3>{{ 'stocks' in product ? '仓库分布' : '仓库库存' }}</h3>
    <div class="warehouse-table">
      <table class="detail-table" aria-label="仓库库存">
        <thead>
          <tr>
            <th scope="col">仓库</th>
            <th scope="col" class="amount">现存</th>
            <th scope="col" class="amount">平均成本</th>
            <th scope="col" class="amount">库存金额</th>
            <th scope="col">最近入库</th>
            <th scope="col">最近出库</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="stock in stocks" :key="stock.id">
            <td>{{ stock.warehouseName || '—' }}</td>
            <td class="amount" :class="{ out: Number(stock.onHand) < 0 }">
              {{ qty(stock.onHand) }} {{ stock.unit }}
            </td>
            <td class="amount">{{ averageCost(stock) ?? '—' }}</td>
            <td class="amount">
              {{ stock.costKnown ? money(stock.costAmount) : '成本未知' }}
            </td>
            <td>{{ stock.lastInDate ?? '—' }}</td>
            <td>{{ stock.lastOutDate ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.stock-details {
  font-size: 13px;
  overflow-wrap: anywhere;
}

.detail-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  align-items: baseline;
}

.detail-heading a {
  color: hsl(var(--primary));
}

.stock-details h3 {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
}

.detail-table {
  width: 100%;
  border-collapse: collapse;
  background: hsl(var(--card));
}

.detail-table th,
.detail-table td {
  padding: 6px 10px;
  vertical-align: top;
  text-align: left;
  border: 1px solid hsl(var(--border));
}

.detail-table th {
  font-weight: 500;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--muted));
}

.product-fields {
  margin-bottom: 12px;
  table-layout: fixed;
}

.product-fields th {
  width: 8rem;
}

.product-fields td {
  white-space: pre-line;
}

.warehouse-table {
  overflow-x: auto;
}

.warehouse-table table {
  min-width: 640px;
}

.detail-table .amount {
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.detail-table .out {
  color: hsl(var(--destructive));
}

@media (max-width: 700px) {
  .product-fields th {
    width: 4.25rem;
  }
}
</style>
