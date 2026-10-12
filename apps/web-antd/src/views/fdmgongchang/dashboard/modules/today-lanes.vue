<script setup lang="ts">
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed, ref } from 'vue';
import { useRouter } from 'vue-router';

import { QRCode } from 'ant-design-vue';

import { FACTORY_ROUTES } from '../../shared/routes';
import { big, n, pct } from '../shared';

/**
 * 今天各工序：排单计划 vs 实际、谁在做、在制与库存；没排也没做的工序先收起来。
 * 右侧二维码贴在车间墙上，工人用钉钉扫码直接进手机端「我的工作台」。
 */
const props = defineProps<{ today: Api.Today }>();
const router = useRouter();
const showAll = ref(false);

const lanes = computed(() =>
  props.today.lanes.map((l) => {
    const plan = n(l.plan);
    const done = n(l.done);
    const total = done + n(l.defect);
    const percent = plan > 0 ? Math.min(100, Math.round((done / plan) * 100)) : 0;
    const rate = total > 0 ? n(l.defect) / total : 0;
    const behind = plan > 0 && percent < 50 && new Date().getHours() >= 14;
    let note = plan > 0 ? '正常' : '今天没排';
    if (behind) note = '进度落后';
    if (rate >= 0.02) note = `残次 ${pct(rate)}`;
    return { ...l, active: plan > 0 || done > 0 || l.wip > 0, note, percent, warn: behind || rate >= 0.02 };
  }),
);
const visible = computed(() => (showAll.value ? lanes.value : lanes.value.filter((l) => l.active)));
const hidden = computed(() => lanes.value.length - lanes.value.filter((l) => l.active).length);
const planDone = computed(() => {
  if (props.today.taskCount === 0) return null;
  const plan = props.today.lanes.reduce((s, l) => s + n(l.plan), 0);
  const done = props.today.lanes.reduce((s, l) => s + Math.min(n(l.done), n(l.plan)), 0);
  return plan > 0 ? done / plan : null;
});
/** 看板的人不一定有工作台权限（例如审计），这时路由里没有工作台，按固定地址生成二维码。 */
const workbenchUrl = computed(() => {
  let href = '/gongchang/workbench';
  try {
    href = router.resolve(FACTORY_ROUTES.workbench).href;
  } catch {
    // 当前账号没有工作台路由
  }
  return `${window.location.origin}${href}`;
});
</script>

<template>
  <section class="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_260px]">
    <div class="flex min-w-0 flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div class="flex flex-wrap items-baseline justify-between gap-2">
        <h2 class="m-0 text-base font-semibold">今天各工序</h2>
        <span class="text-xs text-muted-foreground">
          <template v-if="today.taskCount > 0">排单 {{ today.taskCount }} 个任务、{{ today.startedTaskCount }} 个已开工，完成 {{ pct(planDone) }}</template>
          <template v-else>今天还没有下发的排单</template>
        </span>
      </div>
      <p v-if="visible.length === 0" class="m-0 text-sm text-muted-foreground">今天各工序还没有排单，也没有人开工。</p>
      <div
        v-for="l in visible"
        :key="l.process"
        class="grid grid-cols-1 items-center gap-2 rounded-lg border border-border px-3 py-2 md:grid-cols-[110px_minmax(0,1fr)_170px]"
      >
        <div class="flex flex-col">
          <b class="text-sm">{{ l.label }}</b>
          <span class="text-xs text-muted-foreground">产出{{ l.outputLabel }}</span>
        </div>
        <div class="flex flex-col gap-1">
          <div class="flex justify-between gap-2 text-xs">
            <span>实际 <b>{{ big(l.done) }}</b><template v-if="n(l.plan) > 0"> / 计划 {{ big(l.plan) }}</template> {{ l.unit }}</span>
            <span class="truncate text-muted-foreground">{{ l.people.join(' ') || '还没人开工' }}</span>
          </div>
          <div class="h-2 overflow-hidden rounded-full bg-muted">
            <div :class="l.warn ? 'bg-warning' : 'bg-primary'" :style="{ width: `${l.percent}%` }" class="h-2"></div>
          </div>
        </div>
        <div class="flex flex-col text-xs md:items-end">
          <span>在做 {{ l.wip }} 单 · 库存 {{ big(l.stock) }} {{ l.unit }}</span>
          <span :class="l.warn ? 'font-bold text-warning' : 'text-muted-foreground'">{{ l.note }}</span>
        </div>
      </div>
      <button v-if="hidden > 0" class="self-start text-xs text-primary hover:underline" type="button" @click="showAll = !showAll">
        {{ showAll ? '收起今天没动的工序' : `还有 ${hidden} 道工序今天没排也没开工，展开` }}
      </button>
    </div>
    <div class="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center shadow-sm">
      <b class="text-sm">手机扫码进工人端</b>
      <QRCode :size="140" :value="workbenchUrl" />
      <span class="text-xs leading-relaxed text-muted-foreground">贴在车间墙上，工人用钉钉扫码直接进「我的工作台」</span>
    </div>
  </section>
</template>
