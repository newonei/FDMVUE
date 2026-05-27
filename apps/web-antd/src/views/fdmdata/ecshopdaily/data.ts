import type { Ref } from 'vue';

import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataEcShopDailyApi } from '#/api/fdmdata/ecshopdaily';

import { markRaw } from 'vue';

import dayjs from 'dayjs';

import {
  FdmDateRangePicker,
  getYesterdayDateRange,
} from '#/components/fdm-date-range-picker';

/** 接口 LocalDate 可能为 YYYY-MM-DD 字符串或 [year, month, day] 数组 */
export function normalizeStatDateForForm(
  statDate: unknown,
): string | undefined {
  if (statDate === undefined || statDate === null || statDate === '') {
    return undefined;
  }
  if (typeof statDate === 'string') {
    const s = statDate.trim();
    if (!s) return undefined;
    const d = dayjs(s.length >= 10 ? s.slice(0, 10) : s);
    return d.isValid() ? d.format('YYYY-MM-DD') : undefined;
  }
  if (Array.isArray(statDate) && statDate.length >= 3) {
    const [y, m, d] = statDate;
    const parsed = dayjs(
      `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    );
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : undefined;
  }
  const d = dayjs(statDate as dayjs.ConfigType);
  return d.isValid() ? d.format('YYYY-MM-DD') : undefined;
}

/** 详情/列表行 → 表单可回填的值（DatePicker、平台编码等） */
export function mapEcShopDailyToFormValues(
  detail: Partial<FdmdataEcShopDailyApi.EcShopDaily> & Record<string, unknown>,
): Record<string, unknown> {
  const platformRaw =
    detail.platformCode ?? (detail.platform_code as string | undefined);
  return {
    ...detail,
    statDate: normalizeStatDateForForm(detail.statDate),
    platformCode:
      platformRaw !== null &&
      platformRaw !== undefined &&
      String(platformRaw).trim() !== ''
        ? String(platformRaw).trim()
        : undefined,
  };
}

/** 常用平台编码（供看板和表单下拉使用） */
export const EC_PLATFORM_SUGGESTIONS = [
  { value: 'TAOBAO', label: '淘宝' },
  { value: 'PDD', label: '拼多多' },
  { value: 'DOUYIN', label: '抖音' },
  { value: 'JD', label: '京东' },
  { value: 'XHS', label: '小红书' },
  { value: 'SPH', label: '视频号' },
];

const EC_PLATFORM_LABEL_MAP = new Map(
  EC_PLATFORM_SUGGESTIONS.map((item) => [item.value, item.label] as const),
);

export function formatEcPlatformLabel(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const code = String(value).trim();
  return EC_PLATFORM_LABEL_MAP.get(code) ?? code;
}

export interface EcShopDailyOption {
  label: string;
  value: string;
}

export interface EcShopDailyGridOptions {
  hidePlatform?: boolean;
}

export const EC_SHOP_DAILY_CREATE_DEFAULTS: Partial<FdmdataEcShopDailyApi.EcShopDaily> =
  {
    currency: 'CNY',
    shopId: '',
    shopName: '',
    orderCount: 0,
    paidOrderCount: 0,
    refundOrderCount: 0,
    gmvAmount: 0,
    paidAmount: 0,
    refundAmount: 0,
    marketingCost: 0,
  };

function requiredInt(raw: unknown, fallback = 0): number {
  if (raw === '' || raw === null || raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function requiredAmount(raw: unknown, fallback = 0): number {
  if (raw === '' || raw === null || raw === undefined) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function buildEcShopDailySubmitPayload(
  raw: Record<string, any>,
): FdmdataEcShopDailyApi.EcShopDaily {
  const payload: Record<string, any> = {
    id: raw.id,
    statDate: normalizeStatDateForForm(raw.statDate),
    platformCode: String(raw.platformCode ?? '').trim(),
    shopId: String(raw.shopId ?? '').trim(),
    shopName: String(raw.shopName ?? '').trim(),
    currency: String(raw.currency ?? 'CNY'),
    orderCount: requiredInt(raw.orderCount),
    paidOrderCount: requiredInt(raw.paidOrderCount),
    refundOrderCount: requiredInt(raw.refundOrderCount),
    gmvAmount: requiredAmount(raw.gmvAmount),
    paidAmount: requiredAmount(raw.paidAmount),
    refundAmount: requiredAmount(raw.refundAmount),
    marketingCost: requiredAmount(raw.marketingCost),
    buyerCount: raw.buyerCount === '' ? null : requiredInt(raw.buyerCount, 0),
    remark: String(raw.remark ?? '').trim() || undefined,
  };
  return payload as FdmdataEcShopDailyApi.EcShopDaily;
}

// ─── 表单 schema helpers ─────────────────────────────────────────────────────

function formInt(
  fieldName: keyof FdmdataEcShopDailyApi.EcShopDaily & string,
  label: string,
  required = false,
): VbenFormSchema {
  return {
    fieldName,
    label,
    rules: required ? 'selectRequired' : undefined,
    component: 'InputNumber',
    componentProps: {
      class: 'w-full',
      min: 0,
      precision: 0,
      placeholder: required ? '0' : '可选',
    },
  };
}

function formAmount(
  fieldName: keyof FdmdataEcShopDailyApi.EcShopDaily & string,
  label: string,
  required = false,
  precision = 2,
): VbenFormSchema {
  return {
    fieldName,
    label,
    rules: required ? 'selectRequired' : undefined,
    component: 'InputNumber',
    componentProps: {
      class: 'w-full',
      min: 0,
      precision,
      placeholder: required ? '0.00' : '可选',
    },
  };
}

/** 新增/修改表单 */
export function useFormSchema(): VbenFormSchema[] {
  const fullWidth = 'col-span-2 min-w-0';
  const section = (key: string, title: string): VbenFormSchema => ({
    fieldName: `_divider_${key}`,
    label: '',
    hideLabel: true,
    component: 'Divider',
    formItemClass: fullWidth,
    renderComponentContent: () => ({ default: () => title }),
    componentProps: { orientation: 'left', plain: true },
  });

  return [
    { fieldName: 'id', component: 'Input', formItemClass: 'hidden' },

    section('basic', '基本信息'),
    {
      fieldName: 'statDate',
      label: '统计日期',
      rules: 'selectRequired',
      component: 'DatePicker',
      componentProps: {
        class: 'w-full',
        allowClear: true,
        format: 'YYYY-MM-DD',
        valueFormat: 'YYYY-MM-DD',
      },
    },
    {
      fieldName: 'platformCode',
      label: '平台',
      rules: 'required',
      component: 'Select',
      componentProps: {
        allowClear: true,
        showSearch: true,
        optionFilterProp: 'label',
        placeholder: '请选择平台',
        options: EC_PLATFORM_SUGGESTIONS,
      },
    },
    {
      fieldName: 'shopId',
      label: '店铺 ID',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '无则留空',
        maxlength: 64,
      },
    },
    {
      fieldName: 'shopName',
      label: '店铺名称',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: 'shop_id 为空时用于区分多店',
        maxlength: 128,
      },
    },
    {
      fieldName: 'currency',
      label: '币种',
      rules: 'selectRequired',
      component: 'Select',
      componentProps: {
        allowClear: false,
        options: [{ label: 'CNY 人民币', value: 'CNY' }],
      },
    },

    section('sales', '订单与金额'),
    formInt('orderCount', '订单笔数', true),
    formInt('paidOrderCount', '已支付订单笔数', true),
    formInt('refundOrderCount', '退款完成订单笔数', true),
    formAmount('gmvAmount', '成交额', true),
    formAmount('paidAmount', '已支付金额', true),
    formAmount('refundAmount', '退款金额', true),
    {
      fieldName: 'netSalesAmount',
      label: '净销售额',
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        disabled: true,
        precision: 2,
        placeholder: '保存时自动计算',
      },
      dependencies: {
        triggerFields: ['paidAmount', 'refundAmount'],
        componentProps: (values) => {
          const paid = Number(values.paidAmount ?? 0);
          const refund = Number(values.refundAmount ?? 0);
          const net = Number((paid - refund).toFixed(2));
          return {
            class: 'w-full',
            disabled: true,
            precision: 2,
            value: Number.isFinite(net) ? net : undefined,
          };
        },
      },
    },
    formAmount('marketingCost', '营销花费', true),
    formInt('buyerCount', '成交买家数'),

    section('remark', '备注'),
    {
      fieldName: 'remark',
      label: '备注',
      formItemClass: fullWidth,
      component: 'Textarea',
      componentProps: {
        maxlength: 512,
        rows: 3,
        showCount: true,
        placeholder: '可选',
      },
    },
  ];
}

/** 列表检索表单 */
export function useGridFormSchema(
  shopNameOptions?: Ref<EcShopDailyOption[]>,
  onShopNameSearch?: (keyword: string) => void,
  options: EcShopDailyGridOptions = {},
): VbenFormSchema[] {
  const getShopNameAutoCompleteProps = () => ({
    allowClear: true,
    filterOption: false,
    onClear: () => onShopNameSearch?.(''),
    onFocus: () => onShopNameSearch?.(''),
    onSearch: onShopNameSearch,
    options: shopNameOptions?.value ?? [],
    placeholder: '输入关键词或选择店铺',
  });

  const schema: VbenFormSchema[] = [
    {
      fieldName: 'statDate',
      label: '统计日期',
      component: markRaw(FdmDateRangePicker),
      componentProps: { allowClear: false },
      defaultValue: getYesterdayDateRange(),
    },
  ];

  if (!options.hidePlatform) {
    schema.push({
      fieldName: 'platformCode',
      label: '平台',
      component: 'Select',
      componentProps: {
        allowClear: true,
        showSearch: true,
        optionFilterProp: 'label',
        placeholder: '全部平台',
        options: EC_PLATFORM_SUGGESTIONS,
      },
    });
  }

  schema.push(
    {
      fieldName: 'shopName',
      label: '店铺名称',
      component: 'AutoComplete',
      componentProps: getShopNameAutoCompleteProps,
    },
  );

  return schema;
}

function formatAmount({ cellValue }: { cellValue: unknown }) {
  if (cellValue === null || cellValue === undefined || cellValue === '')
    return '';
  const n = Number(cellValue);
  return Number.isFinite(n) ? n.toFixed(2) : String(cellValue);
}

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatRatioPercent(numerator: number, denominator: number): string {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return '';
  if (denominator === 0) return '';
  return `${((numerator / denominator) * 100).toFixed(2)}%`;
}

function formatRoi(numerator: number, denominator: number): string {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return '';
  if (denominator === 0) return '';
  return (numerator / denominator).toFixed(2);
}

/** 列表列（核心汇总字段；详细数据在编辑弹窗查看） */
export function useGridColumns(
  options: EcShopDailyGridOptions = {},
): VxeTableGridOptions<FdmdataEcShopDailyApi.EcShopDaily>['columns'] {
  return [
    { type: 'checkbox', width: 40, fixed: 'left' },
    {
      field: 'statDate',
      title: '统计日',
      minWidth: 112,
      fixed: 'left',
      formatter: ({ cellValue }: { cellValue: unknown }) =>
        cellValue ? String(cellValue).slice(0, 10) : '',
    },
    {
      field: 'platformCode',
      title: '平台',
      minWidth: 88,
      fixed: 'left',
      visible: !options.hidePlatform,
      formatter: ({ cellValue }: { cellValue: unknown }) =>
        formatEcPlatformLabel(cellValue),
    },
    {
      field: 'shopName',
      title: '店铺名称',
      minWidth: 180,
      showOverflow: 'tooltip',
    },

    // ─── 真实口径（剔除刷单） ───────────────────────────────────────────────
    {
      field: 'realNetSalesAmount',
      title: '真实净销',
      minWidth: 110,
      align: 'right',
      formatter: ({ row }: any) => {
        // 优先服务端 real 字段；否则按 paid-refund-brushPrincipal 兜底
        const real = row?.realNetSalesAmount;
        if (real !== undefined && real !== null && real !== '')
          return formatAmount({ cellValue: real });
        const paid = asNumber(row?.paidAmount);
        const refund = asNumber(row?.refundAmount);
        const brushPrincipal = asNumber(row?.brushPrincipal);
        return formatAmount({ cellValue: paid - refund - brushPrincipal });
      },
    },
    {
      field: 'realPaidAmount',
      title: '真实支付',
      minWidth: 110,
      align: 'right',
      formatter: ({ row }: any) => {
        const real = row?.realPaidAmount;
        if (real !== undefined && real !== null && real !== '')
          return formatAmount({ cellValue: real });
        const paid = asNumber(row?.paidAmount);
        const refund = asNumber(row?.refundAmount);
        const brushPrincipal = asNumber(row?.brushPrincipal);
        return formatAmount({ cellValue: paid - refund - brushPrincipal });
      },
    },
    {
      field: 'refundAmount',
      title: '退款额',
      minWidth: 104,
      align: 'right',
      formatter: formatAmount,
    },
    {
      field: 'refundRate',
      title: '退款率',
      minWidth: 96,
      align: 'right',
      formatter: ({ row }: any) =>
        formatRatioPercent(
          asNumber(row?.refundAmount),
          asNumber(row?.paidAmount),
        ),
    },
    {
      field: 'realPaidOrderCount',
      title: '真实支付单',
      minWidth: 104,
      align: 'right',
      formatter: ({ row }: any) => {
        const real = row?.realPaidOrderCount;
        if (real !== undefined && real !== null && real !== '')
          return String(real);
        const paidOrder = asNumber(row?.paidOrderCount);
        const brushOrder = asNumber(row?.brushOrderCount);
        const v = Math.max(paidOrder - brushOrder, 0);
        return String(v);
      },
    },
    {
      field: 'brushPrincipal',
      title: '刷单本金',
      minWidth: 104,
      align: 'right',
      formatter: formatAmount,
    },
    {
      field: 'brushOrderCount',
      title: '刷单单量',
      minWidth: 96,
      align: 'right',
    },

    // ─── 投放效率 ─────────────────────────────────────────────────────────────
    {
      field: 'marketingCost',
      title: '营销花费',
      minWidth: 100,
      align: 'right',
      formatter: formatAmount,
    },
    {
      field: 'roi',
      title: 'ROI',
      minWidth: 88,
      align: 'right',
      formatter: ({ row }: any) => {
        const realNet =
          row?.realNetSalesAmount ??
          asNumber(row?.paidAmount) -
            asNumber(row?.refundAmount) -
            asNumber(row?.brushPrincipal);
        return formatRoi(asNumber(realNet), asNumber(row?.marketingCost));
      },
    },

    {
      title: '操作',
      width: 160,
      fixed: 'right',
      slots: { default: 'actions' },
    },
  ];
}
