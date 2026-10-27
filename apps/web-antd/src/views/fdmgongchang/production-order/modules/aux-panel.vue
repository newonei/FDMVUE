<script setup lang="ts">
import type { AuxUsageDraft } from '../../shared/aux';

import type { FdmgongchangRouteApi as RouteApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Button, message, Select, Spin, Tag } from 'ant-design-vue';

import { getOrderAux, saveOrderItemAux, searchAuxProducts } from '#/api/fdmgongchang/production-order';

import { auxPayload, auxProblem, toAuxDrafts } from '../../shared/aux';
import AuxUsageEditor from '../../shared/aux-usage-editor.vue';
import { num } from '../shared';

/**
 * 采购单生成的单的辅料（只有包装辅料，在包装那道工序领）：
 * - 采购单勾选了哪些辅料，按名称对应到产品中心的辅料（第一次选了以后记住），纸箱按装箱数算每件用量，其余每件 1 个；
 * - 工厂确认、可改后保存成明细的辅料用量，开包装工序单时按用量带出建议领用数；
 * - 齐套：还要领多少、能用的库存（通用 + 这个合同的定制辅料）、送本厂还没收齐的采购；缺辅料时 AI 排单不排包装。
 */
const props = defineProps<{ editable: boolean; items: Api.Item[]; orderId: number; routeOptions?: RouteApi.Options }>();
const emit = defineEmits<{ changed: [] }>();

type Suggestion = Api.OrderAux['items'][number]['suggestions'][number];

const aux = ref<Api.OrderAux>();
const loading = ref(false);
const saving = ref(false);
const editing = ref<number>();
const drafts = ref<AuxUsageDraft[]>([]);
/** 编辑时给每个建议选的产品：名称 → 产品。 */
const picks = ref<Record<string, { id: string; name: string; unit?: null | string }>>({});
const options = ref<Record<string, Array<{ label: string; value: string }>>>({});
const found = ref<Record<string, Array<{ displayName?: null | string; id: string; name: string; unit?: null | string }>>>({});

const steps = (itemId: number) => props.items.find((i) => i.id === itemId)?.processes ?? [];

async function load() {
  loading.value = true;
  try {
    aux.value = await getOrderAux(props.orderId);
  } catch {
    aux.value = undefined;
  } finally {
    loading.value = false;
  }
}

watch(() => props.orderId, load, { immediate: true });
defineExpose({ load });

function startEdit(row: Api.OrderAux['items'][number]) {
  editing.value = row.itemId;
  drafts.value = toAuxDrafts(row.usages);
  picks.value = {};
  for (const s of row.suggestions) {
    if (s.productId) picks.value[s.name] = { id: s.productId, name: s.productName ?? s.name, unit: s.unit };
  }
  // 还没定过辅料时，已经对应好的建议直接带进来
  if (drafts.value.length === 0) {
    for (const s of row.suggestions) if (s.productId) addSuggestion(row, s);
  }
}

let timer: ReturnType<typeof setTimeout> | undefined;
onBeforeUnmount(() => clearTimeout(timer));
function search(name: string, keyword: string) {
  clearTimeout(timer);
  if (!keyword.trim()) return;
  timer = setTimeout(async () => {
    const list = await searchAuxProducts(keyword.trim()).catch(() => []);
    found.value = { ...found.value, [name]: list };
    options.value = {
      ...options.value,
      [name]: list.map((p) => ({ label: `${p.displayName || p.name}${p.code ? `（${p.code}）` : ''}`, value: p.id })),
    };
  }, 300);
}

function pick(name: string, value: unknown) {
  const p = found.value[name]?.find((x) => x.id === value);
  if (p) picks.value = { ...picks.value, [name]: { id: p.id, name: p.displayName || p.name, unit: p.unit } };
}

function addSuggestion(row: Api.OrderAux['items'][number], s: Suggestion) {
  const p = picks.value[s.name];
  if (!p) {
    message.warning(`先给「${s.name}」选对应的辅料`);
    return;
  }
  if (drafts.value.some((d) => d.productId === p.id)) return;
  drafts.value = [
    ...drafts.value,
    { perUnit: Number(s.perUnit) || 1, process: row.process, productId: p.id, productName: p.name, unit: p.unit },
  ];
}

async function save(itemId: number) {
  const problem = auxProblem(drafts.value);
  if (problem) {
    message.warning(problem);
    return;
  }
  saving.value = true;
  try {
    await saveOrderItemAux({
      itemId,
      names: Object.entries(picks.value).map(([name, p]) => ({ name, productId: p.id })),
      usages: auxPayload(drafts.value),
    });
    message.success('辅料用量已保存');
    editing.value = undefined;
    await load();
    emit('changed');
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    saving.value = false;
  }
}

const anySuggestion = computed(() => (aux.value?.items ?? []).some((i) => i.suggestions.length > 0 || i.usages.length > 0));
</script>

<template>
  <section class="flex flex-col gap-3 rounded-md border border-border p-3">
    <div class="flex flex-wrap items-center gap-2">
      <h3 class="m-0 text-sm font-semibold">辅料</h3>
      <span class="text-xs text-muted-foreground">包装时用；缺辅料时 AI 排单不排包装，前面的工序照排</span>
      <Tag v-if="aux && anySuggestion" class="m-0" :color="aux.ready ? 'green' : 'orange'">{{ aux.ready ? '齐了' : '还缺' }}</Tag>
    </div>
    <Spin :spinning="loading">
      <div v-if="aux" class="flex flex-col gap-3 text-sm">
        <p v-if="aux.accessoryNote" class="m-0 whitespace-pre-wrap text-xs">
          <span class="text-muted-foreground">采购单辅料说明：</span>{{ aux.accessoryNote }}
        </p>
        <p v-if="!anySuggestion" class="m-0 text-xs text-muted-foreground">采购单没有勾选辅料。</p>
        <div v-for="row in aux.items" :key="row.itemId" class="flex flex-col gap-2 rounded bg-muted/40 px-2.5 py-2">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span>
              {{ row.productName }}
              <span class="text-xs text-muted-foreground">
                还要做 {{ num(row.remaining) }}{{ row.unit }}<template v-if="row.processLabel"> · 在{{ row.processLabel }}领</template>
              </span>
            </span>
            <Button
              v-if="editable && editing !== row.itemId && (row.suggestions.length > 0 || row.usages.length > 0) && steps(row.itemId).length > 0"
              size="small"
              @click="startEdit(row)"
            >
              {{ row.usages.length > 0 ? '调整辅料' : '定辅料' }}
            </Button>
            <span v-else-if="editable && steps(row.itemId).length === 0" class="text-xs text-muted-foreground">先定工艺再定辅料</span>
          </div>

          <table v-if="row.usages.length > 0 && editing !== row.itemId" class="w-full text-xs">
            <thead class="text-muted-foreground">
              <tr>
                <th class="text-left font-normal">辅料</th>
                <th class="text-right font-normal">每件</th>
                <th class="text-right font-normal">还要领</th>
                <th class="text-right font-normal">库存</th>
                <th class="text-right font-normal">在途</th>
                <th class="text-right font-normal">缺</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="u in row.usages" :key="u.productId">
                <td>{{ u.productName }}<span v-if="u.processLabel" class="text-muted-foreground"> · {{ u.processLabel }}</span></td>
                <td class="text-right tabular-nums">{{ num(u.perUnit) }}</td>
                <td class="text-right tabular-nums">{{ num(u.need) }}{{ u.unit }}</td>
                <td class="text-right tabular-nums">{{ num(u.stock) }}</td>
                <td class="text-right tabular-nums">{{ num(u.inbound) }}</td>
                <td class="text-right tabular-nums" :class="num(u.shortage) > 0 ? 'text-destructive' : 'text-success'">
                  {{ num(u.shortage) > 0 ? num(u.shortage) : '齐' }}
                </td>
              </tr>
            </tbody>
          </table>
          <p v-else-if="editing !== row.itemId && row.suggestions.length > 0" class="m-0 text-xs text-warning">
            采购单要 {{ row.suggestions.map((s) => s.name).join('、') }}，还没定用量
          </p>

          <div v-if="editing === row.itemId" class="flex flex-col gap-2">
            <div v-if="row.suggestions.length > 0" class="flex flex-col gap-1.5">
              <span class="text-xs text-muted-foreground">采购单勾选的辅料（选一次对应的辅料，以后自动带出）</span>
              <div v-for="s in row.suggestions" :key="s.name" class="flex flex-wrap items-center gap-2 text-xs">
                <span class="w-24 shrink-0">{{ s.name }}<span v-if="s.remark" class="text-muted-foreground">（{{ s.remark }}）</span></span>
                <Select
                  :id="`aux-pick-${row.itemId}-${s.name}`"
                  :filter-option="false"
                  :options="options[s.name] ?? (picks[s.name] ? [{ label: picks[s.name]!.name, value: picks[s.name]!.id }] : [])"
                  :value="picks[s.name]?.id"
                  class="w-56"
                  placeholder="搜产品中心的辅料"
                  show-search
                  size="small"
                  @change="(v) => pick(s.name, v)"
                  @search="(k: string) => search(s.name, k)"
                />
                <span class="text-muted-foreground">{{ s.basis }}</span>
                <Button size="small" type="link" @click="addSuggestion(row, s)">加入</Button>
              </div>
            </div>
            <AuxUsageEditor
              :id="`aux-${row.itemId}`"
              v-model="drafts"
              :options="routeOptions"
              :search="searchAuxProducts"
              :steps="steps(row.itemId)"
            />
            <div class="flex gap-2">
              <Button :loading="saving" size="small" type="primary" @click="save(row.itemId)">保存辅料</Button>
              <Button size="small" @click="editing = undefined">取消</Button>
            </div>
          </div>
        </div>
      </div>
    </Spin>
  </section>
</template>
