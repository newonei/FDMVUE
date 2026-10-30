<script setup lang="ts">
import type {
  SupplierRow,
  SupplierSnapshot,
} from '#/api/fdmplatform/supplier-stats';

import { computed, onMounted, ref } from 'vue';

import { Alert, Button, Spin } from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import { getSupplierSnapshot } from '#/api/fdmplatform/supplier-stats';

import { errorText } from '../../data';
import RelatedLink from '../../documents/RelatedLink.vue';
import { moneyShort } from './model';

const props = defineProps<{ supplier: SupplierRow }>();
const emit = defineEmits<{
  contacts: [supplier: SupplierRow];
  edit: [supplier: SupplierRow];
}>();
const snapshot = ref<SupplierSnapshot>();
const loading = ref(false);
const loadError = ref('');

async function load() {
  loading.value = true;
  loadError.value = '';
  try {
    snapshot.value = await getSupplierSnapshot(props.supplier.id);
  } catch (error) {
    loadError.value = errorText(error);
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const years = computed(() => {
  const rows = snapshot.value?.years ?? [];
  const max = BigNumber.max(1, ...rows.map((row) => new BigNumber(row.amount)));
  return rows.map((row) => ({
    ...row,
    width: `${new BigNumber(row.amount).dividedBy(max).multipliedBy(100).toFixed(1)}%`,
  }));
});
const statusNames: Record<string, string> = {
  ORDERED: '待到货',
  PARTIALLY_RECEIVED: '部分到货',
  RECEIVED: '已到货',
  CLOSED: '已关闭',
  CANCELLED: '已取消',
};
</script>

<template>
  <Spin :spinning="loading">
    <Alert v-if="loadError" type="error" show-icon :message="loadError">
      <template #action>
        <Button size="small" @click="load">重试</Button>
      </template>
    </Alert>
    <div v-else-if="snapshot" class="snapshot">
      <section>
        <h4>年度采购额 <small>人民币</small></h4>
        <ul v-if="years.length" class="years">
          <li v-for="row in years" :key="row.year">
            <span>{{ row.year }}</span>
            <span class="track"><span :style="{ width: row.width }"></span></span>
            <b>{{ moneyShort(row.amount) }}</b>
          </li>
        </ul>
        <p v-else class="muted">没有人民币采购记录</p>
      </section>
      <section>
        <h4>常购物料 <small>近一年下单次数</small></h4>
        <ol v-if="snapshot.items.length" class="items">
          <li v-for="item in snapshot.items" :key="item.name">
            <span :title="item.name">{{ item.name }}</span><b>{{ item.orders }} 次</b>
          </li>
        </ol>
        <p v-else class="muted">采购单没有记录物料</p>
      </section>
      <section class="orders">
        <h4>
          最近采购单
          <small>共 {{ snapshot.orderCount.toLocaleString('en-US') }} 张<template
              v-if="snapshot.openOrders"
            >
              · 在途 {{ snapshot.openOrders }} 张</template></small>
        </h4>
        <table v-if="snapshot.recentOrders.length">
          <tbody>
            <tr v-for="order in snapshot.recentOrders" :key="order.id">
              <td class="num">{{ order.date ?? '—' }}</td>
              <td>
                <RelatedLink
                  v-if="order.contractId"
                  :target="{
                    type: 'document',
                    kind: 'orders',
                    contractId: order.contractId,
                    documentId: order.id,
                  }"
                >
                  {{ order.code || order.id }}
                </RelatedLink>
                <RelatedLink
                  v-else-if="order.standaloneId"
                  :target="{
                    type: 'businessDocument',
                    kind: 'orders',
                    standaloneId: order.standaloneId,
                  }"
                >
                  {{ order.code || order.id }}
                </RelatedLink>
                <span v-else>{{ order.code || order.id }}</span>
                <span v-if="order.migrated" class="tag">金智</span>
              </td>
              <td class="items-cell" :title="order.items">
                {{ order.items || '—' }}
              </td>
              <td class="num right">
                {{ moneyShort(order.amount, order.currency) }}
              </td>
              <td class="muted">
                {{ statusNames[order.status ?? ''] ?? order.status }}
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else class="muted">还没有采购单</p>
        <div class="actions">
          <Button size="small" @click="emit('contacts', supplier)">
            工厂联系人
          </Button>
          <Button size="small" @click="emit('edit', supplier)">维护资料</Button>
        </div>
      </section>
    </div>
  </Spin>
</template>

<style scoped>
.snapshot {
  display: grid;
  grid-template-columns: minmax(0, 0.9fr) minmax(0, 1fr) minmax(0, 1.6fr);
  gap: 24px;
  padding: 4px 8px 8px;
}

h4 {
  display: flex;
  gap: 6px;
  align-items: baseline;
  margin: 0 0 8px;
  font-size: 13px;
  font-weight: 600;
}

h4 small,
.muted {
  font-size: 12px;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

.years,
.items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.years li {
  display: grid;
  grid-template-columns: 3em minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}

.track {
  height: 8px;
  overflow: hidden;
  background: hsl(var(--accent));
  border-radius: 4px;
}

.track span {
  display: block;
  height: 100%;
  background: hsl(var(--primary));
  border-radius: 4px;
}

.years b,
.items b,
.num {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.items li {
  display: flex;
  gap: 8px;
  justify-content: space-between;
  font-size: 12px;
}

.items li span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

table {
  width: 100%;
  font-size: 12px;
  border-collapse: collapse;
}

td {
  padding: 4px 6px;
  border-top: 1px solid hsl(var(--border));
}

tr:first-child td {
  border-top: 0;
}

.items-cell {
  max-width: 10em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.right {
  text-align: right;
}

td:nth-child(2) {
  white-space: nowrap;
}

.tag {
  padding: 0 4px;
  margin-left: 4px;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--accent));
  border-radius: 3px;
}

.actions {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}

@media (max-width: 960px) {
  .snapshot {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
