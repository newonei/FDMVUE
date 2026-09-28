import type { Ref } from 'vue';

import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmNeixiaoPatternDesignItemApi } from '#/api/fdmneixiao/pattern/design-item';
import type { SystemUserApi } from '#/api/system/user';

import { h } from 'vue';

import { Image, Tag } from 'ant-design-vue';

import { z } from '#/adapter/form';
import { uploadFdmNeixiaoPatternDesignItemAttachment } from '#/api/fdmneixiao/pattern/design-item';
import { getSimpleUserList } from '#/api/system/user';
import { getRangePickerDefaultProps } from '#/utils';

export const PATTERN_DESIGN_ITEM_DEFAULTS: Partial<FdmNeixiaoPatternDesignItemApi.PatternDesignItem> =
  {
    quantity: 1,
    importSequence: 0,
    productionSent: 0,
    downloaded: 0,
    status: 0,
  };

export const PATTERN_DESIGN_ITEM_STATUS_OPTIONS = [
  { label: '启用', value: 0 },
  { label: '停用', value: 1 },
];

export const RECOGNITION_STATUS_OPTIONS = [
  { label: '待识别', value: 0 },
  { label: '部分识别', value: 1 },
  { label: '已完成', value: 2 },
];

export const PRODUCTION_SENT_OPTIONS = [
  { label: '未发出', value: 0 },
  { label: '已发出', value: 1 },
];

export const DOWNLOADED_OPTIONS = [
  { label: '未下载', value: 0 },
  { label: '已下载', value: 1 },
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

function formatRecognitionStatus(value: unknown) {
  if (Number(value) === 2) return '已完成';
  if (Number(value) === 1) return '部分识别';
  return '待识别';
}

function formatRecognitionProgress(
  row: FdmNeixiaoPatternDesignItemApi.PatternDesignItem,
) {
  const recognizedCount = Number(row.recognizedCount ?? 0);
  const quantity = Number(row.quantity ?? 0);
  const recognized = Number.isFinite(recognizedCount) ? recognizedCount : 0;
  const total = Number.isFinite(quantity) ? quantity : 0;
  return `${recognized}/${total}`;
}

function formatProductionSent(value: unknown) {
  return Number(value) === 1 ? '已发出' : '未发出';
}

function recognitionStatusColor(value: unknown) {
  if (Number(value) === 2) return 'green';
  if (Number(value) === 1) return 'orange';
  return 'default';
}

function formatDownloaded(value: unknown) {
  return Number(value) === 1 ? '已下载' : '未下载';
}

function formatPurchasePrice(value: unknown) {
  if (value === undefined || value === null || value === '') return '';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return String(value);
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
  }).format(amount);
}

function formatItemNoWithTotal(
  row: FdmNeixiaoPatternDesignItemApi.PatternDesignItem,
) {
  const itemNo = String(row.itemNo ?? '').trim();
  const total = Number(row.orderItemCount ?? 0);
  const parsedItemNo = Number.parseInt(itemNo, 10);
  const current =
    Number.isFinite(parsedItemNo) && parsedItemNo > 0
      ? String(parsedItemNo)
      : itemNo || '-';
  return total > 0 ? `${current}/${total}` : current;
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

function getAttachmentUploadProps() {
  return {
    api: uploadFdmNeixiaoPatternDesignItemAttachment,
    maxNumber: 1,
    maxSize: 1024,
    showDescription: false,
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
        allowClear: false,
        maxlength: 64,
        placeholder: '请输入订单号',
      },
      rules: 'required',
    },
    {
      fieldName: 'internalOrderNo',
      label: '内部单号',
      component: 'Input',
      componentProps: {
        allowClear: true,
        maxlength: 64,
        placeholder: '请输入内部单号',
      },
    },
    {
      fieldName: 'shopName',
      label: '店铺',
      component: 'Select',
      componentProps: getShopNameSelectProps(shopOptions),
    },
    {
      fieldName: 'attachmentUrl',
      label: '附件',
      component: 'FileUpload',
      componentProps: getAttachmentUploadProps(),
      formItemClass: 'col-span-2',
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
      fieldName: 'packagingMethod',
      label: '包装方式',
      component: 'Input',
      componentProps: {
        allowClear: true,
        maxlength: 128,
        placeholder: '请输入包装方式',
      },
    },
    {
      fieldName: 'purchasePrice',
      label: '采购价',
      component: 'InputNumber',
      componentProps: {
        class: 'w-full',
        min: 0,
        placeholder: '请输入采购价，单位：元',
        precision: 6,
        step: 0.01,
      },
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
      componentProps: {
        class: 'w-full',
        rows: 3,
        maxlength: 512,
        showCount: true,
      },
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
      fieldName: 'internalOrderNo',
      label: '内部单号',
      component: 'Input',
      componentProps: {
        allowClear: true,
        maxlength: 64,
        placeholder: '请输入内部单号',
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
      fieldName: 'followUser',
      label: '跟进人',
      component: 'ApiSelect',
      componentProps: getFollowUserSelectProps(),
    },
    {
      fieldName: 'importSequence',
      label: '起始顺序',
      component: 'InputNumber',
      componentProps: { class: 'w-full', min: 0, precision: 0 },
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
      fieldName: 'attachmentUrl',
      label: '附件',
      component: 'FileUpload',
      componentProps: getAttachmentUploadProps(),
      formItemClass: 'md:col-span-2',
    },
    {
      fieldName: 'remark',
      label: '备注',
      component: 'Textarea',
      formItemClass: 'md:col-span-3',
      componentProps: {
        class: 'w-full',
        rows: 2,
        maxlength: 512,
        showCount: true,
      },
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
      fieldName: 'internalOrderNo',
      label: '内部单号',
      component: 'Input',
      componentProps: { allowClear: true, placeholder: '请输入内部单号' },
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
      fieldName: 'recognitionStatus',
      label: '识别状态',
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: RECOGNITION_STATUS_OPTIONS,
        placeholder: '请选择识别状态',
      },
    },
    {
      fieldName: 'downloaded',
      label: '是否下载',
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: DOWNLOADED_OPTIONS,
        placeholder: '请选择是否下载',
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

function renderStatusTag(color: string, text: string) {
  return h(Tag, { color, style: { marginInlineEnd: 0 } }, () => text);
}

export function useGridColumns(): VxeTableGridOptions<FdmNeixiaoPatternDesignItemApi.PatternDesignItem>['columns'] {
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
      field: 'previewImage',
      title: '预览图',
      width: 84,
      fixed: 'left',
      align: 'center',
      slots: {
        default: ({ row }) =>
          row.previewImageUrl
            ? h(Image, {
                height: 56,
                preview: {
                  src: getPatternDesignImagePreviewUrl(
                    row.previewImageUrl,
                    'preview',
                  ),
                },
                src: getPatternDesignImagePreviewUrl(
                  row.previewImageUrl,
                  'thumb',
                ),
                style: { objectFit: 'cover', borderRadius: '4px' },
                width: 56,
              })
            : '',
      },
    },
    {
      field: 'internalOrderNo',
      title: '内部单号',
      minWidth: 140,
      showOverflow: 'tooltip',
    },
    {
      field: 'itemNo',
      title: '明细号',
      width: 90,
      align: 'center',
      slots: {
        default: ({ row }) => formatItemNoWithTotal(row),
      },
    },
    {
      // 制作 / 识别 / 下载三个状态合并展示，减少横向滚动
      field: 'processSummary',
      title: '处理进度',
      width: 250,
      slots: {
        default: ({ row }) =>
          h('div', { class: 'flex flex-wrap gap-1' }, [
            renderStatusTag(
              Number(row.productionSent) === 1 ? 'blue' : 'default',
              formatProductionSent(row.productionSent),
            ),
            renderStatusTag(
              recognitionStatusColor(row.recognitionStatus),
              `${formatRecognitionStatus(row.recognitionStatus)} ${formatRecognitionProgress(row)}`,
            ),
            renderStatusTag(
              Number(row.downloaded) === 1 ? 'blue' : 'default',
              formatDownloaded(row.downloaded),
            ),
          ]),
      },
    },
    {
      field: 'shopName',
      title: '店铺',
      minWidth: 130,
      showOverflow: 'tooltip',
    },
    {
      field: 'productSpec',
      title: '产品规格',
      minWidth: 160,
      showOverflow: 'tooltip',
    },
    { field: 'quantity', title: '数量', width: 80, align: 'right' },
    {
      field: 'purchasePrice',
      title: '采购价',
      minWidth: 110,
      align: 'right',
      slots: {
        default: ({ row }) => formatPurchasePrice(row.purchasePrice),
      },
    },
    {
      field: 'packagingMethod',
      title: '包装方式',
      minWidth: 120,
      showOverflow: 'tooltip',
    },
    {
      field: 'orderDate',
      title: '订单时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    {
      field: 'followUser',
      title: '跟进人',
      minWidth: 100,
      showOverflow: 'tooltip',
    },
    {
      field: 'importSequence',
      title: '导入顺序',
      width: 90,
      align: 'right',
    },
    {
      field: 'status',
      title: '状态',
      width: 80,
      slots: {
        default: ({ row }) =>
          renderStatusTag(
            Number(row.status) === 1 ? 'default' : 'green',
            formatStatus(row.status),
          ),
      },
    },
    {
      field: 'remark',
      title: '备注',
      minWidth: 160,
      showOverflow: 'tooltip',
    },
    {
      field: 'createTime',
      title: '创建时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    {
      field: 'previewImageUrl',
      title: '预览图 URL',
      minWidth: 220,
      showOverflow: 'tooltip',
      visible: false,
    },
    {
      field: 'designImageUrl',
      title: '原图 URL',
      minWidth: 260,
      showOverflow: 'tooltip',
      visible: false,
    },
    {
      field: '__actions',
      title: '操作',
      width: 260,
      fixed: 'right',
      slots: { default: 'actions' },
    },
  ];
}
