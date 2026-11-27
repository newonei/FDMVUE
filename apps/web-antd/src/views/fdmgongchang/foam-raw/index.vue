<script setup lang="ts">
import type { FoamRawMaterial } from '#/api/fdmgongchang/foam-raw';

import { computed, nextTick, onMounted, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import { Alert, Button, Input, InputNumber, message, Modal, Result, Table, TabPane, Tabs, Tag } from 'ant-design-vue';
import dayjs from 'dayjs';

import { getFoamRawMaterials, observeFoamRawMaterial, saveFoamRawMaterialSetting } from '#/api/fdmgongchang/foam-raw';

import FactorySwitch from '../shared/factory-switch.vue';
import { useFactory } from '../shared/use-factory';
import { formatKilograms } from './format';
import InventoryPanel from './inventory-panel.vue';
import OrdersPanel from './orders-panel.vue';
import QuantityInput from './quantity-input.vue';

defineOptions({ name: 'FdmGongchangFoamRaw' });

const { hasAccessByCodes } = useAccess();
const canApply = computed(() => hasAccessByCodes(['fdmgongchang:foam-raw:apply']));
const canIssue = computed(() => hasAccessByCodes(['fdmgongchang:foam-raw:issue']));
const canManage = computed(() => hasAccessByCodes(['fdmgongchang:foam-raw:manage']));
const factory = useFactory();
const factoryId = factory.factoryId;
const tab = ref<'inventory' | 'materials' | 'orders'>('materials');
const ordersPanel = ref<InstanceType<typeof OrdersPanel>>();
const materials = ref<FoamRawMaterial[]>([]);
const refreshKey = ref(0);
const loading = ref(false);
const loadError = ref(false);
const saving = ref(false);
const keyword = ref('');
const onlyLow = ref(false);
let loadVersion = 0;

const lowCount = computed(() => materials.value.filter((row) => row.low).length);
const visibleMaterials = computed(() => {
  const search = keyword.value.trim().toLowerCase();
  return materials.value
    .filter((row) => (!onlyLow.value || row.low) && (!search || `${row.materialName} ${row.materialCode}`.toLowerCase().includes(search)))
    .toSorted((a, b) => Number(b.low) - Number(a.low));
});
const columns = [
  { key: 'material', title: '原料', width: 180 },
  { key: 'remaining', title: '车间最近确认余量', width: 185 },
  { key: 'warehouse', title: '原料仓库存', width: 155 },
  { key: 'pending', title: '已申请待发', width: 140 },
  { key: 'threshold', title: '预警线', width: 125 },
  { key: 'actions', title: '操作', width: 285 },
];

function materialShortage(material: FoamRawMaterial) {
  const warehouse = Number(material.warehouseQuantity);
  const pending = Number(material.pendingQuantity);
  return warehouse <= 0 || warehouse < pending;
}

function needsRecheck(material: FoamRawMaterial) {
  const observedAt = material.observedAt;
  return observedAt !== null && observedAt !== undefined && dayjs(observedAt).isBefore(dayjs().startOf('day'));
}

async function refresh() {
  const version = ++loadVersion;
  loading.value = true;
  loadError.value = false;
  try {
    if (!factory.loaded.value) await factory.load();
    const currentFactory = factoryId.value;
    if (version !== loadVersion || currentFactory === null || currentFactory === undefined) return;
    const result = await getFoamRawMaterials(currentFactory);
    if (version === loadVersion) materials.value = result;
  } catch {
    if (version === loadVersion) loadError.value = true;
  } finally {
    if (version === loadVersion) loading.value = false;
  }
}

onMounted(refresh);

function changeFactory(id: number) {
  if (id === factoryId.value || saving.value) return;
  factory.select(id);
  materials.value = [];
  void refresh();
}

function afterChange() {
  refreshKey.value += 1;
  void refresh();
}

async function startApplication(itemId?: number) {
  tab.value = 'orders';
  await nextTick();
  ordersPanel.value?.openApply(itemId);
}

const editor = ref<
  | { kind: 'observe'; material: FoamRawMaterial; quantity: null | number }
  | { kind: 'settings'; material: FoamRawMaterial; packageWeight: null | number; threshold: null | number }
>();
const editorTitle = computed(() => editor.value?.kind === 'settings'
  ? `预警线与袋重 · ${editor.value.material.materialName}`
  : `确认车间余量 · ${editor.value?.material.materialName ?? ''}`);

function editObservation(material: FoamRawMaterial) {
  editor.value = { kind: 'observe', material, quantity: material.remainingQuantity ?? null };
}

function editSettings(material: FoamRawMaterial) {
  editor.value = { kind: 'settings', material, packageWeight: material.packageWeight ?? null, threshold: material.thresholdQuantity ?? null };
}

async function submitEditor() {
  const draft = editor.value;
  const currentFactory = factoryId.value;
  if (!draft || currentFactory === null || currentFactory === undefined || saving.value) return;
  saving.value = true;
  try {
    if (draft.kind === 'observe') {
      if (draft.quantity === null || draft.quantity === undefined || draft.quantity < 0) {
        message.warning('请填写现在实际还剩多少原料');
        return;
      }
      await observeFoamRawMaterial(currentFactory, { itemId: draft.material.itemId, remainingQuantity: draft.quantity });
      message.success('已更新车间余量');
    } else {
      const { packageWeight, threshold } = draft;
      if (threshold === null || threshold === undefined || threshold < 0
        || (packageWeight !== null && packageWeight !== undefined && Number(packageWeight) <= 0)) {
        message.warning('请填写预警线，每袋净重若填写必须大于零');
        return;
      }
      await saveFoamRawMaterialSetting(currentFactory, { itemId: draft.material.itemId, packageWeight: packageWeight ?? undefined, thresholdQuantity: threshold });
      message.success('已保存原料设置');
    }
    editor.value = undefined;
    afterChange();
  } finally {
    saving.value = false;
  }
}

async function reportLow(material: FoamRawMaterial) {
  const currentFactory = factoryId.value;
  if (currentFactory === null || currentFactory === undefined || saving.value) return;
  saving.value = true;
  try {
    await observeFoamRawMaterial(currentFactory, { itemId: material.itemId, low: true });
    message.success('已标记快用完');
    afterChange();
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Page auto-content-height title="发泡原料领用">
    <template #extra>
      <div class="flex flex-wrap items-center gap-3">
        <FactorySwitch :factories="factory.factories.value" :value="factoryId" @change="changeFactory" />
        <Button :loading="loading" @click="afterChange">刷新</Button>
        <Button v-if="canApply && factoryId != null" type="primary" @click="startApplication()">申请领料</Button>
      </div>
    </template>

    <Alert v-if="loadError" class="mb-3" type="error" show-icon message="原料信息加载失败，请刷新重试。" />
    <Result v-if="factory.loaded.value && factoryId == null" status="403" title="当前账号没有可操作的工厂" />
    <div v-else-if="factoryId != null" :key="factoryId" class="rounded-lg border border-border bg-card px-3 pb-3 sm:px-4">
      <Tabs v-model:active-key="tab">
        <TabPane key="materials" :tab="lowCount > 0 ? `车间余量（${lowCount} 项待补）` : '车间余量'">
          <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div class="text-sm text-muted-foreground">车间快用完时更新余量，原料仓可按待发单安排补料。</div>
            <div class="flex flex-wrap gap-2">
              <Input v-model:value="keyword" allow-clear aria-label="搜索原料" class="w-44" placeholder="原料名称或编码" />
              <Button :type="onlyLow ? 'primary' : 'default'" :aria-pressed="onlyLow" @click="onlyLow = !onlyLow">只看待补</Button>
            </div>
          </div>
          <Table :columns="columns" :data-source="visibleMaterials" :loading="loading" :pagination="{ pageSize: 15, showSizeChanger: false }" :scroll="{ x: 1080 }" row-key="itemId" size="middle">
            <template #bodyCell="{ column, record }">
              <div v-if="column.key === 'material'" class="flex flex-col gap-1">
                <b>{{ record.materialName }}</b><span class="text-xs text-muted-foreground">{{ record.materialCode }}</span>
              </div>
              <div v-else-if="column.key === 'remaining'" class="flex flex-col items-start gap-1">
                <Tag v-if="record.low" :color="materialShortage(record as FoamRawMaterial) ? 'red' : 'orange'">{{ materialShortage(record as FoamRawMaterial) ? '原料仓不足' : Number(record.pendingQuantity) > 0 ? '补料待发' : '快用完' }}</Tag>
                <span v-if="record.remainingQuantity != null" class="tabular-nums">{{ formatKilograms(record.remainingQuantity) }}</span>
                <span v-else-if="!record.low" class="text-muted-foreground">待确认</span>
                <div v-if="record.observedAt" class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{{ dayjs(record.observedAt).format('MM-DD HH:mm') }} 更新</span>
                  <span v-if="needsRecheck(record as FoamRawMaterial)" class="text-orange-700">待核实</span>
                </div>
              </div>
              <span v-else-if="column.key === 'warehouse'" class="tabular-nums">{{ formatKilograms(record.warehouseQuantity) }}</span>
              <b v-else-if="column.key === 'pending' && Number(record.pendingQuantity) > 0" class="tabular-nums">{{ formatKilograms(record.pendingQuantity) }}</b>
              <span v-else-if="column.key === 'pending'" class="text-muted-foreground">—</span>
              <span v-else-if="column.key === 'threshold'" class="tabular-nums">{{ formatKilograms(record.thresholdQuantity) }}</span>
              <div v-else-if="column.key === 'actions'" class="flex flex-wrap gap-1">
                <Button v-if="canApply" size="small" @click="editObservation(record as FoamRawMaterial)">报余量</Button>
                <Button v-if="canApply && !record.low" :disabled="saving" size="small" @click="reportLow(record as FoamRawMaterial)">快用完</Button>
                <Button v-if="canApply" :type="record.low ? 'primary' : 'default'" size="small" @click="startApplication(record.itemId)">{{ record.low ? '补领' : '领料' }}</Button>
                <Button v-if="canManage" size="small" @click="editSettings(record as FoamRawMaterial)">设置</Button>
              </div>
            </template>
          </Table>
        </TabPane>
        <TabPane key="orders" tab="领料记录" force-render>
          <OrdersPanel ref="ordersPanel" :factory-id="factoryId" :materials="materials" :can-apply="canApply" :can-issue="canIssue" :refresh-key="refreshKey" @changed="afterChange" />
        </TabPane>
        <TabPane key="inventory" tab="月盘点">
          <InventoryPanel :factory-id="factoryId" :materials="materials" :can-manage="canManage" :refresh-key="refreshKey" @changed="afterChange" />
        </TabPane>
      </Tabs>
    </div>

    <Modal :open="!!editor" :confirm-loading="saving" :mask-closable="false" :title="editorTitle" @cancel="!saving && (editor = undefined)" @ok="submitEditor">
      <div v-if="editor?.kind === 'observe'" class="grid gap-2 py-2 sm:grid-cols-2 sm:items-center">
        <span>现场剩余数量</span>
        <QuantityInput v-model="editor.quantity" label="现场剩余数量" :package-weight="editor.material.packageWeight" />
      </div>
      <div v-else-if="editor?.kind === 'settings'" class="grid gap-3 py-2 sm:grid-cols-2 sm:items-center">
        <span>现场余量预警线</span>
        <QuantityInput v-model="editor.threshold" label="现场余量预警线" :package-weight="editor.packageWeight" />
        <span>每袋净重（公斤）</span>
        <InputNumber :value="editor.packageWeight ?? undefined" :min="0.001" :precision="3" aria-label="每袋净重（公斤）" placeholder="非固定包装可留空" class="w-full" @update:value="(value) => { if (editor?.kind === 'settings') editor.packageWeight = value == null ? null : Number(value); }" />
      </div>
    </Modal>
  </Page>
</template>
