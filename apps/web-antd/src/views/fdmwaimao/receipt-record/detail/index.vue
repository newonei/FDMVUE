<script lang="ts" setup>
import type { FdmWaimaoReceiptRecordApi } from '#/api/fdmwaimao/receipt-record';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Spin, Tag } from 'ant-design-vue';

import {
  getConsumptionRecord,
  getReceiptRecord,
} from '#/api/fdmwaimao/receipt-record';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';

import ReceiptRecordDetail from '../components/ReceiptRecordDetail.vue';
import { normalizeRecordType } from '../form-model';

defineOptions({ name: 'FdmWaimaoReceiptRecordDetail' });

type RecordDetail =
  | FdmWaimaoReceiptRecordApi.ConsumptionRecord
  | FdmWaimaoReceiptRecordApi.ReceiptRecord;

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();

const record = ref<RecordDetail>();
const loading = ref(false);
let requestId = 0;

const type = computed<FdmWaimaoReceiptRecordApi.RecordType>(() =>
  route.path.includes('/receipt-record/consumption/')
    ? 'consumption'
    : normalizeRecordType(route.query.type),
);
const id = computed(() => String(route.params.id || ''));
const permissionPrefix = computed(() =>
  type.value === 'consumption' ? 'consumption-record' : 'receipt-record',
);
const canUpdate = computed(() =>
  hasAccessByCodes([`fdmwaimao:${permissionPrefix.value}:update`]),
);

function recordEntityLabel(value?: RecordDetail) {
  if (!value) return undefined;
  if ('receiptNo' in value) return value.receiptNo;
  return value.consumptionNo;
}

useFdmWaimaoAiContext(() => ({
  businessId: id.value,
  context: {
    loading: loading.value,
    record: record.value,
  },
  contextMode: 'detail',
  entityLabel: recordEntityLabel(record.value),
  surfaceKey: 'receipt-record',
  variant: type.value,
}));

async function load() {
  const current = ++requestId;
  record.value = undefined;
  loading.value = true;
  try {
    const result =
      type.value === 'consumption'
        ? await getConsumptionRecord(id.value)
        : await getReceiptRecord(id.value);
    if (current === requestId) record.value = result;
  } finally {
    if (current === requestId) loading.value = false;
  }
}

function back() {
  void router.push({
    path: '/fdmwaimao/receipt-record',
    query: { type: type.value },
  });
}

function edit() {
  if (!record.value) return;
  void router.push({
    path:
      type.value === 'consumption'
        ? `/fdmwaimao/receipt-record/consumption/edit/${record.value.id}`
        : `/fdmwaimao/receipt-record/edit/${record.value.id}`,
    query: { type: type.value },
  });
}

watch(() => [route.params.id, route.path, route.query.type], load, {
  immediate: true,
});
</script>

<template>
  <Page
    :auto-content-height="false"
    :description="
      type === 'consumption' ? '消费结算明细' : '真实到账与汇率快照'
    "
    :title="
      record
        ? 'consumptionNo' in record
          ? record.consumptionNo
          : record.receiptNo
        : '记录详情'
    "
  >
    <template #extra>
      <Button @click="back">
        <template #icon>
          <IconifyIcon icon="lucide:arrow-left" aria-hidden="true" />
        </template>
        返回列表
      </Button>
      <Button
        v-if="canUpdate && record && record.status !== 'VOIDED'"
        type="primary"
        @click="edit"
      >
        编辑记录
      </Button>
      <Tag v-if="record?.status === 'VOIDED'" color="error">已作废</Tag>
    </template>
    <Spin :spinning="loading">
      <div class="receipt-detail-page">
        <ReceiptRecordDetail :record="record" :type="type" />
      </div>
    </Spin>
  </Page>
</template>

<style scoped>
.receipt-detail-page {
  max-width: 1320px;
  margin: 0 auto;
}
</style>
