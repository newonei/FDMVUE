<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type {
  ProductSelectionDataSource,
  ProductSelectionDetail,
  ProductSelectionItem,
  ProductSelectionValue,
} from './product-selection';

import { computed, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Descriptions,
  DescriptionsItem,
  Empty,
  Image,
  Input,
  Modal,
  Pagination,
  Spin,
  Table,
  Tag,
  TypographyText,
} from 'ant-design-vue';

import {
  fdmProductSelectionDataSource,
  toProductSelectionValue,
} from './product-selection';

defineOptions({ name: 'FdmProductSelectionModal' });

const props = withDefaults(
  defineProps<{
    companyId?: string;
    dataSource?: ProductSelectionDataSource;
    disabled?: boolean;
    open: boolean;
    title?: string;
  }>(),
  {
    companyId: undefined,
    dataSource: () => fdmProductSelectionDataSource,
    disabled: false,
    title: '从产品中心选择 SKU',
  },
);

const emit = defineEmits<{
  select: [value: ProductSelectionValue];
  'update:open': [open: boolean];
}>();

const columns: ColumnsType<ProductSelectionItem> = [
  { key: 'product', title: '产品 / SKU', width: 250 },
  { dataIndex: 'category', key: 'category', title: '分类', width: 110 },
  { key: 'price', title: '参考价', width: 105 },
];

const keyword = ref('');
const rows = ref<ProductSelectionItem[]>([]);
const total = ref(0);
const pageNo = ref(1);
const pageSize = ref(10);
const loading = ref(false);
const detailLoading = ref(false);
const validating = ref(false);
const selected = ref<ProductSelectionDetail>();
const listError = ref('');
const detailError = ref('');
const validationError = ref('');
let listRequestId = 0;
let detailRequestId = 0;

const canQuery = computed(() => Boolean(props.companyId) && !props.disabled);
const canConfirm = computed(
  () => canQuery.value && Boolean(selected.value) && !detailLoading.value,
);
const selectedRowKeys = computed(() =>
  selected.value ? [selected.value.skuId] : [],
);

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : fallback;
}

function reset() {
  keyword.value = '';
  rows.value = [];
  total.value = 0;
  pageNo.value = 1;
  selected.value = undefined;
  listError.value = '';
  detailError.value = '';
  validationError.value = '';
  listRequestId += 1;
  detailRequestId += 1;
}

async function loadPage(resetPage = false) {
  const companyId = props.companyId;
  if (!companyId || props.disabled) return;
  if (resetPage) pageNo.value = 1;
  const requestId = ++listRequestId;
  loading.value = true;
  listError.value = '';
  try {
    const result = await props.dataSource.page({
      companyId,
      keyword: keyword.value.trim() || undefined,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
    });
    if (requestId !== listRequestId || props.companyId !== companyId) return;
    rows.value = result.list ?? [];
    total.value = result.total ?? 0;
    if (
      selected.value &&
      !rows.value.some((item) => item.skuId === selected.value?.skuId)
    ) {
      selected.value = undefined;
    }
  } catch (error) {
    if (requestId !== listRequestId) return;
    rows.value = [];
    total.value = 0;
    listError.value = errorText(error, '产品列表加载失败，请稍后重试。');
  } finally {
    if (requestId === listRequestId) loading.value = false;
  }
}

async function selectRow(row: ProductSelectionItem) {
  const companyId = props.companyId;
  if (!companyId || detailLoading.value) return;
  const requestId = ++detailRequestId;
  selected.value = undefined;
  detailLoading.value = true;
  detailError.value = '';
  validationError.value = '';
  try {
    const result = await props.dataSource.get({ companyId, skuId: row.skuId });
    if (requestId !== detailRequestId || props.companyId !== companyId) return;
    selected.value = result;
  } catch (error) {
    if (requestId !== detailRequestId) return;
    detailError.value = errorText(error, 'SKU 详情加载失败，请重新选择。');
  } finally {
    if (requestId === detailRequestId) detailLoading.value = false;
  }
}

async function confirm() {
  const detail = selected.value;
  const companyId = props.companyId;
  if (!detail || !companyId || validating.value) return;
  validating.value = true;
  validationError.value = '';
  try {
    const current = await props.dataSource.validate({
      companyId,
      skuId: detail.skuId,
      versionToken: detail.versionToken,
    });
    selected.value = current;
    emit('select', toProductSelectionValue(current));
    emit('update:open', false);
  } catch (error) {
    validationError.value = errorText(
      error,
      'SKU 有效性校验失败，请稍后重试。',
    );
  } finally {
    validating.value = false;
  }
}

function close() {
  if (validating.value) return;
  emit('update:open', false);
}

function changePage(nextPage: number, nextPageSize: number) {
  pageNo.value = nextPageSize === pageSize.value ? nextPage : 1;
  pageSize.value = nextPageSize;
  void loadPage();
}

watch(
  () => [props.open, props.companyId] as const,
  ([open]) => {
    reset();
    if (open && canQuery.value) void loadPage();
  },
);
</script>

<template>
  <Modal
    :confirm-loading="validating"
    :mask-closable="!validating"
    :ok-button-props="{ disabled: !canConfirm }"
    ok-text="使用此 SKU"
    :open="open"
    :title="title"
    width="min(1120px, calc(100vw - 32px))"
    @cancel="close"
    @ok="confirm"
  >
    <Alert
      v-if="!companyId"
      class="product-selection__notice"
      description="产品的参考价和可售版本按订单所属公司校验。请先在合同中选择公司，再打开产品中心。"
      message="请先选择订单所属公司"
      show-icon
      type="warning"
    />

    <div v-else class="product-selection">
      <section class="product-selection__list">
        <div class="product-selection__search">
          <Input.Search
            v-model:value="keyword"
            allow-clear
            :disabled="disabled"
            placeholder="搜索产品名称、SPU 编码或 SKU 编码"
            @search="loadPage(true)"
          />
        </div>

        <Alert v-if="listError" :message="listError" show-icon type="error">
          <template #action>
            <Button size="small" @click="loadPage()">重试</Button>
          </template>
        </Alert>

        <Table
          :columns="columns"
          :custom-row="
            (row: ProductSelectionItem) => ({ onClick: () => selectRow(row) })
          "
          :data-source="rows"
          :loading="loading"
          :pagination="false"
          :row-class-name="
            (row: ProductSelectionItem) =>
              selectedRowKeys.includes(row.skuId)
                ? 'product-selection__row--selected'
                : ''
          "
          row-key="skuId"
          :scroll="{ x: 520, y: 390 }"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <div
              v-if="column.key === 'product'"
              class="product-selection__product"
            >
              <Image
                v-if="record.imageUrl"
                :preview="false"
                :src="record.imageUrl"
                :width="38"
              />
              <span v-else class="product-selection__image-empty">
                <IconifyIcon icon="lucide:package" :width="18" />
              </span>
              <div>
                <strong>{{ record.name }}</strong>
                <small>{{ record.code }} · {{ record.productName }}</small>
              </div>
            </div>
            <span v-else-if="column.key === 'price'">
              {{ record.currency || '—' }} {{ record.referencePrice || '—' }}
            </span>
          </template>
          <template #emptyText>
            <Empty
              :image="Empty.PRESENTED_IMAGE_SIMPLE"
              description="没有符合条件的可用 SKU"
            />
          </template>
        </Table>

        <Pagination
          class="product-selection__pagination"
          :current="pageNo"
          :page-size="pageSize"
          :page-size-options="['10', '20', '50']"
          :show-size-changer="true"
          :total="total"
          @change="changePage"
        />
      </section>

      <section class="product-selection__preview">
        <Spin :spinning="detailLoading">
          <Alert
            v-if="detailError"
            :message="detailError"
            show-icon
            type="error"
          />
          <Alert
            v-if="validationError"
            class="product-selection__notice"
            :message="validationError"
            show-icon
            type="warning"
          />

          <template v-if="selected">
            <div class="product-selection__preview-title">
              <div>
                <small>已选 SKU</small>
                <h3>{{ selected.name }}</h3>
              </div>
              <Tag color="blue">{{ selected.code }}</Tag>
            </div>
            <Descriptions bordered :column="1" size="small">
              <DescriptionsItem label="所属产品">
                {{ selected.productName }}（{{ selected.productCode }}）
              </DescriptionsItem>
              <DescriptionsItem label="分类">
                {{ selected.category || '未分类' }}
              </DescriptionsItem>
              <DescriptionsItem label="单位">
                {{ selected.unit || '未设置' }}
              </DescriptionsItem>
              <DescriptionsItem label="参考价">
                {{ selected.currency || '—' }}
                {{ selected.referencePrice || '未设置' }}
              </DescriptionsItem>
              <DescriptionsItem label="出口销售资料">
                <template v-if="selected.exportProfile">
                  版本 {{ selected.exportProfile.version }} ·
                  {{ selected.exportProfile.effectiveFrom || '未设开始日' }} 至
                  {{ selected.exportProfile.effectiveTo || '长期有效' }}
                </template>
                <TypographyText v-else type="secondary">未提供</TypographyText>
              </DescriptionsItem>
              <DescriptionsItem label="包装">
                净重 {{ selected.packageProfile?.netWeightKg || '—' }} kg · 毛重
                {{ selected.packageProfile?.grossWeightKg || '—' }} kg
              </DescriptionsItem>
            </Descriptions>
            <Alert
              class="product-selection__notice"
              description="选择只负责把当前产品快照回填到业务明细；合同中的名称、单位、图片、价格等字段仍可继续编辑。"
              message="回填后仍可修改"
              show-icon
              type="info"
            />
          </template>

          <Empty
            v-else-if="!detailLoading"
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            description="从左侧选择一个 SKU 查看完整资料"
          />
        </Spin>
      </section>
    </div>
  </Modal>
</template>

<style scoped>
.product-selection {
  display: grid;
  grid-template-columns: minmax(0, 1.35fr) minmax(310px, 0.8fr);
  gap: 16px;
  min-height: 520px;
}

.product-selection__list,
.product-selection__preview {
  min-width: 0;
  padding: 14px;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 8px;
}

.product-selection__search,
.product-selection__notice {
  margin-bottom: 12px;
}

.product-selection__pagination {
  display: flex;
  justify-content: flex-end;
  margin-top: 14px;
}

.product-selection__product,
.product-selection__preview-title {
  display: flex;
  gap: 9px;
  align-items: center;
}

.product-selection__product > div {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.product-selection__product strong,
.product-selection__product small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.product-selection__product small,
.product-selection__preview-title small {
  font-size: 12px;
  color: #64748b;
}

.product-selection__image-empty {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  color: #64748b;
  background: #f1f5f9;
  border-radius: 6px;
}

.product-selection__preview {
  background: #f8fafc;
}

.product-selection__preview-title {
  justify-content: space-between;
  margin-bottom: 14px;
}

.product-selection__preview-title h3 {
  margin: 2px 0 0;
  font-size: 18px;
}

:deep(.product-selection__row--selected > td) {
  background: #eaf4ff !important;
}

:deep(.ant-table-tbody > tr) {
  cursor: pointer;
}

@media (max-width: 820px) {
  .product-selection {
    grid-template-columns: 1fr;
  }
}
</style>
