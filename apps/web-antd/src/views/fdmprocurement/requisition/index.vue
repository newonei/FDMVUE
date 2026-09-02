<script lang="ts" setup>
import type { FdmProcurementRequisitionApi } from '#/api/fdmprocurement/requisition';

import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

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
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { getDataCompanySimpleList } from '#/api/fdmdata/datacompany';
import { getProcurementRequisitionList } from '#/api/fdmprocurement/requisition';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';

import { requisitionStatusMeta, validationStatusMeta } from './policy';

defineOptions({ name: 'FdmProcurementRequisition' });

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();

const loading = ref(false);
const companiesLoading = ref(false);
const records = ref<FdmProcurementRequisitionApi.Requisition[]>([]);
const companyOptions = ref<Array<{ label: string; value: string }>>([]);
const companyId = ref(String(route.query.companyId || ''));
const keyword = ref('');
const status = ref<FdmProcurementRequisitionApi.RequisitionStatus>();
const loadError = ref('');

const canQuery = computed(() =>
  hasAccessByCodes(['fdmprocurement:requisition:query']),
);
const canReview = computed(() =>
  hasAccessByCodes(['fdmprocurement:requisition:update']),
);
const visibleRecords = computed(() => {
  const normalizedKeyword = keyword.value.trim().toLocaleLowerCase();
  return records.value.filter((record) => {
    if (status.value && record.status !== status.value) return false;
    if (!normalizedKeyword) return true;
    return [
      record.requisitionNo,
      record.sourcePlanId,
      record.sourceOrderId,
      ...record.items.flatMap((item) => [item.productCode, item.productName]),
    ]
      .filter(Boolean)
      .some((value) =>
        String(value).toLocaleLowerCase().includes(normalizedKeyword),
      );
  });
});

function requisitionStatusCounts(
  values: readonly FdmProcurementRequisitionApi.Requisition[],
) {
  const counts: Record<string, number> = {};
  for (const record of values) {
    counts[record.status] = (counts[record.status] || 0) + 1;
  }
  return counts;
}

useFdmWaimaoAiContext(() => ({
  companyId: companyId.value || undefined,
  context: {
    filters: {
      keywordApplied: Boolean(keyword.value.trim()),
      status: status.value,
    },
    loading: loading.value,
    summary: {
      loadedCount: records.value.length,
      visibleCount: visibleRecords.value.length,
      visibleStatusCounts: requisitionStatusCounts(visibleRecords.value),
    },
  },
  contextMode: 'list',
  surfaceKey: 'procurement-requisition',
}));

const columns = [
  { key: 'requisition', title: '申请单 / 来源', width: 240 },
  { key: 'items', title: '产品明细', width: 220 },
  { key: 'requiredDate', title: '要求日期', width: 120 },
  { key: 'validation', title: '数据预检', width: 120 },
  { key: 'status', title: '业务状态', width: 110 },
  { key: 'version', title: '版本', width: 80 },
  { fixed: 'right' as const, key: 'actions', title: '操作', width: 150 },
];

async function loadCompanies() {
  companiesLoading.value = true;
  try {
    const companies = await getDataCompanySimpleList();
    companyOptions.value = (companies || [])
      .filter((company) => company.id !== undefined)
      .map((company) => ({
        label:
          company.companyShortName || company.companyName || String(company.id),
        value: String(company.id),
      }));
    if (!companyId.value && companyOptions.value.length === 1) {
      companyId.value = companyOptions.value[0]!.value;
    }
  } catch {
    loadError.value = '无法读取公司列表，请检查公司配置或稍后重试。';
  } finally {
    companiesLoading.value = false;
  }
}

async function load() {
  if (!canQuery.value || !companyId.value) {
    records.value = [];
    return;
  }
  loading.value = true;
  loadError.value = '';
  try {
    records.value =
      (await getProcurementRequisitionList(companyId.value)) || [];
    await router.replace({
      query: { ...route.query, companyId: companyId.value },
    });
  } catch {
    records.value = [];
    loadError.value = '采购申请加载失败，请检查公司配置或稍后重试。';
  } finally {
    loading.value = false;
  }
}

async function initialize() {
  if (!canQuery.value) return;
  await loadCompanies();
  if (companyId.value) await load();
}

function resetFilters() {
  keyword.value = '';
  status.value = undefined;
}

function openDetail(id: string) {
  void router.push(`/fdmprocurement/requisition/detail/${id}`);
}

function openReview(id: string) {
  void router.push(`/fdmprocurement/requisition/edit/${id}`);
}

function openDemandPlans() {
  void router.push('/fdmwaimao/demand-analysis');
}

function itemSummary(record: Record<string, unknown>) {
  const items = Array.isArray(record.items)
    ? (record.items as FdmProcurementRequisitionApi.RequisitionItem[])
    : [];
  return (
    items
      .slice(0, 2)
      .map((item) => item.productName)
      .join('、') || '无产品明细'
  );
}

void initialize();
</script>

<template>
  <Page
    :auto-content-height="false"
    description="承接已确认履约计划的外部采购数量，完成数据预检、寻源与审批"
    title="采购申请"
  >
    <template #extra>
      <Button @click="openDemandPlans">
        <template #icon>
          <IconifyIcon icon="lucide:workflow" aria-hidden="true" />
        </template>
        查看来源需求计划
      </Button>
      <Button :disabled="!companyId" :loading="loading" @click="load">
        <template #icon>
          <IconifyIcon icon="lucide:refresh-cw" aria-hidden="true" />
        </template>
        刷新
      </Button>
    </template>

    <Alert
      v-if="!canQuery"
      message="当前账号没有采购申请查询权限"
      show-icon
      type="warning"
    />
    <div v-else class="requisition-list">
      <Alert v-if="loadError" :message="loadError" show-icon type="error" />
      <Card :bordered="false" size="small">
        <Space wrap>
          <Select
            v-model:value="companyId"
            :loading="companiesLoading"
            :options="companyOptions"
            placeholder="选择当前数据公司"
            show-search
            style="width: 240px"
            @change="load"
          />
          <Input
            v-model:value="keyword"
            allow-clear
            placeholder="申请编号、来源编号或产品"
            style="width: 280px"
          />
          <Select
            v-model:value="status"
            allow-clear
            :options="[
              { label: '资料不完整', value: 'DATA_INCOMPLETE' },
              { label: '草稿', value: 'DRAFT' },
              { label: '待提交', value: 'READY' },
              { label: '审批中', value: 'SUBMITTED' },
              { label: '已通过', value: 'APPROVED' },
              { label: '已驳回', value: 'REJECTED' },
              { label: '已取消', value: 'CANCELLED' },
            ]"
            placeholder="全部状态"
            style="width: 150px"
          />
          <Button @click="resetFilters">重置筛选</Button>
        </Space>
      </Card>

      <Card :bordered="false" size="small">
        <Table
          :columns="columns"
          :data-source="visibleRecords"
          :loading="loading"
          :pagination="false"
          row-key="id"
          :scroll="{ x: 1050 }"
        >
          <template #emptyText>
            <Empty
              :description="
                companyId ? '当前公司暂无真实采购申请' : '请先选择一个数据公司'
              "
            />
          </template>
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'requisition'">
              <button
                class="requisition-list__link"
                @click="openDetail(record.id)"
              >
                <strong>{{ record.requisitionNo }}</strong>
                <span>
                  需求计划 {{ record.sourcePlanId }} / 合同
                  {{ record.sourceOrderId }}
                </span>
              </button>
            </template>
            <template v-else-if="column.key === 'items'">
              <div class="requisition-list__stack">
                <strong>{{ record.items.length }} 行</strong>
                <span>{{ itemSummary(record) }}</span>
              </div>
            </template>
            <template v-else-if="column.key === 'requiredDate'">
              {{ record.requiredDate || '未提供' }}
            </template>
            <template v-else-if="column.key === 'validation'">
              <Tag :color="validationStatusMeta(record.validationStatus).color">
                {{ validationStatusMeta(record.validationStatus).label }}
              </Tag>
            </template>
            <template v-else-if="column.key === 'status'">
              <Tag :color="requisitionStatusMeta(record.status).color">
                {{ requisitionStatusMeta(record.status).label }}
              </Tag>
            </template>
            <template v-else-if="column.key === 'version'">
              v{{ record.version }}
            </template>
            <template v-else-if="column.key === 'actions'">
              <Space>
                <Button size="small" type="link" @click="openDetail(record.id)">
                  查看
                </Button>
                <Button
                  v-if="canReview"
                  size="small"
                  type="link"
                  @click="openReview(record.id)"
                >
                  校核
                </Button>
              </Space>
            </template>
          </template>
        </Table>
        <footer class="requisition-list__footer">
          共 {{ visibleRecords.length }} 条（后端当前为按公司全量列表）
        </footer>
      </Card>
    </div>
  </Page>
</template>

<style scoped>
.requisition-list {
  display: grid;
  gap: 12px;
}

.requisition-list :deep(.ant-card-body) {
  padding: 14px 16px;
}

.requisition-list__link {
  display: grid;
  gap: 3px;
  width: 100%;
  padding: 0;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.requisition-list__link strong {
  color: #1677ff;
}

.requisition-list__link span,
.requisition-list__stack span,
.requisition-list__footer {
  font-size: 12px;
  color: #64748b;
}

.requisition-list__stack {
  display: grid;
  gap: 3px;
}

.requisition-list__footer {
  padding-top: 12px;
  text-align: right;
}
</style>
