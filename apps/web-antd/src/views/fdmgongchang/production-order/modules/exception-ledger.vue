<script setup lang="ts">
import type { FdmgongchangQualityApi as Api } from '#/api/fdmgongchang/quality';

import { computed, reactive, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { formatDateTime } from '@vben/utils';

import { Button, Checkbox, Input, message, Modal, Select, Table, Tag } from 'ant-design-vue';

import { closeException, createException, getExceptions, viewException } from '#/api/fdmgongchang/quality';

/**
 * 异常台账：报工短产、隔夜负账、交期风险、采购单变更、质量冻结自动登记，也可以手工登记。
 * 交期风险、质量冻结（和勾了高风险的手工登记）会发钉钉；看过不等于关闭，关闭要写处理结果。
 * 对象恢复正常时（差额已处理、负账补平、冻结已处理、确认了采购单变更）系统自动关闭。
 */
const props = defineProps<{ factoryId: number }>();

const { hasAccessByCodes } = useAccess();
const canHandle = computed(() => hasAccessByCodes(['fdmgongchang:schedule:confirm']));

const TYPES: Record<Api.ExceptionType, { color: string; label: string }> = {
  DUE_RISK: { color: 'red', label: '交期风险' },
  MANUAL: { color: 'default', label: '手工登记' },
  NEGATIVE_STOCK: { color: 'orange', label: '隔夜负账' },
  QUALITY_HOLD: { color: 'magenta', label: '质量冻结' },
  SHORTAGE: { color: 'gold', label: '报工短产' },
  SOURCE_CHANGED: { color: 'blue', label: '采购单变更' },
};

const rows = ref<Api.Exception[]>([]);
const filters = reactive({ status: 'OPEN' as string | undefined, type: undefined as string | undefined });
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    rows.value = await getExceptions(filters);
  } finally {
    loading.value = false;
  }
}
watch([() => props.factoryId, () => filters.status, () => filters.type], load, { immediate: true });

async function markViewed(row: Api.Exception) {
  await viewException(row.id);
  message.success('已记下查看；处理完请关闭并写处理结果');
  await load();
}

const closing = ref<Api.Exception>();
const resolution = ref('');
const saving = ref(false);
function openClose(row: Api.Exception) {
  closing.value = row;
  resolution.value = '';
}
async function submitClose() {
  if (!closing.value) return;
  if (!resolution.value.trim()) {
    message.warning('请写处理结果');
    return;
  }
  saving.value = true;
  try {
    await closeException({ id: closing.value.id, resolution: resolution.value.trim() });
    message.success('已关闭');
    closing.value = undefined;
    await load();
  } finally {
    saving.value = false;
  }
}

const createOpen = ref(false);
const draft = reactive({ detail: '', high: false, orderNo: '', title: '' });
function openCreate() {
  Object.assign(draft, { detail: '', high: false, orderNo: '', title: '' });
  createOpen.value = true;
}
async function submitCreate() {
  if (!draft.title.trim()) {
    message.warning('请填写异常标题');
    return;
  }
  saving.value = true;
  try {
    await createException({
      detail: draft.detail.trim() || undefined,
      high: draft.high,
      orderNo: draft.orderNo.trim() || undefined,
      title: draft.title.trim(),
    });
    message.success(draft.high ? '已登记，并已钉钉通知本厂接单的人' : '已登记');
    createOpen.value = false;
    await load();
  } finally {
    saving.value = false;
  }
}

const columns = [
  { key: 'type', title: '类型', width: 120 },
  { key: 'title', title: '异常' },
  { key: 'orderNo', title: '订单', width: 140 },
  { key: 'time', title: '登记 / 查看', width: 200 },
  { key: 'status', title: '状态', width: 220 },
  { key: 'action', title: '', width: 130 },
];
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <Select
        id="exception-status"
        v-model:value="filters.status"
        allow-clear
        class="w-32"
        :options="[{ label: '待处理', value: 'OPEN' }, { label: '已关闭', value: 'CLOSED' }]"
        placeholder="全部状态"
      />
      <Select
        id="exception-type"
        v-model:value="filters.type"
        allow-clear
        class="w-36"
        :options="Object.entries(TYPES).map(([value, t]) => ({ label: t.label, value }))"
        placeholder="全部类型"
      />
      <Button :loading="loading" @click="load">刷新</Button>
      <Button v-if="canHandle" @click="openCreate">手工登记</Button>
      <span class="text-xs text-muted-foreground">每天早上 8 点巡检隔夜负账和交期风险；交期风险、质量冻结会发钉钉。</span>
    </div>
    <Table :columns="columns" :data-source="rows" :loading="loading" :pagination="{ pageSize: 20 }" row-key="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'type'">
          <div class="flex flex-wrap gap-1">
            <Tag :color="TYPES[record.type as Api.ExceptionType]?.color" class="m-0">{{ record.typeLabel || TYPES[record.type as Api.ExceptionType]?.label || record.type }}</Tag>
            <Tag v-if="record.risk === 'HIGH'" class="m-0" color="red">高风险</Tag>
          </div>
        </template>
        <template v-else-if="column.key === 'title'">
          <div class="flex flex-col">
            <span>{{ record.title }}</span>
            <span v-if="record.detail" class="text-xs text-muted-foreground">{{ record.detail }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'orderNo'">
          <span class="font-mono text-xs">{{ record.orderNo || '—' }}</span>
        </template>
        <template v-else-if="column.key === 'time'">
          <div class="flex flex-col text-xs">
            <span>{{ formatDateTime(record.createTime ?? undefined) }}</span>
            <span v-if="record.viewedBy" class="text-muted-foreground">{{ record.viewedBy }} 看过 · {{ formatDateTime(record.viewedAt ?? undefined) }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'status'">
          <Tag v-if="record.status === 'OPEN'" class="m-0" color="orange">待处理</Tag>
          <div v-else class="flex flex-col text-xs">
            <span><Tag class="m-0" color="green">已关闭</Tag> {{ record.closedBy }} · {{ formatDateTime(record.closedAt ?? undefined) }}</span>
            <span class="text-muted-foreground">{{ record.resolution }}</span>
          </div>
        </template>
        <template v-else-if="column.key === 'action'">
          <div v-if="record.status === 'OPEN'" class="flex gap-1">
            <Button size="small" type="link" @click="markViewed(record as Api.Exception)">已查看</Button>
            <Button v-if="canHandle" size="small" type="link" @click="openClose(record as Api.Exception)">关闭</Button>
          </div>
        </template>
      </template>
    </Table>

    <Modal
      :confirm-loading="saving"
      :open="closing !== undefined"
      ok-text="关闭异常"
      title="关闭异常"
      @cancel="closing = undefined"
      @ok="submitClose"
    >
      <p class="text-sm">{{ closing?.title }}</p>
      <Input.TextArea id="exception-resolution" v-model:value="resolution" :maxlength="400" :rows="3" placeholder="处理结果，例如：已再派任务补齐 / 已和客户确认延期到 11-20" />
    </Modal>

    <Modal :confirm-loading="saving" :open="createOpen" ok-text="登记" title="手工登记异常" @cancel="createOpen = false" @ok="submitCreate">
      <div class="flex flex-col gap-3">
        <Input id="exception-title" v-model:value="draft.title" :maxlength="190" placeholder="标题，例如：冲裁模具开裂" />
        <Input.TextArea id="exception-detail" v-model:value="draft.detail" :maxlength="900" :rows="3" placeholder="详情（选填）：影响哪些工序、预计多久恢复" />
        <Input id="exception-order" v-model:value="draft.orderNo" :maxlength="60" placeholder="影响的订单号（选填）" />
        <Checkbox :checked="draft.high" @update:checked="(v: boolean) => (draft.high = v)">高风险：钉钉通知本厂接单的人</Checkbox>
      </div>
    </Modal>
  </div>
</template>
