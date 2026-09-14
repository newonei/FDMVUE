<script setup lang="ts">
import type { Product, TaxBasis } from '#/api/fdmplatform/products';

import { computed, reactive, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Drawer,
  Empty,
  Image,
  Input,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { getProducts } from '#/api/fdmplatform/products';

import { errorText, money } from '../../data';
import { mergeProductSelection, productDescription } from '../model';
import ProductEditor from './ProductEditor.vue';

const props = defineProps<{
  busy?: boolean;
  companyId: number;
  currency?: string;
  open: boolean;
  selectionError?: string;
  single?: boolean;
  taxBasis?: TaxBasis;
}>();
const emit = defineEmits<{ close: []; selected: [products: Product[]] }>();
const data = ref<Product[]>([]);
const selected = ref<Product[]>([]);
const selectedKeys = computed(() => selected.value.map((item) => item.id));
const filters = reactive({
  keyword: '',
  category: '',
  material: '',
  size: '',
  color: '',
  shape: '',
});
const pageNo = ref(1);
const pageSize = ref(10);
const total = ref(0);
const loading = ref(false);
const panelError = ref('');
const editorOpen = ref(false);
let sequence = 0;
watch(
  () => [props.open, props.companyId],
  () => {
    if (!props.open) {
      sequence += 1;
      return;
    }
    selected.value = [];
    pageNo.value = 1;
    void load();
  },
);
async function load(reset = false) {
  if (reset) pageNo.value = 1;
  const run = ++sequence;
  loading.value = true;
  panelError.value = '';
  try {
    const result = await getProducts({
      companyId: props.companyId,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      ...filters,
      selectable: true,
      currency: props.currency,
      taxBasis: props.taxBasis,
    });
    if (run === sequence) {
      data.value = result.list;
      total.value = result.total;
    }
  } catch (error) {
    if (run === sequence) panelError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
function changeSelection(keys: (number | string)[]) {
  selected.value = mergeProductSelection(
    selected.value,
    data.value,
    keys.map(String),
  );
}
function changePage(page: { current?: number; pageSize?: number }) {
  pageNo.value = page.current ?? 1;
  pageSize.value = page.pageSize ?? 10;
  void load();
}
function afterCreated(product: Product) {
  editorOpen.value = false;
  if (product.selectable) selected.value.push(product);
  void load();
}
</script>

<template>
  <Drawer
    :open="open"
    title="从产品中心选择"
    width="min(1200px, 98vw)"
    @close="emit('close')"
  >
    <div class="picker-stack">
      <Alert v-if="panelError" type="error" show-icon :message="panelError" />
      <Alert
        v-if="selectionError"
        type="error"
        show-icon
        :message="selectionError"
      />
      <Space wrap>
        <Input
          v-model:value="filters.keyword"
          placeholder="名称 / SKU / 展示名称"
          style="width: 230px"
          allow-clear
          @press-enter="load(true)"
        />
        <Input
          v-for="entry in [
            'category',
            'material',
            'size',
            'color',
            'shape',
          ] as const"
          :key="entry"
          v-model:value="filters[entry]"
          :placeholder="
            {
              category: '分类',
              material: '材质',
              size: '尺寸',
              color: '颜色',
              shape: '形状',
            }[entry]
          "
          style="width: 110px"
          allow-clear
          @press-enter="load(true)"
        />
        <Button type="primary" @click="load(true)">查询产品</Button>
        <Button @click="editorOpen = true">新建产品</Button>
      </Space>
      <Alert
        type="info"
        show-icon
        :message="`可选启用产品；翻页保留勾选。${currency ? `${currency} ${taxBasis === 'TAX_INCLUDED' ? '含税' : '未税'}参考价` : '销售参考价'}缺失时带入待定价，保存草稿后可继续补齐。`"
      />
      <Table
        :data-source="data"
        row-key="id"
        :loading="loading"
        :scroll="{ x: 920 }"
        :row-selection="{
          type: single ? 'radio' : 'checkbox',
          selectedRowKeys: selectedKeys,
          preserveSelectedRowKeys: true,
          onChange: changeSelection,
        }"
        :pagination="{
          current: pageNo,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (count: number) => `共 ${count} 个规格`,
        }"
        :columns="[
          { title: '产品', key: 'product', width: 280 },
          { title: '完整规格', key: 'specification' },
          { title: '单位', dataIndex: 'unit', width: 70 },
          { title: '销售参考价', key: 'price', width: 160 },
        ]"
        @change="changePage"
      >
        <template #emptyText>
          <Empty description="暂无可选产品；请调整搜索，或新建产品并补齐资料" />
        </template>
        <template #bodyCell="{ column, record }">
          <div v-if="column.key === 'product'" class="product-cell">
            <Image
              v-if="record.imageUrl"
              :src="record.imageUrl"
              :width="48"
              :height="48"
            /><span v-else class="image-placeholder">暂无图</span>
            <div>
              <strong>{{ record.displayName || record.name }}</strong>
              <div class="muted">{{ record.code }}</div>
            </div>
          </div>
          <span v-else-if="column.key === 'specification'">{{
            productDescription(record as Product)
          }}</span>
          <template v-else-if="column.key === 'price'">
            <span v-if="record.referencePrice">{{
              money(
                record.referencePrice.unitPrice,
                record.referencePrice.currency,
              )
            }}</span><Tag v-else color="orange">待定价</Tag>
          </template>
        </template>
      </Table>
      <div class="selected-items">
        <strong>已选 {{ selected.length }} 个规格</strong><Tag
          v-for="item in selected"
          :key="item.id"
          closable
          @close.prevent="
            selected = selected.filter((entry) => entry.id !== item.id)
          "
        >
          {{ item.displayName || item.name }} · {{ item.code }}
        </Tag>
      </div>
    </div>
    <template #footer>
      <Space>
        <Button @click="emit('close')">取消</Button><Button
          type="primary"
          :disabled="selected.length === 0 || busy"
          :loading="busy"
          @click="emit('selected', selected)"
        >
          加入 {{ selected.length }} 个产品
        </Button>
      </Space>
    </template>
  </Drawer>
  <ProductEditor
    :company-id="companyId"
    :open="editorOpen"
    @close="editorOpen = false"
    @saved="afterCreated"
  />
</template>

<style scoped>
.picker-stack {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.product-cell {
  display: flex;
  gap: 12px;
  align-items: center;
}

.image-placeholder {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  font-size: 11px;
  color: #94a3b8;
  background: #f1f5f9;
  border-radius: 6px;
}

.muted {
  font-size: 12px;
  color: #64748b;
}

.selected-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}
</style>
