<script lang="ts" setup>
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import { Alert, Button, message, Result, Spin, Tabs } from 'ant-design-vue';

import {
  getStageStockOptions,
  getStageStockSummary,
} from '#/api/fdmgongchang/stage-stock';

import FactorySwitch from '../shared/factory-switch.vue';
import { FACTORY_ROUTES } from '../shared/routes';
import { useFactory } from '../shared/use-factory';
import OrderDrawer from './modules/order-drawer.vue';
import OrderPanel from './modules/order-panel.vue';
import ReceiptDrawer from './modules/receipt-drawer.vue';
import ReceivingPanel from './modules/receiving-panel.vue';
import SettingPanel from './modules/setting-panel.vue';
import ShipmentPanel from './modules/shipment-panel.vue';
import StageRail from './modules/stage-rail.vue';
import StockPanel from './modules/stock-panel.vue';
import TxnPanel from './modules/txn-panel.vue';

/**
 * 工厂部门 · 工序库存：每道工序向上游库存领料，良品进入本段库存，残次品只登记数量。
 * 顶部是六个业务页签；「库存」页签里左侧是库存阶段目录，右侧是当前阶段的库存明细。
 */
defineOptions({ name: 'FdmGongchangStageStock' });

const { hasAccessByCodes } = useAccess();
const canOperate = computed(() =>
  hasAccessByCodes(['fdmgongchang:stage-stock:operate']),
);

const factory = useFactory();
const options = ref<Api.Options>();
const summary = ref<Api.Summary>();
const loadError = ref(false);
/** 账号不属于任何工厂，且没有「查看全部工厂」权限。 */
const noFactory = ref(false);
type TabKey =
  | 'orders'
  | 'receiving'
  | 'settings'
  | 'stock'
  | 'trade'
  | 'txns';
const TAB_KEYS = new Set<TabKey>([
  'orders',
  'receiving',
  'settings',
  'stock',
  'trade',
  'txns',
]);
const route = useRoute();
const router = useRouter();
const activeTab = ref<TabKey>('stock');
/** 手机上打开时提示去工人端。 */
const onPhone = typeof window !== 'undefined' && window.innerWidth < 768;
const receivingPending = ref(0);
const activeStage = ref('BOARD');
const refreshKey = ref(0);
const txnItemCode = ref('');

const drawerOpen = ref(false);
const drawerMode = ref<'create' | 'report'>('create');
const drawerStage = ref<string>();
const drawerOrderId = ref<number>();


const receiptOpen = ref(false);
const receiptLine = ref<Api.PurchaseLine>();

const wipCount = computed(() =>
  (summary.value?.processes ?? []).reduce(
    (t, p) => t + (p.inProgressCount ?? 0),
    0,
  ),
);

async function loadSummary() {
  summary.value = await getStageStockSummary();
}

async function loadAll() {
  loadError.value = false;
  noFactory.value = false;
  try {
    if (!factory.loaded.value) await factory.load();
    if (factory.factoryId.value === null) {
      noFactory.value = true;
      return;
    }
    const [opts] = await Promise.all([getStageStockOptions(), loadSummary()]);
    options.value = opts;
  } catch {
    loadError.value = true;
  }
}

onMounted(loadAll);

/** 切换工厂：库存、单据、设置都按工厂分开，整页重新加载。 */
async function switchFactory(id: number) {
  if (id === factory.factoryId.value) return;
  factory.select(id);
  options.value = undefined;
  summary.value = undefined;
  receivingPending.value = 0;
  txnItemCode.value = '';
  await loadAll();
}

/** 外贸合同主线的「去工序库存」带 ?tab=receiving 进来，直接打开对应标签。 */
watch(
  () => route.query.tab,
  (tab) => {
    if (typeof tab === 'string' && TAB_KEYS.has(tab as TabKey))
      activeTab.value = tab as TabKey;
  },
  { immediate: true },
);

function selectStage(stage: string) {
  activeStage.value = stage;
  activeTab.value = 'stock';
}

function openCreate(stage?: string) {
  drawerMode.value = 'create';
  drawerStage.value = stage ?? activeStage.value;
  drawerOrderId.value = undefined;
  drawerOpen.value = true;
}

function openReceipt(line: Api.PurchaseLine) {
  receiptLine.value = line;
  receiptOpen.value = true;
}


function openReport(orderId: number) {
  drawerMode.value = 'report';
  drawerOrderId.value = orderId;
  drawerOpen.value = true;
}

function showTxns(itemCode: string) {
  txnItemCode.value = itemCode;
  activeTab.value = 'txns';
}

async function onChanged() {
  refreshKey.value += 1;
  await loadSummary();
}

async function onSaved(text: string, stage?: string) {
  message.success(text);
  if (stage && activeTab.value === 'stock') activeStage.value = stage;
  await onChanged();
}

async function onSettingSaved() {
  options.value = await getStageStockOptions();
}
</script>

<template>
  <Page>
    <div class="flex flex-col gap-4">
      <header class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
            <h1 class="m-0 text-[26px] font-semibold leading-tight tracking-tight">
              工序库存
            </h1>
            <FactorySwitch
              v-if="factory.factories.value.length > 0"
              :factories="factory.factories.value"
              :value="factory.factoryId.value"
              @change="switchFactory"
            />
          </div>
          <p class="m-0 mt-1.5 text-sm text-muted-foreground">
            每道工序向上游库存领料，良品进入本段库存，残次品只登记数量。
          </p>
        </div>
        <Button
          v-if="canOperate && options"
          size="large"
          type="primary"
          @click="openCreate()"
        >
          ＋ 新建工序单
        </Button>
      </header>

      <Alert
        v-if="onPhone"
        message="在手机上？工人请用「我的工作台」，一步一步领料、报数量更方便"
        show-icon
        type="info"
      >
        <template #action>
          <Button size="small" type="primary" @click="router.push(FACTORY_ROUTES.workbench)">
            去工作台
          </Button>
        </template>
      </Alert>
      <Result
        v-if="noFactory"
        status="info"
        title="你的账号还不属于任何工厂"
      >
        <template #subTitle>
          工序库存按工厂分开记账。请在钉钉里把你调到所在工厂的部门，或联系管理员分配「查看全部工厂」权限。
        </template>
      </Result>
      <Result
        v-else-if="loadError"
        status="warning"
        title="工序库存没有加载出来"
      >
        <template #subTitle>
          可能是网络问题，或者还没有分配「工序库存」的查看权限。
        </template>
        <template #extra>
          <Button type="primary" @click="loadAll">重新加载</Button>
        </template>
      </Result>
      <div v-else-if="!options" class="flex h-60 items-center justify-center">
        <Spin />
      </div>

      <div v-else :key="factory.factoryId.value ?? 0" class="stage-stock">
        <Tabs v-model:active-key="activeTab" class="stage-stock__tabs">
          <Tabs.TabPane key="stock" tab="库存">
            <div
              class="flex flex-col overflow-hidden rounded-lg border border-border bg-card lg:flex-row"
            >
              <aside
                class="shrink-0 border-b border-border lg:w-[220px] lg:border-b-0 lg:border-r"
              >
                <StageRail
                  :active="activeStage"
                  :options="options"
                  :summary="summary"
                  @select="selectStage"
                />
              </aside>
              <div class="min-w-0 flex-1 p-4 lg:px-6 lg:py-5">
                <StockPanel
                  :options="options"
                  :refresh-key="refreshKey"
                  :stage="activeStage"
                  :summary="summary"
                  @changed="onChanged"
                  @create="openCreate"
                  @saved="(text) => message.success(text)"
                  @txn="showTxns"
                />
              </div>
            </div>
          </Tabs.TabPane>
          <Tabs.TabPane key="orders">
            <template #tab>
              工序单
              <span v-if="wipCount > 0" class="ml-1 text-xs text-warning">
                {{ wipCount }} 在制
              </span>
            </template>
            <div class="stage-stock__card">
              <OrderPanel
                :options="options"
                :refresh-key="refreshKey"
                @changed="onChanged"
                @create="openCreate()"
                @report="openReport"
              />
            </div>
          </Tabs.TabPane>
          <Tabs.TabPane key="trade" tab="早期出货">
            <div class="stage-stock__card">
              <ShipmentPanel :refresh-key="refreshKey" />
            </div>
          </Tabs.TabPane>
          <Tabs.TabPane key="receiving">
            <template #tab>
              到货入库
              <span
                v-if="receivingPending > 0"
                class="ml-1 text-xs text-primary"
              >
                {{ receivingPending }} 待到
              </span>
            </template>
            <div class="stage-stock__card">
              <ReceivingPanel
                :refresh-key="refreshKey"
                @pending="(count) => (receivingPending = count)"
                @receive="openReceipt"
              />
            </div>
          </Tabs.TabPane>
          <Tabs.TabPane key="txns" tab="库存流水">
            <div class="stage-stock__card">
              <TxnPanel
                v-model:item-code="txnItemCode"
                :options="options"
                :refresh-key="refreshKey"
              />
            </div>
          </Tabs.TabPane>
          <Tabs.TabPane key="settings" tab="基础设置">
            <div class="stage-stock__card">
              <SettingPanel :options="options" @saved="onSettingSaved" />
            </div>
          </Tabs.TabPane>
        </Tabs>

        <OrderDrawer
          v-model:open="drawerOpen"
          :initial-stage="drawerStage"
          :mode="drawerMode"
          :options="options"
          :order-id="drawerOrderId"
          @saved="onSaved"
        />
        <ReceiptDrawer
          v-model:open="receiptOpen"
          :options="options"
          :line="receiptLine"
          @saved="onSaved"
        />
      </div>
    </div>
  </Page>
</template>

<style scoped>
.stage-stock__card {
  padding: 16px 20px 20px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.stage-stock__tabs > :deep(.ant-tabs-nav) {
  margin-bottom: 16px;
}

/* 只调整页面这一层的页签，不影响各面板内部的页签 */
.stage-stock__tabs > :deep(.ant-tabs-nav .ant-tabs-nav-list > .ant-tabs-tab) {
  padding: 10px 4px;
  font-size: 15px;
}
</style>
