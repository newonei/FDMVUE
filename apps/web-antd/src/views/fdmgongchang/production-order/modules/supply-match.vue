<script setup lang="ts">
import type {
  FdmgongchangProductionOrderApi as Api,
  FdmgongchangSupplyMatchApi as MatchApi,
} from '#/api/fdmgongchang/production-order';

import { computed, reactive, ref, watch } from 'vue';

import { Alert, Button, InputNumber, message, Modal, Select, Spin, Tag } from 'ant-design-vue';

import { getSupplyMatch, getTargetOptions, saveItemTarget } from '#/api/fdmgongchang/production-order';

import { num } from '../shared';

/**
 * 规格确认与库存匹配（#154）。工厂给每条明细确认结构化规格（材质、正反面色、长宽厚、压纹、图案），
 * 确认后系统按它从「已包装 → … → 板材」逆向找现成库存和已排任务，多张单按交期先后分，
 * 算出还要新做多少、每道工序要做多少；AI 排单直接用这个结果。规格缺长宽厚的明细不能排单。
 */
const props = defineProps<{ editable: boolean; items: Api.Item[]; orderId: number }>();
const emit = defineEmits<{ changed: [] }>();

const matches = ref<MatchApi.Match[]>([]);
const options = ref<MatchApi.TargetOptions>();
const loading = ref(false);
const saving = ref(false);
const editing = ref<Api.Item>();
/** 弹窗表单：下拉和数字框只认 undefined，不认 null。 */
interface TargetForm {
  backColor?: string;
  frontColor?: string;
  itemId?: number;
  length?: number;
  material?: string;
  pattern?: string;
  textureBack?: string;
  textureFront?: string;
  thickness?: number;
  width?: number;
}
const form = reactive<TargetForm>({});

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
    front === back ? front : `正 ${front} / 反 ${back}`,
    `${size(item.targetLength, item.targetWidth, item.targetThickness)}cm`,
  ];
  if (item.targetTextureFront || item.targetTextureBack) {
    parts.push(`压纹 正 ${label(o?.textures, item.targetTextureFront) || '无'} / 反 ${label(o?.textures, item.targetTextureBack) || '无'}`);
  }
  parts.push(item.targetPattern ? `图案 ${label(o?.patterns, item.targetPattern)}` : '不雕刻');
  return parts.filter(Boolean).join(' · ');
}

function needs(item: Api.Item, process: string) {
  return !item.processes || item.processes.length === 0 ? undefined : item.processes.includes(process);
}

function numOrUndefined(v: null | number | string | undefined) {
  return v === null || v === undefined || v === '' ? undefined : num(v);
}

function openEdit(item: Api.Item) {
  const src: MatchApi.TargetReq = confirmed(item)
    ? {
        backColor: item.targetBackColor,
        frontColor: item.targetFrontColor,
        length: item.targetLength,
        material: item.targetMaterial,
        pattern: item.targetPattern,
        textureBack: item.targetTextureBack,
        textureFront: item.targetTextureFront,
        thickness: item.targetThickness,
        width: item.targetWidth,
      }
    : { ...item.targetSuggested };
  Object.assign(form, {
    backColor: src.backColor ?? undefined,
    frontColor: src.frontColor ?? undefined,
    itemId: item.id,
    length: numOrUndefined(src.length),
    material: src.material ?? undefined,
    pattern: src.pattern ?? undefined,
    textureBack: src.textureBack ?? undefined,
    textureFront: src.textureFront ?? undefined,
    thickness: numOrUndefined(src.thickness),
    width: numOrUndefined(src.width),
  });
  editing.value = item;
}

async function save() {
  if (!form.material || !form.frontColor || form.length === 0 || !form.width || !form.thickness) {
    message.warning('材质、颜色、长宽厚必填');
    return;
  }
  const item = editing.value;
  if (item && needs(item, 'EMBOSS') === false) {
    form.textureFront = undefined;
    form.textureBack = undefined;
  }
  if (item && needs(item, 'ENGRAVE') === false) {
    form.pattern = undefined;
  }
  saving.value = true;
  try {
    await saveItemTarget({ ...form });
    message.success('规格已确认');
    editing.value = undefined;
    emit('changed');
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    saving.value = false;
  }
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
            <Button v-if="editable" size="small" @click="openEdit(item)">{{ confirmed(item) ? '改规格' : '确认规格' }}</Button>
          </div>
          <p class="m-0 text-xs">
            <Tag v-if="confirmed(item)" color="green">已确认</Tag>
            <Tag v-else color="orange">未确认</Tag>
            <template v-if="confirmed(item)">
              {{ targetText(item) }}
              <span class="text-muted-foreground">（{{ item.targetConfirmedBy }}）</span>
            </template>
            <span v-else class="text-muted-foreground">按规格文本解析，只比对材质、颜色、长宽厚；确认后才比对压纹、图案，也不会用已雕刻的库存</span>
          </p>

          <template v-if="matchByItem.get(item.id)">
            <Alert v-if="matchByItem.get(item.id)!.pending" type="warning" show-icon :message="`${matchByItem.get(item.id)!.pending}，确认前不能排单`" />
            <template v-else>
              <p class="m-0 text-sm">
                还要交 <b class="tabular-nums">{{ fmt(matchByItem.get(item.id)!.remaining) }}</b>：
                现成料覆盖 <b class="tabular-nums">{{ fmt(matchByItem.get(item.id)!.covered) }}</b>，
                {{ item.processes?.[0] === 'MIX' || !item.processes?.length ? '新做' : '缺料' }}
                <b class="tabular-nums">{{ fmt(matchByItem.get(item.id)!.newProduction) }}</b>
              </p>
              <table v-if="matchByItem.get(item.id)!.lines.length > 0" class="w-full text-xs">
                <thead class="text-muted-foreground">
                  <tr>
                    <th class="py-1 text-left font-normal">用哪份料</th>
                    <th class="py-1 text-right font-normal">用量</th>
                    <th class="py-1 text-right font-normal">折成品</th>
                    <th class="py-1 text-left font-normal pl-3">后面还要做</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(l, index) in matchByItem.get(item.id)!.lines" :key="index" class="border-t border-border">
                    <td class="py-1">
                      <Tag :color="l.source === 'TASK' ? 'blue' : undefined">{{ l.source === 'TASK' ? '已排任务' : l.stageLabel }}</Tag>
                      {{ l.code }}
                    </td>
                    <td class="py-1 text-right tabular-nums">{{ fmt(l.used) }} {{ l.unit }}</td>
                    <td class="py-1 text-right tabular-nums">{{ fmt(l.covers) }}</td>
                    <td class="py-1 pl-3">{{ l.nextProcesses.length > 0 ? l.nextProcesses.join(' → ') : '直接交货' }}</td>
                  </tr>
                </tbody>
              </table>
              <p class="m-0 text-xs text-muted-foreground">
                各工序要做（折成品）：
                <template v-for="(p, index) in matchByItem.get(item.id)!.processes" :key="p.process">
                  <template v-if="index > 0"> · </template>{{ p.label }} {{ fmt(p.quantity) }}
                </template>
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

    <Modal
      :open="!!editing"
      :confirm-loading="saving"
      ok-text="确认规格"
      :title="`确认规格 · ${editing?.productName ?? ''}`"
      @cancel="editing = undefined"
      @ok="save"
    >
      <p v-if="editing" class="mt-0 text-xs text-muted-foreground">
        订单写的：{{ [editing.specification, editing.size, editing.material, editing.color].filter(Boolean).join(' / ') || '无' }}
      </p>
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label for="target-material" class="flex flex-col gap-1 text-xs text-muted-foreground">
          材质
          <Select id="target-material" v-model:value="form.material" :options="options?.materials" show-search option-filter-prop="label" />
        </label>
        <div class="hidden sm:block"></div>
        <label for="target-front" class="flex flex-col gap-1 text-xs text-muted-foreground">
          正面色
          <Select id="target-front" v-model:value="form.frontColor" :options="options?.colors" show-search option-filter-prop="label" />
        </label>
        <label for="target-back" class="flex flex-col gap-1 text-xs text-muted-foreground">
          反面色（单色不填）
          <Select id="target-back" v-model:value="form.backColor" allow-clear :options="options?.colors" show-search option-filter-prop="label" />
        </label>
        <div class="grid grid-cols-3 gap-2 sm:col-span-2">
          <label for="target-length" class="flex flex-col gap-1 text-xs text-muted-foreground">
            长 cm
            <InputNumber id="target-length" v-model:value="form.length" :min="0.01" :max="9999.99" class="w-full" />
          </label>
          <label for="target-width" class="flex flex-col gap-1 text-xs text-muted-foreground">
            宽 cm
            <InputNumber id="target-width" v-model:value="form.width" :min="0.01" :max="9999.99" class="w-full" />
          </label>
          <label for="target-thickness" class="flex flex-col gap-1 text-xs text-muted-foreground">
            厚 cm
            <InputNumber id="target-thickness" v-model:value="form.thickness" :min="0.01" :max="9999.99" class="w-full" />
          </label>
        </div>
        <label for="target-tf" class="flex flex-col gap-1 text-xs text-muted-foreground">
          正面压纹{{ editing && needs(editing, 'EMBOSS') === false ? '（工艺没有压花）' : '' }}
          <Select
            id="target-tf"
            v-model:value="form.textureFront"
            allow-clear
            :disabled="!!editing && needs(editing, 'EMBOSS') === false"
            :options="options?.textures"
            placeholder="不压"
          />
        </label>
        <label for="target-tb" class="flex flex-col gap-1 text-xs text-muted-foreground">
          反面压纹
          <Select
            id="target-tb"
            v-model:value="form.textureBack"
            allow-clear
            :disabled="!!editing && needs(editing, 'EMBOSS') === false"
            :options="options?.textures"
            placeholder="不压"
          />
        </label>
        <label for="target-pattern" class="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
          雕刻图案{{ editing && needs(editing, 'ENGRAVE') === false ? '（工艺没有雕刻）' : editing && needs(editing, 'ENGRAVE') ? '（必选）' : '' }}
          <Select
            id="target-pattern"
            v-model:value="form.pattern"
            allow-clear
            :disabled="!!editing && needs(editing, 'ENGRAVE') === false"
            :options="options?.patterns"
            placeholder="不雕刻"
            show-search
            option-filter-prop="label"
          />
        </label>
      </div>
    </Modal>
  </section>
</template>
