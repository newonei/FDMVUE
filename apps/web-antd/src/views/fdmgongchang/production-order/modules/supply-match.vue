<script setup lang="ts">
import type {
  FdmgongchangProductionOrderApi as Api,
  FdmgongchangSupplyMatchApi as MatchApi,
} from '#/api/fdmgongchang/production-order';

import { computed, ref, watch } from 'vue';

import { Spin, Tag } from 'ant-design-vue';

import { getSupplyMatch, getTargetOptions } from '#/api/fdmgongchang/production-order';
import { colorModeText, constructionText } from '#/views/fdmplatform/products/manufacturing';

import { textureText } from '../manufacturing';
import { num } from '../shared';

/**
 * 规格确认与库存匹配（#154）。工厂给每条明细确认结构化规格（材质、正反面色、长宽厚、压纹、图案），
 * 确认后系统按它从「已包装 → … → 板材」逆向找现成库存和已排任务，多张单按交期先后分，
 * 算出还要新做多少、每道工序要做多少；AI 排单直接用这个结果。规格缺长宽厚的明细不能排单。
 */
const props = defineProps<{ items: Api.Item[]; orderId: number }>();

const matches = ref<MatchApi.Match[]>([]);
const options = ref<MatchApi.TargetOptions>();
const loading = ref(false);

const matchByItem = computed(() => new Map(matches.value.map((m) => [m.itemId, m])));
const rows = computed(() => props.items.map((item) => ({ item, match: matchByItem.value.get(item.id) })));
const matchedRows = computed(() => rows.value.filter(({ match }) => match && !match.pending));
const stockRows = computed(() => matchedRows.value.flatMap(({ item, match }) => (match?.lines ?? []).map((line) => ({ item, line }))));
const processRows = computed(() => matchedRows.value.flatMap(({ item, match }) => (match?.processes ?? []).map((process) => ({ item, process }))));

async function load() {
  loading.value = true;
  try {
    const [m, o] = await Promise.all([
      getSupplyMatch(props.orderId),
      options.value ? Promise.resolve(options.value) : getTargetOptions(),
    ]);
    matches.value = m;
    options.value = o;
  } finally {
    loading.value = false;
  }
}

// 订单重新加载（改工艺、确认规格）后明细换了引用，匹配跟着重算
watch([() => props.orderId, () => props.items], load, { immediate: true });

function label(list: MatchApi.DictOption[] | undefined, value: null | string | undefined) {
  if (!value) return '';
  return list?.find((o) => o.value === value)?.label ?? value;
}

function doubleLayer(item: Api.Item) {
  return (item.targetConstructionType ?? (item.targetConfirmedAt ? undefined : item.targetSuggested?.constructionType)) === 'DOUBLE_LAYER';
}
const sideText = (side?: null | string) => ({ FRONT: '正面', BACK: '反面', BOTH: '正反同规格' })[side as 'FRONT'] || '';
function layerGapText(match: MatchApi.Match) {
  const layers = Object.values(match.newProductionByLayer ?? {});
  return layers.length > 0 ? layers.map((layer) => `${sideText(layer.side)} ${label(options.value?.colors, layer.color)} ${Number(layer.thickness) * 10} mm：${fmt(layer.quantity)} 片`).join('；')
    : Object.entries(match.newProductionByColor ?? {}).map(([color, quantity]) => `${label(options.value?.colors, color)} ${fmt(quantity)} 片`).join('；');
}

function confirmed(item: Api.Item) {
  return !!item.targetConfirmedAt;
}

function size(l: unknown, w: unknown, t: unknown) {
  return [l, w, t].map((v) => num(v as string)).join('×');
}

/** 已确认的规格写成一行：TPE · 粉 · 183×61×0.6cm · 正 贝壳纹 / 反 波浪纹 · 图案 哆啦A梦。 */
function targetText(item: Api.Item) {
  const o = options.value;
  const front = label(o?.colors, item.targetFrontColor);
  const back = label(o?.colors, item.targetBackColor);
  const parts = [
    label(o?.materials, item.targetMaterial),
    colorModeText({ colorMode: item.targetColorMode }),
    constructionText({ constructionType: item.targetConstructionType }),
    front === back ? front : `正 ${front} / 反 ${back}`,
    `${size(item.targetLength, item.targetWidth, item.targetThickness)}cm`,
  ];
  if (item.targetConstructionType === 'DOUBLE_LAYER') parts.push(`正面层 ${item.targetFrontThickness ?? '未维护'}cm + 反面层 ${item.targetBackThickness ?? '未维护'}cm`);
  parts.push(needs(item, 'EMBOSS') === false
    ? '无需压花'
    : `压纹 正 ${textureText(item, 'FRONT', label(o?.textures, item.targetTextureFront))} / 反 ${textureText(item, 'BACK', label(o?.textures, item.targetTextureBack))}`);
  const engrave = needs(item, 'ENGRAVE');
  const pattern = label(o?.patterns, item.targetPattern);
  if (engrave === false) parts.push('无需雕刻');
  else if (pattern) parts.push(`图案 ${pattern}`);
  else if (engrave) parts.push('按图纸雕刻');
  return parts.filter(Boolean).join(' · ');
}

function needs(item: Api.Item, process: string) {
  return !item.processes || item.processes.length === 0 ? undefined : item.processes.includes(process);
}

function fmt(v: null | number | string | undefined) {
  return num(v).toLocaleString('zh-CN', { maximumFractionDigits: 3 });
}

function processUnit(item: Api.Item, process: string) {
  if (!doubleLayer(item)) return item.unit || '成品';
  return ['CUT', 'MIX', 'SLICE'].includes(process) ? '片单层' : '条成品';
}

defineExpose({ reload: load });
</script>

<template>
  <section class="flex flex-col gap-2">
    <h3 class="m-0 text-sm font-semibold">规格与库存匹配</h3>
    <Spin :spinning="loading">
      <div class="space-y-3">
        <div class="match-table-wrap">
          <table aria-label="订单产品库存匹配" class="match-table min-w-[990px]">
            <thead>
              <tr>
                <th scope="col">产品</th>
                <th scope="col">规格状态</th>
                <th scope="col">生产规格</th>
                <th scope="col" class="amount">成品数量</th>
                <th scope="col" class="amount">待交</th>
                <th scope="col" class="amount">现成料覆盖</th>
                <th scope="col" class="amount">新做 / 缺料</th>
                <th scope="col">匹配说明</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="{ item, match } in rows" :key="item.id">
                <th scope="row">{{ item.productName }}</th>
                <td>
                  <Tag v-if="confirmed(item)" color="green" class="m-0">已确认</Tag>
                  <Tag v-else color="orange" class="m-0">未确认</Tag>
                  <div v-if="confirmed(item) && item.targetConfirmedBy" class="mt-1 text-muted-foreground">{{ item.targetConfirmedBy }}</div>
                </td>
                <td class="min-w-60">
                  <template v-if="confirmed(item)">{{ targetText(item) }}</template>
                  <span v-else class="text-muted-foreground">按规格文本解析材质、颜色、长宽厚。确认后才比对压纹、图案，并排除已雕刻库存。</span>
                </td>
                <td class="amount">{{ item.quantity == null ? '未填写' : fmt(item.quantity) }} {{ item.unit }}</td>
                <td class="amount">{{ match && !match.pending ? fmt(match.remaining) : '—' }}</td>
                <td class="amount">{{ match && !match.pending ? fmt(match.covered) : '—' }}</td>
                <td class="amount">
                  <template v-if="match && !match.pending">{{ item.processes?.[0] === 'MIX' || !item.processes?.length ? '新做' : '缺料' }} {{ fmt(match.newProduction) }}</template>
                  <template v-else>—</template>
                </td>
                <td class="min-w-40">
                  <span v-if="match?.pending" class="text-warning">{{ match.pending }}，确认前不能排单</span>
                  <span v-else-if="!match" class="text-muted-foreground">接单后计算匹配</span>
                  <template v-else>
                    <span v-if="doubleLayer(item)" class="text-muted-foreground">正反两层配齐后才计入整垫覆盖；单层缺口：{{ layerGapText(match) || '—' }}</span>
                    <details v-if="match.notes.length > 0" class="text-muted-foreground">
                      <summary class="cursor-pointer">没用上的库存</summary>
                      <ul class="m-0 pl-4"><li v-for="(note, index) in match.notes" :key="index">{{ note }}</li></ul>
                    </details>
                    <span v-if="!doubleLayer(item) && match.notes.length === 0" class="text-muted-foreground">—</span>
                  </template>
                </td>
              </tr>
              <tr v-if="rows.length === 0"><td colspan="8" class="text-center text-muted-foreground">暂无订单产品</td></tr>
            </tbody>
          </table>
        </div>
        <section v-if="stockRows.length > 0" class="space-y-2">
          <h4 class="m-0 text-sm font-medium">匹配用料</h4>
          <div class="match-table-wrap">
            <table aria-label="匹配用料" class="match-table min-w-[720px]">
              <thead>
                <tr>
                  <th scope="col">产品</th>
                  <th scope="col">料件来源</th>
                  <th scope="col">料件编码</th>
                  <th scope="col" class="amount">用量</th>
                  <th scope="col" class="amount">可覆盖数量</th>
                  <th scope="col">后续工序</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="({ item, line }, index) in stockRows" :key="`${item.id}-${index}`">
                  <th scope="row">{{ item.productName }}</th>
                  <td><Tag :color="line.source === 'TASK' ? 'blue' : line.source === 'OWN' ? 'green' : undefined" class="m-0">{{ line.source === 'TASK' ? '已排任务' : line.source === 'OWN' ? `已锁 · ${line.stageLabel}` : line.stageLabel }}</Tag></td>
                  <td>{{ line.code || '—' }}</td>
                  <td class="amount">{{ fmt(line.used) }} {{ line.unit }}</td>
                  <td class="amount">{{ fmt(line.covers) }} {{ line.color ? `${sideText(line.side)} ${label(options?.colors, line.color)}${line.thickness != null ? ` ${Number(line.thickness) * 10} mm` : ''} 单层片材` : '条成品' }}</td>
                  <td>{{ line.nextProcesses.length > 0 ? line.nextProcesses.join(' → ') : '直接交货' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <section v-if="processRows.length > 0" class="space-y-2">
          <h4 class="m-0 text-sm font-medium">各工序剩余折算需求</h4>
          <p v-if="matchedRows.some(({ item }) => doubleLayer(item))" class="m-0 text-xs text-muted-foreground">双层产品在贴合前按成品尺寸折算单层片数，贴合后按成品计。实际任务数量按板材规格换算。</p>
          <div class="match-table-wrap">
            <table aria-label="各工序剩余折算需求" class="match-table min-w-[420px]">
              <thead><tr><th scope="col">产品</th><th scope="col">工序</th><th scope="col" class="amount">折算数量</th></tr></thead>
              <tbody>
                <tr v-for="{ item, process } in processRows" :key="`${item.id}-${process.process}`">
                  <th scope="row">{{ item.productName }}</th>
                  <td>{{ process.label }}</td>
                  <td class="amount">{{ fmt(process.quantity) }} {{ processUnit(item, process.process) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Spin>
  </section>
</template>

<style scoped>
.match-table-wrap {
  overflow-x: auto;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.match-table {
  width: 100%;
  font-size: 12px;
  text-align: left;
  border-collapse: collapse;
}

.match-table thead {
  background: hsl(var(--muted) / 60%);
}

.match-table :is(th, td) {
  padding: 8px 10px;
  vertical-align: middle;
  overflow-wrap: anywhere;
  border-inline-end: 1px solid hsl(var(--border));
  border-bottom: 1px solid hsl(var(--border));
}

.match-table :is(th, td):last-child {
  border-inline-end: 0;
}

.match-table tbody tr:last-child :is(th, td) {
  border-bottom: 0;
}

.amount {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
</style>
