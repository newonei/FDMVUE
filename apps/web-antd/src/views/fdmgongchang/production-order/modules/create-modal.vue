<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { AuxUsageDraft } from '../../shared/auxiliary-usage';
import type { RouteDraft } from '../shared';

import type { FdmgongchangRouteApi as RouteApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { AutoComplete, DatePicker, Empty, Input, InputNumber, Modal, Select, Spin } from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  createProductionOrder,
  getLastRoute,
  getRouteOptions,
  searchAuxProducts,
  searchOrderProducts,
} from '#/api/fdmgongchang/production-order';

import AuxUsageEditor from '../../shared/aux-usage-editor.vue';
import { auxPayload, auxProblem, toAuxDrafts } from '../../shared/auxiliary-usage';
import { routeProblem, sortSteps, specText } from '../shared';
import RoutePicker from './route-picker.vue';

/**
 * 向工厂下单：选工厂、交期，从产品中心搜 SKU 加到明细里填数量，并为每个产品定好要走的工序（工艺由下单人决定，工厂只能退回）
 * 和要用的辅料（每件用量，开工序单时按用量带出领用数）。
 * 产品规格以下单这一刻的产品档案为准，之后产品改了不影响这张单。
 * copyFrom：从「我提的需求」复制（例如被退回后改一改重新提交），带出工厂、用途、备注和产品数量，交期重新选。
 */
const props = defineProps<{ copyFrom?: Api.Order; factories: Api.Factory[] }>();
const emit = defineEmits<{ created: [id: number] }>();
const open = defineModel<boolean>('open', { required: true });

interface Line {
  aux: AuxUsageDraft[];
  product: Api.Product;
  quantity: null | number;
  remark: string;
  route: RouteDraft;
}

const PURPOSES = ['电商备货', '客户订单', '样品', '补货'].map((value) => ({ value }));

const factoryId = ref<number>();
const requiredDate = ref<Dayjs>();
const purpose = ref('');
const remark = ref('');
const lines = ref<Line[]>([]);
const keyword = ref('');
const results = ref<Api.Product[]>([]);
const searching = ref(false);
const searched = ref(false);
const submitting = ref(false);
const error = ref('');
const routeOptions = ref<RouteApi.Options>();
const routeLoading = ref(false);

const factoryOptions = computed(() => props.factories.map((f) => ({ label: f.name, value: f.id })));
const pickedIds = computed(() => new Set(lines.value.map((l) => l.product.id)));

function fromSnapshot(i: Api.Item): Api.Product {
  return {
    code: i.productCode,
    color: i.color,
    displayName: i.productName,
    id: i.productId,
    material: i.material,
    name: i.productName,
    packaging: i.packaging,
    printing: i.printing,
    size: i.size,
    specification: i.specification,
    unit: i.unit,
  };
}

watch(open, (value) => {
  if (!value) return;
  const src = props.copyFrom;
  factoryId.value = src?.factoryId ?? (props.factories.length === 1 ? props.factories[0]?.id : undefined);
  requiredDate.value = undefined;
  purpose.value = src?.purpose ?? '';
  remark.value = src?.remark ?? '';
  lines.value = (src?.items ?? []).map((i) => ({
    aux: toAuxDrafts(i.auxUsages),
    product: fromSnapshot(i),
    quantity: Number(i.quantity) || null,
    remark: i.remark ?? '',
    route: { routeId: i.routeId ?? undefined, steps: i.processes ?? [] },
  }));
  keyword.value = '';
  results.value = [];
  searched.value = false;
  error.value = '';
});

let timer: ReturnType<typeof setTimeout> | undefined;
let seq = 0;
watch(keyword, (value) => {
  clearTimeout(timer);
  const k = value.trim();
  if (!k) {
    results.value = [];
    searched.value = false;
    return;
  }
  timer = setTimeout(async () => {
    const mine = ++seq;
    searching.value = true;
    try {
      const list = await searchOrderProducts(k);
      if (mine === seq) {
        results.value = list;
        searched.value = true;
      }
    } finally {
      if (mine === seq) searching.value = false;
    }
  }, 300);
});
onBeforeUnmount(() => clearTimeout(timer));

/** 换工厂时重新取这家工厂的工序和常用路线；本厂没启用的工序从已选工艺里去掉。 */
let optionsSeq = 0;
watch(factoryId, async (id) => {
  const mine = ++optionsSeq;
  routeOptions.value = undefined;
  if (!id) return;
  routeLoading.value = true;
  try {
    const options = await getRouteOptions(id);
    if (mine !== optionsSeq) return;
    routeOptions.value = options;
    for (const line of lines.value) {
      line.route = {
        routeId: options.routes.some((r) => r.id === line.route.routeId) ? line.route.routeId : undefined,
        steps: sortSteps(line.route.steps, options.processes),
      };
    }
  } catch {
    if (mine === optionsSeq) routeOptions.value = undefined;
  } finally {
    if (mine === optionsSeq) routeLoading.value = false;
  }
});

/** 新加的产品默认带出它上次向这家工厂下单的工艺；没下过且工厂只有一条路线时用那条。 */
async function defaultRoute(line: Line) {
  const id = factoryId.value;
  if (!id) return;
  try {
    const last = await getLastRoute(id, line.product.id);
    const options = routeOptions.value;
    if (id !== factoryId.value || line.route.steps.length > 0) return;
    if (last && line.aux.length === 0) line.aux = toAuxDrafts(last.auxUsages);
    if (last && last.steps.length > 0) {
      line.route = {
        routeId: options?.routes.some((r) => r.id === last.routeId) ? (last.routeId ?? undefined) : undefined,
        steps: options ? sortSteps(last.steps, options.processes) : last.steps,
      };
    } else if (options?.routes.length === 1) {
      const only = options.routes[0]!;
      line.route = { routeId: only.id, steps: sortSteps(only.steps, options.processes) };
    }
  } catch {
    // 带不出来就让下单人自己选
  }
}

function add(p: Api.Product) {
  if (pickedIds.value.has(p.id)) return;
  lines.value = [...lines.value, { aux: [], product: p, quantity: null, remark: '', route: { steps: [] } }];
  void defaultRoute(lines.value[lines.value.length - 1]!);
}

function remove(id: string) {
  lines.value = lines.value.filter((l) => l.product.id !== id);
}

const disabledDate = (d: Dayjs) => d.isBefore(dayjs().startOf('day'));

async function submit() {
  error.value = '';
  if (!factoryId.value) {
    error.value = '请选择工厂';
    return;
  }
  if (!requiredDate.value) {
    error.value = '请选择希望交货的日期';
    return;
  }
  if (lines.value.length === 0) {
    error.value = '请至少搜一个产品加进来';
    return;
  }
  const missing = lines.value.find((l) => !l.quantity || l.quantity <= 0);
  if (missing) {
    error.value = `请填写「${missing.product.displayName ?? missing.product.name}」的数量`;
    return;
  }
  const options = routeOptions.value;
  if (!options) {
    error.value = routeLoading.value ? '工厂的工序还在加载，请稍等' : '工厂的工序没有加载出来，请重新选一下工厂';
    return;
  }
  for (const l of lines.value) {
    const problem = routeProblem(l.route.steps, options.processes) || auxProblem(l.aux);
    if (problem) {
      error.value = `「${l.product.displayName ?? l.product.name}」：${problem}`;
      return;
    }
  }
  submitting.value = true;
  try {
    const id = await createProductionOrder({
      factoryId: factoryId.value,
      items: lines.value.map((l) => ({
        auxUsages: auxPayload(l.aux),
        productId: l.product.id,
        quantity: l.quantity as number,
        remark: l.remark.trim() || undefined,
        routeId: l.route.routeId,
        steps: l.route.steps,
      })),
      purpose: purpose.value.trim() || undefined,
      remark: remark.value.trim() || undefined,
      requiredDate: requiredDate.value.format('YYYY-MM-DD'),
    });
    open.value = false;
    emit('created', id);
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <Modal
    v-model:open="open"
    :confirm-loading="submitting"
    :width="860"
    ok-text="提交给工厂"
    :title="copyFrom ? `复制需求（来自 ${copyFrom.orderNo}）` : '提生产需求'"
    @ok="submit"
  >
    <div class="flex flex-col gap-4 text-sm">
      <div class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label for="po-factory" class="flex flex-col gap-1 text-xs text-muted-foreground">
          下给哪家工厂
          <Select id="po-factory" v-model:value="factoryId" :options="factoryOptions" placeholder="选择工厂" />
        </label>
        <label for="po-date" class="flex flex-col gap-1 text-xs text-muted-foreground">
          希望交货日期
          <DatePicker id="po-date" v-model:value="requiredDate" :disabled-date="disabledDate" class="w-full" />
        </label>
        <label for="po-purpose" class="flex flex-col gap-1 text-xs text-muted-foreground">
          用途
          <AutoComplete id="po-purpose" v-model:value="purpose" :maxlength="64" :options="PURPOSES" placeholder="例如 电商备货" />
        </label>
      </div>

      <section class="flex flex-col gap-2">
        <h3 class="m-0 text-sm font-semibold">
          产品<span class="ml-2 text-xs font-normal text-muted-foreground">从产品中心搜名称、编码或规格，点一下加入</span>
        </h3>
        <Input id="po-product-keyword" v-model:value="keyword" allow-clear placeholder="例如 TPE 瑜伽垫、DZ2401968、183*61" />
        <Spin :spinning="searching">
          <ul v-if="results.length > 0" class="m-0 flex max-h-56 list-none flex-col overflow-auto rounded-md border border-border p-0">
            <li v-for="p in results" :key="p.id">
              <button
                :disabled="pickedIds.has(p.id)"
                class="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                type="button"
                @click="add(p)"
              >
                <span class="flex min-w-0 flex-col">
                  <span class="truncate">{{ p.displayName ?? p.name }}</span>
                  <span class="truncate text-xs text-muted-foreground">{{ p.code }} · {{ specText(p) }}</span>
                </span>
                <span class="shrink-0 text-xs text-primary">{{ pickedIds.has(p.id) ? '已加入' : '＋ 加入' }}</span>
              </button>
            </li>
          </ul>
          <p v-else-if="searched" class="m-0 py-2 text-xs text-muted-foreground">
            产品中心没有找到「{{ keyword.trim() }}」。新产品请先在「产品中心 → 产品档案」建档。
          </p>
        </Spin>
      </section>

      <section class="flex flex-col gap-2">
        <h3 class="m-0 text-sm font-semibold">明细（{{ lines.length }}）</h3>
        <Empty v-if="lines.length === 0" description="还没有加产品" />
        <div v-for="l in lines" v-else :key="l.product.id" class="flex flex-col gap-2 rounded-md border border-border px-3 py-2">
          <div class="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,180px)_auto]">
            <span class="flex min-w-0 flex-col">
              <span class="truncate">{{ l.product.displayName ?? l.product.name }}</span>
              <span class="truncate text-xs text-muted-foreground">{{ l.product.code }} · {{ specText(l.product) }}</span>
            </span>
            <span class="flex items-center gap-1 text-xs text-muted-foreground">
              <InputNumber
                :id="`po-qty-${l.product.id}`"
                :min="0"
                :precision="0"
                :value="l.quantity ?? undefined"
                :style="{ width: '7rem' }"
                placeholder="数量"
                @change="(v) => (l.quantity = (v as null | number | undefined) ?? null)"
              />
              {{ l.product.unit }}
            </span>
            <Input v-model:value="l.remark" :maxlength="255" placeholder="备注（选填）" size="small" />
            <button class="text-xs text-destructive hover:underline" type="button" @click="remove(l.product.id)">删除</button>
          </div>
          <RoutePicker :id="`po-route-${l.product.id}`" v-model="l.route" :options="routeOptions" />
          <AuxUsageEditor
            :id="`po-aux-${l.product.id}`"
            v-model="l.aux"
            :options="routeOptions"
            :search="searchAuxProducts"
            :steps="l.route.steps"
          />
        </div>
      </section>

      <label for="po-remark" class="flex flex-col gap-1 text-xs text-muted-foreground">
        备注
        <Input.TextArea id="po-remark" v-model:value="remark" :auto-size="{ minRows: 2, maxRows: 4 }" :maxlength="500" placeholder="选填，例如 包装要求、优先级" />
      </label>
      <p v-if="copyFrom" class="m-0 text-xs text-muted-foreground">
        产品按产品中心当前的档案重新核对；已经停用的产品提交时会提示，请删掉换一个。
      </p>
      <p v-if="error" class="m-0 text-sm text-destructive">{{ error }}</p>
    </div>
  </Modal>
</template>
