<script setup lang="ts">
import type { Product } from '#/api/fdmplatform/products';

import { computed, ref } from 'vue';

import { useAccess } from '@vben/access';

import { Button } from 'ant-design-vue';

import { productAttributeDetails } from '../attributes';
import { productDimensionsText } from '../manufacturing';
import { missingProductFields } from '../model';
import ProductCatalogStocks from './ProductCatalogStocks.vue';
import ProductColorSummary from './ProductColorSummary.vue';

const props = defineProps<{ product: Product }>();
const emit = defineEmits<{ activity: []; files: [] }>();

const { hasAccessByCodes } = useAccess();
const activeTab = ref<'specification' | 'stock'>('specification');
const warehouseAccess = computed(() =>
  hasAccessByCodes(['fdmplatform:inventory:query']),
);
const factoryAccess = computed(() =>
  hasAccessByCodes(['fdmgongchang:stage-stock:query']),
);
const hasStockAccess = computed(
  () => warehouseAccess.value || factoryAccess.value,
);

const fields = computed(() => {
  const product = props.product;
  const { size } = product;
  const attributeFields = productAttributeDetails(product)
    .filter(({ label }) =>
      [
        '反面压花',
        '垫子类型',
        '正面压花',
        '生产分类',
        '雕刻 / 图案版本',
      ].includes(label),
    )
    .map((entry) => ({
      ...entry,
      value: entry.value === 'NONE' ? '无纹路' : entry.value,
    }));

  return [
    { label: '型号', value: product.model },
    { label: '尺寸', value: productDimensionsText(product) || size },
    { label: '规格原文', value: product.specification || product.spec },
    { label: '材质', value: product.material },
    { label: '计量单位', value: product.unit },
    { label: '克重', value: product.weight },
    { label: '形状', value: product.shape },
    { label: '颜色原文', value: product.color },
    { label: '颜色和制造结构', value: '' },
    ...attributeFields,
    { label: '定制说明', value: product.printing },
    { label: '标准包装', value: product.packaging },
    { label: '备注', value: product.remark },
    ...(!product.selectable && product.active
      ? [
          {
            label: '待补资料',
            value: missingProductFields(product.missingFields ?? []),
          },
        ]
      : []),
  ];
});
</script>

<template>
  <section
    class="catalog-details"
    :aria-label="`${product.code || product.name} 产品详情`"
  >
    <div class="catalog-detail-actions">
      <div class="catalog-detail-tabs" role="group" aria-label="详情分类">
        <Button
          size="small"
          type="text"
          :aria-pressed="activeTab === 'specification'"
          @click="activeTab = 'specification'"
        >
          规格资料
        </Button>
        <Button
          v-if="hasStockAccess"
          size="small"
          type="text"
          :aria-pressed="activeTab === 'stock'"
          @click="activeTab = 'stock'"
        >
          库存
        </Button>
      </div>
      <Button size="small" type="link" @click="emit('activity')">
        业务记录
      </Button>
      <Button size="small" type="link" @click="emit('files')">标准附件</Button>
    </div>
    <ProductCatalogStocks
      v-if="activeTab === 'stock' && hasStockAccess"
      :product-id="product.id"
      :show-warehouse="warehouseAccess"
    />
    <table v-else class="catalog-detail-table" aria-label="产品规格资料">
      <tbody>
        <tr v-for="field in fields" :key="field.label">
          <th scope="row">{{ field.label }}</th>
          <td>
            <ProductColorSummary
              v-if="field.label === '颜色和制造结构'"
              :value="product"
              construction
              show-previews
            />
            <template v-else>{{ field.value?.trim() || '未维护' }}</template>
          </td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.catalog-details {
  min-width: 0;
}

.catalog-detail-actions,
.catalog-detail-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.catalog-detail-actions {
  padding-block: 4px 7px;
}

.catalog-detail-tabs {
  flex: 1;
}

.catalog-detail-tabs :deep(.ant-btn[aria-pressed='true']) {
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 9%);
}

.catalog-detail-table {
  width: 100%;
  font-size: 13px;
  border-collapse: collapse;
}

.catalog-detail-table tr:nth-child(odd) {
  background: hsl(var(--card));
}

.catalog-detail-table th,
.catalog-detail-table td {
  padding: 4px 8px;
  vertical-align: top;
  text-align: left;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  border-top: 1px solid hsl(var(--border));
}

.catalog-detail-table th {
  width: clamp(80px, 28%, 180px);
  font-weight: 500;
  color: hsl(var(--muted-foreground));
}
</style>
