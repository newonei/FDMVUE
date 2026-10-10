<script lang="ts" setup>
import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import { Button, Input, message, Progress, Result, Select, Table, Tabs, Tag } from 'ant-design-vue';

import {
  getFactoryProductionOrders,
  getMyProductionOrders,
  getOrderableFactories,
} from '#/api/fdmgongchang/production-order';

import FactorySwitch from '../shared/factory-switch.vue';
import { useFactory } from '../shared/use-factory';
import CreateModal from './modules/create-modal.vue';
import OrderDrawer from './modules/order-drawer.vue';
import { dateText, num, ORDER_STATUS, specText, timeText } from './shared';

/**
 * 工厂部门 · 工厂下单：运营、内贸等部门从产品中心选 SKU 向工厂下生产订单；
 * 工厂在「本厂收到的单」里确认接单、回复交期，接单后进入 AI 排单的待生产订单，做完登记完成。
 */
defineOptions({ name: 'FdmGongchangProductionOrder' });

type Tab = 'factory' | 'mine';

const { hasAccessByCodes } = useAccess();
const canCreate = computed(() => hasAccessByCodes(['fdmgongchang:production-order:create']));
const canHandle = computed(() => hasAccessByCodes(['fdmgongchang:production-order:handle']));
const tab = ref<Tab>(canCreate.value ? 'mine' : 'factory');

const factory = useFactory();
const factoryReady = ref(false);
const noFactory = ref(false);
const orderable = ref<Api.Factory[]>([]);

const rows = ref<Api.Order[]>([]);
const total = ref(0);
const loading = ref(false);
const loadError = ref(false);
const pendingCount = ref(0);
const filters = reactive({ keyword: '', status: undefined as Api.Status | undefined });
const pageNo = ref(1);
const pageSize = ref(20);

const createOpen = ref(false);
const drawerOpen = ref(false);
const drawerId = ref<number>();

async function loadRows() {
  if (tab.value === 'factory' && (!factoryReady.value || noFactory.value)) return;
  loading.value = true;
  loadError.value = false;
  try {
    const params = {
      keyword: filters.keyword.trim() || undefined,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      status: filters.status,
    };
    const page = tab.value === 'mine' ? await getMyProductionOrders(params) : await getFactoryProductionOrders(params);
    rows.value = page.list;
    total.value = page.total;
  } catch {
    loadError.value = true;
  } finally {
    loading.value = false;
  }
}

async function loadPending() {
  if (!canHandle.value || !factoryReady.value || noFactory.value) return;
  try {
    const page = await getFactoryProductionOrders({ pageNo: 1, pageSize: 1, status: 'SUBMITTED' });
    pendingCount.value = page.total;
  } catch {
    pendingCount.value = 0;
  }
}

async function initFactory() {
  if (!canHandle.value) return;
  try {
    await factory.load();
    noFactory.value = factory.factoryId.value === null;
  } catch {
    noFactory.value = true;
  }
  factoryReady.value = true;
}

onMounted(async () => {
  await Promise.all([
    initFactory(),
    canCreate.value ? getOrderableFactories().then((list) => (orderable.value = list)).catch(() => []) : undefined,
  ]);
  await Promise.all([loadRows(), loadPending()]);
});

async function switchFactory(id: number) {
  if (id === factory.factoryId.value) return;
  factory.select(id);
  pageNo.value = 1;
  await Promise.all([loadRows(), loadPending()]);
}

watch(tab, () => {
  pageNo.value = 1;
  filters.status = undefined;
  loadRows();
});

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => [filters.keyword, filters.status],
  () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      pageNo.value = 1;
      loadRows();
    }, 300);
  },
);
onBeforeUnmount(() => clearTimeout(searchTimer));

function openOrder(id: number) {
  drawerId.value = id;
  drawerOpen.value = true;
}

async function onCreated(id: number) {
  message.success('已提交给工厂，等工厂接单');
  tab.value = 'mine';
  await loadRows();
  openOrder(id);
}

async function onChanged() {
  await Promise.all([loadRows(), loadPending()]);
}

const statusOptions = Object.entries(ORDER_STATUS).map(([value, s]) => ({ label: s.label, value }));
const columns = computed(() => [
  { key: 'orderNo', title: '订单号' },
  tab.value === 'mine'
    ? { dataIndex: 'factoryName', key: 'factoryName', title: '工厂' }
    : { key: 'requester', title: '下单人' },
  { key: 'items', title: '产品' },
  { key: 'progress', title: '完成', width: 160 },
  { key: 'date', title: '交期' },
  { key: 'status', title: '状态' },
  { align: 'right' as const, key: 'actions', title: '', width: 80 },
]);

function progressPercent(o: Api.Order) {
  const t = num(o.totalQuantity);
  return t > 0 ? Math.min(100, Math.round((num(o.completedQuantity) / t) * 100)) : 0;
}
</script>

<template>
  <Page>
    <div class="flex flex-col gap-4">
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
            <h1 class="m-0 text-xl font-semibold tracking-tight">工厂下单</h1>
            <FactorySwitch
              v-if="tab === 'factory' && factory.factories.value.length > 0"
              :factories="factory.factories.value"
              :value="factory.factoryId.value"
              @change="switchFactory"
            />
          </div>
          <p class="m-0 mt-1 text-sm text-muted-foreground">
            从产品中心选产品向工厂下生产订单。工厂确认接单、回复交期后，这张单会进入 AI 排单的待生产订单；包装工序单报产出时自动累加完成数量。
          </p>
        </div>
        <Button v-if="canCreate" type="primary" @click="createOpen = true">＋ 向工厂下单</Button>
      </header>

      <Result v-if="!canCreate && !canHandle" status="info" title="还没有工厂下单的权限">
        <template #subTitle>需要向工厂下单的话，请联系管理员分配「工厂下单」角色。</template>
      </Result>

      <section v-else class="rounded-lg border border-border bg-card px-4 pb-4">
        <Tabs v-model:active-key="tab">
          <Tabs.TabPane v-if="canCreate" key="mine" tab="我下的单" />
          <Tabs.TabPane v-if="canHandle" key="factory">
            <template #tab>
              本厂收到的单
              <Tag v-if="pendingCount > 0" class="ml-1" color="orange">{{ pendingCount }} 待接单</Tag>
            </template>
          </Tabs.TabPane>
        </Tabs>

        <Result v-if="tab === 'factory' && noFactory" status="info" title="你的账号还不属于任何工厂">
          <template #subTitle>接单处理只能处理自己所在工厂的单。</template>
        </Result>
        <Result v-else-if="loadError" status="warning" title="订单没有加载出来">
          <template #extra><Button type="primary" @click="loadRows">重新加载</Button></template>
        </Result>
        <div v-else class="flex flex-col gap-3">
          <div class="flex flex-wrap items-center gap-2">
            <Select
              id="po-filter-status"
              v-model:value="filters.status"
              :options="statusOptions"
              allow-clear
              class="w-32"
              placeholder="全部状态"
              size="small"
            />
            <Input
              id="po-filter-keyword"
              v-model:value="filters.keyword"
              allow-clear
              class="w-56"
              placeholder="订单号、用途、下单人、备注"
              size="small"
            />
          </div>
          <Table
            :columns="columns"
            :data-source="rows"
            :loading="loading"
            :pagination="{ current: pageNo, pageSize, showSizeChanger: true, total, showTotal: (t: number) => `共 ${t} 张` }"
            :scroll="{ x: 'max-content' }"
            row-key="id"
            size="small"
            @change="(p) => ((pageNo = p.current ?? 1), (pageSize = p.pageSize ?? 20), loadRows())"
          >
            <template #emptyText>
              <span class="text-muted-foreground">{{ tab === 'mine' ? '还没有下过单，点右上角「向工厂下单」' : '还没有收到订单' }}</span>
            </template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'orderNo'">
                <div class="flex flex-col">
                  <button class="text-left text-primary hover:underline" type="button" @click="openOrder(record.id)">{{ record.orderNo }}</button>
                  <span class="text-xs text-muted-foreground">{{ timeText(record.createTime) }}<template v-if="record.purpose"> · {{ record.purpose }}</template></span>
                </div>
              </template>
              <template v-else-if="column.key === 'requester'">
                <div class="flex flex-col">
                  <span>{{ record.requesterName }}</span>
                  <span class="text-xs text-muted-foreground">{{ record.requesterDeptName }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'items'">
                <div class="flex max-w-80 flex-col">
                  <span class="truncate">{{ record.items[0]?.productName }}</span>
                  <span class="truncate text-xs text-muted-foreground">
                    {{ record.items[0] ? specText(record.items[0]) : '' }}<template v-if="record.items.length > 1"> 等 {{ record.items.length }} 个产品</template>
                  </span>
                </div>
              </template>
              <template v-else-if="column.key === 'progress'">
                <div class="flex flex-col">
                  <span class="text-xs">{{ num(record.completedQuantity) }} / {{ num(record.totalQuantity) }}</span>
                  <Progress :percent="progressPercent(record as Api.Order)" :show-info="false" size="small" />
                </div>
              </template>
              <template v-else-if="column.key === 'date'">
                <div class="flex flex-col">
                  <span>{{ dateText(record.promisedDate) || dateText(record.requiredDate) }}</span>
                  <span class="text-xs text-muted-foreground">{{ record.promisedDate ? '工厂交期' : '希望交货' }}</span>
                </div>
              </template>
              <template v-else-if="column.key === 'status'">
                <Tag :color="ORDER_STATUS[record.status as Api.Status]?.color" class="m-0">{{ record.statusLabel }}</Tag>
              </template>
              <template v-else-if="column.key === 'actions'">
                <button class="whitespace-nowrap text-xs text-primary hover:underline" type="button" @click="openOrder(record.id)">
                  {{ tab === 'factory' && record.status === 'SUBMITTED' ? '去接单' : '查看' }}
                </button>
              </template>
            </template>
          </Table>
        </div>
      </section>

      <CreateModal v-model:open="createOpen" :factories="orderable" @created="onCreated" />
      <OrderDrawer v-model:open="drawerOpen" :mode="tab" :order-id="drawerId" @changed="onChanged" />
    </div>
  </Page>
</template>
