<script setup lang="ts">
import type {
  LegacyKind,
  LegacyRecord,
  LegacySummary,
} from '#/api/fdmplatform/legacy';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Card,
  Checkbox,
  Input,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { getLegacyRecords, getLegacySummary } from '#/api/fdmplatform/legacy';

import { errorText } from '../data';
import LegacyDetail from './LegacyDetail.vue';
import {
  allLegacyKinds,
  legacyAmount,
  legacyDateError,
  legacyLabels,
  legacyRecordName,
  legacyText,
} from './model';

const props = withDefaults(
  defineProps<{
    compact?: boolean;
    kinds?: LegacyKind[];
    productId?: string;
    relatedId?: string;
    summary?: LegacySummary;
  }>(),
  {
    compact: false,
    kinds: undefined,
    productId: undefined,
    relatedId: undefined,
    summary: undefined,
  },
);
const scopeSummary = ref<LegacySummary>();
const selectedKind = ref<LegacyKind>();
const keyword = ref('');
const fromDate = ref('');
const toDate = ref('');
const issuesOnly = ref(false);
const loading = ref(false);
const pageError = ref('');
const summaryError = ref('');
const records = ref<LegacyRecord[]>([]);
const pageNo = ref(1);
const pageSize = ref(20);
const total = ref(0);
const detailId = ref<string>();
let sequence = 0;
let scopeSequence = 0;
const availableKinds = computed(() =>
  props.kinds?.length ? props.kinds : allLegacyKinds,
);
const options = computed(() =>
  availableKinds.value.map((kind) => ({
    value: kind,
    label: `${legacyLabels[kind]}${scopeSummary.value ? ` (${scopeSummary.value.counts[kind] ?? 0})` : ''}`,
  })),
);
const columns = computed(() => [
  { title: '原单据 / 记录', key: 'document', width: 245 },
  { title: '客户 / 供应商', key: 'partyName', width: 180 },
  { title: '原公司', key: 'companyName', width: 150 },
  { title: '原业务日期', key: 'businessDate', width: 135 },
  { title: '原金额', key: 'amount', width: 180 },
  { title: '原状态', key: 'sourceStatus', width: 130 },
  { title: '来源行 / 待核对', key: 'issues', width: 130 },
]);

async function load() {
  const run = ++sequence;
  records.value = [];
  total.value = 0;
  pageError.value = legacyDateError(fromDate.value, toDate.value);
  if (pageError.value || !selectedKind.value) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const result = await getLegacyRecords({
      kind: selectedKind.value,
      keyword: keyword.value.trim() || undefined,
      productId: props.productId,
      relatedId: props.relatedId,
      fromDate: fromDate.value || undefined,
      toDate: toDate.value || undefined,
      issuesOnly: issuesOnly.value,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
    });
    if (run !== sequence) return;
    records.value = result.list;
    total.value = result.total;
  } catch (error) {
    if (run === sequence) pageError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
async function initialize() {
  const run = ++scopeSequence;
  ++sequence;
  scopeSummary.value = undefined;
  records.value = [];
  total.value = 0;
  detailId.value = undefined;
  keyword.value = '';
  fromDate.value = '';
  toDate.value = '';
  issuesOnly.value = false;
  pageNo.value = 1;
  pageError.value = '';
  summaryError.value = '';
  loading.value = true;
  try {
    const result =
      props.summary ??
      (await getLegacySummary({
        productId: props.productId,
        relatedId: props.relatedId,
      }));
    if (run !== scopeSequence) return;
    scopeSummary.value = result;
  } catch (error) {
    if (run !== scopeSequence) return;
    summaryError.value = `记录数量暂未读取：${errorText(error)}`;
  }
  if (run !== scopeSequence) return;
  selectedKind.value =
    availableKinds.value.find(
      (kind) => (scopeSummary.value?.counts[kind] ?? 0) > 0,
    ) ?? availableKinds.value[0];
  await load();
}
function search() {
  pageNo.value = 1;
  void load();
}
function reset() {
  keyword.value = '';
  fromDate.value = '';
  toDate.value = '';
  issuesOnly.value = false;
  search();
}
function changePage(value: { current?: number; pageSize?: number }) {
  pageNo.value = value.pageSize === pageSize.value ? (value.current ?? 1) : 1;
  pageSize.value = value.pageSize ?? pageSize.value;
  void load();
}
watch(
  () => [
    availableKinds.value.join(','),
    props.productId,
    props.relatedId,
    props.summary?.batchId,
  ],
  () => {
    void initialize();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  ++sequence;
  ++scopeSequence;
});
</script>

<template>
  <Card :bordered="!compact" :title="compact ? undefined : '金智导入记录'">
    <Space direction="vertical" style="width: 100%" :size="14">
      <Alert
        type="info"
        show-icon
        message="原系统记录"
        description="按导出表保留原状态、金额和明细。未注明的信息不补成零；历史冲销字段保持原含义。本页用于查询，不重新执行审批、收付款或库存扣减。"
      />
      <Alert
        v-if="summaryError"
        type="warning"
        :message="summaryError"
        show-icon
      />
      <Space wrap>
        <Select
          v-model:value="selectedKind"
          :options="options"
          style="min-width: 200px"
          aria-label="原记录类型"
          @change="search"
        />
        <Input
          v-model:value="keyword"
          allow-clear
          placeholder="单号、名称、客户或供应商"
          style="width: 240px"
          @press-enter="search"
        />
        <Input
          v-model:value="fromDate"
          type="date"
          aria-label="原业务开始日期"
          style="width: 160px"
        />
        <span>至</span>
        <Input
          v-model:value="toDate"
          type="date"
          aria-label="原业务结束日期"
          style="width: 160px"
        />
        <Checkbox v-model:checked="issuesOnly" @change="search">
          仅待核对记录
        </Checkbox>
        <Button type="primary" :loading="loading" @click="search">查询</Button>
        <Button @click="reset">重置</Button>
      </Space>
      <span class="legacy-note">类别数量按{{
          productId
            ? '本产品已匹配的'
            : relatedId
              ? '当前关联的'
              : '当前导入批次'
        }}记录统计；日期筛选只使用来源业务日期。</span>
      <Alert v-if="pageError" type="error" :message="pageError" show-icon />
      <Table
        :columns="columns"
        :data-source="records"
        :loading="loading"
        row-key="id"
        :scroll="{ x: 1150 }"
        :pagination="{
          current: pageNo,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (count: number) => `共 ${count} 条原记录`,
        }"
        @change="changePage"
      >
        <template #emptyText>
          当前范围没有原系统记录。可调整类型或筛选后查询。
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'document'">
            <Button
              type="link"
              class="record-link"
              @click="detailId = String(record.id)"
            >
              {{ legacyRecordName(record as LegacyRecord) }}
            </Button>
            <div v-if="record.documentNo && record.title" class="legacy-note">
              {{ record.title }}
            </div>
          </template>
          <template v-else-if="column.key === 'amount'">
            {{ legacyAmount(record as LegacyRecord) }}
            <div v-if="record.amountLabel" class="legacy-note">
              {{ record.amountLabel }}
            </div>
          </template>
          <template v-else-if="column.key === 'issues'">
            <span>{{ record.rowCount }} 行</span>
            <Tag v-if="record.issueCount" color="orange">
              {{ record.issueCount }} 项待核对
            </Tag>
          </template>
          <span v-else>{{ legacyText(record[String(column.key)]) }}</span>
        </template>
      </Table>
    </Space>
    <LegacyDetail
      :id="detailId"
      :open="!!detailId"
      @close="detailId = undefined"
    />
  </Card>
</template>

<style scoped>
.legacy-note {
  font-size: 12px;
  color: #64748b;
}

.record-link {
  height: auto;
  padding: 0;
  text-align: left;
  overflow-wrap: anywhere;
  white-space: normal;
}
</style>
