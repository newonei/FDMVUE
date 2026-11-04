<script setup lang="ts">
import type { FdmgongchangRestockApi as Api } from '#/api/fdmgongchang/restock';

import { onBeforeUnmount, onMounted, ref } from 'vue';

import { Button, Checkbox, InputNumber, message, Select, Spin } from 'ant-design-vue';

import { getRestockSetting, saveRestockSetting, searchStandingProducts } from '#/api/fdmgongchang/restock';

/**
 * 常备物料：订单用掉这些库存后，系统自动下「补库」工厂订单补回来（没接单前同一产品直接加量）。
 * 已雕刻的成品默认补对应的空白冲裁件；常备图案款勾「补同图案」就补同一款。
 */
defineProps<{ canEdit: boolean }>();

const items = ref<Api.StandingItem[]>([]);
const days = ref<number>(7);
const options = ref<Api.ProductOption[]>([]);
const loading = ref(false);
const searching = ref(false);
const saving = ref(false);
const adding = ref<string>();

async function load() {
  loading.value = true;
  try {
    const s = await getRestockSetting();
    items.value = s.items ?? [];
    days.value = s.days ?? 7;
  } finally {
    loading.value = false;
  }
}
onMounted(load);

let timer: ReturnType<typeof setTimeout> | undefined;
function search(keyword: string) {
  clearTimeout(timer);
  if (!keyword.trim()) return;
  timer = setTimeout(async () => {
    searching.value = true;
    try {
      options.value = await searchStandingProducts(keyword.trim());
    } finally {
      searching.value = false;
    }
  }, 300);
}
onBeforeUnmount(() => clearTimeout(timer));

const nameOf = (p: Api.ProductOption) => [p.displayName || p.name, p.code, p.specification].filter(Boolean).join(' · ');

function add(value: unknown) {
  const p = options.value.find((o) => o.id === value);
  adding.value = undefined;
  if (!p || items.value.some((i) => i.productId === p.id)) return;
  items.value = [...items.value, { productId: p.id, productName: p.displayName || p.name, samePattern: false }];
}

function remove(productId: string) {
  items.value = items.value.filter((i) => i.productId !== productId);
}

async function save() {
  saving.value = true;
  try {
    await saveRestockSetting({ days: days.value, items: items.value });
    message.success('已保存，之后订单用掉这些库存时自动补库');
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="flex flex-col gap-3">
    <h2 class="m-0 text-sm font-semibold">
      常备物料<span class="ml-2 text-xs font-normal text-muted-foreground">订单用掉这些库存后，自动下「补库」工厂订单补回来</span>
    </h2>
    <Spin :spinning="loading">
      <div class="flex flex-col gap-2">
        <p v-if="items.length === 0" class="m-0 text-xs text-muted-foreground">还没有常备物料，订单用掉库存不会补库。</p>
        <div v-for="i in items" :key="i.productId" class="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2">
          <span class="min-w-[12rem] flex-1">{{ i.productName || i.productId }}</span>
          <Checkbox
            :id="`standing-pattern-${i.productId}`"
            :checked="!!i.samePattern"
            :disabled="!canEdit"
            @update:checked="(v: boolean) => (i.samePattern = v)"
          >
            已雕刻的补同图案
          </Checkbox>
          <Button v-if="canEdit" danger size="small" type="link" @click="remove(i.productId)">移除</Button>
        </div>
        <Select
          v-if="canEdit"
          id="standing-add"
          v-model:value="adding"
          :filter-option="false"
          :loading="searching"
          :options="options.map((o) => ({ label: nameOf(o), value: o.id }))"
          class="max-w-xl"
          placeholder="搜产品中心的产品（如空白冲裁件），选中加入"
          show-search
          @search="search"
          @change="add"
        />
        <label for="standing-days" class="flex items-center gap-2 text-xs text-muted-foreground">
          补库订单交期：今天 +
          <InputNumber id="standing-days" v-model:value="days" :disabled="!canEdit" :max="365" :min="1" :precision="0" size="small" />
          天（客户订单交期近的照样先排）
        </label>
        <p class="m-0 text-xs text-muted-foreground">
          已雕刻的成品没勾「补同图案」时补同规格的空白冲裁件；找不到对应空白时补库台账里标「待配置」。
        </p>
        <div v-if="canEdit"><Button :loading="saving" type="primary" @click="save">保存常备物料</Button></div>
      </div>
    </Spin>
  </section>
</template>
