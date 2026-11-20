<script setup lang="ts">
import type { Product, ProductCategory } from '#/api/fdmplatform/products';

import { computed, onMounted, reactive, ref } from 'vue';

import { Alert, Form, Input, Modal, Select } from 'ant-design-vue';

import { newIdempotencyKey } from '#/api/fdmplatform';
import {
  createPurchaseAuxiliaryProduct,
  getProductCategoryList,
} from '#/api/fdmplatform/products';

import { errorText } from '../../../data';
import { materialKind } from '../entry-model';

const emit = defineEmits<{ close: []; saved: [product: Product] }>();
const form = reactive({
  categoryId: '',
  code: '',
  name: '',
  specification: '',
  unit: '',
});
const categories = ref<ProductCategory[]>([]);
const loading = ref(true);
const saving = ref(false);
const error = ref('');
const idempotencyKey = newIdempotencyKey();
const options = computed(() =>
  categories.value
    .filter(({ active, name }) => active && materialKind(name) === 'AUX')
    .map(({ id, name }) => ({ label: name, value: id })),
);
const fields = [
  { key: 'code', label: 'SKU 编号', max: 128 },
  { key: 'name', label: '辅料名称', max: 200 },
  { key: 'specification', label: '规格', max: 4000 },
  { key: 'unit', label: '单位', max: 64 },
] as const;
const complete = computed(
  () => Boolean(form.categoryId) && fields.every(({ key }) => form[key].trim()),
);

onMounted(async () => {
  try {
    categories.value = await getProductCategoryList();
    if (options.value.length === 1) form.categoryId = options.value[0]!.value;
    if (options.value.length === 0)
      error.value = '当前没有启用的辅料分类，请先在产品分类中维护。';
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    loading.value = false;
  }
});

async function save() {
  if (!complete.value || saving.value) return;
  error.value = '';
  saving.value = true;
  try {
    const product = await createPurchaseAuxiliaryProduct({
      categoryId: form.categoryId,
      code: form.code.trim(),
      idempotencyKey,
      name: form.name.trim(),
      specification: form.specification.trim(),
      unit: form.unit.trim(),
    });
    emit('saved', product);
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    open
    title="新建辅料档案"
    ok-text="保存并带入采购单"
    :ok-button-props="{ disabled: loading || !complete }"
    :confirm-loading="saving"
    :cancel-button-props="{ disabled: saving }"
    :closable="!saving"
    :keyboard="!saving"
    :mask-closable="false"
    @ok="save"
    @cancel="saving || emit('close')"
  >
    <Alert v-if="error" :message="error" type="error" show-icon />
    <Form layout="vertical" :disabled="loading || saving">
      <Form.Item
        label="辅料分类"
        html-for="purchase-auxiliary-category"
        required
      >
        <Select
          id="purchase-auxiliary-category"
          v-model:value="form.categoryId"
          :options="options"
          :loading="loading"
        />
      </Form.Item>
      <Form.Item
        v-for="{ key, label, max } in fields"
        :key="key"
        :label="label"
        :html-for="`purchase-auxiliary-${key}`"
        required
      >
        <Input
          :id="`purchase-auxiliary-${key}`"
          v-model:value="form[key]"
          :maxlength="max"
        />
      </Form.Item>
    </Form>
  </Modal>
</template>
