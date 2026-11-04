<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { AuxUsageDraft } from '../../shared/auxiliary-usage';
import type { RouteDraft } from '../shared';

import type { FdmgongchangRouteApi as RouteApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Alert, AutoComplete, DatePicker, Empty, Input, InputNumber, message, Modal, Select, Spin, Tag } from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  createProductionOrder,
  getLastRoute,
  getProductCategories,
  getRouteOptions,
  searchAuxProducts,
  searchOrderProducts,
} from '#/api/fdmgongchang/production-order';

import AuxUsageEditor from '../../shared/aux-usage-editor.vue';
import { auxPayload, auxProblem, toAuxDrafts } from '../../shared/auxiliary-usage';
import { routeProblem, sortSteps, specText } from '../shared';
import AiFillPanel from './ai-fill-panel.vue';
import RoutePicker from './route-picker.vue';

/**
 * 向工厂下单：选工厂、交期，从产品中心搜 SKU 加到明细里填数量，并为每个产品定好要走的工序（工艺由下单人决定，工厂只能退回）
 * 和要用的辅料（每件用量，开工序单时按用量带出领用数）。
 * 产品规格以下单这一刻的产品档案为准，之后产品改了不影响这张单。
 * copyFrom：从「我提的需求」复制（例如被退回后改一改重新提交），带出工厂、用途、备注和产品数量，交期重新选。
 * AI 识别：上传附件交给 AI 回填。对上产品中心的直接用；对不上的是「新建」行，提交时在产品中心建档，下单人核对名称、规格、分类。
 */
const props = defineProps<{ copyFrom?: Api.Order; factories: Api.Factory[] }>();
const emit = defineEmits<{ created: [id: number] }>();
const open = defineModel<boolean>('open', { required: true });

interface NewDraft {
  category?: string;
  color: string;
  material: string;
  model: string;
  name: string;
  packaging: string;
  printing: string;
  specification: string;
  unit: string;
}

interface Line {
  /** 是 AI 识别回填的，提示下单人核对。 */
  ai: boolean;
  aux: AuxUsageDraft[];
  /** AI 没对上时，产品中心里可能是的产品。 */
  candidates: Api.Product[];
  key: string;
  /** 产品中心还没有、提交时新建的规格；和 product 二选一。 */
  newProduct?: NewDraft;
  product: Api.Product | null;
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
const categories = ref<string[]>([]);
const aiNotes = ref<string[]>([]);
const aiSummary = ref('');
const aiPanel = ref<InstanceType<typeof AiFillPanel>>();
let lineSeq = 0;
const nextKey = () => `l${++lineSeq}`;

const factoryOptions = computed(() => props.factories.map((f) => ({ label: f.name, value: f.id })));
const pickedIds = computed(() => new Set(lines.value.flatMap((l) => (l.product ? [l.product.id] : []))));
const categoryOptions = computed(() => categories.value.map((value) => ({ label: value, value })));
const newCount = computed(() => lines.value.filter((l) => l.newProduct).length);

function lineName(l: Line) {
  return l.product ? (l.product.displayName ?? l.product.name) : l.newProduct?.name || '新产品';
}

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
    ai: false,
    aux: toAuxDrafts(i.auxUsages),
    candidates: [],
    key: nextKey(),
    product: fromSnapshot(i),
    quantity: Number(i.quantity) || null,
    remark: i.remark ?? '',
    route: { routeId: i.routeId ?? undefined, steps: i.processes ?? [] },
  }));
  keyword.value = '';
  results.value = [];
  searched.value = false;
  error.value = '';
  aiNotes.value = [];
  aiSummary.value = '';
  aiPanel.value?.reset();
  if (categories.value.length === 0) {
    getProductCategories()
      .then((list) => (categories.value = list))
      .catch(() => {});
  }
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
  if (!line.product) {
    const options = routeOptions.value;
    if (options?.routes.length === 1 && line.route.steps.length === 0) {
      const only = options.routes[0]!;
      line.route = { routeId: only.id, steps: sortSteps(only.steps, options.processes) };
    }
    return;
  }
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
  lines.value = [
    ...lines.value,
    { ai: false, aux: [], candidates: [], key: nextKey(), product: p, quantity: null, remark: '', route: { steps: [] } },
  ];
  void defaultRoute(lines.value[lines.value.length - 1]!);
}

function remove(key: string) {
  lines.value = lines.value.filter((l) => l.key !== key);
}

/** 新建行改用产品中心里已有的产品。 */
function useCandidate(line: Line, p: Api.Product) {
  if (pickedIds.value.has(p.id)) {
    error.value = `「${p.displayName ?? p.name}」已经在明细里了，可以删掉这一行、把数量加到那一行`;
    return;
  }
  line.product = p;
  line.newProduct = undefined;
  line.candidates = [];
  line.route = { steps: [] };
  void defaultRoute(line);
}

/**
 * AI 识别结果回填：交期、用途已经填了的不覆盖，备注追加；对上产品中心的直接加入，对不上的加成「新建」行。
 * 已经在明细里的产品不重复加，提示下单人自己核对数量。
 */
function applyFill(result: NonNullable<Api.Fill['result']>) {
  error.value = '';
  if (!requiredDate.value && result.requiredDate) requiredDate.value = dayjs(result.requiredDate);
  if (!purpose.value && result.purpose) purpose.value = result.purpose.slice(0, 64);
  if (result.remark) remark.value = (remark.value ? `${remark.value}\n${result.remark}` : result.remark).slice(0, 500);
  const notes = [...result.notes];
  let matched = 0;
  let fresh = 0;
  const added: Line[] = [];
  for (const l of result.lines) {
    const quantity = l.quantity === null || l.quantity === undefined ? null : Number(l.quantity);
    const base = { ai: true, aux: [], key: nextKey(), quantity, remark: l.remark ?? '', route: { steps: [] } };
    if (l.product) {
      if (pickedIds.value.has(l.product.id) || added.some((a) => a.product?.id === l.product!.id)) {
        notes.push(`「${l.product.displayName ?? l.product.name}」识别出不止一行，只加了一次，请核对数量`);
        continue;
      }
      added.push({ ...base, candidates: [], product: l.product });
      matched++;
    } else {
      added.push({
        ...base,
        candidates: l.candidates ?? [],
        newProduct: {
          category: l.category && categories.value.includes(l.category) ? l.category : undefined,
          color: l.color ?? '',
          material: l.material ?? '',
          model: l.model ?? '',
          name: l.name ?? '',
          packaging: l.packaging ?? '',
          printing: l.printing ?? '',
          specification: l.specification ?? '',
          unit: l.unit ?? '',
        },
        product: null,
      });
      fresh++;
    }
  }
  lines.value = [...lines.value, ...added];
  for (const line of added) void defaultRoute(line);
  aiNotes.value = notes;
  aiSummary.value =
    added.length === 0
      ? 'AI 没有识别出新的产品明细'
      : `AI 回填了 ${added.length} 行：${matched} 行对上产品中心${fresh > 0 ? `，${fresh} 行是新规格（标了「新建」，请核对）` : ''}。请逐行核对数量和工艺。`;
}

function newProblem(d: NewDraft) {
  if (!d.name.trim()) return '新产品要填名称';
  if (!d.specification.trim()) return '新产品要填规格';
  if (!d.unit.trim()) return '新产品要填单位';
  if (!d.category) return '新产品要选产品分类';
  return '';
}

function newPayload(d: NewDraft): Api.NewProduct {
  const opt = (v: string) => v.trim() || undefined;
  return {
    category: d.category!,
    color: opt(d.color),
    material: opt(d.material),
    model: opt(d.model),
    name: d.name.trim(),
    packaging: opt(d.packaging),
    printing: opt(d.printing),
    specification: d.specification.trim(),
    unit: d.unit.trim(),
  };
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
    error.value = `请填写「${lineName(missing)}」的数量`;
    return;
  }
  const options = routeOptions.value;
  if (!options) {
    error.value = routeLoading.value ? '工厂的工序还在加载，请稍等' : '工厂的工序没有加载出来，请重新选一下工厂';
    return;
  }
  for (const l of lines.value) {
    const problem =
      (l.newProduct ? newProblem(l.newProduct) : '') || routeProblem(l.route.steps, options.processes) || auxProblem(l.aux);
    if (problem) {
      error.value = `「${lineName(l)}」：${problem}`;
      return;
    }
  }
  submitting.value = true;
  try {
    const id = await createProductionOrder({
      factoryId: factoryId.value,
      items: lines.value.map((l) => ({
        auxUsages: auxPayload(l.aux),
        newProduct: l.newProduct ? newPayload(l.newProduct) : undefined,
        productId: l.product?.id,
        quantity: l.quantity as number,
        remark: l.remark.trim() || undefined,
        routeId: l.route.routeId,
        steps: l.route.steps,
      })),
      purpose: purpose.value.trim() || undefined,
      remark: remark.value.trim() || undefined,
      requiredDate: requiredDate.value.format('YYYY-MM-DD'),
    });
    const created = newCount.value;
    open.value = false;
    if (created > 0) message.success(`已提交，并在产品中心新建了 ${created} 个产品（编号 XQ 开头）`);
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

      <AiFillPanel ref="aiPanel" :factory-id="factoryId" @filled="applyFill" />
      <Alert v-if="aiSummary || aiNotes.length > 0" show-icon type="info">
        <template #message>
          <p v-if="aiSummary" class="m-0">{{ aiSummary }}</p>
          <ul v-if="aiNotes.length > 0" class="m-0 mt-1 pl-4 text-xs">
            <li v-for="(n, i) in aiNotes" :key="i">{{ n }}</li>
          </ul>
        </template>
      </Alert>

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
        <h3 class="m-0 text-sm font-semibold">
          明细（{{ lines.length }}）<span v-if="newCount > 0" class="ml-2 text-xs font-normal text-warning">其中 {{ newCount }} 个是新规格，提交时在产品中心新建</span>
        </h3>
        <Empty v-if="lines.length === 0" description="还没有加产品" />
        <div
          v-for="l in lines"
          v-else
          :key="l.key"
          :class="l.newProduct ? 'border-warning bg-warning/5' : 'border-border'"
          class="flex flex-col gap-2 rounded-md border px-3 py-2"
        >
          <div class="grid grid-cols-1 items-center gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,180px)_auto]">
            <span v-if="l.product" class="flex min-w-0 flex-col">
              <span class="truncate">
                <Tag v-if="l.ai" class="mr-1" color="blue">AI</Tag>{{ l.product.displayName ?? l.product.name }}
              </span>
              <span class="truncate text-xs text-muted-foreground">{{ l.product.code }} · {{ specText(l.product) }}</span>
            </span>
            <span v-else class="flex min-w-0 flex-col">
              <span class="truncate">
                <Tag class="mr-1" color="orange">新建</Tag>{{ l.newProduct?.name || '新产品' }}
              </span>
              <span class="text-xs text-warning">产品中心没有这个规格，提交时自动新建产品档案（编号 XQ 开头），请核对下面的信息</span>
            </span>
            <span class="flex items-center gap-1 text-xs text-muted-foreground">
              <InputNumber
                :id="`po-qty-${l.product?.id ?? l.key}`"
                :min="0"
                :precision="0"
                :value="l.quantity ?? undefined"
                :style="{ width: '7rem' }"
                placeholder="数量"
                @change="(v) => (l.quantity = (v as null | number | undefined) ?? null)"
              />
              {{ l.product ? l.product.unit : l.newProduct?.unit }}
            </span>
            <Input v-model:value="l.remark" :maxlength="255" placeholder="备注（选填）" size="small" />
            <button class="text-xs text-destructive hover:underline" type="button" @click="remove(l.key)">删除</button>
          </div>
          <template v-if="l.newProduct">
            <div class="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <label :for="`po-new-name-${l.key}`" class="flex flex-col gap-1 text-xs text-muted-foreground">
                产品名称
                <Input :id="`po-new-name-${l.key}`" v-model:value="l.newProduct.name" :maxlength="200" placeholder="例如 TPE 单色瑜伽垫" size="small" />
              </label>
              <label :for="`po-new-model-${l.key}`" class="flex flex-col gap-1 text-xs text-muted-foreground">
                型号（颜色、色号）
                <Input :id="`po-new-model-${l.key}`" v-model:value="l.newProduct.model" :maxlength="200" placeholder="例如 电商米白" size="small" />
              </label>
              <label :for="`po-new-spec-${l.key}`" class="flex flex-col gap-1 text-xs text-muted-foreground">
                规格
                <Input :id="`po-new-spec-${l.key}`" v-model:value="l.newProduct.specification" :maxlength="200" placeholder="例如 183*61*0.6cm" size="small" />
              </label>
              <label :for="`po-new-material-${l.key}`" class="flex flex-col gap-1 text-xs text-muted-foreground">
                材质
                <Input :id="`po-new-material-${l.key}`" v-model:value="l.newProduct.material" :maxlength="64" placeholder="例如 TPE" size="small" />
              </label>
              <label :for="`po-new-unit-${l.key}`" class="flex flex-col gap-1 text-xs text-muted-foreground">
                单位
                <Input :id="`po-new-unit-${l.key}`" v-model:value="l.newProduct.unit" :maxlength="16" placeholder="例如 条" size="small" />
              </label>
              <label :for="`po-new-category-${l.key}`" class="flex flex-col gap-1 text-xs text-muted-foreground">
                产品分类
                <Select
                  :id="`po-new-category-${l.key}`"
                  v-model:value="l.newProduct.category"
                  :options="categoryOptions"
                  placeholder="选已有分类"
                  show-search
                  size="small"
                />
              </label>
              <label :for="`po-new-printing-${l.key}`" class="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-3">
                印刷 / logo（选填）
                <Input :id="`po-new-printing-${l.key}`" v-model:value="l.newProduct.printing" :maxlength="200" size="small" />
              </label>
            </div>
            <div v-if="l.candidates.length > 0" class="flex flex-col gap-1 text-xs">
              <span class="text-muted-foreground">产品中心里可能是这些，是的话点一下改用，就不新建了：</span>
              <button
                v-for="c in l.candidates"
                :key="c.id"
                class="flex items-center justify-between gap-3 rounded border border-border px-2 py-1 text-left hover:bg-accent"
                type="button"
                @click="useCandidate(l, c)"
              >
                <span class="min-w-0 truncate">{{ c.displayName ?? c.name }} <span class="text-muted-foreground">{{ c.code }} · {{ specText(c) }}</span></span>
                <span class="shrink-0 text-primary">改用这个</span>
              </button>
            </div>
          </template>
          <RoutePicker :id="`po-route-${l.product?.id ?? l.key}`" v-model="l.route" :options="routeOptions" />
          <AuxUsageEditor
            :id="`po-aux-${l.product?.id ?? l.key}`"
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
