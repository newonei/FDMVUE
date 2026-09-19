<script setup lang="ts">
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import {
  Alert,
  Button,
  Collapse,
  Descriptions,
  Modal,
  Table,
  Tag,
} from 'ant-design-vue';
import { getEcProfitConfigurationHistory } from '#/api/fdmcaiwu/ec-profit';

const props = defineProps<{ revision: number }>();
const active = ref<string[]>([]);
const rows = ref<Api.ConfigurationHistory[]>([]);
const loading = ref(false);
const error = ref('');
const detail = ref<Api.ConfigurationHistory>();
const open = ref(false);
let sequence = 0;
const labels: Record<string, string> = {
  ASSIGNMENTS: '店铺归属变更',
  SCOPE_SYNC: '月报范围同步',
  GROUP_CREATE: '新增财务小组',
  GROUP_UPDATE: '修改财务小组',
  GROUP_DELETE: '删除财务小组',
};
const columns = [
  { title: '操作时间', dataIndex: 'createTime', width: 180 },
  { title: '变更类型', key: 'action', width: 150 },
  { title: '操作人', dataIndex: 'creator', width: 110 },
  { title: '变更摘要', key: 'summary', width: 300 },
  { title: '操作', key: 'actions', width: 80 },
];
const changeColumns = [
  { title: '店铺', dataIndex: 'shopName', width: 180 },
  { title: '原值', key: 'before', width: 270 },
  { title: '新值', key: 'after', width: 270 },
];
function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function label(value: unknown) {
  const data = object(value);
  if (!Object.keys(data).length) return '—';
  if ('configured' in data && !data.configured) return '未配置';
  if ('included' in data && !data.included)
    return `不纳入毛利 · ${data.reason || '未填写原因'}`;
  return [
    data.departmentName || '未分配部门',
    data.groupName || data.name || '未分组',
    data.effectiveMonth ? `${data.effectiveMonth} 起` : '',
    typeof data.enabled === 'boolean' ? (data.enabled ? '启用' : '停用') : '',
    data.reason || '',
  ]
    .filter(Boolean)
    .join(' / ');
}
const changes = computed(() => {
  const result = detail.value?.result ?? {};
  if (Array.isArray(result.changes))
    return result.changes.map((change, index) => ({
      ...object(change),
      rowKey: String(index),
    }));
  if (result.before || result.after)
    return [
      {
        rowKey: 'group',
        shopName: '财务小组',
        before: result.before,
        after: result.after,
      },
    ];
  return [];
});
function summary(row: Api.ConfigurationHistory) {
  const result = row.result;
  if (Array.isArray(result.changes))
    return `${result.changes.length} 项变更${result.effectiveMonth ? ` · ${result.effectiveMonth} 起` : ''}`;
  if (result.before || result.after)
    return `${label(result.before)} → ${label(result.after)}`;
  return result.month
    ? `${result.month} 月报范围`
    : `配置版本 ${result.configVersion ?? '—'}`;
}
async function load() {
  const current = ++sequence;
  loading.value = true;
  error.value = '';
  try {
    const result = await getEcProfitConfigurationHistory();
    if (current === sequence) rows.value = result;
  } catch {
    if (current === sequence) error.value = '变更记录加载失败，请重试。';
  } finally {
    if (current === sequence) loading.value = false;
  }
}
watch(
  () => [active.value.length, props.revision],
  () => {
    if (active.value.length) void load();
  },
);
onBeforeUnmount(() => sequence++);
</script>

<template>
  <Collapse v-model:active-key="active" class="mt-4"
    ><Collapse.Panel key="history" header="最近配置与范围变更（最多 50 条）"
      ><Alert v-if="error" type="error" :message="error" class="mb-3" />
      <div class="mb-3 flex justify-end">
        <Button size="small" :loading="loading" @click="load">刷新记录</Button>
      </div>
      <Table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="{ pageSize: 10, showSizeChanger: false }"
        :scroll="{ x: 820 }"
        row-key="id"
        size="small"
        ><template #bodyCell="{ column, record }"
          ><Tag v-if="column.key === 'action'">{{
            labels[record.action] || record.action
          }}</Tag
          ><template v-else-if="column.key === 'summary'">{{
            summary(record as Api.ConfigurationHistory)
          }}</template
          ><Button
            v-else-if="column.key === 'actions'"
            size="small"
            type="link"
            @click="
              detail = record as Api.ConfigurationHistory;
              open = true;
            "
            >详情</Button
          ></template
        ></Table
      ></Collapse.Panel
    ></Collapse
  >
  <Modal v-model:open="open" title="配置变更详情" :width="880" :footer="null"
    ><template v-if="detail"
      ><Descriptions class="my-4" :column="2" size="small"
        ><Descriptions.Item label="类型">{{
          labels[detail.action] || detail.action
        }}</Descriptions.Item
        ><Descriptions.Item label="操作人">{{
          detail.creator
        }}</Descriptions.Item
        ><Descriptions.Item label="时间">{{
          detail.createTime
        }}</Descriptions.Item
        ><Descriptions.Item label="配置版本">{{
          detail.result.configVersion ?? '—'
        }}</Descriptions.Item></Descriptions
      ><Table
        :columns="changeColumns"
        :data-source="changes"
        :pagination="false"
        :scroll="{ x: 720, y: 400 }"
        row-key="rowKey"
        size="small"
        ><template #bodyCell="{ column, record }"
          ><template v-if="column.key === 'before'">{{
            label(record.before)
          }}</template
          ><template v-else-if="column.key === 'after'">{{
            label(record.after)
          }}</template></template
        ><template #emptyText
          >本次记录未包含逐项前后值，请查看变更摘要。</template
        ></Table
      >
      <p class="mt-3 text-xs text-muted-foreground">
        {{ summary(detail) }}
      </p></template
    ></Modal
  >
</template>
