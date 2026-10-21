<script setup lang="ts">
import type { Product, TaxBasis } from '#/api/fdmplatform/products';

import { computed, reactive, ref, watch } from 'vue';

import {
  Alert,
  Button,
  Empty,
  Image,
  Input,
  Modal,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { getProducts } from '#/api/fdmplatform/products';

import { errorText, money } from '../../data';
import { mergeProductSelection, productDescription } from '../model';
import ProductCategoryPanel from './ProductCategoryPanel.vue';
import ProductEditor from './ProductEditor.vue';

const props = defineProps<{
  /** 采购等场景可选启用但资料未补齐的产品；合同选品仍只列可选用产品 */
  allowIncomplete?: boolean;
  busy?: boolean;
  companyId: number;
  currency?: string;
  open: boolean;
  selectionError?: string;
  single?: boolean;
  taxBasis?: TaxBasis;
  title?: string;
}>();
const emit = defineEmits<{ close: []; selected: [products: Product[]] }>();
const allowIncomplete = computed(() => Boolean(props.allowIncomplete));
const data = ref<Product[]>([]);
const selected = ref<Product[]>([]);
const selectedKeys = computed(() => selected.value.map((item) => item.id));
/** undefined 为全部分类，空字符串为未分类 */
const category = ref<string>();
const appliedKeyword = ref('');
const categoryRefresh = ref(0);
const filters = reactive({
  keyword: '',
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
    categoryRefresh.value++;
    void load();
  },
);
async function load(reset = false) {
  if (reset) pageNo.value = 1;
  appliedKeyword.value = filters.keyword;
  const run = ++sequence;
  loading.value = true;
  panelError.value = '';
  try {
    const result = await getProducts({
      companyId: props.companyId,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      ...filters,
      category: category.value,
      exactCategory: category.value === undefined ? undefined : true,
      ...(allowIncomplete.value ? { active: true } : { selectable: true }),
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
function chooseCategory(value: string | undefined) {
  category.value = value;
  void load(true);
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
  if (product.selectable || (allowIncomplete.value && product.active))
    selected.value = props.single ? [product] : [...selected.value, product];
  categoryRefresh.value++;
  void load();
}
</script>

<template>
  <Modal
    :open="open"
    :title="title || '从产品中心选择'"
    width="min(1680px, 98vw)"
    :mask-closable="false"
    :body-style="{ paddingTop: '4px' }"
    centered
    @cancel="emit('close')"
  >
    <div class="picker-layout">
      <aside class="picker-side">
        <ProductCategoryPanel
          v-if="open"
          :company-id="companyId"
          :value="category"
          :keyword="appliedKeyword"
          :active="allowIncomplete ? true : undefined"
          :selectable="allowIncomplete ? undefined : true"
          :refresh-key="categoryRefresh"
          @update:value="chooseCategory"
        />
      </aside>
      <div class="picker-stack">
        <Alert v-if="panelError" type="error" show-icon :message="panelError" />
        <Alert
          v-if="selectionError"
          type="error"
          show-icon
          :message="selectionError"
        />
        <Space wrap :size="8">
          <Input
            v-model:value="filters.keyword"
            placeholder="名称 / SKU / 展示名称"
            style="width: 220px"
            allow-clear
            @press-enter="load(true)"
          />
          <Input
            v-for="entry in ['material', 'size', 'color', 'shape'] as const"
            :key="entry"
            v-model:value="filters[entry]"
            :placeholder="
              {
                material: '材质',
                size: '尺寸',
                color: '颜色',
                shape: '形状',
              }[entry]
            "
            style="width: 96px"
            allow-clear
            @press-enter="load(true)"
          />
          <Button type="primary" @click="load(true)">查询</Button>
          <Button @click="editorOpen = true">新建产品</Button>
        </Space>
        <div class="picker-hint">
          {{
            allowIncomplete
              ? '列出全部启用产品，可跨分类、跨页勾选。'
              : `只列资料齐全的启用产品，可跨分类、跨页勾选；${currency ? `${currency} ${taxBasis === 'TAX_INCLUDED' ? '含税' : '未税'}参考价` : '销售参考价'}缺失时带入待定价。`
          }}
        </div>
        <Table
          size="small"
          :data-source="data"
          row-key="id"
          :loading="loading"
          :scroll="{ x: 1040, y: 'calc(100vh - 420px)' }"
          :row-selection="{
            type: single ? 'radio' : 'checkbox',
            selectedRowKeys: selectedKeys,
            preserveSelectedRowKeys: true,
            onChange: changeSelection,
          }"
          :custom-row="
            (record: Product) => ({
              onDblclick: () => {
                if (!single) return;
                selected = [record];
                emit('selected', selected);
              },
            })
          "
          :pagination="{
            current: pageNo,
            pageSize,
            total,
            size: 'small',
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50', '100'],
            showTotal: (count: number) => `共 ${count} 个规格`,
          }"
          :columns="[
            { title: '产品', key: 'product', width: 320 },
            {
              title: '分类',
              dataIndex: 'category',
              key: 'category',
              width: 150,
            },
            { title: '型号 · 规格', key: 'specification' },
            { title: '单位', dataIndex: 'unit', width: 60 },
            allowIncomplete
              ? { title: '资料', key: 'state', width: 90 }
              : { title: '销售参考价', key: 'price', width: 130 },
          ]"
          @change="changePage"
        >
          <template #emptyText>
            <Empty
              description="暂无可选产品；请换个分类或调整搜索，或新建产品并补齐资料"
            />
          </template>
          <template #bodyCell="{ column, record }">
            <div v-if="column.key === 'product'" class="product-cell">
              <Image
                v-if="record.imageUrl"
                :src="record.imageUrl"
                :width="40"
                :height="40"
              /><span v-else class="image-placeholder">暂无图</span>
              <div class="product-copy">
                <strong :title="record.displayName || record.name">{{
                  record.displayName || record.name
                }}</strong>
                <div class="muted">{{ record.code }}</div>
              </div>
            </div>
            <span v-else-if="column.key === 'category'" class="muted">{{
              record.category || '未分类'
            }}</span>
            <span
              v-else-if="column.key === 'specification'"
              :title="productDescription(record as Product)"
              >{{ productDescription(record as Product) }}</span>
            <template v-else-if="column.key === 'price'">
              <span v-if="record.referencePrice">{{
                money(
                  record.referencePrice.unitPrice,
                  record.referencePrice.currency,
                )
              }}</span><Tag v-else color="orange">待定价</Tag>
            </template>
            <Tag
              v-else-if="column.key === 'state'"
              :color="record.selectable ? 'green' : 'orange'"
            >
              {{ record.selectable ? '齐全' : '待补资料' }}
            </Tag>
          </template>
        </Table>
      </div>
    </div>
    <template #footer>
      <div class="picker-footer">
        <div class="selected-items">
          <strong>已选 {{ selected.length }} 个</strong>
          <Tag
            v-for="item in selected"
            :key="item.id"
            closable
            @close.prevent="
              selected = selected.filter((entry) => entry.id !== item.id)
            "
          >
            {{ item.displayName || item.name }} · {{ item.code }}
          </Tag>
          <Button
            v-if="selected.length > 1"
            type="link"
            size="small"
            @click="selected = []"
          >
            清空
          </Button>
        </div>
        <Space>
          <Button @click="emit('close')">取消</Button><Button
            type="primary"
            :disabled="selected.length === 0 || busy"
            :loading="busy"
            @click="emit('selected', selected)"
          >
            {{ single ? '确定' : `确定加入 ${selected.length} 个产品` }}
          </Button>
        </Space>
      </div>
    </template>
  </Modal>
  <ProductEditor
    :company-id="companyId"
    :open="editorOpen"
    @close="editorOpen = false"
    @saved="afterCreated"
  />
</template>

<style scoped>
.picker-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 14px;
  height: calc(100vh - 240px);
  min-height: 420px;
}

.picker-side {
  min-height: 0;
  padding-right: 12px;
  border-right: 1px solid hsl(var(--border));
}

.picker-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
  min-height: 0;
}

.picker-hint {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.product-cell {
  display: flex;
  gap: 10px;
  align-items: center;
}

.product-copy {
  min-width: 0;
}

.product-copy strong {
  display: block;
  overflow-wrap: anywhere;
}

.image-placeholder {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  font-size: 11px;
  color: #94a3b8;
  background: #f1f5f9;
  border-radius: 6px;
}

.muted {
  font-size: 12px;
  color: #64748b;
}

.picker-footer {
  display: flex;
  gap: 12px;
  align-items: flex-end;
  justify-content: space-between;
}

.selected-items {
  display: flex;
  flex: 1;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  max-height: 64px;
  overflow-y: auto;
  text-align: left;
}

@media (max-width: 760px) {
  .picker-layout {
    grid-template-columns: 1fr;
    height: auto;
  }

  .picker-side {
    --category-list-max-height: 180px;

    padding-right: 0;
    padding-bottom: 8px;
    border-right: 0;
    border-bottom: 1px solid hsl(var(--border));
  }

  .picker-footer {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
