<script setup lang="ts">
import type { FdmgongchangProductionOrderApi as Api, FdmgongchangSupplyMatchApi as MatchApi } from '#/api/fdmgongchang/production-order';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Image, Spin, Tag } from 'ant-design-vue';

import { getPurchaseImage, getPurchaseSheet, getTargetOptions } from '#/api/fdmgongchang/production-order';
import ProductStructureDetails from '#/views/fdmplatform/products/components/ProductStructureDetails.vue';

import { num } from '../shared';
import ProductionSpecComparison from './production-spec-comparison.vue';
import { purchaseSheetImageIds, purchaseSheetStructure } from './purchase-sheet-structure';

/**
 * 采购单生成的工厂订单的生产要求：产品结构读取该行采购资料与下单快照，补充说明实时读取采购资料，
 * 按采购单打印出来的顺序列出每行的定制说明、包装要求、明细备注，整单的共用说明、辅料和包装步骤。
 */
const props = defineProps<{ items?: Api.Item[]; orderId: number; }>();

const sheet = ref<Api.PurchaseSheet>();
const targetOptions = ref<MatchApi.TargetOptions>();
const loading = ref(false);
const failed = ref(false);
/** 配图要带登录信息下载，转成本地地址再显示。 */
const images = ref<Record<string, string>>({});
let version = 0;

const details = computed(() => sheet.value?.details ?? {});
const rows = computed(() => {
  const bySource = new Map(props.items?.filter((item) => item.sourceLineId).map((item) => [item.sourceLineId, item]));
  return (sheet.value?.order.lines ?? []).map((line) => ({
    line, item: bySource.get(line.id),
    purchase: purchaseSheetStructure(line, details.value.lineExtras?.[line.id], targetOptions.value),
  }));
});
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
  const current = ++version;
  const orderId = props.orderId;
  loading.value = true;
  failed.value = false;
  try {
    const [freshSheet, options] = await Promise.all([getPurchaseSheet(orderId), getTargetOptions().catch(() => undefined)]);
    if (current !== version) return;
    sheet.value = freshSheet;
    targetOptions.value = options;
    await loadImages(orderId, current);
  } catch {
    if (current === version) failed.value = true;
  } finally {
    if (current === version) loading.value = false;
  }
}

async function loadImages(orderId: number, current: number) {
  const d = sheet.value?.details;
  if (!d) return;
  const ids = purchaseSheetImageIds(d);
  await Promise.all(
    ids.filter((id) => !images.value[id]).map(async (id) => {
      try {
        const blob = await getPurchaseImage(orderId, id);
        if (current !== version) return;
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
onBeforeUnmount(() => { ++version; revoke(); });

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
          <div v-for="{ line, item, purchase } in rows" :key="line.id" class="flex flex-col gap-0.5 rounded bg-muted/40 px-2.5 py-1.5">
            <span class="flex flex-wrap items-baseline justify-between gap-2">
              <span>{{ line.skuName }} <span class="text-xs text-muted-foreground">{{ line.skuCode }}</span></span>
              <span class="tabular-nums">{{ openQty(line) }} {{ line.unit }}</span>
            </span>
            <span class="text-xs"><span class="text-muted-foreground">采购规格原文：</span>{{ line.specification || '未记录' }}</span>
            <ProductionSpecComparison v-if="item?.targetConfirmedAt" :item="item" :purchase="purchase" :options="targetOptions" />
            <p v-else-if="item" class="m-0 text-xs text-orange-700">工厂执行规格待确认</p>
            <p v-else-if="items?.length && openQty(line) > 0" class="m-0 text-xs text-orange-700">此采购行缺少对应的工厂明细</p>
            <span class="mt-1 text-xs font-medium">采购来源规格</span>
            <ProductStructureDetails :value="purchase" :expanded="!item?.targetConfirmedAt" />
            <span v-if="extraText(line.id)" class="text-xs text-muted-foreground">{{ extraText(line.id) }}</span>
            <span v-if="lineNote(line.id)" class="text-xs text-warning">备注：{{ lineNote(line.id) }}</span>
            <Image
              v-if="details.lineExtras?.[line.id]?.imageId && images[details.lineExtras[line.id]!.imageId!]"
              :src="images[details.lineExtras[line.id]!.imageId!]"
              :width="72"
              class="rounded"
            />
            <div v-if="details.lineExtras?.[line.id]?.colorImageId" class="mt-1 flex flex-col items-start gap-1">
              <span class="text-xs text-muted-foreground">供应商实物色号图</span>
              <Image v-if="images[details.lineExtras[line.id]!.colorImageId!]" :src="images[details.lineExtras[line.id]!.colorImageId!]" :width="96" class="rounded" />
              <span v-else class="text-xs text-muted-foreground">色号图暂时无法读取</span>
            </div>
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
