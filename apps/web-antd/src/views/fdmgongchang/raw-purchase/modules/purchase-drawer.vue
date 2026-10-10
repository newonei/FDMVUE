<script setup lang="ts">
import type { Dayjs } from 'dayjs';

import type { DraftLine } from '../model';

import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangRawPurchaseApi as Api } from '#/api/fdmgongchang/raw-purchase';
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';
import type { MasterRecord } from '#/api/fdmplatform';

import { computed, ref, watch } from 'vue';

import {
  Alert,
  Button,
  DatePicker,
  Drawer,
  Input,
  InputNumber,
  Select,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  createRawPurchase,
  updateRawPurchase,
} from '#/api/fdmgongchang/raw-purchase';
import RemoteMasterSelect from '#/views/fdmplatform/components/RemoteMasterSelect.vue';

import { RAW_CATEGORY_LABELS, toNumber } from '../../stage-stock/model';
import {
  draftTotal,
  formatMoney,
  lineAmount,
  newDraftLine,
  validateDraft,
} from '../model';

/** 新建 / 修改原材料采购单：供应商来自外贸平台供应商主数据，原材料来自财务部门的原材料价格表。 */
const props = defineProps<{
  /** 收货工厂：三家工厂各自到货入库。 */
  factories: FdmgongchangFactoryApi.Factory[];
  materials: StockApi.RawMaterialOption[];
  purchase?: Api.Purchase;
}>();
const emit = defineEmits<{ saved: [message: string] }>();
const open = defineModel<boolean>('open', { required: true });

const factoryId = ref<number>();
const supplierId = ref<string>();
const supplierName = ref<string>();
const orderDate = ref<Dayjs>(dayjs());
const expectedDate = ref<Dayjs>();
const remark = ref('');
const lines = ref<DraftLine[]>([]);
const errors = ref<string[]>([]);
const saving = ref(false);

const editing = computed(() => !!props.purchase);
const materialOptions = computed(() =>
  props.materials.map((m) => ({
    disabled: !m.enabled,
    label: `${m.name}（${m.code}）· ${RAW_CATEGORY_LABELS[m.category] ?? m.category}${m.enabled ? '' : '（已停用）'}`,
    value: m.code,
  })),
);
const total = computed(() => draftTotal(lines.value));

function nameOf(code: string) {
  return props.materials.find((m) => m.code === code)?.name ?? code;
}

watch(open, (value) => {
  if (!value) return;
  errors.value = [];
  const p = props.purchase;
  factoryId.value =
    p?.factoryId ?? (props.factories.length === 1 ? props.factories[0]?.id : undefined);
  supplierId.value = p?.supplierId;
  supplierName.value = p?.supplierName;
  orderDate.value = p?.orderDate ? dayjs(String(p.orderDate)) : dayjs();
  expectedDate.value = p?.expectedDate ? dayjs(String(p.expectedDate)) : undefined;
  remark.value = p?.remark ?? '';
  lines.value = p
    ? p.lines.map((l) =>
        newDraftLine({
          quantity: toNumber(l.quantity),
          rawMaterialCode: l.rawMaterialCode,
          remark: l.remark ?? '',
          unitPrice: toNumber(l.unitPrice),
        }),
      )
    : [newDraftLine()];
});

function onSupplier(record: MasterRecord | undefined) {
  supplierName.value = record?.name;
}

function patch(key: number, change: Partial<DraftLine>) {
  lines.value = lines.value.map((l) => (l.key === key ? { ...l, ...change } : l));
}

function num(value: null | number | string | undefined) {
  return value === null || value === undefined || value === '' ? undefined : Number(value);
}

async function submit() {
  const problems = validateDraft({ lines: lines.value, nameOf, supplierId: supplierId.value });
  if (!factoryId.value) problems.unshift('请选择收货工厂。');
  errors.value = problems;
  if (problems.length > 0 || !supplierId.value || !factoryId.value) return;
  saving.value = true;
  try {
    const data: Api.SaveReq = {
      expectedDate: expectedDate.value?.format('YYYY-MM-DD'),
      factoryId: factoryId.value,
      id: props.purchase?.id,
      lines: lines.value.map((l) => ({
        quantity: l.quantity!,
        rawMaterialCode: l.rawMaterialCode!,
        remark: l.remark.trim() || undefined,
        unitPrice: l.unitPrice!,
      })),
      orderDate: orderDate.value?.format('YYYY-MM-DD'),
      remark: remark.value.trim() || undefined,
      supplierId: supplierId.value,
      supplierName: supplierName.value,
    };
    if (editing.value) {
      await updateRawPurchase(data);
      emit('saved', `采购单 ${props.purchase!.purchaseNo} 已修改`);
    } else {
      await createRawPurchase(data);
      emit('saved', `已下单，金额 ${formatMoney(total.value)} 元。到货后由工厂在「工序库存 · 到货入库」收货。`);
    }
    open.value = false;
  } catch {
    // 后端错误已由全局提示展示，保留内容方便修改
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Drawer
    v-model:open="open"
    :title="editing ? `修改采购单 ${purchase?.purchaseNo ?? ''}` : '新建原材料采购单'"
    :width="860"
    class="max-w-full"
    destroy-on-close
  >
    <div class="flex flex-col gap-5">
      <section class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label for="rp-factory" class="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
          收货工厂（到货后由这家工厂在「工序库存 · 到货入库」收货）
          <Select
            id="rp-factory"
            v-model:value="factoryId"
            :options="factories.map((f) => ({ label: f.name, value: f.id }))"
            class="w-full"
            placeholder="选择收货工厂"
          />
        </label>
        <div class="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2">
          <span>供应商（采购部门「供应商管理」里的供应商）</span>
          <RemoteMasterSelect
            v-model:value="supplierId"
            type="SUPPLIER"
            placeholder="输入供应商名称或编码搜索"
            @selected="onSupplier"
          />
        </div>
        <label for="rp-order-date" class="flex flex-col gap-1 text-xs text-muted-foreground">
          下单日期
          <DatePicker id="rp-order-date" v-model:value="orderDate" :allow-clear="false" class="w-full" />
        </label>
        <label for="rp-expected-date" class="flex flex-col gap-1 text-xs text-muted-foreground">
          预计到货
          <DatePicker id="rp-expected-date" v-model:value="expectedDate" class="w-full" placeholder="选填" />
        </label>
      </section>

      <section class="flex flex-col gap-2">
        <h3 class="m-0 text-sm font-semibold">
          原材料
          <span class="ml-1 text-xs font-normal text-muted-foreground">数量按 kg，单价按 元/kg</span>
        </h3>
        <div class="overflow-x-auto rounded-md border border-border">
          <table class="w-full min-w-[720px] text-sm">
            <thead class="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th class="px-2 py-2 text-left font-medium">原材料</th>
                <th class="w-32 px-2 py-2 text-right font-medium">数量（kg）</th>
                <th class="w-32 px-2 py-2 text-right font-medium">单价（元/kg）</th>
                <th class="w-28 px-2 py-2 text-right font-medium">金额（元）</th>
                <th class="w-40 px-2 py-2 text-left font-medium">备注</th>
                <th class="w-12 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(line, index) in lines" :key="line.key" class="border-t border-border">
                <td class="px-2 py-1.5">
                  <Select
                    :id="`rp-material-${index}`"
                    :value="line.rawMaterialCode"
                    :options="materialOptions"
                    :aria-label="`第 ${index + 1} 行原材料`"
                    class="w-full min-w-[220px]"
                    option-filter-prop="label"
                    placeholder="搜索名称或编码"
                    show-search
                    @change="(v) => patch(line.key, { rawMaterialCode: v as string })"
                  />
                </td>
                <td class="px-2 py-1.5">
                  <InputNumber
                    :id="`rp-qty-${index}`"
                    :value="line.quantity"
                    :min="0"
                    :precision="3"
                    :aria-label="`第 ${index + 1} 行采购数量`"
                    class="w-full"
                    @change="(v) => patch(line.key, { quantity: num(v) })"
                  />
                </td>
                <td class="px-2 py-1.5">
                  <InputNumber
                    :id="`rp-price-${index}`"
                    :value="line.unitPrice"
                    :min="0"
                    :precision="4"
                    :aria-label="`第 ${index + 1} 行单价`"
                    class="w-full"
                    @change="(v) => patch(line.key, { unitPrice: num(v) })"
                  />
                </td>
                <td class="px-2 py-1.5 text-right tabular-nums">{{ formatMoney(lineAmount(line)) }}</td>
                <td class="px-2 py-1.5">
                  <Input
                    :id="`rp-remark-${index}`"
                    :value="line.remark"
                    :maxlength="255"
                    :aria-label="`第 ${index + 1} 行备注`"
                    placeholder="选填"
                    @update:value="(v) => patch(line.key, { remark: v ?? '' })"
                  />
                </td>
                <td class="px-2 py-1.5 text-center">
                  <button
                    type="button"
                    class="text-xs text-muted-foreground hover:text-destructive"
                    :aria-label="`删除第 ${index + 1} 行`"
                    @click="lines = lines.filter((l) => l.key !== line.key)"
                  >
                    删除
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div>
          <Button size="small" @click="lines = [...lines, newDraftLine()]">＋ 添加原材料</Button>
        </div>
      </section>

      <label for="rp-remark" class="flex flex-col gap-1 text-xs text-muted-foreground">
        备注
        <Input.TextArea id="rp-remark" v-model:value="remark" :maxlength="500" :rows="2" placeholder="例如 付款方式、送货要求" />
      </label>
    </div>
    <template #footer>
      <div class="flex flex-col gap-2">
        <Alert v-if="errors.length > 0" type="error" show-icon>
          <template #message>
            <ul class="m-0 list-disc pl-4">
              <li v-for="e in errors" :key="e">{{ e }}</li>
            </ul>
          </template>
        </Alert>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span class="text-sm">
            合计 <b class="tabular-nums">{{ formatMoney(total) }}</b> 元 · {{ lines.length }} 种原材料
          </span>
          <div class="flex gap-2">
            <Button @click="open = false">取消</Button>
            <Button :loading="saving" type="primary" @click="submit">{{ editing ? '保存修改' : '确认下单' }}</Button>
          </div>
        </div>
      </div>
    </template>
  </Drawer>
</template>
