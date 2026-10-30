<script setup lang="ts">
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';

import { computed, reactive, ref, watch } from 'vue';

import {
  Alert,
  Input,
  InputNumber,
  message,
  Modal,
  Radio,
  Select,
  Tag,
  Tooltip,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import {
  getEcProfitShopOptions,
  saveEcProfitItem,
} from '#/api/fdmcaiwu/ec-profit';

import { formatMetric } from '../model';

/**
 * 网页修改/新增一行明细。自营 = 采购合计 − 周边；平台扣费 = 账单费用 + 调整；
 * 毛利润 = 销售额 − 采购合计 − 代发 − 快递 − 推广 − 平台扣费 − 税费，任一项空白则暂不计算。
 */
const props = defineProps<{
  /** 修改时传入明细；新增时为空 */
  item?: Api.Item;
  month: string;
  /** 当月月报版本；当月还没有月报时为空 */
  reportVersion?: number;
}>();
const open = defineModel<boolean>('open', { default: false });
const emit = defineEmits<{ saved: [] }>();

type AmountKey = Exclude<
  keyof Api.ItemSave,
  | 'id'
  | 'lineType'
  | 'month'
  | 'platformFeeAdjustmentReason'
  | 'remark'
  | 'reportVersion'
  | 'shopId'
  | 'shopName'
>;

const SECTIONS: {
  fields: { hint?: string; imported?: boolean; key: AmountKey; label: string }[];
  title: string;
}[] = [
  {
    title: '收入',
    fields: [
      { key: 'salesAmount', label: '销售额', imported: true, hint: '聚水潭「销售收入」' },
      { key: 'newProductGiftAmount', label: '新品礼金' },
      { key: 'customerRefundAmount', label: '客户返款' },
    ],
  },
  {
    title: '采购',
    fields: [
      { key: 'purchaseCost', label: '采购成本（自营+周边）', imported: true, hint: '聚水潭「销售成本」' },
      { key: 'accessoryPurchaseCost', label: '其中周边' },
      { key: 'dropshipPurchaseCost', label: '代发采购' },
    ],
  },
  {
    title: '运费',
    fields: [
      { key: 'freightCost', label: '快递运费', imported: true, hint: '聚水潭「60020401 快递费用」' },
      { key: 'estimatedFreight', label: '聚水潭暂估运费' },
      { key: 'freightAdjustment', label: '运费差异' },
    ],
  },
  {
    title: '费用',
    fields: [
      { key: 'promotionCost', label: '推广费', imported: true, hint: '聚水潭「6003 运营费用」' },
      { key: 'platformFeeBill', label: '平台账单费用', imported: true, hint: '聚水潭「6001 账单费用」' },
      { key: 'platformFeeAdjustment', label: '平台费用调整', hint: '可填负数；有调整时须写原因' },
      { key: 'taxFee', label: '税费' },
    ],
  },
];
const ALL_KEYS = SECTIONS.flatMap((section) => section.fields.map((field) => field.key));

const form = reactive<Record<AmountKey, number | undefined>>(
  Object.fromEntries(ALL_KEYS.map((key) => [key, undefined])) as Record<AmountKey, number | undefined>,
);
const meta = reactive({
  lineType: 'SHOP' as 'ADJUSTMENT' | 'SHOP',
  shopId: undefined as string | undefined,
  shopName: '',
  reason: '',
  remark: '',
});
const saving = ref(false);
const shops = ref<Api.ShopOption[]>([]);
const editing = computed(() => !!props.item);
const manual = computed(() => new Set((props.item?.manualFields ?? '').split(',').filter(Boolean)));

function num(value: Api.Decimal | undefined) {
  if (value === null || value === undefined || value === '') return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

watch(open, async (value) => {
  if (!value) return;
  const item = props.item;
  for (const key of ALL_KEYS) form[key] = num(item?.[key as keyof Api.Item] as Api.Decimal);
  // 历史数据只有平台扣费合计，带入账单费用，改动后才拆分
  if (item && form.platformFeeBill == null) form.platformFeeBill = num(item.platformFee);
  Object.assign(meta, {
    lineType: item?.lineType ?? 'SHOP',
    shopId: item?.shopId,
    shopName: item?.shopName ?? '',
    reason: item?.platformFeeAdjustmentReason ?? '',
    remark: item?.remark ?? '',
  });
  if (!item && shops.value.length === 0) {
    try {
      shops.value = await getEcProfitShopOptions();
    } catch {
      shops.value = [];
    }
  }
});

const shopOptions = computed(() =>
  shops.value.map((shop) => ({
    label: `${shop.shopName}（${shop.shopId}）`,
    value: shop.shopId,
  })),
);

function big(value: null | number | undefined) {
  return value == null ? null : new BigNumber(value);
}
const ownPurchase = computed(() => {
  const purchase = big(form.purchaseCost);
  const accessory = big(form.accessoryPurchaseCost);
  return purchase === null || accessory === null ? null : purchase.minus(accessory);
});
const platformFee = computed(() => {
  const bill = big(form.platformFeeBill);
  return bill === null ? null : bill.plus(big(form.platformFeeAdjustment) ?? 0);
});
const missing = computed(() =>
  (
    [
      ['salesAmount', '销售额'],
      ['purchaseCost', '采购成本'],
      ['dropshipPurchaseCost', '代发采购'],
      ['freightCost', '快递运费'],
      ['promotionCost', '推广费'],
      ['platformFeeBill', '平台账单费用'],
      ['taxFee', '税费'],
    ] as [AmountKey, string][]
  )
    .filter(([key]) => form[key] == null)
    .map(([, label]) => label),
);
const grossProfit = computed(() => {
  if (missing.value.length > 0 || platformFee.value === null) return null;
  return new BigNumber(form.salesAmount!)
    .minus(form.purchaseCost!)
    .minus(form.dropshipPurchaseCost!)
    .minus(form.freightCost!)
    .minus(form.promotionCost!)
    .minus(platformFee.value)
    .minus(form.taxFee!);
});
const needReason = computed(
  () => (form.platformFeeAdjustment ?? 0) !== 0 && !meta.reason.trim(),
);

async function save() {
  if (saving.value) return;
  if (!editing.value && meta.lineType === 'SHOP' && !meta.shopId && !meta.shopName.trim()) {
    message.warning('请选择店铺，或填写店铺名称');
    return;
  }
  if (!editing.value && meta.lineType === 'ADJUSTMENT' && !meta.shopName.trim()) {
    message.warning('请填写费用名称');
    return;
  }
  if (needReason.value) {
    message.warning('平台费用有调整时请填写调整原因');
    return;
  }
  saving.value = true;
  try {
    await saveEcProfitItem({
      // 空白的项不传，后端按「未填」保存
      ...(Object.fromEntries(ALL_KEYS.map((key) => [key, form[key] ?? undefined])) as Partial<Api.ItemSave>),
      id: props.item?.id,
      month: props.month,
      reportVersion: props.reportVersion,
      lineType: meta.lineType,
      shopId: meta.lineType === 'SHOP' ? meta.shopId : undefined,
      shopName: meta.shopName.trim() || undefined,
      platformFeeAdjustmentReason: meta.reason.trim() || undefined,
      remark: meta.remark.trim() || undefined,
    });
    message.success(editing.value ? '已保存' : '已添加');
    open.value = false;
    emit('saved');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    v-model:open="open"
    :title="editing ? `修改 · ${item?.shopName}` : `添加 · ${month.replace('-', ' 年 ')} 月`"
    :width="780"
    :confirm-loading="saving"
    ok-text="保存"
    @ok="save"
  >
    <div class="max-h-[68vh] space-y-4 overflow-y-auto pr-1 pt-2">
      <section v-if="!editing" class="space-y-2">
        <Radio.Group v-model:value="meta.lineType" button-style="solid" size="small">
          <Radio.Button value="SHOP">店铺</Radio.Button>
          <Radio.Button value="ADJUSTMENT">费用行（寄样、团购等）</Radio.Button>
        </Radio.Group>
        <div v-if="meta.lineType === 'SHOP'" class="grid grid-cols-2 gap-3">
          <Select
            v-model:value="meta.shopId"
            :options="shopOptions"
            show-search
            allow-clear
            option-filter-prop="label"
            placeholder="从店铺目录选择"
          />
          <Input
            v-model:value="meta.shopName"
            :disabled="!!meta.shopId"
            :maxlength="128"
            placeholder="目录里没有的店铺，直接填名称"
          />
        </div>
        <Input
          v-else
          v-model:value="meta.shopName"
          :maxlength="128"
          placeholder="费用名称，如：达人寄样"
        />
      </section>

      <section v-for="section in SECTIONS" :key="section.title">
        <div class="mb-2 text-sm font-medium">{{ section.title }}</div>
        <div class="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-3">
          <label v-for="field in section.fields" :key="field.key" class="block">
            <span class="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Tooltip v-if="field.hint" :title="field.hint">
                <span class="border-b border-dashed border-muted-foreground/40">{{ field.label }}</span>
              </Tooltip>
              <span v-else>{{ field.label }}</span>
              <Tag v-if="manual.has(field.key)" color="gold" class="!mr-0 !px-1 !text-[10px] !leading-4">手工</Tag>
              <Tag
                v-else-if="field.imported && item?.sourceBatchId"
                color="blue"
                class="!mr-0 !px-1 !text-[10px] !leading-4"
                >导入</Tag
              >
            </span>
            <InputNumber
              v-model:value="form[field.key]"
              :precision="2"
              class="!w-full"
              placeholder="未填"
            />
          </label>
        </div>
        <div v-if="section.title === '采购'" class="mt-1 text-xs text-muted-foreground">
          自营 = 采购合计 − 周边：{{ ownPurchase === null ? '—' : formatMetric(ownPurchase.toFixed()) }}
        </div>
        <div v-if="section.title === '费用'" class="mt-2 space-y-1">
          <Input
            v-model:value="meta.reason"
            :maxlength="500"
            :status="needReason ? 'error' : undefined"
            placeholder="平台费用调整原因（有调整时必填）"
          />
          <div class="text-xs text-muted-foreground">
            平台扣费 = 账单费用 + 调整：{{ platformFee === null ? '—' : formatMetric(platformFee.toFixed()) }}
          </div>
        </div>
      </section>

      <section>
        <div class="mb-2 text-sm font-medium">备注</div>
        <Input.TextArea v-model:value="meta.remark" :maxlength="500" :rows="2" />
      </section>

      <Alert
        :type="grossProfit === null ? 'warning' : 'info'"
        show-icon
        :message="
          grossProfit === null
            ? `毛利润暂不计算：还有 ${missing.join('、')} 未填`
            : `毛利润 ${formatMetric(grossProfit.toFixed())} 元`
        "
      />
    </div>
  </Modal>
</template>
