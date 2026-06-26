import type { Ref } from 'vue';

import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataPatternDesignItemApi } from '#/api/fdmdata/pattern/design-item';
import type { SystemUserApi } from '#/api/system/user';

import { h } from 'vue';

import { Image, Tag } from 'ant-design-vue';

import { z } from '#/adapter/form';
import { getSimpleUserList } from '#/api/system/user';
import { getRangePickerDefaultProps } from '#/utils';

export const PATTERN_DESIGN_ITEM_DEFAULTS: Partial<FdmdataPatternDesignItemApi.PatternDesignItem> =
  {
    quantity: 1,
    importSequence: 0,
    productionSent: 0,
    status: 0,
  };

export const PATTERN_DESIGN_ITEM_STATUS_OPTIONS = [
  { label: '启用', value: 0 },
  { label: '停用', value: 1 },
];

export const PRODUCTION_SENT_OPTIONS = [
  { label: '未发出', value: 0 },
  { label: '已发出', value: 1 },
];

export interface PatternDesignItemShopOption {
  label: string;
  value: string;
}

export interface ShopNameSelectOptions {
  onShopNameSearch?: (keyword: string) => void;
  shopNameOptions?: Ref<PatternDesignItemShopOption[]>;
  shopNameOptionsLoading?: Ref<boolean>;
}

export type PatternDesignImagePreviewUsage = 'preview' | 'thumb';

export const PATTERN_DESIGN_IMAGE_PLACEHOLDER =
  'data:image/svg+xml;charset=utf-8,%3Csvg xmlns%3D%22http://www.w3.org/2000/svg%22 width%3D%22240%22 height%3D%22240%22 viewBox%3D%220 0 240 240%22%3E%3Crect width%3D%22240%22 height%3D%22240%22 fill%3D%22%23f5f5f5%22/%3E%3Cpath d%3D%22M76 154l44-52 40 52H76z%22 fill%3D%22%23d9d9d9%22/%3E%3Ccircle cx%3D%22162%22 cy%3D%2284%22 r%3D%2220%22 fill%3D%22%23d9d9d9%22/%3E%3C/svg%3E';

export function getPatternDesignImagePreviewUrl(
  url?: string,
  _usage: PatternDesignImagePreviewUsage = 'thumb',
) {
  const value = String(url ?? '').trim();
  return value || PATTERN_DESIGN_IMAGE_PLACEHOLDER;
}

function formatStatus(value: unknown) {
  return Number(value) === 1 ? '停用' : '启用';
}

function formatProductionSent(value: unknown) {
  return Number(value) === 1 ? '已发出' : '未发出';
}

function getShopNameSelectProps(options: ShopNameSelectOptions = {}) {
  return () => ({
    allowClear: true,
    class: 'w-full',
    filterOption: false,
    loading: options.shopNameOptionsLoading?.value ?? false,
    onClear: () => options.onShopNameSearch?.(''),
    onFocus: () => options.onShopNameSearch?.(''),
    onSearch: options.onShopNameSearch,
    optionFilterProp: 'label',
    options: options.shopNameOptions?.value ?? [],
    placeholder: '请选择店铺',
    popupMatchSelectWidth: 420,
    showSearch: true,
  });
}

function formatUserOptionLabel(
  item: Record<string, unknown> | SystemUserApi.User,
) {
  const nickname = String(item.nickname ?? item.username ?? item.id ?? '用户');
  const username = String(item.username ?? '');
  const mobile = String(item.mobile ?? '');
  const extra = [username, mobile].filter(Boolean).join(' / ');
  return extra ? `${nickname}（${extra}）` : nickname;
}

function getFollowUserSelectProps() {
  return {
    allowClear: true,
    api: getSimpleUserList,
    class: 'w-full',
    labelField: 'nickname',
    labelFn: formatUserOptionLabel,
    optionFilterProp: 'label',
    placeholder: '请选择跟进人',
    popupMatchSelectWidth: 420,
    showSearch: true,
    valueField: 'nickname',
  };
}

export function useFormSchema(
  shopOptions: ShopNameSelectOptions = {},
): VbenFormSchema[] {
  return [
    { fieldName: 'id', component: 'Input', formItemClass: 'hidden' },
    {
      fieldName: 'orderNo',
      label: '订单号',
      component: 'Input',
      componentProps: {
        allowClear: true,
        maxlength: 64,
        placeholder: '请输入订单号',
      },
      rules: 'required',
    },
    {
      fieldName: 'shopName',
      label: '店铺',
      component: 'Select',
      componentProps: getShopNameSelectProps(shopOptions),
    },
    {
      fieldName: 'productSpec',
      label: '产品规格',
      component: 'Input',
      componentProps: {
        allowClear: true,
        maxlength: 255,
        placeholder: '请输入产品规格',
      },
      rules: 'required',
    },
    {
      fieldName: 'quantity',
      label: '数量',
      component: 'InputNumber',
      componentProps: { class: 'w-full', min: 1, precision: 0 },
      rules: z.number().min(1, '数量必须大于 0'),
    },
    {
      fieldName: 'orderDate',
      label: '订单时间',
      component: 'DatePicker',
      componentProps: {
        class: 'w-full',
        allowClear: true,
        format: 'YYYY-MM-DD HH:mm:ss',
        showTime: true,
        valueFormat: 'YYYY-MM-DD HH:mm:ss',
      },
    },
    {
      fieldName: 'importSequence',
      label: '导入顺序',
      component: 'InputNumber',
      componentProps: { class: 'w-full', min: 0, precision: 0 },
    },
    {
      fieldName: 'followUser',
      label: '跟进人',
      component: 'ApiSelect',
      componentProps: getFollowUserSelectProps(),
    },
    {
      fieldName: 'productionSent',
      label: '是否制作发出',
      component: 'RadioGroup',
      defaultValue: 0,
      componentProps: {
        buttonStyle: 'solid',
        optionType: 'button',
        options: PRODUCTION_SENT_OPTIONS,
      },
    },
    {
      fieldName: 'remark',
      label: '备注',
      component: 'Textarea',
      formItemClass: 'col-span-2',
      componentProps: { rows: 3, maxlength: 512, showCount: true },
    },
  ];
}

export function useBatchFormSchema(
  shopOptions: ShopNameSelectOptions = {},
): VbenFormSchema[] {
  return [
    {
      fieldName: 'orderNo',
      label: '订单号',
      component: 'Input',
      componentProps: {
        allowClear: true,
        maxlength: 64,
        placeholder: '请输入订单号',
      },
      rules: 'required',
    },
    {
      fieldName: 'shopName',
      label: '店铺',
      component: 'Select',
      componentProps: getShopNameSelectProps(shopOptions),
      formItemClass: 'col-span-2',
    },
    {
      fieldName: 'orderDate',
      label: '订单时间',
      component: 'DatePicker',
      componentProps: {
        class: 'w-full',
        allowClear: true,
        format: 'YYYY-MM-DD HH:mm:ss',
        showTime: true,
        valueFormat: 'YYYY-MM-DD HH:mm:ss',
      },
    },
    {
      fieldName: 'importSequence',
      label: '起始顺序',
      component: 'InputNumber',
      componentProps: { class: 'w-full', min: 0, precision: 0 },
    },
    {
      fieldName: 'followUser',
      label: '跟进人',
      component: 'ApiSelect',
      componentProps: getFollowUserSelectProps(),
    },
    {
      fieldName: 'productionSent',
      label: '是否制作发出',
      component: 'RadioGroup',
      defaultValue: 0,
      componentProps: {
        buttonStyle: 'solid',
        optionType: 'button',
        options: PRODUCTION_SENT_OPTIONS,
      },
    },
    {
      fieldName: 'remark',
      label: '备注',
      component: 'Textarea',
      formItemClass: 'col-span-2',
      componentProps: { rows: 2, maxlength: 512, showCount: true },
    },
  ];
}

export function useGridFormSchema(
  shopOptions: ShopNameSelectOptions = {},
): VbenFormSchema[] {
  return [
    {
      fieldName: 'orderNo',
      label: '订单号',
      component: 'Input',
      componentProps: { allowClear: true, placeholder: '请输入订单号' },
    },
    {
      fieldName: 'shopName',
      label: '店铺',
      component: 'Select',
      componentProps: getShopNameSelectProps(shopOptions),
    },
    {
      fieldName: 'itemNo',
      label: '图案明细号',
      component: 'Input',
      componentProps: { allowClear: true, placeholder: '请输入图案明细号' },
    },
    {
      fieldName: 'productSpec',
      label: '产品规格',
      component: 'Input',
      componentProps: { allowClear: true, placeholder: '请输入产品规格' },
    },
    {
      fieldName: 'followUser',
      label: '跟进人',
      component: 'ApiSelect',
      componentProps: getFollowUserSelectProps(),
    },
    {
      fieldName: 'productionSent',
      label: '是否制作发出',
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: PRODUCTION_SENT_OPTIONS,
        placeholder: '请选择是否制作发出',
      },
    },
    {
      fieldName: 'status',
      label: '状态',
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: PATTERN_DESIGN_ITEM_STATUS_OPTIONS,
        placeholder: '请选择状态',
      },
    },
    {
      fieldName: 'orderDate',
      label: '订单时间',
      component: 'RangePicker',
      componentProps: { ...getRangePickerDefaultProps(), allowClear: true },
    },
  ];
}

export function useGridColumns(): VxeTableGridOptions<FdmdataPatternDesignItemApi.PatternDesignItem>['columns'] {
  return [
    { type: 'checkbox', width: 40, fixed: 'left' },
    {
      field: 'orderNo',
      title: '订单号',
      minWidth: 150,
      fixed: 'left',
      showOverflow: 'tooltip',
    },
    {
      field: 'shopName',
      title: '店铺',
      minWidth: 130,
      showOverflow: 'tooltip',
    },
    {
      field: 'itemNo',
      title: '图案明细号',
      minWidth: 140,
      showOverflow: 'tooltip',
    },
    {
      field: 'previewImageUrl',
      title: '设计图',
      width: 100,
      slots: {
        default: ({ row }) =>
          row.designImageUrl
            ? h(Image, {
                height: 64,
                preview: { src: row.designImageUrl },
                src: getPatternDesignImagePreviewUrl(row.previewImageUrl),
                width: 64,
              })
            : '',
      },
    },
    {
      field: 'designImageUrl',
      title: '设计图 URL',
      minWidth: 260,
      showOverflow: 'tooltip',
    },
    {
      field: 'productSpec',
      title: '产品规格',
      minWidth: 160,
      showOverflow: 'tooltip',
    },
    { field: 'quantity', title: '数量', minWidth: 90, align: 'right' },
    {
      field: 'orderDate',
      title: '订单时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    {
      field: 'importSequence',
      title: '导入顺序',
      minWidth: 100,
      align: 'right',
    },
    {
      field: 'followUser',
      title: '跟进人',
      minWidth: 110,
      showOverflow: 'tooltip',
    },
    {
      field: 'productionSent',
      title: '是否制作发出',
      minWidth: 120,
      slots: {
        default: ({ row }) =>
          h(
            Tag,
            { color: Number(row.productionSent) === 1 ? 'blue' : 'default' },
            () => formatProductionSent(row.productionSent),
          ),
      },
    },
    {
      field: 'status',
      title: '状态',
      minWidth: 90,
      slots: {
        default: ({ row }) =>
          h(
            Tag,
            { color: Number(row.status) === 1 ? 'default' : 'green' },
            () => formatStatus(row.status),
          ),
      },
    },
    {
      field: 'remark',
      title: '备注',
      minWidth: 180,
      showOverflow: 'tooltip',
    },
    {
      field: 'createTime',
      title: '创建时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    {
      title: '操作',
      width: 220,
      fixed: 'right',
      slots: { default: 'actions' },
    },
  ];
}
