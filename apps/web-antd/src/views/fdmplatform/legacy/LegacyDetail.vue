<script setup lang="ts">
import type {
  LegacyDetailView,
  LegacyKind,
  LegacyRecord,
  NativeSourceRef,
} from '#/api/fdmplatform/legacy';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Input,
  Select,
  Space,
  Spin,
  Table,
  TabPane,
  Tabs,
  Tag,
} from 'ant-design-vue';

import {
  getLegacyDetail,
  getLegacyRecords,
  getNativeSource,
} from '#/api/fdmplatform/legacy';

import { errorText } from '../data';
import RelatedLink from '../documents/RelatedLink.vue';
import {
  allLegacyKinds,
  legacyAmount,
  legacyLabels,
  legacyNativeTarget,
  legacyRecordName,
  legacyText,
} from './model';

const props = defineProps<{
  id?: string;
  nativeSource?: NativeSourceRef;
  open: boolean;
}>();
const emit = defineEmits<{ close: [] }>();
const currentId = ref<string>();
const stack = ref<string[]>([]);
const view = ref<LegacyDetailView>();
const loading = ref(false);
const panelError = ref('');
const tab = ref('fields');
const fieldKeyword = ref('');
const pageNo = ref(1);
const pageSize = ref(50);
const selectedColumns = ref<string[]>([]);
const related = ref<LegacyRecord[]>([]);
const relatedKind = ref<LegacyKind>();
const relatedPage = ref(1);
const relatedSize = ref(10);
const relatedTotal = ref(0);
const relatedLoading = ref(false);
const relatedError = ref('');
let sequence = 0;
let relatedSequence = 0;
const fields = computed(
  () =>
    view.value?.fields.filter((entry) =>
      `${entry.label} ${legacyText(entry.value, '')}`
        .toLowerCase()
        .includes(fieldKeyword.value.toLowerCase()),
    ) ?? [],
);
const columnOptions = computed(
  () =>
    view.value?.columns.map((column) => ({
      value: column.key,
      label: column.label,
    })) ?? [],
);
const columns = computed(() => [
  { title: '原表行号', key: 'rowNo', width: 100, fixed: 'left' as const },
  ...(view.value?.columns ?? [])
    .filter((column) => selectedColumns.value.includes(column.key))
    .map((column) => ({ title: column.label, key: column.key, width: 170 })),
]);
const relatedOptions = computed(() =>
  allLegacyKinds
    .filter((kind) => (view.value?.relatedCounts[kind] ?? 0) > 0)
    .map((kind) => ({
      value: kind,
      label: `${legacyLabels[kind]} (${view.value?.relatedCounts[kind] ?? 0})`,
    })),
);
const relatedColumns = [
  { title: '原单据 / 记录', key: 'document', width: 260 },
  { title: '类型', key: 'kind', width: 130 },
  { title: '客户 / 供应商', key: 'partyName', width: 180 },
  { title: '原金额', key: 'amount', width: 180 },
  { title: '原状态', key: 'sourceStatus', width: 120 },
];

async function load(reset: boolean) {
  const id = currentId.value;
  const run = ++sequence;
  if (!props.open || !id) return;
  loading.value = true;
  panelError.value = '';
  if (reset) {
    view.value = undefined;
    pageNo.value = 1;
    tab.value = 'fields';
    fieldKeyword.value = '';
    related.value = [];
    relatedPage.value = 1;
    relatedTotal.value = 0;
    relatedError.value = '';
    relatedLoading.value = false;
    ++relatedSequence;
  } else if (view.value) view.value = { ...view.value, list: [] };
  try {
    const result = await (props.nativeSource
      ? getNativeSource(props.nativeSource, {
          pageNo: pageNo.value,
          pageSize: pageSize.value,
        })
      : getLegacyDetail(id, {
          pageNo: pageNo.value,
          pageSize: pageSize.value,
        }));
    if (run !== sequence || !props.open || currentId.value !== id) return;
    view.value = result;
    if (reset) {
      selectedColumns.value = result.columns.map((column) => column.key);
      relatedKind.value = allLegacyKinds.find(
        (kind) => (result.relatedCounts[kind] ?? 0) > 0,
      );
    }
  } catch (error) {
    if (run === sequence)
      panelError.value = `无法读取此原记录：${errorText(error)}。可返回上一条或关闭后重新查询。`;
  } finally {
    if (run === sequence) loading.value = false;
  }
}
async function loadRelated() {
  const run = ++relatedSequence;
  related.value = [];
  relatedTotal.value = 0;
  relatedError.value = '';
  if (!currentId.value || !relatedKind.value) return;
  relatedLoading.value = true;
  try {
    const result = await getLegacyRecords({
      relatedId: currentId.value,
      kind: relatedKind.value,
      pageNo: relatedPage.value,
      pageSize: relatedSize.value,
    });
    if (run !== relatedSequence || !props.open) return;
    related.value = result.list;
    relatedTotal.value = result.total;
  } catch (error) {
    if (run === relatedSequence) relatedError.value = errorText(error);
  } finally {
    if (run === relatedSequence) relatedLoading.value = false;
  }
}
function openRelated(id: string) {
  if (currentId.value) stack.value.push(currentId.value);
  currentId.value = id;
  void load(true);
}
function back() {
  const id = stack.value.pop();
  if (!id) return;
  currentId.value = id;
  void load(true);
}
function close() {
  ++sequence;
  ++relatedSequence;
  emit('close');
}
function changePage(value: { current?: number; pageSize?: number }) {
  pageNo.value = value.pageSize === pageSize.value ? (value.current ?? 1) : 1;
  pageSize.value = value.pageSize ?? pageSize.value;
  void load(false);
}
function changeRelatedPage(value: { current?: number; pageSize?: number }) {
  relatedPage.value =
    value.pageSize === relatedSize.value ? (value.current ?? 1) : 1;
  relatedSize.value = value.pageSize ?? relatedSize.value;
  void loadRelated();
}
function changeRelatedKind() {
  relatedPage.value = 1;
  void loadRelated();
}
watch(
  () => [
    props.open,
    props.id,
    props.nativeSource?.kind,
    props.nativeSource?.nativeId,
    props.nativeSource?.recordId,
  ],
  () => {
    ++sequence;
    ++relatedSequence;
    if (!props.open) {
      view.value = undefined;
      return;
    }
    currentId.value = props.nativeSource?.nativeId ?? props.id;
    stack.value = [];
    void load(true);
  },
  { immediate: true },
);
watch(tab, (value) => {
  if (value === 'related') void loadRelated();
});
onBeforeUnmount(() => {
  ++sequence;
  ++relatedSequence;
});
</script>

<template>
  <Drawer
    :open="open"
    width="min(1380px, 96vw)"
    title="原系统记录详情"
    :destroy-on-close="true"
    @close="close"
  >
    <template #extra>
      <Space>
        <Button v-if="stack.length" @click="back">返回上一条原记录</Button><Button :loading="loading" @click="load(false)"> 重新读取 </Button>
      </Space>
    </template>
    <Space direction="vertical" style="width: 100%" :size="16">
      <Alert v-if="panelError" :message="panelError" type="error" show-icon />
      <Spin v-if="loading && !view" tip="正在读取原记录…" />
      <template v-if="view">
        <Card size="small">
          <Space wrap>
            <Tag color="blue">{{ legacyLabels[view.record.kind] }}</Tag><strong>{{ legacyRecordName(view.record) }}</strong><Tag>{{ legacyText(view.record.sourceStatus) }}</Tag>
          </Space>
          <Descriptions :column="3" size="small" style="margin-top: 12px">
            <Descriptions.Item label="客户 / 供应商">
              {{ legacyText(view.record.partyName) }}
            </Descriptions.Item>
            <Descriptions.Item label="原公司">
              {{ legacyText(view.record.companyName) }}
            </Descriptions.Item>
            <Descriptions.Item label="原业务日期">
              {{ legacyText(view.record.businessDate) }}
            </Descriptions.Item>
            <Descriptions.Item :label="view.record.amountLabel || '原金额'">
              {{ legacyAmount(view.record) }}
            </Descriptions.Item>
            <Descriptions.Item label="来源记录 ID">
              {{ legacyText(view.record.externalId) }}
            </Descriptions.Item>
            <Descriptions.Item
              v-if="legacyNativeTarget(view.record)"
              label="已匹配当前档案"
            >
              <RelatedLink :target="legacyNativeTarget(view.record)">
                打开当前档案
              </RelatedLink>
            </Descriptions.Item>
          </Descriptions>
        </Card>
        <Alert
          type="info"
          show-icon
          message="保留原系统事实"
          description="原状态和冲销字段按来源保留，不代表当前系统重新执行审批或交易。导出表如仅有附件数量，文件未随表导出，本页不提供不存在的文件下载。"
        />
        <Tabs v-model:active-key="tab">
          <TabPane key="fields" tab="原始字段">
            <Input
              v-model:value="fieldKeyword"
              allow-clear
              placeholder="查找原字段或内容"
              style="max-width: 360px; margin-bottom: 16px"
            />
            <Descriptions bordered :column="2" size="small">
              <Descriptions.Item
                v-for="entry in fields"
                :key="entry.key"
                :label="entry.label"
              >
                <span class="raw-value">{{ legacyText(entry.value) }}</span>
              </Descriptions.Item>
            </Descriptions>
            <Empty v-if="!fields.length" description="没有匹配的原字段" />
          </TabPane>
          <TabPane key="lines" :tab="`原表明细（${view.total} 行）`">
            <Space direction="vertical" style="width: 100%">
              <Select
                v-model:value="selectedColumns"
                mode="multiple"
                :options="columnOptions"
                :max-tag-count="4"
                placeholder="选择要查看的原始列"
                style="width: 100%"
              />
              <Table
                :data-source="view.list"
                :columns="columns"
                row-key="rowNo"
                :loading="loading"
                size="small"
                :scroll="{ x: Math.max(columns.length * 170, 700) }"
                :pagination="{
                  current: pageNo,
                  pageSize,
                  total: view.total,
                  showSizeChanger: true,
                  showTotal: (count: number) => `共 ${count} 行`,
                }"
                @change="changePage"
              >
                <template #bodyCell="{ column, record }">
                  <span class="raw-value">{{
                    column.key === 'rowNo'
                      ? record.rowNo
                      : legacyText(record.values[String(column.key)])
                  }}</span>
                </template>
              </Table>
            </Space>
          </TabPane>
          <TabPane v-if="!nativeSource" key="related" tab="关联原记录">
            <Space direction="vertical" style="width: 100%">
              <Alert
                type="info"
                message="这里只展示已确认匹配的原记录关系；未能唯一匹配的引用保留在原字段和待核对信息中。"
              />
              <Select
                v-if="relatedOptions.length"
                v-model:value="relatedKind"
                :options="relatedOptions"
                style="min-width: 230px"
                @change="changeRelatedKind"
              />
              <Alert
                v-if="relatedError"
                :message="relatedError"
                type="error"
                show-icon
              />
              <Table
                v-if="relatedOptions.length"
                :data-source="related"
                :columns="relatedColumns"
                :loading="relatedLoading"
                row-key="id"
                :scroll="{ x: 900 }"
                :pagination="{
                  current: relatedPage,
                  pageSize: relatedSize,
                  total: relatedTotal,
                  showSizeChanger: true,
                }"
                @change="changeRelatedPage"
              >
                <template #bodyCell="{ column, record }">
                  <Button
                    v-if="column.key === 'document'"
                    type="link"
                    class="record-link"
                    @click="openRelated(String(record.id))"
                  >
                    {{ legacyRecordName(record as LegacyRecord) }}
                  </Button>
                  <span v-else-if="column.key === 'kind'">{{
                    legacyLabels[(record as LegacyRecord).kind]
                  }}</span>
                  <span v-else-if="column.key === 'amount'">{{
                    legacyAmount(record as LegacyRecord)
                  }}</span>
                  <span v-else>{{
                    legacyText(record[String(column.key)])
                  }}</span>
                </template>
              </Table>
              <Empty v-else description="当前没有已确认匹配的关联原记录" />
            </Space>
          </TabPane>
          <TabPane key="source" :tab="`来源与核对（${view.issues.length}）`">
            <Descriptions bordered :column="1" size="small">
              <Descriptions.Item label="来源文件">
                {{ view.source.file }}
              </Descriptions.Item>
              <Descriptions.Item label="工作表">
                {{ view.source.sheet }}
              </Descriptions.Item>
              <Descriptions.Item label="文件 SHA-256">
                <span class="raw-value">{{ view.source.sha256 }}</span>
              </Descriptions.Item>
            </Descriptions>
            <Table
              :data-source="
                view.issues.map((entry, index) => ({ ...entry, index }))
              "
              row-key="index"
              :pagination="{ pageSize: 10 }"
              :columns="[
                { title: '字段', dataIndex: 'field' },
                { title: '原值', key: 'value' },
                { title: '待核对原因', dataIndex: 'reason' },
              ]"
              style="margin-top: 16px"
            >
              <template #bodyCell="{ column, record }">
                <span v-if="column.key === 'value'" class="raw-value">{{
                  legacyText(record.value)
                }}</span>
              </template>
              <template #emptyText>
                当前记录没有单独标记的核对事项，原表未提供的信息仍以原字段为准。
              </template>
            </Table>
          </TabPane>
        </Tabs>
      </template>
    </Space>
  </Drawer>
</template>

<style scoped>
.raw-value {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.record-link {
  height: auto;
  padding: 0;
  text-align: left;
  overflow-wrap: anywhere;
  white-space: normal;
}
</style>
