<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { ContractFormItem } from '../form-model';

import type { ProductSelectionValue } from '#/views/fdmproduct/shared';

import { computed, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Button,
  Image,
  Input,
  InputNumber,
  message,
  Popconfirm,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import { ProductSelectionModal } from '#/views/fdmproduct/shared';

import { formatCurrencyAmount } from '../amount';
import {
  cloneContractItem,
  createContractItemFromProductSelection,
  createEmptyContractItem,
} from '../form-model';

defineOptions({ name: 'FdmWaimaoContractOrderLineEditor' });

const props = withDefaults(
  defineProps<{
    companyId?: string;
    currency?: string;
    disabled?: boolean;
    lineAmounts?: readonly string[];
    modelValue: ContractFormItem[];
    productAmount?: string;
  }>(),
  {
    currency: 'USD',
    companyId: undefined,
    disabled: false,
    lineAmounts: () => [],
    productAmount: '0',
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: ContractFormItem[]];
}>();

const columns: ColumnsType<ContractFormItem> = [
  { fixed: 'left', key: 'sequence', title: '#', width: 48 },
  { key: 'name', title: '产品信息 *', width: 220 },
  { key: 'code', title: '产品编号', width: 130 },
  { key: 'unit', title: '单位', width: 90 },
  { key: 'imageUrl', title: '图片', width: 190 },
  { key: 'category', title: '产品分类', width: 130 },
  { key: 'retailPrice', title: '零售价', width: 120 },
  { key: 'unitPrice', title: '单价 *', width: 120 },
  { key: 'discountRate', title: '折扣 % *', width: 110 },
  { key: 'quantity', title: '数量 *', width: 110 },
  { key: 'lineAmount', title: '总价', width: 130 },
  { key: 'gift', title: '赠品', width: 80 },
  { key: 'customizationText', title: '定制要求', width: 180 },
  { key: 'remark', title: '行备注', width: 180 },
  { fixed: 'right', key: 'actions', title: '操作', width: 170 },
];

const selectionOpen = ref(false);

const totalQuantity = computed(() => {
  let total = new BigNumber(0);
  for (const item of props.modelValue) {
    const value = new BigNumber(item.quantity || 0);
    if (value.isFinite()) total = total.plus(value);
  }
  return total.toFixed(0);
});

function notify() {
  emit('update:modelValue', [...props.modelValue]);
}

function addRow() {
  emit('update:modelValue', [...props.modelValue, createEmptyContractItem()]);
}

function openProductSelection() {
  if (!props.companyId) {
    message.warning('请先选择订单所属公司，再从产品中心选品');
    return;
  }
  selectionOpen.value = true;
}

function applyProductSelection(value: ProductSelectionValue) {
  const { item, priceCurrencyMatches } = createContractItemFromProductSelection(
    value,
    props.currency,
  );
  emit('update:modelValue', [...props.modelValue, item]);
  if (!priceCurrencyMatches) {
    message.info(
      `产品参考价币种为 ${value.currency}，与合同币种 ${props.currency} 不同；价格已留空，请手工填写。`,
    );
  }
}

function convertToManual(record: Record<string, unknown>) {
  const row = record as unknown as ContractFormItem;
  row.entrySource = 'MANUAL';
  row.productId = undefined;
  row.skuId = undefined;
  row.versionToken = undefined;
  notify();
}

function duplicateRow(record: Record<string, unknown>) {
  const row = record as unknown as ContractFormItem;
  const index = props.modelValue.findIndex((item) => item._key === row._key);
  const next = [...props.modelValue];
  next.splice(
    index === -1 ? next.length : index + 1,
    0,
    cloneContractItem(row),
  );
  emit('update:modelValue', next);
}

function deleteRow(record: Record<string, unknown>) {
  const row = record as unknown as ContractFormItem;
  emit(
    'update:modelValue',
    props.modelValue.filter((item) => item._key !== row._key),
  );
}
</script>

<template>
  <div class="contract-line-editor">
    <div class="contract-line-editor__hint">
      <div>
        <strong>产品成交明细</strong>
        <span>可从产品中心回填或手工录入；回填内容仍可自行修改。</span>
      </div>
      <Tag color="blue">{{ modelValue.length }} 行</Tag>
    </div>

    <Table
      bordered
      :columns="columns"
      :data-source="modelValue"
      :pagination="false"
      row-key="_key"
      :scroll="{ x: 2050 }"
      size="small"
    >
      <template #emptyText>
        <div class="contract-line-editor__empty">请至少添加一条产品明细</div>
      </template>
      <template #bodyCell="{ column, index, record }">
        <template v-if="column.key === 'sequence'">
          <span class="contract-line-editor__sequence">{{ index + 1 }}</span>
        </template>
        <template v-else-if="column.key === 'name'">
          <div class="contract-line-editor__product-name">
            <Tag
              :color="
                record.entrySource === 'PRODUCT_CENTER' ? 'purple' : 'default'
              "
            >
              {{
                record.entrySource === 'PRODUCT_CENTER' ? '产品中心' : '手工'
              }}
            </Tag>
            <Input
              v-model:value="record.name"
              :disabled="disabled"
              :maxlength="300"
              placeholder="产品名称/规格"
              @change="notify"
            />
          </div>
        </template>
        <template v-else-if="column.key === 'code'">
          <Input
            v-model:value="record.code"
            :disabled="disabled"
            :maxlength="128"
            placeholder="手工编号"
            @change="notify"
          />
        </template>
        <template v-else-if="column.key === 'unit'">
          <Input
            v-model:value="record.unit"
            :disabled="disabled"
            :maxlength="64"
            placeholder="PCS"
            @change="notify"
          />
        </template>
        <template v-else-if="column.key === 'imageUrl'">
          <div class="contract-line-editor__image-cell">
            <Image
              v-if="record.imageUrl"
              :height="34"
              :src="record.imageUrl"
              :width="34"
            />
            <Input
              v-model:value="record.imageUrl"
              :disabled="disabled"
              :maxlength="1000"
              placeholder="图片 URL"
              @change="notify"
            />
          </div>
        </template>
        <template v-else-if="column.key === 'category'">
          <Input
            v-model:value="record.category"
            :disabled="disabled"
            :maxlength="200"
            placeholder="分类"
            @change="notify"
          />
        </template>
        <template v-else-if="column.key === 'retailPrice'">
          <InputNumber
            v-model:value="record.retailPrice"
            class="w-full"
            :disabled="disabled"
            :min="0"
            placeholder="0.00"
            :precision="6"
            string-mode
            @change="notify"
          />
        </template>
        <template v-else-if="column.key === 'unitPrice'">
          <InputNumber
            v-model:value="record.unitPrice"
            class="w-full"
            :disabled="disabled"
            :min="0"
            placeholder="0.00"
            :precision="6"
            string-mode
            @change="notify"
          />
        </template>
        <template v-else-if="column.key === 'discountRate'">
          <InputNumber
            v-model:value="record.discountRate"
            class="w-full"
            :disabled="disabled"
            :max="100"
            :min="0"
            :precision="4"
            string-mode
            @change="notify"
          />
        </template>
        <template v-else-if="column.key === 'quantity'">
          <InputNumber
            v-model:value="record.quantity"
            class="w-full"
            :disabled="disabled"
            :min="0"
            :precision="6"
            string-mode
            @change="notify"
          />
        </template>
        <template v-else-if="column.key === 'lineAmount'">
          <strong class="contract-line-editor__money">
            {{ currency }} {{ formatCurrencyAmount(lineAmounts[index]) }}
          </strong>
        </template>
        <template v-else-if="column.key === 'gift'">
          <Switch
            v-model:checked="record.gift"
            :disabled="disabled"
            size="small"
            @change="notify"
          />
        </template>
        <template v-else-if="column.key === 'customizationText'">
          <Input
            v-model:value="record.customizationText"
            :disabled="disabled"
            :maxlength="2000"
            placeholder="颜色、包装、工艺等"
            @change="notify"
          />
        </template>
        <template v-else-if="column.key === 'remark'">
          <Input
            v-model:value="record.remark"
            :disabled="disabled"
            :maxlength="1000"
            placeholder="本行备注"
            @change="notify"
          />
        </template>
        <template v-else-if="column.key === 'actions'">
          <div class="contract-line-editor__actions">
            <Popconfirm
              v-if="record.entrySource === 'PRODUCT_CENTER'"
              placement="left"
              title="转为手工行后将不再校验产品中心版本，已回填内容会保留。"
              @confirm="convertToManual(record)"
            >
              <Button :disabled="disabled" size="small" type="link">
                转手工
              </Button>
            </Popconfirm>
            <Button
              :disabled="disabled"
              size="small"
              type="link"
              @click="duplicateRow(record)"
            >
              复制
            </Button>
            <Popconfirm
              placement="left"
              title="确认删除这条产品明细？"
              @confirm="deleteRow(record)"
            >
              <Button :disabled="disabled" danger size="small" type="link">
                删除
              </Button>
            </Popconfirm>
          </div>
        </template>
      </template>
    </Table>

    <div class="contract-line-editor__footer">
      <div class="contract-line-editor__add-actions">
        <Button
          :disabled="disabled"
          type="primary"
          @click="openProductSelection"
        >
          <template #icon>
            <IconifyIcon icon="lucide:package-search" aria-hidden="true" />
          </template>
          从产品中心选择
        </Button>
        <Button :disabled="disabled" @click="addRow">
          <template #icon>
            <IconifyIcon icon="lucide:plus" aria-hidden="true" />
          </template>
          新增手工行
        </Button>
      </div>
      <div class="contract-line-editor__totals">
        <span>共 {{ modelValue.length }} 行</span>
        <span>数量 {{ totalQuantity }}</span>
        <strong>
          产品合计：{{ currency }} {{ formatCurrencyAmount(productAmount) }}
        </strong>
      </div>
    </div>

    <ProductSelectionModal
      :company-id="companyId"
      :disabled="disabled"
      :open="selectionOpen"
      @select="applyProductSelection"
      @update:open="selectionOpen = $event"
    />
  </div>
</template>

<style scoped>
.contract-line-editor {
  min-width: 0;
}

.contract-line-editor__hint,
.contract-line-editor__footer {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
}

.contract-line-editor__hint {
  margin-bottom: 10px;
  font-size: 12px;
  color: #64748b;
}

.contract-line-editor__hint > div {
  display: flex;
  gap: 10px;
  align-items: baseline;
}

.contract-line-editor__hint strong {
  font-size: 13px;
  color: #0f172a;
}

.contract-line-editor__footer {
  padding-top: 12px;
}

.contract-line-editor__totals {
  display: flex;
  gap: 18px;
  align-items: center;
  font-size: 13px;
  color: #64748b;
}

.contract-line-editor__totals strong,
.contract-line-editor__money {
  color: #0f4c81;
  white-space: nowrap;
}

.contract-line-editor__image-cell,
.contract-line-editor__actions {
  display: flex;
  gap: 4px;
  align-items: center;
}

.contract-line-editor__add-actions,
.contract-line-editor__product-name {
  display: flex;
  gap: 8px;
  align-items: center;
}

.contract-line-editor__product-name {
  flex-direction: column;
  align-items: flex-start;
}

.contract-line-editor__sequence {
  font-variant-numeric: tabular-nums;
  color: #64748b;
}

.contract-line-editor__empty {
  padding: 28px 0;
  color: #94a3b8;
}

@media (max-width: 768px) {
  .contract-line-editor__hint,
  .contract-line-editor__footer,
  .contract-line-editor__totals {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
