<script lang="ts" setup>
import type { FdmWaimaoDemandPlanApi } from '#/api/fdmwaimao/demand-plan';

import { IconifyIcon } from '@vben/icons';

import { Empty, Tag } from 'ant-design-vue';

defineOptions({ name: 'FdmWaimaoDemandPlanSourceOrder' });

defineProps<{
  order?: FdmWaimaoDemandPlanApi.SourceOrder;
  snapshotHash?: string;
}>();

function mappingLabel(status?: null | string) {
  return status === 'MAPPED' ? '已映射' : '未映射';
}
</script>

<template>
  <div v-if="order" class="demand-source-order">
    <section class="demand-source-order__identity">
      <span>合同订单</span>
      <strong>{{ order.orderNo }}</strong>
      <p>{{ order.subject }}</p>
      <div>
        <Tag color="green">{{ order.status }}</Tag>
        <Tag>版本 {{ order.version }}</Tag>
      </div>
    </section>

    <dl>
      <div>
        <dt>客户</dt>
        <dd>{{ order.customerName || '未提供' }}</dd>
      </div>
      <div>
        <dt>归属公司</dt>
        <dd>{{ order.companyName || '未提供' }}</dd>
      </div>
      <div>
        <dt>负责人</dt>
        <dd>{{ order.ownerUserName || '未提供' }}</dd>
      </div>
      <div>
        <dt>客户要求交期</dt>
        <dd>{{ order.requiredDeliveryDate || '未提供' }}</dd>
      </div>
    </dl>

    <section class="demand-source-order__items">
      <header>
        <strong>合同产品明细</strong>
        <span>{{ order.items.length }} 行</span>
      </header>
      <article v-for="item in order.items" :key="item.id">
        <span class="demand-source-order__line">{{ item.lineNo || '—' }}</span>
        <div>
          <strong>{{ item.name }}</strong>
          <small>{{ item.code || '无编码' }} · {{ item.unit || '无单位' }}</small>
        </div>
        <div class="demand-source-order__quantity">
          <small>合同数量</small>
          <strong>{{ item.quantity }}</strong>
        </div>
        <Tag :color="item.mappingStatus === 'MAPPED' ? 'green' : 'orange'">
          {{ mappingLabel(item.mappingStatus) }}
        </Tag>
      </article>
    </section>

    <footer v-if="snapshotHash">
      <IconifyIcon icon="lucide:fingerprint" aria-hidden="true" />
      <span>来源快照</span>
      <code>{{ snapshotHash.slice(0, 12) }}…</code>
    </footer>
  </div>
  <Empty v-else description="未读取到来源合同" />
</template>

<style scoped>
.demand-source-order {
  display: grid;
  gap: 18px;
}

.demand-source-order__identity {
  display: grid;
  gap: 5px;
  padding: 14px;
  background: linear-gradient(135deg, #eff6ff, #f8fafc);
  border: 1px solid #dbeafe;
  border-radius: 9px;
}

.demand-source-order__identity > span,
.demand-source-order dt,
.demand-source-order__items header span,
.demand-source-order__items small,
.demand-source-order > footer {
  font-size: 11px;
  color: #64748b;
}

.demand-source-order__identity > strong {
  font-size: 17px;
  color: #1d4ed8;
}

.demand-source-order__identity p {
  margin: 0;
  color: #334155;
}

.demand-source-order dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.demand-source-order dl > div {
  display: grid;
  gap: 2px;
}

.demand-source-order dd {
  margin: 0;
  font-size: 12px;
  color: #334155;
}

.demand-source-order__items {
  display: grid;
  gap: 8px;
}

.demand-source-order__items > header,
.demand-source-order__items article,
.demand-source-order > footer {
  display: flex;
  gap: 8px;
  align-items: center;
}

.demand-source-order__items > header {
  justify-content: space-between;
}

.demand-source-order__items article {
  padding: 9px;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 7px;
}

.demand-source-order__line {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 23px;
  height: 23px;
  font-size: 11px;
  font-weight: 700;
  color: #2563eb;
  background: #eff6ff;
  border-radius: 6px;
}

.demand-source-order__items article > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.demand-source-order__items article > div:nth-child(2) {
  margin-right: auto;
}

.demand-source-order__items article strong,
.demand-source-order__items article small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.demand-source-order__quantity {
  text-align: right;
}

.demand-source-order > footer {
  padding-top: 10px;
  border-top: 1px solid #e5eaf1;
}

.demand-source-order code {
  font-size: 10px;
  color: #475569;
}
</style>
