<script setup lang="ts">
import type { FdmgongchangQualityApi as Api } from '#/api/fdmgongchang/quality';
import type { FdmgongchangStageStockApi as StageApi } from '#/api/fdmgongchang/stage-stock';

import { computed, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { formatDateTime } from '@vben/utils';

import { Alert, Button, Input, InputNumber, message, Modal, Select, Spin, Table, Tag } from 'ant-design-vue';

import { getHolds, getHoldTrace, releaseHold, scrapHold } from '#/api/fdmgongchang/quality';

import { formatQty, processLabel as processLabelOf } from '../model';

/**
 * 质量冻结：冻结中的数量不参与库存匹配。复查合格就解冻；不合格报废（从库存扣掉，可以只报废一部分，其余解冻）。
 * 追溯：库存不分批次，按「冻结的产出报出来之后领过这种料」沿工序单往下找可能流向的工序单和交货单。
 */
const props = defineProps<{ options: StageApi.Options; refreshKey: number }>();
const emit = defineEmits<{ changed: [] }>();

const { hasAccessByCodes } = useAccess();
const canOperate = computed(() => hasAccessByCodes(['fdmgongchang:stage-stock:operate']));
const canVoid = computed(() => hasAccessByCodes(['fdmgongchang:stage-stock:void']));

const STATUS: Record<Api.HoldStatus, { color: string; label: string }> = {
  HELD: { color: 'red', label: '冻结中' },
  RELEASED: { color: 'green', label: '已解冻' },
  SCRAPPED: { color: 'default', label: '已报废' },
};

const rows = ref<Api.Hold[]>([]);
const status = ref<string | undefined>('HELD');
const loading = ref(false);
async function load() {
  loading.value = true;
  try {
    rows.value = await getHolds({ status: status.value });
  } finally {
    loading.value = false;
  }
}
watch([status, () => props.refreshKey], load, { immediate: true });

const unitOf = (stage?: string) => props.options.stages.find((s) => s.code === stage)?.unit ?? '';
const stageLabel = (stage?: string) => props.options.stages.find((s) => s.code === stage)?.label ?? stage ?? '';

// ===== 解冻、报废 =====
const acting = ref<{ hold: Api.Hold; kind: 'release' | 'scrap' }>();
const note = ref('');
const scrapQty = ref<number>();
const saving = ref(false);
function openAction(hold: Api.Hold, kind: 'release' | 'scrap') {
  acting.value = { hold, kind };
  note.value = '';
  scrapQty.value = Number(hold.quantity);
}
async function submitAction() {
  if (!acting.value) return;
  const { hold, kind } = acting.value;
  saving.value = true;
  try {
    if (kind === 'release') {
      await releaseHold({ id: hold.id, note: note.value.trim() || undefined });
      message.success('已解冻，数量恢复可用');
    } else {
      const max = Number(hold.quantity);
      if (!scrapQty.value || scrapQty.value <= 0 || scrapQty.value > max) {
        message.warning(`报废数量要大于 0，且不超过 ${formatQty(max)}`);
        return;
      }
      await scrapHold({ id: hold.id, note: note.value.trim() || undefined, quantity: scrapQty.value });
      message.success(scrapQty.value < max ? `已报废 ${formatQty(scrapQty.value)}，其余解冻` : '已报废，已从库存扣掉');
    }
    acting.value = undefined;
    emit('changed');
    await load();
  } finally {
    saving.value = false;
  }
}

// ===== 追溯 =====
const traceOf = ref<Api.Hold>();
const trace = ref<Api.Trace>();
const tracing = ref(false);
async function openTrace(hold: Api.Hold) {
  traceOf.value = hold;
  trace.value = undefined;
  tracing.value = true;
  try {
    trace.value = await getHoldTrace(hold.id);
  } finally {
    tracing.value = false;
  }
}

const columns = [
  { key: 'order', title: '工序单' },
  { key: 'item', title: '物料' },
  { align: 'right' as const, key: 'qty', title: '冻结', width: 110 },
  { key: 'reason', title: '原因' },
  { key: 'status', title: '状态', width: 220 },
  { key: 'action', title: '', width: 170 },
];
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <Select
        id="hold-status"
        v-model:value="status"
        allow-clear
        class="w-32"
        :options="Object.entries(STATUS).map(([value, s]) => ({ label: s.label, value }))"
        placeholder="全部状态"
      />
      <Button :loading="loading" @click="load">刷新</Button>
      <span class="text-xs text-muted-foreground">在「工序单」展开某张单，产出行点「冻结」。冻结中的数量不参与排单和订单库存匹配。</span>
    </div>
    <Table :columns="columns" :data-source="rows" :loading="loading" :pagination="{ pageSize: 20 }" row-key="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'order'">
          <div class="flex flex-col">
            <span class="font-mono">{{ record.processOrderNo }}</span>
            <span class="text-xs text-muted-foreground">{{ processLabelOf(options, record.process) }}<template v-if="record.contractCode"> · 订单 {{ record.contractCode }}</template></span>
          </div>
        </template>
        <template v-else-if="column.key === 'item'">
          <div class="flex flex-col">
            <span class="font-mono">{{ record.itemCode }}</span>
            <span class="text-xs text-muted-foreground">{{ stageLabel(record.stage) }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'qty'">
          <span class="tabular-nums">{{ formatQty(record.quantity) }} {{ unitOf(record.stage) }}</span>
          <div v-if="Number(record.scrappedQuantity ?? 0) > 0" class="text-xs text-muted-foreground">报废 {{ formatQty(record.scrappedQuantity) }}</div>
        </template>
        <template v-else-if="column.key === 'reason'">
          <div class="flex flex-col">
            <span>{{ record.reason }}</span>
            <span class="text-xs text-muted-foreground">{{ record.heldBy }} · {{ formatDateTime(record.heldAt ?? undefined) }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'status'">
          <Tag :color="STATUS[record.status as Api.HoldStatus]?.color" class="m-0">{{ STATUS[record.status as Api.HoldStatus]?.label ?? record.status }}</Tag>
          <div v-if="record.resolveNote" class="text-xs text-muted-foreground">{{ record.resolveNote }} · {{ record.resolvedBy }}</div>
        </template>
        <template v-else-if="column.key === 'action'">
          <div class="flex flex-wrap gap-1">
            <Button size="small" type="link" @click="openTrace(record as Api.Hold)">追溯</Button>
            <template v-if="record.status === 'HELD'">
              <Button v-if="canOperate" size="small" type="link" @click="openAction(record as Api.Hold, 'release')">解冻</Button>
              <Button v-if="canVoid" danger size="small" type="link" @click="openAction(record as Api.Hold, 'scrap')">报废</Button>
            </template>
          </div>
        </template>
      </template>
    </Table>

    <Modal
      :confirm-loading="saving"
      :ok-button-props="{ danger: acting?.kind === 'scrap' }"
      :ok-text="acting?.kind === 'scrap' ? '报废' : '解冻'"
      :open="acting !== undefined"
      :title="acting?.kind === 'scrap' ? '报废冻结的数量' : '解冻'"
      @cancel="acting = undefined"
      @ok="submitAction"
    >
      <div v-if="acting" class="flex flex-col gap-3">
        <p class="m-0 text-sm">
          {{ acting.hold.processOrderNo }} · <span class="font-mono">{{ acting.hold.itemCode }}</span>
          冻结 {{ formatQty(acting.hold.quantity) }} {{ unitOf(acting.hold.stage) }}
        </p>
        <template v-if="acting.kind === 'scrap'">
          <Alert show-icon type="warning" message="报废的数量从库存扣掉；冻结前已经被领走一部分的话账面会变成负数，请盘点核对。" />
          <label class="flex items-center gap-2 text-sm" for="hold-scrap">
            报废数量
            <InputNumber id="hold-scrap" v-model:value="scrapQty" :max="Number(acting.hold.quantity)" :min="0" :precision="3" class="w-40" />
            <span class="text-muted-foreground">少于冻结数量时其余解冻</span>
          </label>
        </template>
        <Input.TextArea id="hold-note" v-model:value="note" :maxlength="400" :rows="2" :placeholder="acting.kind === 'scrap' ? '处理说明（选填）' : '复查结论（选填），例如：复查合格'" />
      </div>
    </Modal>

    <Modal :footer="null" :open="traceOf !== undefined" :title="`可能流向 · ${traceOf?.processOrderNo ?? ''}`" width="760px" @cancel="traceOf = undefined">
      <Spin :spinning="tracing">
        <div v-if="trace" class="flex flex-col gap-3">
          <Alert show-icon type="info" message="库存不分批次：这里列的是冻结的产出报出来之后领过这种料的工序单（再往下几道），以及它们交出的货，是「可能」用到了问题品。" />
          <section>
            <h4 class="m-0 mb-1 text-sm font-semibold">下游工序单（{{ trace.orders.length }}{{ trace.truncated ? '，没列全' : '' }}）</h4>
            <p v-if="trace.orders.length === 0" class="m-0 text-sm text-muted-foreground">还没有工序单领过这种料。</p>
            <ul v-else class="m-0 flex list-disc flex-col gap-1 pl-4 text-sm">
              <li v-for="o in trace.orders" :key="o.id">
                <Tag class="mr-1">第 {{ o.depth }} 道</Tag>
                <span class="font-mono">{{ o.orderNo }}</span>
                {{ o.processLabel }}<template v-if="o.contractCode"> · 订单 {{ o.contractCode }}</template>
                · 领 {{ formatQty(o.usedQuantity) }} · 良品 {{ formatQty(o.goodQuantity) }}
                <span class="text-xs text-muted-foreground">{{ o.operatorName }} {{ formatDateTime(o.issuedAt ?? undefined) }}</span>
              </li>
            </ul>
          </section>
          <section>
            <h4 class="m-0 mb-1 text-sm font-semibold">交货单（{{ trace.deliveries.length }}）</h4>
            <p v-if="trace.deliveries.length === 0" class="m-0 text-sm text-muted-foreground">还没有交出去的货。</p>
            <ul v-else class="m-0 flex list-disc flex-col gap-1 pl-4 text-sm">
              <li v-for="d in trace.deliveries" :key="d.id">
                <span class="font-mono">{{ d.deliveryNo }}</span>
                {{ d.productName }} {{ formatQty(d.quantity) }} {{ d.unit }}<template v-if="d.orderNo"> · 订单 {{ d.orderNo }}</template>
                <template v-if="d.warehouseName"> · {{ d.warehouseName }}</template>
              </li>
            </ul>
          </section>
        </div>
      </Spin>
    </Modal>
  </div>
</template>
