<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmFactorySupplyTaskApi } from '#/api/fdmfactory/supply-task';

import { computed, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Card,
  Empty,
  Input,
  Select,
  Statistic,
  Table,
  Tag,
} from 'ant-design-vue';

import { getSupplyTaskPage } from '#/api/fdmfactory/supply-task';

import { supplyTaskStatusMeta } from './generation-policy';

defineOptions({ name: 'FdmFactorySupplyTaskList' });

const router = useRouter();
const { hasAccessByCodes } = useAccess();
const canQuery = computed(() =>
  hasAccessByCodes(['fdmfactory:supply-task:query']),
);
const loading = ref(false);
const list = ref<FdmFactorySupplyTaskApi.BatchSummary[]>([]);
const total = ref(0);
const filters = reactive<FdmFactorySupplyTaskApi.PageReq>({
  pageNo: 1,
  pageSize: 20,
});

const columns: TableColumnsType = [
  { key: 'batch', title: '任务批次', width: 230 },
  { key: 'source', title: '来源单据', width: 250 },
  { key: 'company', title: '公司', width: 160 },
  { key: 'quantity', title: '任务规模', width: 150 },
  { key: 'schedule', title: '要求日期', width: 200 },
  { key: 'status', title: '状态', width: 120 },
  { fixed: 'right', key: 'action', title: '操作', width: 100 },
];

async function load() {
  if (!canQuery.value) return;
  loading.value = true;
  try {
    const result = await getSupplyTaskPage({
      ...filters,
      companyId: filters.companyId?.trim() || undefined,
      keyword: filters.keyword?.trim() || undefined,
    });
    list.value = result.list;
    total.value = result.total;
  } finally {
    loading.value = false;
  }
}

function search() {
  filters.pageNo = 1;
  void load();
}

function reset() {
  filters.companyId = undefined;
  filters.keyword = undefined;
  filters.status = undefined;
  filters.pageNo = 1;
  void load();
}

function changePage(pageNo: number, pageSize: number) {
  filters.pageNo = pageNo;
  filters.pageSize = pageSize;
  void load();
}

function openDetail(id: string) {
  void router.push(`/fdmfactory/supply-task/detail/${id}`);
}

function quantitySummary(record: {
  quantitySummary?: FdmFactorySupplyTaskApi.BatchSummary['quantitySummary'];
}) {
  return record.quantitySummary?.length
    ? record.quantitySummary
        .map((item) => `${item.quantity} ${item.unit}`)
        .join(' · ')
    : '未提供';
}

if (canQuery.value) void load();
</script>

<template>
  <Page
    :auto-content-height="false"
    description="由已确认履约需求生成的 FDM 工厂供货任务草稿；正式生产执行由 FDM 工厂后续受控流程下达。"
    title="内部工厂供货任务"
  >
    <Alert
      v-if="!canQuery"
      description="缺少 fdmfactory:supply-task:query 权限，页面不会尝试读取任何任务数据。"
      message="无权查看内部工厂供货任务"
      show-icon
      type="error"
    />
    <template v-else>
      <Alert
        description="本页展示的是工厂供货任务草稿批次，不等同于正式生产工单。当前页面不提供直接下达、开工或完工操作。"
        message="任务草稿与正式生产工单严格分离"
        show-icon
        type="info"
      />

      <Card class="factory-task-list__filters" size="small">
        <Input
          v-model:value="filters.keyword"
          allow-clear
          placeholder="批次号、履约计划号或合同号"
          @press-enter="search"
        />
        <Input
          v-model:value="filters.companyId"
          allow-clear
          placeholder="公司 ID"
          @press-enter="search"
        />
        <Select
          v-model:value="filters.status"
          allow-clear
          :options="[
            { label: '任务草稿', value: 'DRAFT' },
            { label: '已确认草稿', value: 'CONFIRMED' },
            { label: '已交接生产执行', value: 'HANDED_OFF' },
            { label: '处理失败', value: 'FAILED' },
            { label: '已取消', value: 'CANCELLED' },
          ]"
          placeholder="全部状态"
        />
        <div class="factory-task-list__filter-actions">
          <Button type="primary" @click="search">
            <template #icon>
              <IconifyIcon icon="lucide:search" aria-hidden="true" />
            </template>
            查询
          </Button>
          <Button @click="reset">重置</Button>
        </div>
      </Card>

      <section class="factory-task-list__metrics">
        <Card size="small">
          <Statistic title="当前条件任务批次" :value="total" />
        </Card>
        <Card size="small">
          <Statistic
            title="本页内部工厂任务"
            :value="list.reduce((sum, item) => sum + item.taskCount, 0)"
          />
        </Card>
        <Card size="small">
          <Statistic
            title="本页冻结产品行"
            :value="list.reduce((sum, item) => sum + item.lineCount, 0)"
          />
        </Card>
      </section>

      <Card size="small">
        <Table
          :columns="columns"
          :data-source="list"
          :loading="loading"
          :pagination="{
            current: filters.pageNo,
            pageSize: filters.pageSize,
            showSizeChanger: true,
            showTotal: (value: number) => `共 ${value} 个任务批次`,
            total,
          }"
          row-key="id"
          :scroll="{ x: 1220 }"
          @change="
            (pagination) =>
              changePage(
                Number(pagination.current || 1),
                Number(pagination.pageSize || 20),
              )
          "
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'batch'">
              <div class="factory-task-list__stack">
                <Button type="link" @click="openDetail(record.id)">
                  {{ record.batchNo }}
                </Button>
                <span>批次 ID {{ record.id }} · v{{ record.version }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'source'">
              <div class="factory-task-list__stack">
                <strong>{{
                  record.sourcePlanNo || record.sourcePlanId
                }}</strong>
                <span>履约计划 v{{ record.sourcePlanVersion }}</span>
                <span>合同
                  {{ record.contractOrderNo || record.contractOrderId }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'company'">
              <div class="factory-task-list__stack">
                <strong>{{
                  record.companyName || `公司 ${record.companyId}`
                }}</strong>
                <span>ID {{ record.companyId }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'quantity'">
              <div class="factory-task-list__stack">
                <strong>{{ quantitySummary(record) }}</strong>
                <span>{{ record.taskCount }} 个工厂任务 ·
                  {{ record.lineCount }} 行</span>
              </div>
            </template>
            <template v-else-if="column.key === 'schedule'">
              <div class="factory-task-list__stack">
                <span>最早 {{ record.earliestRequiredDate || '未提供' }}</span>
                <span>最晚 {{ record.latestRequiredDate || '未提供' }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'status'">
              <Tag :color="supplyTaskStatusMeta(record.status).color">
                {{ supplyTaskStatusMeta(record.status).label }}
              </Tag>
            </template>
            <template v-else-if="column.key === 'action'">
              <Button type="link" @click="openDetail(record.id)">查看</Button>
            </template>
          </template>
          <template #emptyText>
            <Empty description="当前条件下没有工厂供货任务草稿" />
          </template>
        </Table>
      </Card>
    </template>
  </Page>
</template>

<style scoped>
.factory-task-list__filters {
  margin-top: 14px;
}

.factory-task-list__filters :deep(.ant-card-body) {
  display: grid;
  grid-template-columns:
    minmax(260px, 1.4fr) minmax(160px, 0.6fr) minmax(180px, 0.7fr)
    auto;
  gap: 10px;
}

.factory-task-list__filter-actions,
.factory-task-list__metrics {
  display: flex;
  gap: 8px;
}

.factory-task-list__metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin: 14px 0;
}

.factory-task-list__stack {
  display: grid;
  gap: 3px;
}

.factory-task-list__stack :deep(.ant-btn-link) {
  justify-content: flex-start;
  height: auto;
  padding: 0;
  font-weight: 600;
}

.factory-task-list__stack span {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

@media (max-width: 850px) {
  .factory-task-list__filters :deep(.ant-card-body),
  .factory-task-list__metrics {
    grid-template-columns: 1fr;
  }
}
</style>
