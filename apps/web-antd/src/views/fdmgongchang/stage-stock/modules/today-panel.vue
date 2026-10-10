<script setup lang="ts">
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { formatDateTime } from '@vben/utils';

import { QRCode, Spin } from 'ant-design-vue';

import { getStageStockToday } from '#/api/fdmgongchang/stage-stock';

import { formatQty, formatRate } from '../model';

/**
 * 今日生产：管理员先看今天——各工序计划与实际、在做的单、库存，以及需要处理的事。
 * 右下角二维码贴在车间，工人用钉钉扫码直接进手机端「我的工作台」。
 */
const props = defineProps<{ refreshKey: number }>();
const emit = defineEmits<{ orders: [] }>();
const router = useRouter();

const today = ref<Api.Today>();
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    today.value = await getStageStockToday();
  } finally {
    loading.value = false;
  }
}
watch(() => props.refreshKey, load, { immediate: true });

const progress = computed(() => {
  const t = today.value;
  if (!t || t.taskCount === 0) return null;
  const plan = t.lanes.reduce((s, l) => s + Number(l.plan), 0);
  const done = t.lanes.reduce((s, l) => s + Math.min(Number(l.done), Number(l.plan)), 0);
  return plan > 0 ? done / plan : null;
});
const defectRate = computed(() => {
  const g = Number(today.value?.goodTotal ?? 0);
  const d = Number(today.value?.defectTotal ?? 0);
  return g + d > 0 ? d / (g + d) : null;
});
const lanes = computed(() =>
  (today.value?.lanes ?? []).map((l) => {
    const plan = Number(l.plan);
    const done = Number(l.done);
    const pct = plan > 0 ? Math.min(100, Math.round((done / plan) * 100)) : 0;
    const total = done + Number(l.defect);
    const rate = total > 0 ? Number(l.defect) / total : 0;
    const behind = plan > 0 && pct < 50 && new Date().getHours() >= 14;
    let note = plan > 0 ? '正常' : '今天没排';
    if (behind) note = '进度落后';
    if (rate >= 0.02) note = `残次 ${formatRate(rate)}`;
    return { ...l, note, pct, warn: behind || rate >= 0.02 };
  }),
);
const workbenchUrl = computed(() => `${window.location.origin}${router.resolve('/gongchang/workbench').href}`);
const go = (path: string) => router.push(path);
</script>

<template>
  <Spin :spinning="loading">
    <div v-if="today" class="flex flex-col gap-5 pt-1">
      <section class="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div class="flex flex-col gap-1 rounded-xl border border-border p-4">
          <span class="text-xs text-muted-foreground">今天排单完成</span>
          <span class="text-3xl font-black">{{ progress === null ? '—' : formatRate(progress) }}</span>
          <span class="text-xs text-muted-foreground">
            {{ today.taskCount > 0 ? `${today.taskCount} 个任务，${today.startedTaskCount} 个已开工` : '今天还没有下发的排单' }}
          </span>
        </div>
        <div class="flex flex-col gap-1 rounded-xl border border-border p-4">
          <span class="text-xs text-muted-foreground">车间在做的单</span>
          <span class="text-3xl font-black">{{ today.wipCount }}</span>
          <span :class="today.staleOrders.length > 0 ? 'text-warning' : 'text-muted-foreground'" class="text-xs">
            {{ today.staleOrders.length > 0 ? `${today.staleOrders.length} 张领料超过 8 小时没报数量` : '没有超时的单' }}
          </span>
        </div>
        <div class="flex flex-col gap-1 rounded-xl border border-border p-4">
          <span class="text-xs text-muted-foreground">本月待确认报工</span>
          <span class="text-3xl font-black">{{ today.pendingRecords }}</span>
          <button class="self-start text-xs font-bold text-primary hover:underline" type="button" @click="go('/gongchang/wage')">去计件工资确认</button>
        </div>
        <div class="flex flex-col gap-1 rounded-xl border border-border p-4">
          <span class="text-xs text-muted-foreground">今天残次率</span>
          <span class="text-3xl font-black">{{ defectRate === null ? '—' : formatRate(defectRate) }}</span>
          <span class="text-xs text-muted-foreground">良品 {{ formatQty(today.goodTotal) }} · 残次 {{ formatQty(today.defectTotal) }}</span>
        </div>
      </section>

      <div class="flex flex-wrap items-start gap-5">
        <section class="flex min-w-0 flex-[999_1_560px] flex-col gap-2.5">
          <h3 class="m-0 text-sm font-semibold">各工序今天的进度</h3>
          <div
            v-for="l in lanes"
            :key="l.process"
            class="grid grid-cols-1 items-center gap-3 rounded-xl border border-border px-4 py-3 md:grid-cols-[120px_minmax(0,1fr)_180px]"
          >
            <div class="flex flex-col">
              <b>{{ l.label }}</b>
              <span class="text-xs text-muted-foreground">产出{{ l.outputLabel }}</span>
            </div>
            <div class="flex flex-col gap-1.5">
              <div class="flex justify-between gap-2 text-xs">
                <span>实际 <b>{{ formatQty(l.done) }}</b><template v-if="Number(l.plan) > 0"> / 计划 {{ formatQty(l.plan) }}</template> {{ l.unit }}</span>
                <span class="truncate text-muted-foreground">{{ l.people.join(' ') || '还没人开工' }}</span>
              </div>
              <div class="h-2.5 overflow-hidden rounded-full bg-muted">
                <div :class="l.warn ? 'bg-warning' : 'bg-primary'" :style="{ width: `${Number(l.plan) > 0 ? l.pct : 0}%` }" class="h-2.5"></div>
              </div>
            </div>
            <div class="flex flex-col gap-0.5 text-xs md:items-end">
              <span>在做 {{ l.wip }} 单 · 库存 {{ formatQty(l.stock) }} {{ l.unit }}</span>
              <span :class="l.warn ? 'font-bold text-warning' : 'text-muted-foreground'">{{ l.note }}</span>
            </div>
          </div>
        </section>

        <aside class="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5">
          <h3 class="m-0 text-sm font-semibold">需要你处理</h3>
          <div v-for="s in today.shortages" :key="s.process" class="flex flex-col gap-1 rounded-xl border-2 border-warning p-4">
            <b>{{ s.label }}明天可能缺料</b>
            <span class="text-xs leading-relaxed text-muted-foreground">明天排了 {{ formatQty(s.planned) }} {{ s.unit }}，{{ s.sourceLabel }}现在只有 {{ formatQty(s.available) }} {{ s.unit }}</span>
            <button class="self-start text-xs font-bold text-primary hover:underline" type="button" @click="go('/gongchang/schedule')">去 AI 排单调整</button>
          </div>
          <div v-for="o in today.staleOrders" :key="o.id" class="flex flex-col gap-1 rounded-xl border border-border p-4">
            <b>{{ o.operatorName || '有人' }} 领料很久没报数量</b>
            <span class="text-xs text-muted-foreground">{{ o.orderNo }} · 已领 {{ formatQty(o.inputQuantity) }} {{ o.unit }} · {{ formatDateTime(o.issuedAt ?? undefined) }}</span>
            <button class="self-start text-xs font-bold text-primary hover:underline" type="button" @click="emit('orders')">看工序单</button>
          </div>
          <div v-if="today.unassignedWorkers > 0" class="flex flex-col gap-1 rounded-xl border border-border p-4">
            <b>{{ today.unassignedWorkers }} 个人还没分配岗位</b>
            <span class="text-xs text-muted-foreground">没分岗位的人在手机上看不到要做的活</span>
            <button class="self-start text-xs font-bold text-primary hover:underline" type="button" @click="go('/gongchang/worker')">去人员岗位</button>
          </div>
          <p v-if="today.shortages.length === 0 && today.staleOrders.length === 0 && today.unassignedWorkers === 0" class="m-0 rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
            暂时没有要处理的事。
          </p>
          <div class="flex flex-col gap-2 rounded-xl border border-border p-4">
            <b>手机扫码进工人端</b>
            <QRCode :size="128" :value="workbenchUrl" />
            <span class="text-xs leading-relaxed text-muted-foreground">贴在车间墙上，工人用钉钉扫码直接进「我的工作台」</span>
          </div>
        </aside>
      </div>
    </div>
  </Spin>
</template>
