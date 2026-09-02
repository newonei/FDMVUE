<script lang="ts" setup>
import type { Dayjs } from 'dayjs';

import type { ProductSkuForm } from '../form-model';

import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Collapse,
  CollapsePanel,
  DatePicker,
  Input,
  InputNumber,
  Select,
  Switch,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import { createEmptyProductSku } from '../form-model';

defineOptions({ name: 'FdmProductSkuEditor' });

const props = defineProps<{
  categoryOptions?: Array<{ label: string; value: string }>;
  defaultUnit?: string;
  disabled?: boolean;
  modelValue: ProductSkuForm[];
}>();

const emit = defineEmits<{
  'update:modelValue': [value: ProductSkuForm[]];
}>();

const CURRENCY_OPTIONS = ['USD', 'EUR', 'CNY', 'GBP', 'AUD', 'CAD', 'JPY'].map(
  (value) => ({ label: value, value }),
);

function addSku() {
  emit('update:modelValue', [
    ...props.modelValue,
    createEmptyProductSku(props.defaultUnit || 'PCS'),
  ]);
}

function removeSku(index: number) {
  if (props.modelValue.length <= 1) return;
  emit(
    'update:modelValue',
    props.modelValue.filter((_, current) => current !== index),
  );
}

function dateValue(value?: string) {
  return value ? dayjs(value) : undefined;
}

function setDate(
  sku: ProductSkuForm,
  key: 'exportEffectiveFrom' | 'exportEffectiveTo',
  value: Dayjs | null | string,
) {
  if (!value) {
    sku[key] = undefined;
    return;
  }
  sku[key] =
    typeof value === 'string' ? value.slice(0, 10) : value.format('YYYY-MM-DD');
}
</script>

<template>
  <div class="product-sku-editor">
    <Alert
      class="product-sku-editor__notice"
      description="SKU 和 EXPORT 销售资料均独立版本化。编辑已有 SKU 时会提交当前 SKU 与出口版本，后端以 CAS 防止覆盖他人改动。"
      message="合同选择的最小单位是已启用的 EXPORT SKU"
      show-icon
      type="info"
    />

    <Collapse :default-active-key="modelValue.map((item) => item.rowKey)">
      <CollapsePanel
        v-for="(sku, index) in modelValue"
        :key="sku.rowKey"
        :header="sku.skuName || `SKU ${index + 1}`"
      >
        <template #extra>
          <Tag :color="sku.status === 0 ? 'success' : 'default'">
            {{ sku.status === 0 ? 'SKU 启用' : 'SKU 停用' }}
          </Tag>
          <Tag :color="sku.exportStatus === 0 ? 'blue' : 'default'">
            {{ sku.exportStatus === 0 ? '出口启用' : '出口停用' }}
          </Tag>
        </template>

        <div v-if="sku.id" class="product-sku-editor__version">
          <span>SKU ID {{ sku.id }} · v{{ sku.expectedVersion }}</span>
          <span v-if="sku.exportProfileId">
            EXPORT ID {{ sku.exportProfileId }} · v{{
              sku.expectedExportVersion
            }}
          </span>
        </div>

        <div class="product-sku-editor__grid">
          <label>
            <span>SKU 名称 <b>*</b></span>
            <Input
              v-model:value="sku.skuName"
              :disabled="disabled"
              :maxlength="200"
            />
          </label>
          <label>
            <span>SKU 编码 <b>*</b></span>
            <Input
              v-model:value="sku.skuCode"
              :disabled="disabled || Boolean(sku.id)"
              :maxlength="64"
              placeholder="仅字母、数字、点、下划线、短横线"
            />
          </label>
          <label>
            <span>单位</span>
            <Input
              v-model:value="sku.unit"
              :disabled="disabled"
              :maxlength="32"
              :placeholder="defaultUnit || 'PCS'"
            />
          </label>
          <label>
            <span>SKU 状态</span>
            <Switch
              :checked="sku.status === 0"
              checked-children="启用"
              :disabled="disabled"
              un-checked-children="停用"
              @change="sku.status = $event ? 0 : 1"
            />
          </label>
          <label>
            <span>SKU 图片 URL</span>
            <Input
              v-model:value="sku.imageUrl"
              :disabled="disabled"
              :maxlength="1024"
            />
          </label>
          <label>
            <span>参考价</span>
            <div class="product-sku-editor__price">
              <Select
                v-model:value="sku.referenceCurrency"
                :disabled="disabled"
                :options="CURRENCY_OPTIONS"
              />
              <InputNumber
                v-model:value="sku.referencePrice"
                class="w-full"
                :disabled="disabled"
                :min="0"
                :precision="6"
                string-mode
              />
            </div>
          </label>
          <label class="product-sku-editor__field--wide">
            <span>包装说明</span>
            <Input
              v-model:value="sku.packagingDescription"
              :disabled="disabled"
              :maxlength="500"
              placeholder="如 20 PCS / carton，内袋 + 五层瓦楞箱"
            />
          </label>
        </div>

        <div class="product-sku-editor__subsection">
          <div class="product-sku-editor__subheading">
            <div>
              <strong>重量与尺寸</strong>
              <small>所有 decimal 都按字符串提交，避免精度丢失</small>
            </div>
          </div>
          <div class="product-sku-editor__measure-grid">
            <label>
              <span>净重 kg</span>
              <InputNumber
                v-model:value="sku.netWeightKg"
                class="w-full"
                :disabled="disabled"
                :min="0"
                :precision="6"
                string-mode
              />
            </label>
            <label>
              <span>毛重 kg</span>
              <InputNumber
                v-model:value="sku.grossWeightKg"
                class="w-full"
                :disabled="disabled"
                :min="0"
                :precision="6"
                string-mode
              />
            </label>
            <label>
              <span>长 cm</span>
              <InputNumber
                v-model:value="sku.lengthCm"
                class="w-full"
                :disabled="disabled"
                :min="0"
                :precision="6"
                string-mode
              />
            </label>
            <label>
              <span>宽 cm</span>
              <InputNumber
                v-model:value="sku.widthCm"
                class="w-full"
                :disabled="disabled"
                :min="0"
                :precision="6"
                string-mode
              />
            </label>
            <label>
              <span>高 cm</span>
              <InputNumber
                v-model:value="sku.heightCm"
                class="w-full"
                :disabled="disabled"
                :min="0"
                :precision="6"
                string-mode
              />
            </label>
          </div>
        </div>

        <div class="product-sku-editor__subsection product-sku-editor__export">
          <div class="product-sku-editor__subheading">
            <div>
              <strong>EXPORT 销售资料</strong>
              <small>合同选择器只返回当前有效且启用的出口销售版本</small>
            </div>
            <Switch
              :checked="sku.exportStatus === 0"
              checked-children="启用"
              :disabled="disabled"
              un-checked-children="停用"
              @change="sku.exportStatus = $event ? 0 : 1"
            />
          </div>
          <div class="product-sku-editor__grid">
            <label>
              <span>出口分类</span>
              <Select
                v-model:value="sku.exportCategoryId"
                allow-clear
                :disabled="disabled"
                :options="categoryOptions"
                show-search
              />
            </label>
            <label>
              <span>出口展示编码</span>
              <Input
                v-model:value="sku.exportDisplayCode"
                :disabled="disabled"
                :maxlength="64"
                placeholder="留空时沿用 SKU 编码"
              />
            </label>
            <label>
              <span>出口展示名称</span>
              <Input
                v-model:value="sku.exportDisplayName"
                :disabled="disabled"
                :maxlength="200"
                placeholder="留空时沿用 SKU 名称"
              />
            </label>
            <label>
              <span>出口销售单位</span>
              <Input
                v-model:value="sku.exportSalesUnit"
                :disabled="disabled"
                :maxlength="32"
              />
            </label>
            <label>
              <span>出口图片 URL</span>
              <Input
                v-model:value="sku.exportImageUrl"
                :disabled="disabled"
                :maxlength="1024"
              />
            </label>
            <label>
              <span>出口参考价</span>
              <div class="product-sku-editor__price">
                <Select
                  v-model:value="sku.exportReferenceCurrency"
                  :disabled="disabled"
                  :options="CURRENCY_OPTIONS"
                />
                <InputNumber
                  v-model:value="sku.exportReferencePrice"
                  class="w-full"
                  :disabled="disabled"
                  :min="0"
                  :precision="6"
                  string-mode
                />
              </div>
            </label>
            <label>
              <span>生效日期</span>
              <DatePicker
                class="w-full"
                :disabled="disabled"
                :value="dateValue(sku.exportEffectiveFrom)"
                @change="setDate(sku, 'exportEffectiveFrom', $event)"
              />
            </label>
            <label>
              <span>失效日期</span>
              <DatePicker
                class="w-full"
                :disabled="disabled"
                :value="dateValue(sku.exportEffectiveTo)"
                @change="setDate(sku, 'exportEffectiveTo', $event)"
              />
            </label>
          </div>
        </div>

        <div class="product-sku-editor__subsection">
          <strong>SKU 备注</strong>
          <Input.TextArea
            v-model:value="sku.remark"
            :disabled="disabled"
            :maxlength="500"
            :rows="2"
            show-count
          />
        </div>

        <div class="product-sku-editor__actions">
          <Button
            danger
            :disabled="disabled || modelValue.length <= 1"
            @click="removeSku(index)"
          >
            <template #icon><IconifyIcon icon="lucide:trash-2" /></template>
            从权威集合移除此 SKU
          </Button>
        </div>
      </CollapsePanel>
    </Collapse>

    <Button
      class="product-sku-editor__add"
      :disabled="disabled"
      type="dashed"
      @click="addSku"
    >
      <template #icon><IconifyIcon icon="lucide:plus" /></template>
      新增 SKU
    </Button>
  </div>
</template>

<style scoped>
.product-sku-editor__notice {
  margin-bottom: 12px;
}

.product-sku-editor__version,
.product-sku-editor__subheading,
.product-sku-editor__actions {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.product-sku-editor__version {
  margin-bottom: 14px;
  font-size: 12px;
  color: #64748b;
}

.product-sku-editor__grid,
.product-sku-editor__measure-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px 20px;
}

.product-sku-editor__measure-grid {
  grid-template-columns: repeat(5, minmax(0, 1fr));
}

.product-sku-editor label,
.product-sku-editor__subsection,
.product-sku-editor__subheading > div {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.product-sku-editor label > span,
.product-sku-editor__subheading small {
  font-size: 12px;
  color: #64748b;
}

.product-sku-editor label > span {
  font-size: 13px;
  font-weight: 500;
  color: #374151;
}

.product-sku-editor b {
  color: #ef4444;
}

.product-sku-editor__field--wide {
  grid-column: 1 / -1;
}

.product-sku-editor__price {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 8px;
}

.product-sku-editor__subsection {
  padding-top: 14px;
  margin-top: 18px;
  border-top: 1px dashed #dbe3ed;
}

.product-sku-editor__export {
  padding: 14px;
  background: #f3f8fd;
  border: 1px solid #dbeaf7;
  border-radius: 7px;
}

.product-sku-editor__actions {
  justify-content: flex-end;
  margin-top: 18px;
}

.product-sku-editor__add {
  width: 100%;
  margin-top: 12px;
}

@media (max-width: 980px) {
  .product-sku-editor__measure-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .product-sku-editor__grid,
  .product-sku-editor__measure-grid {
    grid-template-columns: 1fr;
  }

  .product-sku-editor__field--wide {
    grid-column: auto;
  }
}
</style>
