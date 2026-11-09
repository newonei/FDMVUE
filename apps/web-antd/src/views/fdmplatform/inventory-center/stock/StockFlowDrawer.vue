<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { StockBalance, StockTxn } from '#/api/fdmplatform/warehouse';

import { computed, ref, watch } from 'vue';

import { Alert, DatePicker, Radio, Tag } from 'ant-design-vue';

import { getStockTxns } from '#/api/fdmplatform/warehouse';
import { FdmResizableDrawer } from '#/components/fdm-resizable-drawer';

import { errorText } from '../../data';
import { localDate } from '../../purchase/quotes/comparison';
import { averageCost, money, qty } from '../../purchase/warehouse/model';
import TxnTable from '../../purchase/warehouse/TxnTable.vue';
import { groupByProduct, idleDays, share, stockFlags } from './model';

import '../../purchase/warehouse/warehouse-pages.css';

/**
 * 库存行的详情：同一产品的现存、成本、各仓库分布，以及可按出入方向、日期筛选的流水。
 * stocks 传一个库存行即看这个仓库；传同一产品的多个库存行即看全部仓库。
 */
const props = defineProps<{ open: boolean; stocks: StockBalance[] }>();
const emit = defineEmits<{ close: [] }>();

const today = localDate();
const type = ref<'' | StockTxn['type']>('');
const range = ref<[Dayjs, Dayjs]>();
const txns = ref<StockTxn[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const error = ref('');

const product = computed(() => groupByProduct(props.stocks)[0]);
const single = computed(() =>
  props.stocks.length === 1 ? props.stocks[0] : undefined,
);
const title = computed(() => {
  const name = product.value?.productName || '产品未注明';
  return single.value
    ? `${single.value.warehouseName} · ${name}`
    : `${name} · ${props.stocks.length} 个仓库`;
});
const flags = computed(() =>
  single.value ? stockFlags(single.value, today) : undefined,
);
const idle = computed(() =>
  product.value &&
  !product.value.stocks.every((row) => Number(row.onHand) === 0)
    ? idleDays(product.value, today)
    : undefined,
);
const avg = computed(() =>
  product.value
    ? averageCost({
        onHand: product.value.onHand,
        costAmount: product.value.costAmount,
        costKnown: product.value.costKnown,
      })
    : undefined,
);

async function load(reset = false) {
  if (props.stocks.length === 0) return;
  if (reset) page.value = 1;
  loading.value = true;
  error.value = '';
  try {
    const result = await getStockTxns({
      pageNo: page.value,
      pageSize: 20,
      stockId: props.stocks.map((row) => row.id),
      type: type.value || undefined,
      dateFrom: range.value?.[0]?.format('YYYY-MM-DD'),
      dateTo: range.value?.[1]?.format('YYYY-MM-DD'),
    });
    txns.value = result.list;
    total.value = result.total;
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    loading.value = false;
  }
}

watch(
  () => [props.open, props.stocks.map((row) => row.id).join(',')] as const,
  ([open]) => {
    if (!open) return;
    type.value = '';
    range.value = undefined;
    txns.value = [];
    total.value = 0;
    void load(true);
  },
  { immediate: true },
);
</script>

<template>
  <FdmResizableDrawer
    resize-key="inventory-stock-flow"
    :open="open"
    width="1080px"
    :title="title"
    @close="emit('close')"
  >
    <div v-if="product" class="warehouse-page flow">
      <div class="head">
        <div class="product">
          <strong>{{ product.productName || '产品未注明' }}</strong>
          <span class="muted">
            {{ product.productCode || '无编号' }}
            <template v-if="product.specification">
              · {{ product.specification }}
            </template>
          </span>
          <span class="tags">
            <Tag v-if="flags?.negative" color="error">负库存</Tag>
            <Tag v-if="idle !== undefined && idle >= 90" color="warning">
              {{ idle }} 天未出库
            </Tag>
            <Tag v-if="!product.costKnown" color="default">部分成本未知</Tag>
          </span>
        </div>
        <dl class="stats">
          <div>
            <dt>现存</dt>
            <dd class="num" :class="{ out: Number(product.onHand) < 0 }">
              {{ qty(product.onHand) }}
              <span class="muted">{{ product.unit }}</span>
            </dd>
          </div>
          <div>
            <dt>平均成本</dt>
            <dd class="num">{{ avg ?? '—' }}</dd>
          </div>
          <div>
            <dt>库存金额</dt>
            <dd class="num">
              {{ money(product.costAmount) }}
            </dd>
          </div>
          <div>
            <dt>最近入库</dt>
            <dd class="num">{{ product.lastInDate ?? '—' }}</dd>
          </div>
          <div>
            <dt>最近出库</dt>
            <dd class="num">{{ product.lastOutDate ?? '—' }}</dd>
          </div>
          <div v-if="single?.lastUnitCost">
            <dt>最近单位成本</dt>
            <dd class="num">{{ qty(single.lastUnitCost) }}</dd>
          </div>
        </dl>
      </div>

      <section v-if="!single" class="spread" aria-label="仓库分布">
        <h4>仓库分布</h4>
        <div v-for="row in product.stocks" :key="row.id" class="spread-row">
          <span class="ellipsis">{{ row.warehouseName }}</span>
          <span class="bar" aria-hidden="true">
            <span
              :style="{
                width: `${Number(product.onHand) > 0 ? Math.max(0, share(row.onHand, product.onHand)) : 0}%`,
              }"
            ></span>
          </span>
          <b class="num" :class="{ out: Number(row.onHand) < 0 }">
            {{ qty(row.onHand) }}
          </b>
          <span class="num muted">
            {{ row.costKnown ? money(row.costAmount) : '成本未知' }}
          </span>
        </div>
      </section>

      <div class="toolbar">
        <h4>出入库流水</h4>
        <span class="grow"></span>
        <Radio.Group
          v-model:value="type"
          button-style="solid"
          size="small"
          @change="load(true)"
        >
          <Radio.Button value="">全部</Radio.Button>
          <Radio.Button value="IN">入库</Radio.Button>
          <Radio.Button value="OUT">出库</Radio.Button>
        </Radio.Group>
        <DatePicker.RangePicker
          v-model:value="range"
          size="small"
          :placeholder="['开始日期', '结束日期']"
          style="width: 240px"
          @change="load(true)"
        />
      </div>
      <Alert v-if="error" type="error" :message="error" show-icon />
      <TxnTable
        :rows="txns"
        :loading="loading"
        :total="total"
        :page="page"
        @page="
          (value) => {
            page = value;
            load();
          }
        "
      />
    </div>
  </FdmResizableDrawer>
</template>

<style scoped>
.flow {
  padding: 0;
}

.head {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  justify-content: space-between;
  padding: 12px 14px;
  background: hsl(var(--accent));
  border-radius: 8px;
}

.product {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 200px;
}

.product strong {
  font-size: 15px;
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.stats {
  display: grid;
  flex: 1;
  grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
  gap: 8px 20px;
  max-width: 680px;
  margin: 0;
}

.stats dt {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.stats dd {
  margin: 2px 0 0;
  font-size: 15px;
  font-weight: 600;
}

h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.spread {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.spread-row {
  display: grid;
  grid-template-columns: minmax(100px, 180px) 1fr 100px 130px;
  gap: 12px;
  align-items: center;
  font-size: 13px;
}

.spread-row b,
.spread-row .muted {
  text-align: right;
}

.bar {
  height: 6px;
  overflow: hidden;
  background: hsl(var(--border));
  border-radius: 3px;
}

.bar span {
  display: block;
  height: 100%;
  background: hsl(var(--primary));
  border-radius: 3px;
}
</style>
