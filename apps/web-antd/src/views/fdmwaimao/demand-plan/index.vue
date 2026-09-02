<script lang="ts" setup>
import type { FdmWaimaoDemandPlanApi } from '#/api/fdmwaimao/demand-plan';

import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Card,
  Empty,
  Input,
  Pagination,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { getDemandPlanPage } from '#/api/fdmwaimao/demand-plan';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';
import { TradeBusinessLink } from '#/views/fdm-trade-shared/components';
import { fdmTradeDocumentRoute } from '#/views/fdm-trade-shared/document-links';

defineOptions({ name: 'FdmWaimaoDemandPlan' });

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();

const loading = ref(false);
const records = ref<FdmWaimaoDemandPlanApi.PageItem[]>([]);
const total = ref(0);
const query = reactive<FdmWaimaoDemandPlanApi.PageReq>({
  keyword: '',
  pageNo: 1,
  pageSize: 20,
});

const canQuery = computed(() =>
  hasAccessByCodes(['fdmwaimao:demand-plan:query']),
);
const canUpdate = computed(() =>
  hasAccessByCodes(['fdmwaimao:demand-plan:update']),
);
const canQueryContract = computed(() =>
  hasAccessByCodes(['fdmwaimao:contract-order:query']),
);
const canQueryCustomer = computed(() =>
  hasAccessByCodes(['fdmwaimao:customer:query']),
);
const relationCustomerName = computed(
  () =>
    records.value.find((record) => record.customerId === query.customerId)
      ?.customerName || query.customerId,
);

const columns = [
  { key: 'plan', title: '计划编号 / 来源合同', width: 220 },
  { key: 'customer', title: '客户 / 负责人', width: 190 },
  { key: 'requiredDate', title: '客户要求交期', width: 130 },
  { key: 'quality', title: '计划完整性', width: 230 },
  { key: 'status', title: '状态', width: 110 },
  { key: 'updateTime', title: '最近更新', width: 170 },
  { fixed: 'right' as const, key: 'actions', title: '操作', width: 150 },
];

useFdmWaimaoAiContext(() => ({
  context: {
    loading: loading.value,
    query: { ...query },
    records: records.value,
    total: total.value,
  },
  contextMode: 'list',
  entityLabel: '履约需求计划列表',
  surfaceKey: 'demand-plan',
}));

function statusLabel(status: FdmWaimaoDemandPlanApi.DemandPlanStatus) {
  if (status === 'CONFIRMED') return '已确认';
  if (status === 'NEEDS_REPLAN') return '需要重排';
  if (status === 'VOIDED') return '已作废';
  if (status === 'AI_DRAFT') return 'AI 草稿';
  return '草稿';
}

function statusColor(status: FdmWaimaoDemandPlanApi.DemandPlanStatus) {
  if (status === 'CONFIRMED') return 'green';
  if (status === 'NEEDS_REPLAN') return 'orange';
  if (status === 'VOIDED') return 'default';
  return 'blue';
}

async function load() {
  if (!canQuery.value) return;
  loading.value = true;
  try {
    const result = await getDemandPlanPage({
      ...query,
      keyword: query.keyword?.trim() || undefined,
    });
    records.value = result.list || [];
    total.value = result.total || 0;
  } finally {
    loading.value = false;
  }
}

function search() {
  query.pageNo = 1;
  void load();
}

function reset() {
  query.keyword = '';
  query.customerId = undefined;
  query.status = undefined;
  query.pageNo = 1;
  void load();
}

function routeQueryValue(value: unknown) {
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function clearCustomerRelation() {
  query.customerId = undefined;
  void load();
}

function changePage(pageNo: number, pageSize: number) {
  query.pageNo = pageNo;
  query.pageSize = pageSize;
  void load();
}

function openDetail(id: string) {
  void router.push(`/fdmwaimao/demand-analysis/detail/${id}`);
}

function editPlan(id: string) {
  void router.push(`/fdmwaimao/demand-analysis/edit/${id}`);
}

function openContracts() {
  void router.push('/fdmwaimao/contract-order');
}

onMounted(() => {
  query.customerId = routeQueryValue(route.query.customerId) || undefined;
  void load();
});

watch(
  () => route.query.customerId,
  () => {
    const customerId = routeQueryValue(route.query.customerId) || undefined;
    if (customerId === query.customerId) return;
    query.customerId = customerId;
    query.pageNo = 1;
    void load();
  },
);
</script>

<template>
  <Page
    :auto-content-height="false"
    description="从已确认合同生成履约需求拆分，并由人工审阅后确认"
    title="需求计划"
  >
    <template #extra>
      <Button type="primary" @click="openContracts">
        <template #icon>
          <IconifyIcon icon="lucide:file-input" aria-hidden="true" />
        </template>
        从合同发起
      </Button>
    </template>

    <Card :bordered="false" class="demand-plan-list__filters" size="small">
      <Space wrap>
        <Tag
          v-if="query.customerId"
          closable
          color="blue"
          @close="clearCustomerRelation"
        >
          关联客户：{{ relationCustomerName }}
        </Tag>
        <Input
          v-model:value="query.keyword"
          allow-clear
          placeholder="计划编号、合同编号、主题或客户"
          style="width: 300px"
          @press-enter="search"
        />
        <Select
          v-model:value="query.status"
          allow-clear
          :options="[
            { label: '草稿', value: 'DRAFT' },
            { label: 'AI 草稿', value: 'AI_DRAFT' },
            { label: '已确认', value: 'CONFIRMED' },
            { label: '需要重排', value: 'NEEDS_REPLAN' },
            { label: '已作废', value: 'VOIDED' },
          ]"
          placeholder="全部状态"
          style="width: 150px"
        />
        <Button type="primary" @click="search">查询</Button>
        <Button @click="reset">重置</Button>
      </Space>
    </Card>

    <Card :bordered="false" class="demand-plan-list__table" size="small">
      <Table
        :columns="columns"
        :data-source="records"
        :loading="loading"
        :pagination="false"
        row-key="id"
        :scroll="{ x: 1200 }"
      >
        <template #emptyText>
          <Empty description="暂无需求计划，请从已确认合同详情发起" />
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'plan'">
            <div class="demand-plan-list__stack">
              <TradeBusinessLink
                :to="fdmTradeDocumentRoute('demand-plan', record.id)"
              >
                {{ record.planNo }}
              </TradeBusinessLink>
              <TradeBusinessLink
                :disabled="!canQueryContract"
                :to="
                  canQueryContract
                    ? fdmTradeDocumentRoute(
                        'contract-order',
                        record.contractOrderId,
                      )
                    : undefined
                "
              >
                {{ record.contractOrderNo }} · {{ record.contractSubject }}
              </TradeBusinessLink>
            </div>
          </template>
          <template v-else-if="column.key === 'customer'">
            <div class="demand-plan-list__stack">
              <TradeBusinessLink
                :disabled="!canQueryCustomer"
                :to="
                  canQueryCustomer
                    ? fdmTradeDocumentRoute('customer', record.customerId)
                    : undefined
                "
              >
                {{ record.customerName || '未提供客户' }}
              </TradeBusinessLink>
              <span>{{ record.ownerUserName || '未提供负责人' }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'requiredDate'">
            {{ record.customerRequiredDeliveryDate || '未提供' }}
          </template>
          <template v-else-if="column.key === 'quality'">
            <Space :size="4" wrap>
              <Tag :color="record.unknownAllocationCount ? 'orange' : 'green'">
                未知 {{ record.unknownAllocationCount }}
              </Tag>
              <Tag :color="record.unbalancedLineCount ? 'red' : 'green'">
                不平 {{ record.unbalancedLineCount }}
              </Tag>
              <Tag :color="record.unmappedLineCount ? 'orange' : 'green'">
                未映射 {{ record.unmappedLineCount }}
              </Tag>
            </Space>
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="statusColor(record.status)">
              {{ statusLabel(record.status) }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'updateTime'">
            {{ record.updateTime || '未记录' }}
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space>
              <Button size="small" type="link" @click="openDetail(record.id)">
                查看
              </Button>
              <Button
                v-if="canUpdate && record.status === 'DRAFT'"
                size="small"
                type="link"
                @click="editPlan(record.id)"
              >
                编辑
              </Button>
            </Space>
          </template>
        </template>
      </Table>

      <footer class="demand-plan-list__pagination">
        <span>共 {{ total }} 条真实计划</span>
        <Pagination
          :current="query.pageNo"
          :page-size="query.pageSize"
          :total="total"
          show-size-changer
          @change="changePage"
          @show-size-change="changePage"
        />
      </footer>
    </Card>
  </Page>
</template>

<style scoped>
.demand-plan-list__filters {
  margin-bottom: 12px;
}

.demand-plan-list__table :deep(.ant-card-body) {
  padding: 0;
}

.demand-plan-list__link {
  display: grid;
  gap: 3px;
  width: 100%;
  padding: 0;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.demand-plan-list__link strong {
  color: #1677ff;
}

.demand-plan-list__link span,
.demand-plan-list__stack span,
.demand-plan-list__pagination > span {
  font-size: 12px;
  color: #64748b;
}

.demand-plan-list__stack {
  display: grid;
  gap: 3px;
}

.demand-plan-list__pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-top: 1px solid #eef2f6;
}

@media (max-width: 640px) {
  .demand-plan-list__pagination {
    flex-direction: column;
    gap: 8px;
    align-items: flex-end;
  }
}
</style>
