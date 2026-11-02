<script setup lang="ts">
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { ref, watch } from 'vue';

import { Alert, Button, message, Modal, Select } from 'ant-design-vue';

import {
  bindStageItemProduct,
  searchSemiProducts,
} from '#/api/fdmgongchang/stage-stock';

import { errorText } from '../../data';

/** 半成品默认对应自动建的产品；产品中心已有同规格产品时改绑过去，避免一物两码。 */
const props = defineProps<{ stock?: Api.Stock }>();
const emit = defineEmits<{ close: []; saved: [] }>();

const productId = ref<string>();
const productOptions = ref<Array<{ label: string; value: string }>>([]);
const searching = ref(false);
const saving = ref(false);
const error = ref('');
let timer: ReturnType<typeof setTimeout> | undefined;

watch(
  () => props.stock,
  () => {
    productId.value = undefined;
    productOptions.value = [];
    error.value = '';
  },
);

function search(keyword: string) {
  if (timer) clearTimeout(timer);
  if (!keyword.trim()) return;
  timer = setTimeout(async () => {
    searching.value = true;
    try {
      const list = await searchSemiProducts(keyword.trim());
      productOptions.value = list.map((p) => ({
        label: [
          p.displayName || p.name,
          p.code,
          (p.specification ?? '').replaceAll('\n', ' '),
        ]
          .filter(Boolean)
          .join(' · '),
        value: p.id,
      }));
    } catch (error_) {
      error.value = errorText(error_);
    } finally {
      searching.value = false;
    }
  }, 300);
}

async function save(target?: string) {
  if (!props.stock) return;
  saving.value = true;
  error.value = '';
  try {
    await bindStageItemProduct(props.stock.itemId, target);
    message.success(target ? '已绑定产品' : '已恢复自动建的产品');
    emit('saved');
    emit('close');
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :open="!!stock"
    title="绑定产品"
    width="560px"
    :footer="null"
    @cancel="emit('close')"
  >
    <p>
      工序物料 <span class="mono">{{ stock?.itemCode }}</span>
      <template v-if="stock?.item?.productCode">
        ，当前产品 <span class="mono">{{ stock.item.productCode }}</span>
      </template>
    </p>
    <Alert v-if="error" type="error" :message="error" show-icon />
    <Select
      v-model:value="productId"
      show-search
      allow-clear
      placeholder="输入产品名称或编码搜索"
      style="width: 100%; margin: 12px 0"
      :default-active-first-option="false"
      :filter-option="false"
      :loading="searching"
      :options="productOptions"
      @search="search"
    />
    <div style="display: flex; justify-content: space-between">
      <Button :loading="saving" @click="save()">恢复自动建的产品</Button>
      <Button
        type="primary"
        :disabled="!productId"
        :loading="saving"
        @click="save(productId)"
      >
        绑定
      </Button>
    </div>
  </Modal>
</template>
