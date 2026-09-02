<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { FdmProductApi } from '#/api/fdmproduct/product';

import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Descriptions,
  DescriptionsItem,
  Empty,
  Image,
  message,
  Popconfirm,
  Space,
  Spin,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  getFdmProduct,
  getFdmProductFormOptions,
  updateFdmProductStatus,
} from '#/api/fdmproduct/product';
import { useFdmProductAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';

import ProductStatusTag from '../components/ProductStatusTag.vue';
import { formatProductDateTime, formatReferencePrice } from '../display';

defineOptions({ name: 'FdmProductProductDetail' });
const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();
const columns: ColumnsType<FdmProductApi.Sku> = [
  { key: 'sku', title: 'SKU / 编码', width: 250 },
  { key: 'base', title: '单位 / 参考价', width: 160 },
  { key: 'package', title: '包装 / 重量 / 尺寸', width: 260 },
  { key: 'export', title: 'EXPORT 销售资料', width: 300 },
  { key: 'status', title: '状态', width: 100 },
];
const product = ref<FdmProductApi.ProductDetail>();
const loading = ref(false);
const statusUpdating = ref(false);
let requestId = 0;
const productId = computed(() => String(route.params.id || ''));
const companyId = computed(() =>
  String(
    Array.isArray(route.query.companyId)
      ? route.query.companyId[0] || ''
      : route.query.companyId || '',
  ),
);
const canUpdate = computed(() =>
  hasAccessByCodes(['fdmproduct:product:update']),
);
const canStatus = computed(() =>
  hasAccessByCodes(['fdmproduct:product:status']),
);

useFdmProductAiContext(() => ({
  businessId: productId.value,
  companyId: companyId.value || undefined,
  context: {
    companyId: companyId.value,
    loading: loading.value,
    record: product.value,
  },
  contextMode: 'detail',
  entityLabel: product.value
    ? `${product.value.productCode} · ${product.value.productName}`
    : undefined,
  surfaceKey: 'product',
}));

async function load() {
  const id = productId.value;
  let selectedCompany = companyId.value;
  if (!id) return;
  const current = ++requestId;
  loading.value = true;
  product.value = undefined;
  try {
    if (!selectedCompany) {
      const options = await getFdmProductFormOptions();
      selectedCompany =
        options.defaultCompanyId || options.companies[0]?.id || '';
      if (selectedCompany) {
        await router.replace({
          query: { ...route.query, companyId: selectedCompany },
        });
        return;
      }
    }
    if (!selectedCompany) return;
    const result = await getFdmProduct(id, selectedCompany);
    if (
      current === requestId &&
      productId.value === id &&
      companyId.value === selectedCompany
    )
      product.value = result;
  } finally {
    if (current === requestId) loading.value = false;
  }
}
async function changeStatus() {
  const current = product.value;
  if (!current || statusUpdating.value) return;
  statusUpdating.value = true;
  try {
    await updateFdmProductStatus({
      companyId: current.companyId,
      expectedVersion: current.version,
      id: current.id,
      status: current.status === 0 ? 1 : 0,
    });
    message.success(current.status === 0 ? '产品已停用' : '产品已启用');
    await load();
  } finally {
    statusUpdating.value = false;
  }
}
function toList() {
  void router.push({
    path: '/fdmbase/product-center',
    query: companyId.value ? { companyId: companyId.value } : {},
  });
}
function edit() {
  if (product.value)
    void router.push({
      path: `/fdmbase/product-center/edit/${product.value.id}`,
      query: { companyId: product.value.companyId },
    });
}
watch(() => [productId.value, companyId.value], load, { immediate: true });
</script>

<template>
  <Page
    :auto-content-height="false"
    :description="product?.productCode || '产品详情'"
    :title="product?.productName || '产品详情'"
  >
    <template #extra>
      <Space>
        <Button @click="toList">
          <template #icon><IconifyIcon icon="lucide:arrow-left" /></template>返回列表
</Button><ProductStatusTag v-if="product" :status="product.status" /><Button
          v-if="canUpdate && product"
          @click="edit"
        >
          编辑
</Button><Popconfirm
          v-if="canStatus && product"
          :title="product.status === 0 ? '确认停用产品？' : '确认启用产品？'"
          @confirm="changeStatus"
        >
          <Button
            :danger="product.status === 0"
            :loading="statusUpdating"
            type="primary"
          >
            {{ product.status === 0 ? '停用产品' : '启用产品' }}
          </Button>
        </Popconfirm>
      </Space>
    </template>
    <Spin :spinning="loading">
      <div v-if="product" class="product-detail">
        <section class="product-detail__hero">
          <Image v-if="product.imageUrl" :src="product.imageUrl" :width="160" />
          <div v-else class="product-detail__image-empty">
            <IconifyIcon icon="lucide:package" :width="40" /><span>未设置图片</span>
          </div>
          <div>
            <div>
              <Tag color="blue">
                {{ product.categoryName || product.categoryCode }}
</Tag><ProductStatusTag :status="product.status" />
            </div>
            <h2>{{ product.productName }}</h2>
            <Descriptions :column="2" size="small">
              <DescriptionsItem label="产品编码">
                {{ product.productCode }}
</DescriptionsItem><DescriptionsItem label="基础单位">
                {{ product.baseUnit }}
</DescriptionsItem><DescriptionsItem label="公司 ID">
                {{ product.companyId }}
</DescriptionsItem><DescriptionsItem label="版本">
                v{{ product.version }}
</DescriptionsItem><DescriptionsItem label="更新时间">
                {{
                  formatProductDateTime(product.updateTime)
                }}
</DescriptionsItem><DescriptionsItem label="创建时间">
                {{ formatProductDateTime(product.createTime) }}
              </DescriptionsItem>
            </Descriptions>
          </div>
          <div class="product-detail__metric">
            <span>SKU</span><strong>{{ product.skuCount }}</strong><small>其中出口可用 {{ product.exportEnabledSkuCount }}</small>
          </div>
        </section>
        <Alert
          :description="product.remark || '未填写产品备注'"
          message="产品备注"
          show-icon
          type="info"
        />
        <section class="product-detail__section">
          <h2><span>SKU 与 EXPORT 销售版本</span></h2>
          <Table
            :columns="columns"
            :data-source="product.skus"
            :pagination="false"
            row-key="id"
            :scroll="{ x: 1070 }"
          >
            <template #bodyCell="{ column, record }">
              <div v-if="column.key === 'sku'" class="product-detail__sku">
                <Image
                  v-if="record.imageUrl"
                  :preview="false"
                  :src="record.imageUrl"
                  :width="38"
                /><span v-else class="product-detail__sku-image"><IconifyIcon icon="lucide:box" /></span>
                <div>
                  <strong>{{ record.skuName }}</strong><small>{{ record.skuCode }} · SKU v{{ record.version }}</small>
                </div>
              </div>
              <div v-else-if="column.key === 'base'">
                <strong>{{ record.unit || product.baseUnit }}</strong><br /><span>{{
                  formatReferencePrice(
                    record.referenceCurrency,
                    record.referencePrice,
                  )
                }}</span>
              </div>
              <div
                v-else-if="column.key === 'package'"
                class="product-detail__stack"
              >
                <span>{{
                  record.packagingDescription || '未设置包装说明'
                }}</span><small>净/毛重 {{ record.netWeightKg || '—' }} /
                  {{ record.grossWeightKg || '—' }} kg</small><small>{{ record.lengthCm || '—' }} × {{ record.widthCm || '—' }} ×
                  {{ record.heightCm || '—' }} cm</small>
              </div>
              <div
                v-else-if="column.key === 'export'"
                class="product-detail__stack"
              >
                <template v-if="record.exportProfileId">
                  <strong>{{
                    record.exportDisplayName || record.skuName
                  }}</strong><small>{{ record.exportDisplayCode || record.skuCode }} · EXPORT
                    v{{ record.exportVersion }}</small><small>{{
                      formatReferencePrice(
                        record.exportReferenceCurrency,
                        record.exportReferencePrice,
                      )
                    }}
                    · {{ record.exportSalesUnit || record.unit }}</small><small>{{ record.exportEffectiveFrom || '未设开始日' }} 至
                    {{ record.exportEffectiveTo || '长期有效' }}</small>
</template><span v-else>未建立 EXPORT profile</span>
              </div>
              <div
                v-else-if="column.key === 'status'"
                class="product-detail__stack"
              >
                <Tag :color="record.status === 0 ? 'success' : 'default'">
                  SKU {{ record.status === 0 ? '启用' : '停用' }}
</Tag><Tag
                  v-if="record.exportProfileId"
                  :color="record.exportStatus === 0 ? 'blue' : 'default'"
                >
                  EXPORT {{ record.exportStatus === 0 ? '启用' : '停用' }}
                </Tag>
              </div>
            </template>
          </Table>
        </section>
      </div>
      <Empty
        v-else-if="!loading"
        :image="Empty.PRESENTED_IMAGE_SIMPLE"
        description="产品不存在或无权查看"
      >
        <Button @click="toList">返回产品列表</Button>
      </Empty>
    </Spin>
  </Page>
</template>

<style scoped>
.product-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 1540px;
  margin: 0 auto;
}

.product-detail__hero,
.product-detail__section {
  padding: 18px 20px;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 7px;
}

.product-detail__hero {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr) 190px;
  gap: 22px;
  align-items: center;
}

.product-detail__image-empty {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  width: 160px;
  height: 160px;
  color: #94a3b8;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 8px;
}

.product-detail__hero h2 {
  margin: 10px 0 12px;
  font-size: 24px;
}

.product-detail__metric {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 16px;
  background: #f3f8fd;
  border: 1px solid #dbeaf7;
  border-radius: 8px;
}

.product-detail__metric span,
.product-detail__metric small,
.product-detail__stack small,
.product-detail__sku small {
  font-size: 12px;
  color: #64748b;
}

.product-detail__metric strong {
  font-size: 32px;
  color: #0f4c81;
}

.product-detail__section h2 {
  display: flex;
  align-items: center;
  height: 32px;
  padding: 0 20px;
  margin: -18px -20px 18px;
  font-size: 14px;
  color: #0f4c81;
  background: #f3f8fd;
  border-bottom: 1px solid #dbeaf7;
}

.product-detail__section h2::before {
  width: 3px;
  height: 14px;
  margin-right: 8px;
  content: '';
  background: #1677ff;
}

.product-detail__sku,
.product-detail__sku > div,
.product-detail__stack {
  display: flex;
  gap: 4px;
}

.product-detail__sku {
  gap: 9px;
  align-items: center;
}

.product-detail__sku > div,
.product-detail__stack {
  flex-direction: column;
  align-items: flex-start;
}

.product-detail__sku-image {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  color: #64748b;
  background: #f1f5f9;
  border-radius: 6px;
}

@media (max-width: 900px) {
  .product-detail__hero {
    grid-template-columns: 1fr;
  }

  .product-detail__hero > :first-child {
    justify-self: center;
  }
}
</style>
