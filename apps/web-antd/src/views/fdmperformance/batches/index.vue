<script lang="ts">
interface InstanceQueryState {
  deptId?: number;
  pageNo: number;
  pageSize: number;
  periodKey: string;
  status?: number;
  userId?: number;
  userName?: string;
}

let persistedInstanceQuery: InstanceQueryState | undefined;
</script>

<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { JixiaoApi } from '#/api/fdmperformance';
import type { SystemDeptApi } from '#/api/system/dept';
import type { SystemUserApi } from '#/api/system/user';

import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';
import { downloadFileFromBlobPart, handleTree } from '@vben/utils';

import {
  Button,
  DatePicker,
  Input,
  message,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
} from 'ant-design-vue';

import {
  deleteInstance,
  exportInstanceExcel,
  getInstancePage,
  getSetting,
  remindInstances,
} from '#/api/fdmperformance';
import { getSimpleDeptList } from '#/api/system/dept';
import { getSimpleUserList } from '#/api/system/user';

import {
  PERFORMANCE_PAGE_SIZE_OPTIONS,
  TASK_LABELS,
} from '../shared/constants';
import PerformanceShell from '../shared/PerformanceShell.vue';
import HrReviewQueue from './components/HrReviewQueue.vue';

defineOptions({ name: 'FdmPerformanceBatches' });

const router = useRouter();
const userStore = useUserStore();
const activeTab = ref('batches');
const isPerformanceHr = ref(false);
const instanceLoading = ref(false);
const deletingInstanceId = ref<number>();
const exporting = ref(false);
const reminding = ref(false);
const remindingInstanceId = ref<number>();
const instances = ref<JixiaoApi.Instance[]>([]);
const instanceTotal = ref(0);
const selectedInstanceIds = ref<number[]>([]);
const users = ref<SystemUserApi.User[]>([]);
const departments = ref<SystemDeptApi.Dept[]>([]);

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function createDefaultInstanceQuery(): InstanceQueryState {
  return {
    pageNo: 1,
    pageSize: 10,
    periodKey: currentMonthKey(),
    deptId: undefined,
    status: undefined,
    userId: undefined,
    userName: undefined,
  };
}

const instanceQuery = reactive<InstanceQueryState>(
  persistedInstanceQuery
    ? { ...persistedInstanceQuery }
    : createDefaultInstanceQuery(),
);

watch(
  instanceQuery,
  (query) => {
    persistedInstanceQuery = { ...query };
  },
  { deep: true, immediate: true },
);

const userFilterOptions = computed(() =>
  users.value.flatMap((user) =>
    user.id === undefined
      ? []
      : [
          {
            text: `${user.nickname || user.username} (${user.id})`,
            value: user.id,
          },
        ],
  ),
);

interface DeptFilterOption {
  children?: DeptFilterOption[];
  text: string;
  value: number;
}

const deptFilterOptions = computed(() => {
  const toFilterOptions = (items: SystemDeptApi.Dept[]): DeptFilterOption[] =>
    items.flatMap((item) => {
      if (item.id === undefined) return [];
      const children = item.children?.length
        ? toFilterOptions(item.children)
        : undefined;
      return [{ children, text: item.name, value: item.id }];
    });
  return toFilterOptions(handleTree(departments.value) as SystemDeptApi.Dept[]);
});

const instanceColumns = computed<TableColumnsType>(() => [
  {
    dataIndex: 'userName',
    filteredValue:
      instanceQuery.userId === undefined ? null : [instanceQuery.userId],
    filterMultiple: false,
    filterSearch: true,
    filters: userFilterOptions.value,
    title: '被考核人',
    width: 140,
  },
  {
    dataIndex: 'deptName',
    ellipsis: true,
    filteredValue:
      instanceQuery.deptId === undefined ? null : [instanceQuery.deptId],
    filterMode: 'tree',
    filterMultiple: false,
    filterSearch: true,
    filters: deptFilterOptions.value,
    title: '部门',
    width: 160,
  },
  { dataIndex: 'currentTaskName', title: '当前流程', width: 150 },
  {
    dataIndex: 'currentTaskAssigneeUserName',
    title: '当前执行人',
    width: 150,
  },
  { dataIndex: 'finalScore', title: '考核结果', width: 110 },
  { dataIndex: 'grade', title: '绩效等级', width: 100 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 190 },
]);

function canRemind(record: JixiaoApi.Instance) {
  return record.status === 1 && typeof record.id === 'number';
}

const rowSelection = computed(() => ({
  preserveSelectedRowKeys: true,
  selectedRowKeys: selectedInstanceIds.value,
  getCheckboxProps: (record: JixiaoApi.Instance) => ({
    disabled: !canRemind(record),
  }),
  onChange: (keys: Array<number | string>) => {
    selectedInstanceIds.value = keys
      .map(Number)
      .filter((key) => Number.isSafeInteger(key) && key > 0);
  },
}));

function currentFlow(record: JixiaoApi.Instance) {
  if (record.status === 2) return '考核结束';
  if (record.status === 3) return '已取消';
  return (
    TASK_LABELS[record.currentTaskKey || ''] ||
    record.currentTaskName ||
    '等待流程处理'
  );
}

function currentExecutor(record: JixiaoApi.Instance) {
  if (record.status !== 1) return '-';
  if (record.currentTaskAssigneeUserName) {
    return record.currentTaskAssigneeUserName;
  }
  if (record.currentTaskKey === 'JIXIAO_HR_REVIEW') {
    return '绩效 HR';
  }
  return '待分配';
}

function gradeColor(grade?: string) {
  if (grade === 'A+') return 'green';
  if (grade === 'A') return 'cyan';
  if (grade === 'C+') return 'orange';
  if (grade === 'C') return 'red';
  return 'blue';
}

async function loadInstances() {
  instanceLoading.value = true;
  try {
    const data = await getInstancePage(instanceQuery);
    instances.value = data.list;
    instanceTotal.value = data.total;
  } finally {
    instanceLoading.value = false;
  }
}

async function exportInstances() {
  exporting.value = true;
  try {
    const data = await exportInstanceExcel({
      ...instanceQuery,
      userName: instanceQuery.userName?.trim() || undefined,
    });
    downloadFileFromBlobPart({
      fileName: `${monthLabel(instanceQuery.periodKey)}绩效考核结果.xlsx`,
      source: data,
    });
    message.success('绩效考核结果已导出');
  } finally {
    exporting.value = false;
  }
}

function clearSelection() {
  selectedInstanceIds.value = [];
}

function searchInstances() {
  clearSelection();
  instanceQuery.userName = instanceQuery.userName?.trim() || undefined;
  instanceQuery.pageNo = 1;
  void loadInstances();
}

function changePeriodMonth() {
  searchInstances();
}

function monthLabel(periodKey: string) {
  const [year, month] = periodKey.split('-');
  return year && month ? `${year}年${month}月` : periodKey;
}

function openInstance(record: JixiaoApi.Instance) {
  router.push(
    `/fdmperformance/batches/${record.batchId}/instances/${record.id}`,
  );
}

async function removeInstance(record: JixiaoApi.Instance) {
  if (!record.id) return;
  deletingInstanceId.value = record.id;
  try {
    await deleteInstance(record.id);
    selectedInstanceIds.value = selectedInstanceIds.value.filter(
      (id) => id !== record.id,
    );
    message.success('考核已删除');
    if (instances.value.length === 1 && instanceQuery.pageNo > 1) {
      instanceQuery.pageNo -= 1;
    }
    await loadInstances();
  } finally {
    deletingInstanceId.value = undefined;
  }
}

async function remindSelected() {
  if (selectedInstanceIds.value.length === 0) return;
  const instanceIds = [...selectedInstanceIds.value];
  reminding.value = true;
  try {
    const recipientCount = await remindInstances({ instanceIds });
    selectedInstanceIds.value = [];
    message.success(`已提交 ${recipientCount} 位当前处理人的钉钉催办消息`);
  } finally {
    reminding.value = false;
  }
}

async function remindInstance(record: JixiaoApi.Instance) {
  if (!canRemind(record) || record.id === undefined) return;
  remindingInstanceId.value = record.id;
  try {
    const recipientCount = await remindInstances({ instanceIds: [record.id] });
    message.success(`已提交 ${recipientCount} 位当前处理人的钉钉催办消息`);
  } finally {
    remindingInstanceId.value = undefined;
  }
}

function selectedFilterId(filters: Record<string, any>, key: string) {
  const value = filters[key]?.[0];
  return value === undefined ? undefined : Number(value);
}

function changeInstancePage(pagination: any, filters: Record<string, any>) {
  const userId = selectedFilterId(filters, 'userName');
  const deptId = selectedFilterId(filters, 'deptName');
  const filterChanged =
    userId !== instanceQuery.userId || deptId !== instanceQuery.deptId;
  const pageSizeChanged = instanceQuery.pageSize !== pagination.pageSize;
  instanceQuery.userId = userId;
  instanceQuery.deptId = deptId;
  if (filterChanged) {
    selectedInstanceIds.value = [];
  }
  instanceQuery.pageNo =
    filterChanged || pageSizeChanged ? 1 : pagination.current;
  instanceQuery.pageSize = pagination.pageSize;
  void loadInstances();
}

async function initialize() {
  const [setting, userList, departmentList] = await Promise.all([
    getSetting(),
    getSimpleUserList(),
    getSimpleDeptList(),
    loadInstances(),
  ]);
  users.value = userList;
  departments.value = departmentList;
  const currentUserId = Number(
    userStore.userInfo?.id ?? userStore.userInfo?.userId ?? 0,
  );
  isPerformanceHr.value = (setting.hrUserIds || []).includes(currentUserId);
}

onMounted(initialize);
</script>

<template>
  <PerformanceShell title="考核管理">
    <Tabs v-model:active-key="activeTab" class="management-tabs">
      <Tabs.TabPane key="batches" tab="月度考核">
        <div class="filter-bar">
          <Input
            v-model:value="instanceQuery.userName"
            allow-clear
            :maxlength="50"
            placeholder="输入被考核人姓名"
            @press-enter="searchInstances"
          />
          <DatePicker
            v-model:value="instanceQuery.periodKey"
            :allow-clear="false"
            format="YYYY年MM月"
            :input-read-only="true"
            picker="month"
            placeholder="选择月份"
            value-format="YYYY-MM"
            @change="changePeriodMonth"
          />
          <Select
            v-model:value="instanceQuery.status"
            allow-clear
            :options="[
              { label: '进行中', value: 1 },
              { label: '已完成', value: 2 },
              { label: '已取消', value: 3 },
            ]"
            placeholder="全部状态"
          />
          <Button type="primary" @click="searchInstances">查询</Button>
        </div>

        <div class="instance-panel">
          <div class="panel-head">
            <strong>{{ monthLabel(instanceQuery.periodKey) }}考核人员</strong>
            <Space wrap>
              <span class="selected-count">
                已选择 {{ selectedInstanceIds.length }} 项
              </span>
              <Button
                v-if="selectedInstanceIds.length > 0"
                size="small"
                type="link"
                @click="clearSelection"
              >
                清空
              </Button>
              <Button :loading="exporting" @click="exportInstances">
                <template #icon>
                  <IconifyIcon icon="lucide:download" />
                </template>
                导出 Excel
              </Button>
              <Popconfirm
                :title="`确认向所选 ${selectedInstanceIds.length} 条考核的当前处理人发送钉钉催办消息？`"
                @confirm="remindSelected"
              >
                <Button
                  :disabled="
                    selectedInstanceIds.length === 0 ||
                    remindingInstanceId !== undefined
                  "
                  :loading="reminding"
                  type="primary"
                >
                  钉钉催办
                </Button>
              </Popconfirm>
            </Space>
          </div>
          <Table
            class="performance-compact-table"
            :columns="instanceColumns"
            :data-source="instances"
            :loading="instanceLoading"
            :pagination="{
              current: instanceQuery.pageNo,
              pageSize: instanceQuery.pageSize,
              pageSizeOptions: PERFORMANCE_PAGE_SIZE_OPTIONS,
              showSizeChanger: true,
              size: 'small',
              total: instanceTotal,
            }"
            :row-selection="rowSelection"
            :scroll="{ x: 1100 }"
            row-key="id"
            size="small"
            @change="changeInstancePage"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'deptName'">
                {{ record[column.dataIndex] || '-' }}
              </template>
              <template v-else-if="column.dataIndex === 'currentTaskName'">
                {{ currentFlow(record) }}
              </template>
              <template
                v-else-if="column.dataIndex === 'currentTaskAssigneeUserName'"
              >
                {{ currentExecutor(record) }}
              </template>
              <template v-else-if="column.dataIndex === 'finalScore'">
                {{ record.finalScore ?? '-' }}
              </template>
              <template v-else-if="column.dataIndex === 'grade'">
                <Tag v-if="record.grade" :color="gradeColor(record.grade)">
                  {{ record.grade }}
                </Tag>
                <span v-else>-</span>
              </template>
              <template v-else-if="column.dataIndex === 'action'">
                <Space :size="0">
                  <Button
                    size="small"
                    type="link"
                    @click="openInstance(record)"
                  >
                    详情
                  </Button>
                  <Popconfirm
                    v-if="canRemind(record)"
                    title="确认向该考核的当前处理人发送钉钉催办消息？"
                    @confirm="remindInstance(record)"
                  >
                    <Button
                      :disabled="
                        reminding ||
                        (remindingInstanceId !== undefined &&
                          remindingInstanceId !== record.id)
                      "
                      :loading="remindingInstanceId === record.id"
                      size="small"
                      type="link"
                    >
                      催办
                    </Button>
                  </Popconfirm>
                  <Popconfirm
                    ok-type="danger"
                    title="确认删除该考核？删除后评分、结果和复盘数据将无法恢复。"
                    @confirm="removeInstance(record)"
                  >
                    <Button
                      danger
                      :disabled="
                        deletingInstanceId !== undefined &&
                        deletingInstanceId !== record.id
                      "
                      :loading="deletingInstanceId === record.id"
                      size="small"
                      type="link"
                    >
                      删除
                    </Button>
                  </Popconfirm>
                </Space>
              </template>
            </template>
          </Table>
        </div>
      </Tabs.TabPane>
      <Tabs.TabPane v-if="isPerformanceHr" key="hr-review" tab="待人事审核">
        <HrReviewQueue />
      </Tabs.TabPane>
    </Tabs>
  </PerformanceShell>
</template>

<style scoped>
.filter-bar,
.instance-panel {
  padding: 12px;
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

.management-tabs {
  min-width: 0;
}

.filter-bar {
  display: grid;
  grid-template-columns: minmax(180px, 260px) 180px 140px auto;
  gap: 8px;
}

.panel-head {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.selected-count {
  font-size: 13px;
  color: #64748b;
}

@media (max-width: 900px) {
  .filter-bar,
  .panel-head {
    grid-template-columns: 1fr;
  }

  .panel-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
