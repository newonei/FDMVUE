<script setup lang="ts">
import type {
  FdmgongchangProductionOrderApi as Api,
  FdmgongchangSupplyMatchApi as MatchApi,
} from '#/api/fdmgongchang/production-order';

import { computed, ref, watch } from 'vue';

import { Alert, Spin, Tag } from 'ant-design-vue';

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
function layerGapText(item: Api.Item) {
  const match = matchByItem.value.get(item.id);
  const layers = Object.values(match?.newProductionByLayer ?? {});
  return layers.length > 0 ? layers.map((layer) => `${sideText(layer.side)} ${label(options.value?.colors, layer.color)} ${Number(layer.thickness) * 10} mm：${fmt(layer.quantity)} 片`).join('；')
    : Object.entries(match?.newProductionByColor ?? {}).map(([color, quantity]) => `${label(options.value?.colors, color)} ${fmt(quantity)} 片`).join('；');
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

defineExpose({ reload: load });
</script>

<template>
  <section class="flex flex-col gap-2">
    <h3 class="m-0 text-sm font-semibold">规格与库存匹配</h3>
    <Spin :spinning="loading">
      <div class="flex flex-col gap-3">
        <div v-for="item in items" :key="item.id" class="flex flex-col gap-2 rounded-md border border-border p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="font-medium">{{ item.productName }}</span>
          </div>
          <p class="m-0 text-xs">
            <Tag v-if="confirmed(item)" color="green">已确认</Tag>
            <Tag v-else color="orange">未确认</Tag>
            <template v-if="confirmed(item)">
              {{ targetText(item) }}
              <span v-if="item.targetConfirmedBy" class="text-muted-foreground">（{{ item.targetConfirmedBy }}）</span>
            </template>
            <span v-else class="text-muted-foreground">按规格文本解析，只比对材质、颜色、长宽厚；确认后才比对压纹、图案，也不会用已雕刻的库存</span>
          </p>
          <p class="m-0 text-sm">成品数量 <b class="tabular-nums">{{ item.quantity == null ? '未填写' : fmt(item.quantity) }}</b> {{ item.unit }}</p>

          <template v-if="matchByItem.get(item.id)">
            <Alert v-if="matchByItem.get(item.id)!.pending" type="warning" show-icon :message="`${matchByItem.get(item.id)!.pending}，确认前不能排单`" />
            <template v-else>
              <p class="m-0 text-sm">
                还要交 <b class="tabular-nums">{{ fmt(matchByItem.get(item.id)!.remaining) }}</b>：
                现成料覆盖 <b class="tabular-nums">{{ fmt(matchByItem.get(item.id)!.covered) }}</b>，
                {{ item.processes?.[0] === 'MIX' || !item.processes?.length ? '新做' : '缺料' }}
                <b class="tabular-nums">{{ fmt(matchByItem.get(item.id)!.newProduction) }}</b>
              </p>
              <p v-if="doubleLayer(item)" class="m-0 text-xs text-muted-foreground">
                正反两层配齐后才计入整垫覆盖；单层缺口：{{ layerGapText(item) }}
              </p>
              <table v-if="matchByItem.get(item.id)!.lines.length > 0" class="w-full text-xs">
                <thead class="text-muted-foreground">
                  <tr>
                    <th class="py-1 text-left font-normal">用哪份料</th>
                    <th class="py-1 text-right font-normal">用量</th>
                    <th class="py-1 text-right font-normal">可覆盖数量</th>
                    <th class="py-1 text-left font-normal pl-3">后面还要做</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(l, index) in matchByItem.get(item.id)!.lines" :key="index" class="border-t border-border">
                    <td class="py-1">
                      <Tag :color="l.source === 'TASK' ? 'blue' : l.source === 'OWN' ? 'green' : undefined">
                        {{ l.source === 'TASK' ? '已排任务' : l.source === 'OWN' ? `已锁 · ${l.stageLabel}` : l.stageLabel }}
                      </Tag>
                      {{ l.code }}
                    </td>
                    <td class="py-1 text-right tabular-nums">{{ fmt(l.used) }} {{ l.unit }}</td>
                    <td class="py-1 text-right tabular-nums">{{ fmt(l.covers) }} {{ l.color ? `${sideText(l.side)} ${label(options?.colors, l.color)}${l.thickness != null ? ` ${Number(l.thickness) * 10} mm` : ''} 单层片材` : '条成品' }}</td>
                    <td class="py-1 pl-3">{{ l.nextProcesses.length > 0 ? l.nextProcesses.join(' → ') : '直接交货' }}</td>
                  </tr>
                </tbody>
              </table>
              <p class="m-0 text-xs text-muted-foreground">
                各工序剩余折算需求{{ doubleLayer(item) ? '（贴合前折算为成品尺寸的单层片数，贴合后按成品）' : '（折成品）' }}：
                <template v-for="(p, index) in matchByItem.get(item.id)!.processes" :key="p.process">
                  <template v-if="index > 0"> · </template>{{ p.label }} {{ fmt(p.quantity) }}<template v-if="doubleLayer(item)">{{ ['MIX', 'SLICE', 'CUT'].includes(p.process) ? ' 片单层' : ' 条成品' }}</template>
                </template>
                <span v-if="doubleLayer(item)" class="mt-1 block">实际任务数量按板材规格换算。</span>
              </p>
              <details v-if="matchByItem.get(item.id)!.notes.length > 0" class="text-xs text-muted-foreground">
                <summary class="cursor-pointer">没用上的库存</summary>
                <ul class="m-0 pl-4">
                  <li v-for="n in matchByItem.get(item.id)!.notes" :key="n">{{ n }}</li>
                </ul>
              </details>
            </template>
          </template>
          <p v-else class="m-0 text-xs text-muted-foreground">接单后按本厂库存和已排任务计算匹配。</p>
        </div>
      </div>
    </Spin>
</section>
</template>
