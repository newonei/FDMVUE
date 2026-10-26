<script setup lang="ts">
import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Image, Spin, Tag } from 'ant-design-vue';

import { getPurchaseImage, getPurchaseSheet } from '#/api/fdmgongchang/production-order';

import { num } from '../shared';

/**
 * 采购单生成的工厂订单的生产要求：实时读采购单的下单资料（采购员改了这里跟着变），
 * 按采购单打印出来的顺序列出每行的定制说明、包装要求、明细备注，整单的共用说明、辅料和包装步骤。
 */
const props = defineProps<{ orderId: number }>();

const sheet = ref<Api.PurchaseSheet>();
const loading = ref(false);
const failed = ref(false);
/** 配图要带登录信息下载，转成本地地址再显示。 */
const images = ref<Record<string, string>>({});

const details = computed(() => sheet.value?.details ?? {});
const checkedAccessories = computed(() => (details.value.accessories ?? []).filter((a) => a.checked));
const steps = computed(() => details.value.packagingSteps ?? []);
const shared = computed(() => details.value.sharedColumns ?? []);
const empty = computed(
  () =>
    !details.value.accessoryNote &&
    checkedAccessories.value.length === 0 &&
    steps.value.length === 0 &&
    shared.value.length === 0 &&
    (sheet.value?.order.lines ?? []).every((l) => !l.printing && !l.packaging && !lineNote(l.id) && !extraText(l.id)),
);

async function load() {
  loading.value = true;
  failed.value = false;
  try {
    sheet.value = await getPurchaseSheet(props.orderId);
    await loadImages();
  } catch {
    failed.value = true;
  } finally {
    loading.value = false;
  }
}

async function loadImages() {
  const d = sheet.value?.details;
  if (!d) return;
  const ids = new Set<string>();
  for (const s of [...(d.packagingSteps ?? []), ...(d.sharedColumns ?? [])]) for (const id of s.imageIds ?? []) ids.add(id);
  for (const e of Object.values(d.lineExtras ?? {})) if (e.imageId) ids.add(e.imageId);
  await Promise.all(
    [...ids].filter((id) => !images.value[id]).map(async (id) => {
      try {
        const blob = await getPurchaseImage(props.orderId, id);
        images.value = { ...images.value, [id]: URL.createObjectURL(blob) };
      } catch {
        // 图片读不到就不显示，不影响文字要求
      }
    }),
  );
}

function revoke() {
  for (const url of Object.values(images.value)) URL.revokeObjectURL(url);
  images.value = {};
}

watch(
  () => props.orderId,
  () => {
    revoke();
    load();
  },
  { immediate: true },
);
onBeforeUnmount(revoke);

function lineNote(lineId: string) {
  return details.value.lineNotes?.[lineId]?.remark ?? '';
}

function extraText(lineId: string) {
  const e = details.value.lineExtras?.[lineId];
  if (!e) return '';
  return [
    e.customerColor && `客户颜色：${e.customerColor}`,
    e.weight && `克重：${e.weight}`,
    e.model && `型号：${e.model}`,
    e.packQty && `装箱数：${e.packQty}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function openQty(line: Api.PurchaseSheet['order']['lines'][number]) {
  return num(line.quantity) - num(line.cancelledQuantity);
}
</script>

<template>
  <section class="flex flex-col gap-3 rounded-md border border-border p-3">
    <div class="flex flex-wrap items-center gap-2">
      <h3 class="m-0 text-sm font-semibold">生产要求</h3>
      <span class="text-xs text-muted-foreground">采购单下单资料，采购员改了这里跟着变</span>
      <Tag v-if="details.status" class="m-0" :color="details.status === 'CONFIRMED' ? 'green' : 'default'">
        {{ details.status === 'CONFIRMED' ? '已确认' : '采购员还在编辑' }}<template v-if="(details.revision ?? 1) > 1"> · 第 {{ details.revision }} 版</template>
      </Tag>
    </div>
    <Spin :spinning="loading">
      <p v-if="failed" class="m-0 text-xs text-destructive">采购单资料没有读出来，稍后再打开试试。</p>
      <div v-else-if="sheet" class="flex flex-col gap-3 text-sm">
        <p v-if="details.deliveryAddress" class="m-0 text-xs">
          <span class="text-muted-foreground">交货地址：</span>{{ details.deliveryAddress }}
        </p>

        <div class="flex flex-col gap-2">
          <div v-for="line in sheet.order.lines" :key="line.id" class="flex flex-col gap-0.5 rounded bg-muted/40 px-2.5 py-1.5">
            <span class="flex flex-wrap items-baseline justify-between gap-2">
              <span>{{ line.skuName }} <span class="text-xs text-muted-foreground">{{ line.skuCode }}</span></span>
              <span class="tabular-nums">{{ openQty(line) }} {{ line.unit }}</span>
            </span>
            <span v-if="line.printing" class="text-xs"><span class="text-muted-foreground">定制说明：</span>{{ line.printing }}</span>
            <span v-if="line.packaging" class="text-xs"><span class="text-muted-foreground">包装要求：</span>{{ line.packaging }}</span>
            <span v-if="extraText(line.id)" class="text-xs text-muted-foreground">{{ extraText(line.id) }}</span>
            <span v-if="lineNote(line.id)" class="text-xs text-warning">备注：{{ lineNote(line.id) }}</span>
            <Image
              v-if="details.lineExtras?.[line.id]?.imageId && images[details.lineExtras[line.id]!.imageId!]"
              :src="images[details.lineExtras[line.id]!.imageId!]"
              :width="72"
              class="rounded"
            />
          </div>
        </div>

        <div v-for="col in shared" :key="col.title" class="flex flex-col gap-1">
          <span class="text-xs font-medium">{{ col.title }}</span>
          <p v-if="col.text" class="m-0 whitespace-pre-wrap text-xs">{{ col.text }}</p>
          <div v-if="(col.imageIds ?? []).length > 0" class="flex flex-wrap gap-2">
            <template v-for="id in col.imageIds" :key="id">
              <Image v-if="images[id]" :src="images[id]" :width="96" class="rounded" />
            </template>
          </div>
        </div>

        <div v-if="details.accessoryNote || checkedAccessories.length > 0" class="flex flex-col gap-1">
          <span class="text-xs font-medium">辅料（包装时用）</span>
          <p v-if="details.accessoryNote" class="m-0 whitespace-pre-wrap text-xs">{{ details.accessoryNote }}</p>
          <div v-if="checkedAccessories.length > 0" class="flex flex-wrap gap-1">
            <Tag v-for="a in checkedAccessories" :key="a.name" class="m-0">
              {{ a.name }}<template v-if="a.remark">：{{ a.remark }}</template>
            </Tag>
          </div>
        </div>

        <div v-if="steps.length > 0" class="flex flex-col gap-2">
          <span class="text-xs font-medium">包装步骤</span>
          <div v-for="(step, index) in steps" :key="index" class="flex flex-col gap-1">
            <span class="text-xs">{{ index + 1 }}. {{ step.title }}</span>
            <p v-if="step.text" class="m-0 whitespace-pre-wrap text-xs text-muted-foreground">{{ step.text }}</p>
            <div v-if="(step.imageIds ?? []).length > 0" class="flex flex-wrap gap-2">
              <template v-for="id in step.imageIds" :key="id">
                <Image v-if="images[id]" :src="images[id]" :width="96" class="rounded" />
              </template>
            </div>
          </div>
        </div>

        <p v-if="empty" class="m-0 text-xs text-muted-foreground">采购单没有写定制、包装或辅料要求。</p>
      </div>
    </Spin>
  </section>
</template>
