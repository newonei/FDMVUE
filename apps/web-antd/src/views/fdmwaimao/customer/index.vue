<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { FdmWaimaoCustomerApi } from '#/api/fdmwaimao/customer';

import { computed, onMounted, reactive, ref } from 'vue';
import { onBeforeRouteLeave, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Input,
  message,
  Modal,
  Pagination,
  Select,
  Space,
  Table,
  Tag,
  TypographyText,
} from 'ant-design-vue';

import {
  formatOkkiError,
  getCustomer,
  getCustomerFilterOptions,
  getCustomerPage,
  refreshCustomerFromOkki,
  transferCustomer,
  updateCustomerLevel,
} from '#/api/fdmwaimao/customer';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';
import {
  TradeDetailDrawer,
  TradeListShell,
} from '#/views/fdm-trade-shared/components';

import CustomerDetail from './components/CustomerDetail.vue';
import { formatOkkiDateTime } from './components/okki-import/display';
import OkkiImportModal from './components/OkkiImportModal.vue';

defineOptions({ name: 'FdmWaimaoCustomer' });

const router = useRouter();
const { hasAccessByCodes } = useAccess();

const LEVEL_OPTIONS = [
  { label: 'A级', value: 'A' },
  { label: 'B级', value: 'B' },
  { label: 'C级', value: 'C' },
];
const SYNC_OPTIONS = [
  { label: '同步成功', value: 'SYNCED' },
  { label: '同步失败', value: 'FAILED' },
];

const columns: ColumnsType<FdmWaimaoCustomerApi.CustomerPageItem> = [
  {
    dataIndex: 'customerCode',
    key: 'customerCode',
    title: '客户编号',
    width: 150,
  },
  { dataIndex: 'name', key: 'name', title: '客户名称', width: 230 },
  {
    dataIndex: 'countryName',
    key: 'countryName',
    title: '国家/地区',
    width: 130,
  },
  { dataIndex: 'okki', key: 'okki', title: 'OKKI 映射', width: 190 },
  {
    dataIndex: 'primaryContact',
    key: 'primaryContact',
    title: '主联系人',
    width: 210,
  },
  { dataIndex: 'level', key: 'level', title: '客户等级', width: 110 },
  { dataIndex: 'owner', key: 'owner', title: 'FDM 负责人', width: 160 },
  { dataIndex: 'syncStatus', key: 'syncStatus', title: '同步状态', width: 165 },
  { fixed: 'right', key: 'actions', title: '操作', width: 210 },
];

const filters = reactive<FdmWaimaoCustomerApi.PageReq>({
  pageNo: 1,
  pageSize: 20,
});
const rows = ref<FdmWaimaoCustomerApi.CustomerPageItem[]>([]);
const total = ref(0);
const loading = ref(false);
const filterOptions = ref<FdmWaimaoCustomerApi.FilterOptions>({
  countries: [],
  owners: [],
});
const refreshingIds = ref(new Set<string>());
const levelSavingIds = ref(new Set<string>());

const importOpen = ref(false);
const detailOpen = ref(false);
const detailLoading = ref(false);
const detail = ref<FdmWaimaoCustomerApi.CustomerDetail>();
let pageRequestId = 0;
let detailRequestId = 0;

useFdmWaimaoAiContext(() => ({
  businessId: detailOpen.value ? detail.value?.id : undefined,
  context: detailOpen.value
    ? {
        loading: detailLoading.value,
        selectedCustomer: detail.value,
      }
    : {
        filters: { ...filters },
        total: total.value,
        visibleRows: rows.value,
      },
  contextMode: detailOpen.value ? 'detail' : 'list',
  entityLabel: detailOpen.value ? detail.value?.name : undefined,
  surfaceKey: 'customer',
}));

const transferOpen = ref(false);
const transferSaving = ref(false);
const transferForm = reactive<{ customerId?: string; ownerUserId?: string }>(
  {},
);

const canQueryOkki = computed(() =>
  hasAccessByCodes(['fdmwaimao:customer:okki-query']),
);
const canImport = computed(() =>
  hasAccessByCodes(['fdmwaimao:customer:import']),
);
const canRefresh = computed(() =>
  hasAccessByCodes(['fdmwaimao:customer:refresh']),
);
const canUpdateLevel = computed(() =>
  hasAccessByCodes(['fdmwaimao:customer:update-level']),
);
const canUpdateProfile = computed(() =>
  hasAccessByCodes(['fdmwaimao:customer:update-profile']),
);
const canTransfer = computed(() =>
  hasAccessByCodes(['fdmwaimao:customer:transfer']),
);

function display(value: null | string | undefined) {
  return value || '—';
}

function formatDateTime(value: unknown) {
  return formatOkkiDateTime(value, '从未同步');
}

async function loadOptions() {
  filterOptions.value = await getCustomerFilterOptions();
}

async function loadPage(resetPage = false) {
  if (resetPage) filters.pageNo = 1;
  const requestId = ++pageRequestId;
  loading.value = true;
  try {
    const result = await getCustomerPage({
      ...filters,
      keyword: filters.keyword?.trim() || undefined,
    });
    if (requestId === pageRequestId) {
      rows.value = result.list ?? [];
      total.value = result.total ?? 0;
    }
  } finally {
    if (requestId === pageRequestId) loading.value = false;
  }
}

function resetFilters() {
  filters.keyword = undefined;
  filters.countryCode = undefined;
  filters.level = undefined;
  filters.ownerUserId = undefined;
  filters.syncStatus = undefined;
  void loadPage(true);
}

async function changePage(pageNo: number, pageSize: number) {
  filters.pageNo = pageNo;
  filters.pageSize = pageSize;
  await loadPage();
}

async function openCustomer(id: string) {
  const requestId = ++detailRequestId;
  if (typeof window !== 'undefined' && window.innerWidth < 768) {
    await router.push(`/fdmwaimao/customer/detail/${id}`);
    return;
  }
  detailOpen.value = true;
  detail.value = undefined;
  detailLoading.value = true;
  try {
    const result = await getCustomer(id);
    if (requestId === detailRequestId) detail.value = result;
  } finally {
    if (requestId === detailRequestId) detailLoading.value = false;
  }
}

async function openIndependentPage() {
  if (!detail.value) return;
  await router.push(`/fdmwaimao/customer/detail/${detail.value.id}`);
  detailOpen.value = false;
}

async function handleImported(customerId: string) {
  await Promise.all([loadPage(true), loadOptions()]);
  await openCustomer(customerId);
}

async function handleRefresh(record: Record<string, any>) {
  const row = record as unknown as FdmWaimaoCustomerApi.CustomerPageItem;
  if (refreshingIds.value.has(row.id)) return;
  refreshingIds.value = new Set(refreshingIds.value).add(row.id);
  try {
    await refreshCustomerFromOkki(row.id);
    message.success('已从 OKKI 刷新客户资料');
    await loadPage();
    if (detailOpen.value && detail.value?.id === row.id) {
      await openCustomer(row.id);
    }
  } catch (error) {
    message.error(formatOkkiError(error));
  } finally {
    const next = new Set(refreshingIds.value);
    next.delete(row.id);
    refreshingIds.value = next;
  }
}

async function handleLevelChange(record: Record<string, any>, value: unknown) {
  if (value !== 'A' && value !== 'B' && value !== 'C') return;
  const level: FdmWaimaoCustomerApi.CustomerLevel = value;
  const row = record as unknown as FdmWaimaoCustomerApi.CustomerPageItem;
  if (row.level === level || levelSavingIds.value.has(row.id)) return;
  levelSavingIds.value = new Set(levelSavingIds.value).add(row.id);
  try {
    await updateCustomerLevel({ id: row.id, level });
    message.success('客户等级已更新');
    row.level = level;
    if (detail.value?.id === row.id) detail.value.level = level;
  } finally {
    const next = new Set(levelSavingIds.value);
    next.delete(row.id);
    levelSavingIds.value = next;
  }
}

function openTransfer(record: Record<string, any>) {
  const row = record as unknown as FdmWaimaoCustomerApi.CustomerPageItem;
  transferForm.customerId = row.id;
  transferForm.ownerUserId = row.ownerUserId;
  transferOpen.value = true;
}

async function submitTransfer() {
  if (!transferForm.customerId || !transferForm.ownerUserId) {
    message.warning('请选择新的负责人');
    return;
  }
  transferSaving.value = true;
  try {
    await transferCustomer({
      id: transferForm.customerId,
      ownerUserId: transferForm.ownerUserId,
    });
    message.success('负责人已转移');
    transferOpen.value = false;
    await Promise.all([loadPage(), loadOptions()]);
    if (detailOpen.value && detail.value?.id === transferForm.customerId) {
      await openCustomer(transferForm.customerId);
    }
  } finally {
    transferSaving.value = false;
  }
}

onMounted(async () => {
  await Promise.all([loadPage(), loadOptions()]);
});

onBeforeRouteLeave(() => {
  detailOpen.value = false;
});
</script>

<template>
  <TradeListShell
    description="从 OKKI 回填真实客户资料，导入前可补充修正；手工维护的 FDM 资料、等级与负责人均由本地保留。"
    :loading="loading"
    title="交易客户"
  >
    <template #actions>
      <Button v-if="canQueryOkki" type="primary" @click="importOpen = true">
        <template #icon>
          <IconifyIcon icon="lucide:cloud-download" aria-hidden="true" />
        </template>
        从 OKKI 导入
      </Button>
    </template>

    <template #filters>
      <Input
        v-model:value="filters.keyword"
        allow-clear
        placeholder="客户编号、名称、简称或国家"
        @press-enter="loadPage(true)"
      />
      <Select
        v-model:value="filters.countryCode"
        allow-clear
        :options="
          filterOptions.countries.map((item) => ({
            label: item.name,
            value: item.filterValue || item.code || item.name,
          }))
        "
        placeholder="全部国家/地区"
      />
      <Select
        v-model:value="filters.level"
        allow-clear
        :options="LEVEL_OPTIONS"
        placeholder="全部客户等级"
      />
      <Select
        v-model:value="filters.ownerUserId"
        allow-clear
        :options="
          filterOptions.owners.map((item) => ({
            label: item.deptName
              ? `${item.name} · ${item.deptName}`
              : item.name,
            value: item.id,
          }))
        "
        placeholder="全部负责人"
      />
      <Select
        v-model:value="filters.syncStatus"
        allow-clear
        :options="SYNC_OPTIONS"
        placeholder="全部同步状态"
      />
    </template>

    <template #filter-actions>
      <Button type="primary" @click="loadPage(true)">查询</Button>
      <Button @click="resetFilters">重置</Button>
    </template>

    <div class="customer-page__table">
      <Table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="false"
        row-key="id"
        size="middle"
        :scroll="{ x: 1440, y: 'calc(100vh - 390px)' }"
      >
        <template #emptyText>
          <div class="customer-page__empty">
            <span aria-hidden="true">
              <IconifyIcon icon="lucide:building-2" />
            </span>
            <strong>还没有交易客户</strong>
            <p>从 OKKI 查找并核对客户，确认后再进入 FDM 交易客户库。</p>
            <Button
              v-if="canQueryOkki"
              size="small"
              type="primary"
              @click="importOpen = true"
            >
              <template #icon>
                <IconifyIcon icon="lucide:cloud-download" />
              </template>
              {{ canImport ? '从 OKKI 导入首位客户' : '搜索 OKKI 客户' }}
            </Button>
          </div>
        </template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'customerCode'">
            <Button type="link" @click="openCustomer(record.id)">
              {{ record.customerCode }}
            </Button>
          </template>
          <template v-else-if="column.key === 'name'">
            <div class="customer-page__identity">
              <button
                class="customer-page__name-link"
                type="button"
                @click="openCustomer(record.id)"
              >
                {{ record.name }}
              </button>
              <span>{{ record.shortName || '无简称' }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'countryName'">
            {{ display(record.countryName) }}
          </template>
          <template v-else-if="column.key === 'okki'">
            <div class="customer-page__stack">
              <span>{{ record.okkiSerialId || '未分配编号' }}</span>
              <Tag color="blue">{{ record.okkiStageName || '未设置阶段' }}</Tag>
            </div>
          </template>
          <template v-else-if="column.key === 'primaryContact'">
            <div v-if="record.primaryContact" class="customer-page__identity">
              <strong>{{
                record.primaryContact.name || '未命名联系人'
              }}</strong>
              <span>{{
                record.primaryContact.email ||
                record.primaryContact.phone ||
                '无联系方式'
              }}</span>
            </div>
            <span v-else>—</span>
          </template>
          <template v-else-if="column.key === 'level'">
            <Select
              v-if="canUpdateLevel"
              :disabled="levelSavingIds.has(record.id)"
              :loading="levelSavingIds.has(record.id)"
              :options="LEVEL_OPTIONS"
              size="small"
              :value="record.level"
              style="width: 76px"
              @change="handleLevelChange(record, $event)"
            />
            <Tag v-else color="blue">{{ record.level }}</Tag>
          </template>
          <template v-else-if="column.key === 'owner'">
            <div class="customer-page__identity">
              <strong>{{ record.ownerUserName || '未知用户' }}</strong>
              <span>{{ record.ownerDeptName || '未设置部门' }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'syncStatus'">
            <div class="customer-page__stack">
              <Tag
                :color="record.syncStatus === 'SYNCED' ? 'success' : 'error'"
              >
                {{ record.syncStatus === 'SYNCED' ? '同步成功' : '同步失败' }}
              </Tag>
              <TypographyText type="secondary">
                {{ formatDateTime(record.lastSyncTime) }}
              </TypographyText>
              <TypographyText
                v-if="record.syncStatus === 'FAILED' && record.syncError"
                class="customer-page__sync-error"
                :title="record.syncError"
                type="danger"
              >
                {{ record.syncError }}
              </TypographyText>
            </div>
          </template>
          <template v-else-if="column.key === 'actions'">
            <Space :size="4">
              <Button size="small" type="link" @click="openCustomer(record.id)">
                查看
              </Button>
              <Button
                v-if="canRefresh"
                :loading="refreshingIds.has(record.id)"
                size="small"
                type="link"
                @click="handleRefresh(record)"
              >
                刷新
              </Button>
              <Button
                v-if="canTransfer"
                size="small"
                type="link"
                @click="openTransfer(record)"
              >
                转移
              </Button>
            </Space>
          </template>
        </template>
      </Table>
    </div>

    <template #summary>
      <div class="customer-page__pagination">
        <span>共 {{ total }} 个交易客户</span>
        <Pagination
          :current="filters.pageNo"
          :page-size="filters.pageSize"
          :page-size-options="['10', '20', '50', '100']"
          show-size-changer
          :show-total="(value: number) => `共 ${value} 条`"
          :total="total"
          @change="changePage"
        />
      </div>
    </template>
  </TradeListShell>

  <TradeDetailDrawer
    v-model:open="detailOpen"
    document-type="交易客户"
    :loading="detailLoading"
    show-independent-page
    :status="
      detail?.syncStatus === 'SYNCED'
        ? '同步成功'
        : detail
          ? '同步异常'
          : undefined
    "
    :status-tone="detail?.syncStatus === 'SYNCED' ? 'success' : 'warning'"
    :subtitle="detail?.customerCode"
    :title="detail?.name || '交易客户详情'"
    @independent-page="openIndependentPage"
  >
    <CustomerDetail :customer="detail" />
  </TradeDetailDrawer>

  <OkkiImportModal
    v-model:open="importOpen"
    :allow-import="canImport"
    :allow-update-profile="canUpdateProfile"
    @imported="handleImported"
    @open-existing="openCustomer"
    @saved="handleImported"
  />

  <Modal
    v-model:open="transferOpen"
    :confirm-loading="transferSaving"
    title="转移 FDM 负责人"
    @ok="submitTransfer"
  >
    <p>请选择新的外贸负责人。客户等级和 OKKI 映射不会改变。</p>
    <Select
      v-model:value="transferForm.ownerUserId"
      class="customer-page__owner-select"
      :options="
        filterOptions.owners
          .filter((item) => item.transferable)
          .map((item) => ({
            label: item.deptName
              ? `${item.name} · ${item.deptName}`
              : item.name,
            value: item.id,
          }))
      "
      placeholder="选择负责人"
      show-search
      :filter-option="
        (input: string, option: any) =>
          String(option?.label || '')
            .toLowerCase()
            .includes(input.toLowerCase())
      "
    />
  </Modal>
</template>

<style scoped>
.customer-page__table {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--ant-color-bg-container);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 8px;
}

.customer-page__empty {
  display: grid;
  place-items: center;
  min-height: 260px;
  padding: 28px;
  text-align: center;
}

.customer-page__empty > span {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  margin-bottom: 10px;
  font-size: 21px;
  color: var(--ant-color-primary);
  background: var(--ant-color-primary-bg);
  border-radius: 12px;
}

.customer-page__empty strong {
  font-size: 14px;
}

.customer-page__empty p {
  max-width: 360px;
  margin: 5px 0 14px;
  font-size: 12px;
  line-height: 20px;
  color: var(--ant-color-text-secondary);
}

.customer-page__identity,
.customer-page__stack {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.customer-page__identity strong,
.customer-page__identity span,
.customer-page__stack span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.customer-page__name-link {
  max-width: 100%;
  padding: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font: inherit;
  font-weight: 600;
  color: var(--ant-color-primary, #1677ff);
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.customer-page__name-link:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.customer-page__name-link:focus-visible {
  outline: 2px solid var(--ant-color-primary-border, #91caff);
  outline-offset: 2px;
}

.customer-page__identity span,
.customer-page__stack :deep(.ant-typography) {
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

.customer-page__stack :deep(.ant-tag) {
  width: fit-content;
  margin: 0;
}

.customer-page__pagination {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.customer-page__owner-select {
  width: 100%;
}

.customer-page__sync-error {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 720px) {
  .customer-page__pagination {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
