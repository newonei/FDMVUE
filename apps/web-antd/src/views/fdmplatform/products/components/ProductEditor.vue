<script setup lang="ts">
import type { Product } from '#/api/fdmplatform/products';

import { reactive, ref, watch } from 'vue';

import {
  Alert,
  AutoComplete,
  Button,
  Checkbox,
  Drawer,
  Form,
  Input,
  message,
  Space,
} from 'ant-design-vue';

import { newIdempotencyKey } from '#/api/fdmplatform';
import { saveProduct } from '#/api/fdmplatform/products';

import { errorText } from '../../data';
import { missingProductFields } from '../model';

const props = defineProps<{
  companyId: number;
  open: boolean;
  product?: Product;
}>();
const emit = defineEmits<{ close: []; saved: [product: Product] }>();
const form = reactive<Record<string, string>>({});
const active = ref(false);
const loading = ref(false);
const panelError = ref('');
const key = ref('');
const fields = [
  ['code', 'SKU 编号'],
  ['name', '产品名称'],
  ['displayName', '销售展示名称'],
  ['category', '分类'],
  ['unit', '计量单位'],
  ['specification', '完整规格'],
  ['material', '材质'],
  ['size', '尺寸'],
  ['color', '颜色'],
  ['shape', '形状'],
  ['printing', '标准印刷要求'],
  ['packaging', '标准包装'],
  ['imageUrl', '产品图片地址'],
];
watch(
  () => props.open,
  (open) => {
    if (!open) return;
    for (const [field] of fields)
      form[field!] = String(
        (props.product as unknown as Record<string, unknown> | undefined)?.[
          field!
        ] ?? '',
      );
    active.value = props.product?.active ?? false;
    key.value = newIdempotencyKey();
    panelError.value = '';
  },
);
async function save() {
  if (!String(form.code).trim() || !String(form.name).trim()) {
    panelError.value = '请填写 SKU 编号和产品名称';
    return;
  }
  loading.value = true;
  panelError.value = '';
  try {
    const result = await saveProduct({
      ...form,
      active: active.value,
      companyId: props.companyId,
      id: props.product?.id,
      expectedVersion: props.product?.version,
      idempotencyKey: key.value,
    });
    message.success(
      result.selectable
        ? '产品档案已保存，可用于合同选品'
        : `产品已保存，待补齐：${missingProductFields(result.missingFields) || '启用状态'}`,
    );
    emit('saved', result);
    emit('close');
  } catch (error) {
    panelError.value = errorText(error);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <Drawer
    :open="open"
    :title="product ? '产品档案' : '新建产品档案'"
    width="min(760px, 96vw)"
    :mask-closable="false"
    @close="emit('close')"
  >
    <Space direction="vertical" :size="18" style="width: 100%">
      <Alert v-if="panelError" type="error" show-icon :message="panelError" />
      <Alert
        type="info"
        show-icon
        message="在产品中心建立和维护本业务产品。规格、单位、包装等填写一次，创建合同时直接选择带入；资料未齐可先保存，启用后供业务选用。"
      />
      <Form layout="vertical" class="product-fields">
        <Form.Item
          v-for="[field, title] in fields"
          :key="field"
          :label="title"
          :required="['code', 'name'].includes(field!)"
        >
          <AutoComplete
            v-if="field === 'shape'"
            v-model:value="form[field]"
            :options="[{ value: '圆角' }, { value: '方形' }]"
            placeholder="选择圆角、方形，也可输入其他形状"
            :maxlength="64"
          />
          <Input
            v-else
            v-model:value="form[field!]"
            :disabled="Boolean(product) && field === 'code'"
            :placeholder="
              field === 'unit'
                ? '例如：张、个、套；请按实际资料填写'
                : undefined
            "
          />
        </Form.Item>
      </Form>
      <Checkbox v-model:checked="active">
        启用产品（必要资料完整后可选入合同）
      </Checkbox>
      <Alert
        type="info"
        message="保存产品后，从产品列表的“标准资料”上传说明书与规格文件；选入合同时保留对应资料版本。"
      />
    </Space>
    <template #footer>
      <Space>
        <Button @click="emit('close')">取消</Button><Button type="primary" :loading="loading" @click="save">
          保存产品档案
        </Button>
      </Space>
    </template>
  </Drawer>
</template>

<style scoped>
.product-fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 18px;
}

@media (max-width: 600px) {
  .product-fields {
    grid-template-columns: 1fr;
  }
}
</style>
