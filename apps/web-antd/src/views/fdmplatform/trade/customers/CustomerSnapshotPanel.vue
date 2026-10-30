<script setup lang="ts">
import type { Customer, CustomerSnapshot } from '#/api/fdmplatform/customers';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Button, Empty, Spin } from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import { getCustomerSnapshot } from '#/api/fdmplatform/customers';

import { errorText, label } from '../../data';
import RelatedLink from '../../documents/RelatedLink.vue';
import { quantityText } from '../../products/activity-model';
import { customerMissingFields, customerRegion, moneyShort } from './model';

const props = defineProps<{ customer: Customer }>();
const emit = defineEmits<{
  contracts: [customer: Customer];
  edit: [customer: Customer];
  view: [customer: Customer];
}>();

const snapshot = ref<CustomerSnapshot>();
const loading = ref(false);
const failure = ref('');
let sequence = 0;

watch(
  () => [props.customer.id, props.customer.stats?.lastSignedDate],
  () => {
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  sequence++;
});

async function load() {
  const run = ++sequence;
  loading.value = true;
  failure.value = '';
  try {
    const result = await getCustomerSnapshot(props.customer.id);
    if (run === sequence) snapshot.value = result;
  } catch (error) {
    if (run === sequence) failure.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}

const years = computed(() => {
  const rows = snapshot.value?.years ?? [];
  const max = BigNumber.max(1, ...rows.map((row) => new BigNumber(row.amount)));
  return rows.map((row) => {
    const amount = new BigNumber(row.amount);
    return {
      year: row.year,
      text: amount.isZero()
        ? '—'
        : moneyShort(row.amount, snapshot.value?.currency),
      width: amount.isZero()
        ? '0%'
        : `${Math.max(2, amount.dividedBy(max).multipliedBy(100).toNumber())}%`,
    };
  });
});
const missing = computed(() => customerMissingFields(props.customer));
const profile = computed(() => {
  const customer = props.customer;
  const contact = [customer.contactName, customer.email || customer.phone]
    .filter(Boolean)
    .join(' · ');
  return [
    { label: '国家 / 地区', value: customerRegion(customer) },
    { label: '联系人', value: contact },
    { label: '客户来源', value: customer.customerSource },
    { label: '公司名称', value: customer.companyName },
    { label: '详细地址', value: customer.address },
  ];
});
</script>

<template>
  <Spin :spinning="loading">
    <div class="snapshot">
      <section v-if="failure" class="block failure-block">
        <h4>经营数据</h4>
        <p class="failure">{{ failure }}</p>
        <Button size="small" class="retry" @click="load">重新加载</Button>
      </section>
      <template v-else>
        <section class="block">
          <h4>年度合同额</h4>
          <Empty
            v-if="!loading && !years.length"
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            description="暂无合同"
          />
          <div v-for="row in years" :key="row.year" class="year-row">
            <span class="muted">{{ row.year }}</span>
            <span class="track"><span class="fill" :style="{ width: row.width }"></span></span>
            <span class="figure">{{ row.text }}</span>
          </div>
        </section>

        <section class="block">
          <h4>常购产品 Top 3</h4>
          <Empty
            v-if="!loading && !snapshot?.products.length"
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            description="合同里没有产品明细"
          />
          <div
            v-for="product in snapshot?.products ?? []"
            :key="product.name"
            class="product"
          >
            <span class="ellipsis" :title="product.name">{{
              product.name
            }}</span>
            <span class="muted">
              {{ product.orders }} 次下单 · 共
              {{ quantityText(product.quantity, product.unit) }}
            </span>
          </div>
        </section>

        <section class="block">
          <h4>最近合同</h4>
          <Empty
            v-if="!loading && !snapshot?.recentContracts.length"
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            description="暂无合同"
          />
          <div
            v-for="contract in snapshot?.recentContracts ?? []"
            :key="contract.id"
            class="contract"
          >
            <RelatedLink
              :target="{ type: 'contract', contractId: contract.id }"
            >
              <span class="ellipsis">{{ contract.code || '未编号合同' }}</span>
            </RelatedLink>
            <span class="figure">{{
              moneyShort(contract.amount, contract.currency)
            }}</span>
            <span class="muted">{{
              contract.signedDate || '签约日期未记录'
            }}</span>
            <span class="muted figure">{{
              contract.status ? label(contract.status) : ''
            }}</span>
          </div>
          <Button
            v-if="(snapshot?.contractCount ?? 0) > 0"
            type="link"
            size="small"
            class="more"
            @click="emit('contracts', customer)"
          >
            查看全部 {{ snapshot?.contractCount }} 份合同
          </Button>
        </section>
      </template>

      <section class="block">
        <h4>资料</h4>
        <div v-for="field in profile" :key="field.label" class="field">
          <span class="muted">{{ field.label }}</span>
          <span v-if="field.value" class="ellipsis" :title="field.value">{{
            field.value
          }}</span>
          <span v-else class="missing">待补</span>
        </div>
        <div class="actions">
          <Button
            size="small"
            :type="missing.length ? 'primary' : 'default'"
            :ghost="missing.length > 0"
            @click="emit('edit', customer)"
          >
            {{ missing.length ? '补齐资料' : '维护资料' }}
          </Button>
          <Button type="link" size="small" @click="emit('view', customer)">
            打开完整档案
          </Button>
        </div>
      </section>
    </div>
  </Spin>
</template>

<style scoped>
.snapshot {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  padding: 12px 14px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

h4 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  color: hsl(var(--muted-foreground));
}

.year-row {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) 84px;
  gap: 8px;
  align-items: center;
  font-size: 12px;
}

.track {
  display: flex;
  height: 8px;
  overflow: hidden;
  background: hsl(var(--border));
  border-radius: 4px;
}

.fill {
  display: block;
  background: hsl(var(--primary));
  border-radius: 4px;
}

.figure {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}

.product {
  display: flex;
  flex-direction: column;
  min-width: 0;
  font-size: 13px;
}

.contract {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 8px;
  font-size: 13px;
}

.field {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  gap: 8px;
  font-size: 12px;
}

.muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.missing {
  font-weight: 500;
  color: hsl(var(--warning));
}

.failure-block {
  grid-column: span 3;
}

.retry {
  align-self: flex-start;
}

.failure {
  margin: 0;
  font-size: 12px;
  color: hsl(var(--destructive));
  overflow-wrap: anywhere;
}

.ellipsis {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.more {
  align-self: flex-start;
  padding: 0;
  margin-top: auto;
}

.actions {
  display: flex;
  gap: 8px;
  align-items: center;
  padding-top: 4px;
  margin-top: auto;
}

@media (max-width: 1080px) {
  .snapshot {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .failure-block {
    grid-column: span 1;
  }
}
</style>
