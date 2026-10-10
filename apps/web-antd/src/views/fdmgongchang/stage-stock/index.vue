<script lang="ts" setup>
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import { Button, message, Result, Spin, Tabs } from 'ant-design-vue';

import {
  getStageStockOptions,
  getStageStockSummary,
} from '#/api/fdmgongchang/stage-stock';

import FactorySwitch from '../shared/factory-switch.vue';
import { useFactory } from '../shared/use-factory';
import OrderDrawer from './modules/order-drawer.vue';
import OrderPanel from './modules/order-panel.vue';
import ReceiptDrawer from './modules/receipt-drawer.vue';
import ReceivingPanel from './modules/receiving-panel.vue';
import SettingPanel from './modules/setting-panel.vue';
import ShipmentDrawer from './modules/shipment-drawer.vue';
import StageRail from './modules/stage-rail.vue';
import StockPanel from './modules/stock-panel.vue';
import TradePanel from './modules/trade-panel.vue';
import TxnPanel from './modules/txn-panel.vue';

/**
 * 工厂部门 · 工序库存：每道工序向上游库存领料，良品进入本段库存，残次品只登记数量。
 * 宽屏左侧是生产链（竖排），右侧是库存 / 工序单 / 流水 / 设置。
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
type TabKey = 'orders' | 'receiving' | 'settings' | 'stock' | 'trade' | 'txns';
const TAB_KEYS = new Set<TabKey>([
  'orders',
  'receiving',
  'settings',
  'stock',
  'trade',
  'txns',
]);
const route = useRoute();
const activeTab = ref<TabKey>('stock');
const tradePending = ref(0);
const receivingPending = ref(0);
const activeStage = ref('BOARD');
const refreshKey = ref(0);
const txnItemCode = ref('');

const drawerOpen = ref(false);
const drawerMode = ref<'create' | 'report'>('create');
const drawerStage = ref<string>();
const drawerOrderId = ref<number>();
const drawerTask = ref<{ assignmentId: string; contractId: string }>();

const shipmentOpen = ref(false);
const shipmentTarget = ref<{ contractId: string; contractItemId: string }>();

const receiptOpen = ref(false);
const receiptRawLine = ref<Api.RawOpenLine>();
const receiptTradeLine = ref<Api.TradePurchaseLine>();

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
  tradePending.value = 0;
  receivingPending.value = 0;
  txnItemCode.value = '';
  await loadAll();
}

/** 外贸合同主线的「去工序库存」带 ?tab=trade / ?tab=receiving 进来，直接打开对应标签。 */
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
  drawerTask.value = undefined;
  drawerOpen.value = true;
}

/** 外贸订单「安排生产」：预选自制任务，默认从当前选中的库存段开始。 */
function openProduce(task: Api.MakeTask) {
  drawerMode.value = 'create';
  drawerStage.value = activeStage.value;
  drawerOrderId.value = undefined;
  drawerTask.value = {
    assignmentId: task.assignmentId,
    contractId: task.contractId,
  };
  drawerOpen.value = true;
}

function openShipment(target?: { contractId: string; contractItemId: string }) {
  shipmentTarget.value = target;
  shipmentOpen.value = true;
}

function openRawReceipt(line: Api.RawOpenLine) {
  receiptTradeLine.value = undefined;
  receiptRawLine.value = line;
  receiptOpen.value = true;
}

function openTradeReceipt(line: Api.TradePurchaseLine) {
  receiptRawLine.value = undefined;
  receiptTradeLine.value = line;
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
      <header class="flex flex-wrap items-end justify-between gap-3">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
            <h1 class="m-0 text-xl font-semibold tracking-tight">工序库存</h1>
            <FactorySwitch
              v-if="factory.factories.value.length > 0"
              :factories="factory.factories.value"
              :value="factory.factoryId.value"
              @change="switchFactory"
            />
          </div>
          <p class="m-0 mt-1 text-sm text-muted-foreground">
            每道工序向上游库存领料，良品进入本段库存，残次品只登记数量。
          </p>
        </div>
        <Button
          v-if="canOperate && options"
          type="primary"
          @click="openCreate()"
        >
          ＋ 新建工序单
        </Button>
      </header>

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

      <div
        v-else
        :key="factory.factoryId.value ?? 0"
        class="flex flex-col gap-4 xl:flex-row xl:items-start"
      >
        <aside class="flex flex-col gap-2 xl:sticky xl:top-2 xl:w-60 xl:shrink-0">
          <StageRail
            :active="activeTab === 'stock' ? activeStage : undefined"
            :options="options"
            :summary="summary"
            @select="selectStage"
          />
          <p class="m-0 px-1 text-xs leading-relaxed text-muted-foreground">
            每道工序只能向上游库存领料；跳过工序时可以领更早阶段的库存，例如冲裁直接领片材。
          </p>
        </aside>

        <section
          class="min-w-0 flex-1 rounded-lg border border-border bg-card px-4 pb-4"
        >
          <Tabs v-model:active-key="activeTab">
            <Tabs.TabPane key="stock" tab="库存">
              <StockPanel
                :options="options"
                :refresh-key="refreshKey"
                :stage="activeStage"
                @changed="onChanged"
                @create="openCreate"
                @ship="openShipment()"
                @txn="showTxns"
              />
            </Tabs.TabPane>
            <Tabs.TabPane key="orders">
              <template #tab>
                工序单
                <span v-if="wipCount > 0" class="ml-1 text-xs text-warning">
                  {{ wipCount }} 在制
                </span>
              </template>
              <OrderPanel
                :options="options"
                :refresh-key="refreshKey"
                @changed="onChanged"
                @create="openCreate()"
                @report="openReport"
              />
            </Tabs.TabPane>
            <Tabs.TabPane key="trade">
              <template #tab>
                外贸订单
                <span v-if="tradePending > 0" class="ml-1 text-xs text-primary">
                  {{ tradePending }} 待生产
                </span>
              </template>
              <TradePanel
                :refresh-key="refreshKey"
                @pending="(count) => (tradePending = count)"
                @produce="openProduce"
                @ship="openShipment"
              />
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
              <ReceivingPanel
                :refresh-key="refreshKey"
                @pending="(count) => (receivingPending = count)"
                @receive-raw="openRawReceipt"
                @receive-trade="openTradeReceipt"
              />
            </Tabs.TabPane>
            <Tabs.TabPane key="txns" tab="库存流水">
              <TxnPanel
                v-model:item-code="txnItemCode"
                :options="options"
                :refresh-key="refreshKey"
              />
            </Tabs.TabPane>
            <Tabs.TabPane key="settings" tab="基础设置">
              <SettingPanel :options="options" @saved="onSettingSaved" />
            </Tabs.TabPane>
          </Tabs>
        </section>

        <OrderDrawer
          v-model:open="drawerOpen"
          :initial-stage="drawerStage"
          :initial-task="drawerTask"
          :mode="drawerMode"
          :options="options"
          :order-id="drawerOrderId"
          @saved="onSaved"
        />
        <ShipmentDrawer
          v-model:open="shipmentOpen"
          :initial-contract-id="shipmentTarget?.contractId"
          :initial-item-id="shipmentTarget?.contractItemId"
          :options="options"
          @saved="onSaved"
        />
        <ReceiptDrawer
          v-model:open="receiptOpen"
          :options="options"
          :raw-line="receiptRawLine"
          :trade-line="receiptTradeLine"
          @saved="onSaved"
        />
      </div>
    </div>
  </Page>
</template>
