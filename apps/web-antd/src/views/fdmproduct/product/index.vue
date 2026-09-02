<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { FdmProductApi } from '#/api/fdmproduct/product';

import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Card,
  Empty,
  Image,
  Input,
  message,
  Pagination,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  getFdmProductCategoryList,
  getFdmProductFormOptions,
  getFdmProductPage,
  updateFdmProductStatus,
} from '#/api/fdmproduct/product';
import { useFdmProductAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';

import ProductCategoryDrawer from './components/ProductCategoryDrawer.vue';
import ProductStatusTag from './components/ProductStatusTag.vue';
import { formatProductDateTime } from './display';

defineOptions({ name: 'FdmProductProduct' });
const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();
const columns: ColumnsType<FdmProductApi.PageItem> = [
  { fixed: 'left', key: 'product', title: '产品 / 编码', width: 290 },
  { dataIndex: 'categoryName', key: 'category', title: '分类', width: 150 },
  { dataIndex: 'baseUnit', key: 'baseUnit', title: '单位', width: 90 },
  { key: 'skuCount', title: 'SKU / 出口可用', width: 135 },
  { key: 'status', title: '状态', width: 90 },
  { key: 'updateTime', title: '更新时间', width: 165 },
  { fixed: 'right', key: 'action', title: '操作', width: 220 },
];

const formOptions = ref<FdmProductApi.FormOptions>({ companies: [] });
const companyId = ref('');
const filters = reactive<{
  categoryId?: string;
  keyword: string;
  status?: FdmProductApi.CommonStatus;
}>({ keyword: '' });
const rows = ref<FdmProductApi.PageItem[]>([]);
const categories = ref<FdmProductApi.Category[]>([]);
const total = ref(0);
const pageNo = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const categoryLoading = ref(false);
const categoryDrawerOpen = ref(false);
const statusUpdatingId = ref<string>();
let requestId = 0;

const queryCompanyId = computed(() =>
  String(
    Array.isArray(route.query.companyId)
      ? route.query.companyId[0] || ''
      : route.query.companyId || '',
  ),
);
const companyOptions = computed(() =>
  formOptions.value.companies.map((item) => ({
    label: item.shortName || item.name,
    value: item.id,
  })),
);
const categoryOptions = computed(() =>
  categories.value.map((item) => ({
    label: item.categoryName,
    value: item.id,
  })),
);
const canCreate = computed(() =>
  hasAccessByCodes(['fdmproduct:product:create']),
);
const canUpdate = computed(() =>
  hasAccessByCodes(['fdmproduct:product:update']),
);
const canStatus = computed(() =>
  hasAccessByCodes(['fdmproduct:product:status']),
);
const canManageCategory = computed(
  () =>
    hasAccessByCodes(['fdmproduct:category:create']) ||
    hasAccessByCodes(['fdmproduct:category:update']),
);

useFdmProductAiContext(() => ({
  companyId: companyId.value || undefined,
  context: {
    companyId: companyId.value,
    filters: { ...filters, pageNo: pageNo.value, pageSize: pageSize.value },
    loading: loading.value,
    rows: rows.value,
    total: total.value,
  },
  contextMode: 'list',
  entityLabel: `当前公司筛选 ${total.value} 个产品`,
  surfaceKey: 'product',
}));

function resolveCompany(options: FdmProductApi.FormOptions) {
  const ids = new Set(options.companies.map((item) => item.id));
  if (queryCompanyId.value && ids.has(queryCompanyId.value))
    return queryCompanyId.value;
  if (options.defaultCompanyId && ids.has(options.defaultCompanyId))
    return options.defaultCompanyId;
  return options.companies[0]?.id || '';
}

async function initialize() {
  const current = ++requestId;
  loading.value = true;
  rows.value = [];
  categories.value = [];
  total.value = 0;
  try {
    const options = await getFdmProductFormOptions();
    if (current !== requestId) return;
    formOptions.value = options;
    const selected = resolveCompany(options);
    companyId.value = selected;
    if (selected && queryCompanyId.value !== selected) {
      await router.replace({ query: { ...route.query, companyId: selected } });
      return;
    }
    if (!selected) return;
    const [categoryResult, pageResult] = await Promise.all([
      getFdmProductCategoryList({ companyId: selected }),
      getFdmProductPage({
        companyId: selected,
        categoryId: filters.categoryId,
        keyword: filters.keyword.trim() || undefined,
        pageNo: pageNo.value,
        pageSize: pageSize.value,
        status: filters.status,
      }),
    ]);
    if (current !== requestId || companyId.value !== selected) return;
    categories.value = categoryResult;
    rows.value = pageResult.list ?? [];
    total.value = pageResult.total ?? 0;
  } finally {
    if (current === requestId) loading.value = false;
  }
}

async function loadPage(reset = false) {
  if (!companyId.value) return;
  if (reset) pageNo.value = 1;
  const current = ++requestId;
  loading.value = true;
  try {
    const result = await getFdmProductPage({
      companyId: companyId.value,
      categoryId: filters.categoryId,
      keyword: filters.keyword.trim() || undefined,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      status: filters.status,
    });
    if (current !== requestId) return;
    rows.value = result.list ?? [];
    total.value = result.total ?? 0;
  } finally {
    if (current === requestId) loading.value = false;
  }
}

async function loadCategories() {
  if (!companyId.value) return;
  categoryLoading.value = true;
  try {
    categories.value = await getFdmProductCategoryList({
      companyId: companyId.value,
    });
  } finally {
    categoryLoading.value = false;
  }
}

function switchCompany(rawValue: unknown) {
  const value = String(rawValue || '');
  if (value === queryCompanyId.value) return;
  filters.categoryId = undefined;
  pageNo.value = 1;
  void router.replace({ query: { companyId: value } });
}
function resetFilters() {
  filters.keyword = '';
  filters.categoryId = undefined;
  filters.status = undefined;
  void loadPage(true);
}
function changePage(next: number, size: number) {
  pageNo.value = size === pageSize.value ? next : 1;
  pageSize.value = size;
  void loadPage();
}
function routeTo(suffix: string) {
  void router.push({
    path: `/fdmbase/product-center${suffix}`,
    query: { companyId: companyId.value },
  });
}
async function changeStatus(row: FdmProductApi.PageItem) {
  if (!companyId.value || statusUpdatingId.value) return;
  statusUpdatingId.value = row.id;
  try {
    await updateFdmProductStatus({
      companyId: companyId.value,
      expectedVersion: row.version,
      id: row.id,
      status: row.status === 0 ? 1 : 0,
    });
    message.success(row.status === 0 ? '产品已停用' : '产品已启用');
    await loadPage();
  } finally {
    statusUpdatingId.value = undefined;
  }
}
function changeRecordStatus(row: Record<string, any>) {
  return changeStatus(row as FdmProductApi.PageItem);
}

watch(queryCompanyId, initialize, { immediate: true });
</script>

<template>
  <Page
    auto-content-height
    description="按公司维护真实 SPU、SKU、EXPORT 销售版本与包装快照。"
    title="产品中心"
  >
    <template #extra>
      <Space>
        <Button
          v-if="canManageCategory"
          :disabled="!companyId"
          @click="categoryDrawerOpen = true"
        >
          <template #icon><IconifyIcon icon="lucide:tags" /></template>分类管理
</Button><Button
          v-if="canCreate"
          :disabled="!companyId"
          type="primary"
          @click="routeTo('/create')"
        >
          <template #icon><IconifyIcon icon="lucide:plus" /></template>新建产品
        </Button>
      </Space>
    </template>
    <ProductCategoryDrawer
      v-model:open="categoryDrawerOpen"
      :categories="categories"
      :company-id="companyId"
      :loading="categoryLoading"
      @changed="loadCategories"
    />
    <div class="product-list">
      <section class="product-list__summary">
        <Card size="small">
          <span>当前公司</span><strong>{{
            companyOptions.find((item) => item.value === companyId)?.label ||
            '未选择'
          }}</strong><small>数据严格隔离</small>
</Card><Card size="small">
          <span>筛选结果</span><strong>{{ total }}</strong><small>个产品</small>
</Card><Card size="small">
          <span>本页出口可用 SKU</span><strong>{{
            rows.reduce(
              (sum, item) => sum + (item.exportEnabledSkuCount || 0),
              0,
            )
          }}</strong><small>可供合同选择</small>
        </Card>
      </section>
      <Alert
        v-if="formOptions.companies.length === 0"
        message="当前账号没有可用公司数据范围"
        show-icon
        type="warning"
      />
      <section class="product-list__filters">
        <Select
          :options="companyOptions"
          :value="companyId || undefined"
          placeholder="选择公司"
          show-search
          @change="switchCompany"
        /><Input
          v-model:value="filters.keyword"
          allow-clear
          placeholder="产品名称、产品编码或 SKU 编码"
          @press-enter="loadPage(true)"
        /><Select
          v-model:value="filters.categoryId"
          allow-clear
          :loading="categoryLoading"
          :options="categoryOptions"
          placeholder="全部分类"
          show-search
        /><Select
          v-model:value="filters.status"
          allow-clear
          :options="[
            { label: '已启用', value: 0 },
            { label: '已停用', value: 1 },
          ]"
          placeholder="全部状态"
        /><Space>
          <Button type="primary" @click="loadPage(true)">查询</Button><Button @click="resetFilters">重置</Button>
        </Space>
      </section>
      <section class="product-list__table">
        <Table
          :columns="columns"
          :data-source="rows"
          :loading="loading"
          :pagination="false"
          row-key="id"
          :scroll="{ x: 1150 }"
        >
          <template #bodyCell="{ column, record }">
            <div v-if="column.key === 'product'" class="product-list__product">
              <Image
                v-if="record.imageUrl"
                :preview="false"
                :src="record.imageUrl"
                :width="46"
              /><span v-else class="product-list__image-empty"><IconifyIcon icon="lucide:package" :width="22" /></span>
              <div>
                <Button type="link" @click="routeTo(`/detail/${record.id}`)">
                  {{ record.productName }}
</Button><small>{{ record.productCode }}</small>
              </div>
            </div>
            <span v-else-if="column.key === 'category'">{{
              record.categoryName || '未分类'
            }}</span>
            <span v-else-if="column.key === 'skuCount'">{{ record.skuCount }} /
              <Tag color="blue">{{ record.exportEnabledSkuCount }}</Tag></span>
            <ProductStatusTag
              v-else-if="column.key === 'status'"
              :status="record.status"
            />
            <span v-else-if="column.key === 'updateTime'">{{
              formatProductDateTime(record.updateTime)
            }}</span>
            <Space v-else-if="column.key === 'action'" :size="4">
              <Button
                size="small"
                type="link"
                @click="routeTo(`/detail/${record.id}`)"
              >
                查看
</Button><Button
                v-if="canUpdate"
                size="small"
                type="link"
                @click="routeTo(`/edit/${record.id}`)"
              >
                编辑
</Button><Popconfirm
                v-if="canStatus"
                :title="
                  record.status === 0 ? '确认停用产品？' : '确认启用产品？'
                "
                @confirm="changeRecordStatus(record)"
              >
                <Button
                  :danger="record.status === 0"
                  :loading="statusUpdatingId === record.id"
                  size="small"
                  type="link"
                >
                  {{ record.status === 0 ? '停用' : '启用' }}
                </Button>
              </Popconfirm>
            </Space>
</template><template #emptyText>
            <Empty
              :image="Empty.PRESENTED_IMAGE_SIMPLE"
              description="当前公司没有符合条件的产品"
            />
          </template>
</Table><Pagination
          class="product-list__pagination"
          :current="pageNo"
          :page-size="pageSize"
          :page-size-options="['20', '50', '100']"
          show-size-changer
          :total="total"
          @change="changePage"
        />
      </section>
    </div>
  </Page>
</template>

<style scoped>
.product-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.product-list__summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.product-list__summary :deep(.ant-card-body) {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 14px;
  align-items: end;
}

.product-list__summary span,
.product-list__summary small {
  font-size: 12px;
  color: #64748b;
}

.product-list__summary strong {
  grid-row: 1/3;
  grid-column: 2;
  font-size: 20px;
  color: #0f4c81;
}

.product-list__filters,
.product-list__table {
  padding: 14px;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 7px;
}

.product-list__filters {
  display: grid;
  grid-template-columns:
    minmax(160px, 0.8fr) minmax(220px, 1.2fr) minmax(140px, 0.7fr)
    minmax(120px, 0.6fr) auto;
  gap: 10px;
}

.product-list__product,
.product-list__product > div {
  display: flex;
  gap: 2px;
  min-width: 0;
}

.product-list__product {
  gap: 10px;
  align-items: center;
}

.product-list__product > div {
  flex-direction: column;
  align-items: flex-start;
}

.product-list__product :deep(.ant-btn) {
  height: auto;
  padding: 0;
  font-weight: 600;
}

.product-list__product small {
  color: #64748b;
}

.product-list__image-empty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 46px;
  height: 46px;
  color: #64748b;
  background: #f1f5f9;
  border-radius: 7px;
}

.product-list__pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

@media (max-width: 1000px) {
  .product-list__filters {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 640px) {
  .product-list__summary,
  .product-list__filters {
    grid-template-columns: 1fr;
  }
}
</style>
