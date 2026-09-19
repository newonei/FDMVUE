<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';
import type { JixiaoApi } from '#/api/fdmperformance';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { downloadFileFromBlobPart } from '@vben/utils';
import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Input,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Textarea,
} from 'ant-design-vue';
import {
  cancelInstance,
  deleteInstance,
  exportInstanceExcel,
  getInstancePage,
  remindInstances,
} from '#/api/fdmperformance';
import { usePerformanceAccess } from '../shared/access';
import {
  INSTANCE_STATUS_MAP,
  PERFORMANCE_PAGE_SIZE_OPTIONS,
  TASK_LABELS,
} from '../shared/constants';
import PerformanceShell from '../shared/PerformanceShell.vue';
import {
  actionLabel,
  deadlineMeta,
  defaultManagementScope,
  hasAction,
  managementScopes,
  SCOPE_LABELS,
  visibilityLabel,
} from '../shared/workspace';
import HrReviewQueue from './components/HrReviewQueue.vue';

defineOptions({ name: 'FdmPerformanceBatches' });
const router = useRouter();
const { access, accessLoading, loadAccess } = usePerformanceAccess();
const loading = ref(false);
const loadError = ref(false);
const exporting = ref(false);
const reminding = ref(false);
const rows = ref<JixiaoApi.Instance[]>([]);
const total = ref(0);
const selectedIds = ref<number[]>([]);
const activeTab = ref('instances');
const cancelOpen = ref(false);
const cancelTarget = ref<JixiaoApi.Instance>();
const cancelReason = ref('');
const cancelLoading = ref(false);
let requestId = 0;
const query = reactive<JixiaoApi.InstancePageParams>({
  pageNo: 1,
  pageSize: 10,
  scope: 'INITIATED',
  periodKey: undefined,
  status: undefined,
  userName: undefined,
  creatorUserId: undefined,
});
const scopes = computed(() => managementScopes(access.value));
const creatorOptions = computed(() => [
  ...new Map(
    rows.value
      .filter((row) => row.creatorUserId)
      .map((row) => [
        row.creatorUserId,
        {
          label: row.creatorUserName || `用户 ${row.creatorUserId}`,
          value: row.creatorUserId,
        },
      ]),
  ).values(),
]);
const selectedRows = computed(() =>
  rows.value.filter((row) => selectedIds.value.includes(row.id!)),
);
const canRemindSelected = computed(
  () =>
    selectedRows.value.length > 0 &&
    selectedRows.value.every((row) => hasAction(row, 'REMIND')),
);
const rowSelection = computed(() => ({
  selectedRowKeys: selectedIds.value,
  getCheckboxProps: (row: JixiaoApi.Instance) => ({
    disabled: !hasAction(row, 'REMIND'),
  }),
  onChange: (keys: (number | string)[]) => {
    selectedIds.value = keys.map(Number);
  },
}));
const columns: TableColumnsType = [
  { dataIndex: 'userName', title: '被考核人', width: 160 },
  { dataIndex: 'templateName', title: '考核与周期', width: 200 },
  { dataIndex: 'creatorUserName', title: '发起人', width: 120 },
  { dataIndex: 'currentTaskName', title: '阶段与处理人', width: 180 },
  { dataIndex: 'endDate', title: '截止时间', width: 190 },
  { dataIndex: 'finalScore', title: '成绩', width: 130 },
  { dataIndex: 'action', title: '操作', fixed: 'right', width: 220 },
];
async function load() {
  if (!access.value?.canManage) return;
  const current = ++requestId;
  loading.value = true;
  loadError.value = false;
  selectedIds.value = [];
  rows.value = [];
  try {
    const result = await getInstancePage({ ...query });
    if (current !== requestId) return;
    rows.value = result.list;
    total.value = result.total;
  } catch {
    if (current === requestId) {
      loadError.value = true;
      total.value = 0;
    }
  } finally {
    if (current === requestId) loading.value = false;
  }
}
function search() {
  query.pageNo = 1;
  void load();
}
function changeScope(scope: string | number) {
  if (!scopes.value.includes(scope as JixiaoApi.Scope)) return;
  query.scope = scope as JixiaoApi.Scope;
  query.creatorUserId = undefined;
  query.userName = undefined;
  total.value = 0;
  search();
}
function openInstance(row: JixiaoApi.Instance) {
  void router.push(
    `/fdmperformance/batches/${row.batchId}/instances/${row.id}`,
  );
}
async function remind(instanceIds: number[]) {
  reminding.value = true;
  try {
    const count = await remindInstances({ instanceIds });
    message.success(`已提交 ${count} 位处理人的催办消息`);
    selectedIds.value = [];
    await load();
  } finally {
    reminding.value = false;
  }
}
async function exportRows() {
  if (!access.value?.canExport) return;
  exporting.value = true;
  try {
    const data = await exportInstanceExcel({ ...query });
    downloadFileFromBlobPart({ fileName: '绩效考核结果.xlsx', source: data });
  } finally {
    exporting.value = false;
  }
}
function openCancel(row: JixiaoApi.Instance) {
  cancelTarget.value = row;
  cancelReason.value = '';
  cancelOpen.value = true;
}
async function confirmCancel() {
  if (!cancelTarget.value?.id || !cancelReason.value.trim()) {
    message.warning('请填写撤销原因');
    return;
  }
  cancelLoading.value = true;
  try {
    await cancelInstance({
      instanceId: cancelTarget.value.id,
      reason: cancelReason.value.trim(),
    });
    message.success('考核已撤销');
    cancelOpen.value = false;
    await load();
  } finally {
    cancelLoading.value = false;
  }
}
async function remove(row: JixiaoApi.Instance) {
  if (!row.id || !hasAction(row, 'DELETE')) return;
  await deleteInstance(row.id);
  message.success('已删除');
  await load();
}
async function initialize() {
  const capability = await loadAccess();
  query.scope = defaultManagementScope(capability);
  await load();
}
onMounted(initialize);
</script>

<template>
  <PerformanceShell
    title="考核管理"
    description="管理自己发起的考核；分管主管发起的记录可监督查看。只有当前获准的任务和管理操作才会显示。"
  >
    <template #actions
      ><Space
        ><Button
          v-if="access?.canConfigure"
          @click="router.push('/fdmperformance/results')"
          >结果公布与复盘</Button
        ><Button
          v-if="access?.canLaunch"
          type="primary"
          @click="router.push('/fdmperformance/launch')"
          >发起考核</Button
        ></Space
      ></template
    >
    <Alert
      v-if="!accessLoading && access && !access.canManage"
      type="info"
      message="当前岗位仅能查看本人的绩效，请前往我的绩效。"
      show-icon
    />
    <Tabs v-if="access?.canManage" v-model:active-key="activeTab">
      <Tabs.TabPane key="instances" tab="考核记录">
        <div class="management-panel">
          <Alert
            v-if="loadError"
            type="error"
            message="考核记录加载失败，请重新查询。"
            show-icon
          />
          <Tabs :active-key="query.scope" @change="changeScope"
            ><Tabs.TabPane
              v-for="scope in scopes"
              :key="scope"
              :tab="SCOPE_LABELS[scope]"
          /></Tabs>
          <div class="filter-bar">
            <DatePicker
              v-model:value="query.periodKey"
              picker="month"
              value-format="YYYY-MM"
              placeholder="考核月份"
              allow-clear
            />
            <Input
              v-model:value="query.userName"
              placeholder="搜索被考核人"
              allow-clear
              @press-enter="search"
            />
            <Select
              v-model:value="query.status"
              :options="[
                { label: '进行中', value: 1 },
                { label: '已完成', value: 2 },
                { label: '已撤销', value: 3 },
              ]"
              placeholder="全部状态"
              allow-clear
            />
            <Select
              v-if="query.scope !== 'INITIATED'"
              v-model:value="query.creatorUserId"
              :options="creatorOptions"
              placeholder="本页发起人"
              allow-clear
              show-search
              option-filter-prop="label"
            />
            <Button type="primary" @click="search">查询</Button>
          </div>
          <div class="table-toolbar">
            <span
              >共 {{ total }} 条 ·
              {{ SCOPE_LABELS[query.scope || 'VISIBLE'] }}</span
            ><Space
              ><Popconfirm
                v-if="canRemindSelected"
                :title="`催办选中的 ${selectedIds.length} 条考核？`"
                @confirm="remind(selectedIds)"
                ><Button :loading="reminding"
                  >批量催办（{{ selectedIds.length }}）</Button
                ></Popconfirm
              ><Button
                v-if="access.canExport"
                :loading="exporting"
                @click="exportRows"
                >导出当前范围</Button
              ></Space
            >
          </div>
          <Table
            class="performance-compact-table"
            :columns="columns"
            :data-source="rows"
            :loading="loading"
            :row-selection="rowSelection"
            :pagination="{
              current: query.pageNo,
              pageSize: query.pageSize,
              total,
              showSizeChanger: true,
              pageSizeOptions: PERFORMANCE_PAGE_SIZE_OPTIONS,
            }"
            :scroll="{ x: 1240 }"
            row-key="id"
            size="small"
            @change="
              (pagination) => {
                query.pageNo = pagination.current || 1;
                query.pageSize = pagination.pageSize || 10;
                load();
              }
            "
          >
            <template #emptyText
              ><Empty
                :description="
                  loadError
                    ? '加载失败，请重新查询'
                    : '当前范围没有符合条件的考核'
                "
            /></template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'userName'"
                ><strong>{{ record.userName }}</strong>
                <div class="secondary">
                  {{ record.deptName || '—' }}
                </div></template
              >
              <template v-else-if="column.dataIndex === 'templateName'"
                ><span>{{ record.templateName || '绩效考核' }}</span>
                <div class="secondary">{{ record.periodKey }}</div></template
              >
              <template v-else-if="column.dataIndex === 'creatorUserName'"
                ><span>{{ record.creatorUserName || '—' }}</span>
                <div class="secondary">
                  {{ visibilityLabel(record.visibilityReason) }}
                </div></template
              >
              <template v-else-if="column.dataIndex === 'currentTaskName'"
                ><Tag :color="INSTANCE_STATUS_MAP[record.status]?.color">{{
                  record.currentTaskKey
                    ? TASK_LABELS[record.currentTaskKey] ||
                      record.currentTaskName
                    : INSTANCE_STATUS_MAP[record.status]?.text
                }}</Tag>
                <div class="secondary">
                  {{ record.currentTaskAssigneeUserName || '—' }}
                </div></template
              >
              <template v-else-if="column.dataIndex === 'endDate'"
                ><Tag
                  :color="
                    record.status === 1
                      ? deadlineMeta(record.endDate).color
                      : 'default'
                  "
                  >{{
                    record.status === 1
                      ? deadlineMeta(record.endDate).text
                      : record.endDate || '—'
                  }}</Tag
                ></template
              >
              <template v-else-if="column.dataIndex === 'finalScore'"
                >{{ record.finalScore ?? '—' }}
                <Tag v-if="record.grade">{{ record.grade }}</Tag>
                <div class="secondary">
                  {{
                    record.publicTime
                      ? '已公布'
                      : record.finalScore != null
                        ? '待公布'
                        : '尚未完成评分'
                  }}
                </div></template
              >
              <template v-else-if="column.dataIndex === 'action'"
                ><Space :size="0" wrap
                  ><Button
                    size="small"
                    type="link"
                    @click="openInstance(record)"
                    >{{ actionLabel(record) }}</Button
                  ><Popconfirm
                    v-if="hasAction(record, 'REMIND')"
                    title="向当前处理人发送催办提醒？"
                    @confirm="remind([record.id])"
                    ><Button size="small" type="link" :loading="reminding"
                      >催办</Button
                    ></Popconfirm
                  ><Button
                    v-if="hasAction(record, 'CANCEL')"
                    size="small"
                    type="link"
                    @click="openCancel(record)"
                    >撤销</Button
                  ><Popconfirm
                    v-if="access.canConfigure && hasAction(record, 'DELETE')"
                    title="仅已撤销且没有正式评分的考核可删除。确认永久删除该考核及关联数据？"
                    @confirm="remove(record)"
                    ><Button danger size="small" type="link"
                      >删除</Button
                    ></Popconfirm
                  ></Space
                ></template
              >
            </template>
          </Table>
        </div>
      </Tabs.TabPane>
      <Tabs.TabPane v-if="access.canConfigure" key="hr-review" tab="待人事审核"
        ><HrReviewQueue
      /></Tabs.TabPane>
    </Tabs>
    <Modal
      v-model:open="cancelOpen"
      title="撤销考核"
      :confirm-loading="cancelLoading"
      ok-text="确认撤销"
      @ok="confirmCancel"
      ><p>
        撤销 {{ cancelTarget?.userName }} 的
        {{ cancelTarget?.periodKey }} 考核，评分与处理轨迹将保留。
      </p>
      <Textarea
        v-model:value="cancelReason"
        :rows="4"
        :maxlength="500"
        placeholder="填写撤销原因"
    /></Modal>
  </PerformanceShell>
</template>

<style scoped>
.management-panel {
  padding: 18px;
  border: 1px solid hsl(var(--border));
  border-radius: 12px;
  background: hsl(var(--card));
}
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 18px;
}
.filter-bar :deep(.ant-input-affix-wrapper),
.filter-bar :deep(.ant-select),
.filter-bar :deep(.ant-picker) {
  width: 180px;
}
.table-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}
.table-toolbar > span,
.secondary {
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}
.secondary {
  margin-top: 5px;
}
@media (max-width: 700px) {
  .table-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
  .management-panel {
    padding: 12px;
  }
}
</style>
