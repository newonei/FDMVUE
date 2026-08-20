import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmWaimaoCrmCustomerApplicationApi } from '#/api/fdmwaimaocrm/customer-application';

import { z } from '#/adapter/form';
import { getRangePickerDefaultProps } from '#/utils';

export const VIP_OPTIONS = [
  { label: '是', value: true },
  { label: '否', value: false },
];

export function formatDraftStatus(value: unknown) {
  return value === 'DRAFT' ? '草稿' : '—';
}

export function formatVipFlag(value: unknown) {
  return value === true || value === 1 || value === '1' ? '是' : '否';
}

export function useCustomerApplicationDraftFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      fieldName: 'id',
      formItemClass: 'hidden',
    },
    {
      component: 'Input',
      fieldName: 'version',
      formItemClass: 'hidden',
    },
    {
      component: 'Input',
      componentProps: {
        allowClear: true,
        maxlength: 200,
        placeholder: '请输入客户名称',
        showCount: true,
      },
      fieldName: 'customerName',
      label: '客户名称',
      rules: z
        .string()
        .trim()
        .min(1, '请输入客户名称')
        .max(200, '客户名称不能超过 200 个字符'),
    },
    {
      component: 'Textarea',
      componentProps: {
        maxlength: 600,
        placeholder: '可自由填写国家、地区和详细地址',
        rows: 2,
        showCount: true,
      },
      fieldName: 'countryAddressText',
      formItemClass: 'col-span-1 md:col-span-2',
      label: '国家/地区及地址',
      rules: z.string().max(600, '国家/地区及地址不能超过 600 个字符'),
    },
    {
      component: 'Input',
      componentProps: {
        allowClear: true,
        maxlength: 100,
        placeholder: '按实际来源填写',
        showCount: true,
      },
      fieldName: 'sourceText',
      label: '客户来源',
      rules: z.string().max(100, '客户来源不能超过 100 个字符'),
    },
    {
      component: 'Input',
      componentProps: {
        allowClear: true,
        maxlength: 500,
        placeholder: '可填写多个感兴趣的产品类型',
        showCount: true,
      },
      fieldName: 'productCategoryText',
      label: '产品类型',
      rules: z.string().max(500, '产品类型不能超过 500 个字符'),
    },
    {
      component: 'Select',
      componentProps: {
        options: VIP_OPTIONS,
        placeholder: '请选择',
      },
      fieldName: 'vipFlag',
      label: 'VIP 标记',
    },
    {
      component: 'Input',
      componentProps: {
        allowClear: true,
        maxlength: 32,
        placeholder: '按实际等级填写',
        showCount: true,
      },
      fieldName: 'alibabaLevelText',
      label: '阿里 L 等级',
      rules: z.string().max(32, '阿里 L 等级不能超过 32 个字符'),
    },
    {
      component: 'Input',
      componentProps: {
        allowClear: true,
        maxlength: 100,
        placeholder: '请输入联系人姓名',
        showCount: true,
      },
      fieldName: 'contactName',
      label: '联系人姓名',
      rules: z.string().max(100, '联系人姓名不能超过 100 个字符'),
    },
    {
      component: 'Input',
      componentProps: {
        allowClear: true,
        maxlength: 320,
        placeholder: 'name@example.com',
      },
      fieldName: 'contactEmail',
      label: '联系人邮箱',
      rules: z
        .string()
        .max(320, '联系人邮箱不能超过 320 个字符')
        .email('邮箱格式不正确')
        .or(z.literal(''))
        .optional(),
    },
    {
      component: 'Input',
      componentProps: {
        allowClear: true,
        maxlength: 64,
        placeholder: '支持国际区号、空格、短横线和分机号',
        showCount: true,
      },
      fieldName: 'contactPhone',
      label: '联系人电话',
      rules: z.string().max(64, '联系人电话不能超过 64 个字符'),
    },
    {
      component: 'Textarea',
      componentProps: {
        maxlength: 1000,
        placeholder: '记录现有沟通、样品或交易事实',
        rows: 3,
        showCount: true,
      },
      fieldName: 'dealEvidenceText',
      formItemClass: 'col-span-1 md:col-span-2',
      label: '成交依据说明',
      rules: z.string().max(1000, '成交依据说明不能超过 1000 个字符'),
    },
    {
      component: 'Textarea',
      componentProps: {
        maxlength: 1000,
        placeholder: '补充其他客户信息',
        rows: 3,
        showCount: true,
      },
      fieldName: 'remark',
      formItemClass: 'col-span-1 md:col-span-2',
      label: '备注',
      rules: z.string().max(1000, '备注不能超过 1000 个字符'),
    },
  ];
}

export function useCustomerApplicationDraftGridColumns(): VxeTableGridOptions<FdmWaimaoCrmCustomerApplicationApi.CustomerApplicationDraft>['columns'] {
  return [
    {
      field: 'customerName',
      fixed: 'left',
      minWidth: 210,
      showOverflow: 'tooltip',
      title: '客户名称',
    },
    {
      field: 'countryAddressText',
      minWidth: 240,
      showOverflow: 'tooltip',
      title: '国家/地区及地址',
    },
    {
      field: 'sourceText',
      minWidth: 130,
      showOverflow: 'tooltip',
      title: '客户来源',
    },
    {
      field: 'productCategoryText',
      minWidth: 180,
      showOverflow: 'tooltip',
      title: '产品类型',
    },
    {
      field: 'contactName',
      minWidth: 120,
      showOverflow: 'tooltip',
      title: '联系人',
    },
    {
      field: 'contactEmail',
      minWidth: 190,
      showOverflow: 'tooltip',
      title: '联系邮箱',
    },
    {
      field: 'contactPhone',
      minWidth: 150,
      showOverflow: 'tooltip',
      title: '联系电话',
    },
    {
      field: 'vipFlag',
      formatter: ({ cellValue }: { cellValue: unknown }) =>
        formatVipFlag(cellValue),
      minWidth: 80,
      title: 'VIP',
    },
    {
      field: 'alibabaLevelText',
      minWidth: 110,
      showOverflow: 'tooltip',
      title: '阿里 L 等级',
    },
    {
      field: 'status',
      formatter: ({ cellValue }: { cellValue: unknown }) =>
        formatDraftStatus(cellValue),
      minWidth: 80,
      title: '状态',
    },
    {
      field: 'updateTime',
      formatter: 'formatDateTime',
      minWidth: 165,
      title: '更新时间',
    },
    {
      field: 'createTime',
      formatter: 'formatDateTime',
      minWidth: 165,
      title: '创建时间',
    },
    {
      fixed: 'right',
      slots: { default: 'actions' },
      title: '操作',
      width: 150,
    },
  ];
}

export function useCustomerApplicationDraftGridFormSchema(): VbenFormSchema[] {
  return [
    {
      component: 'Input',
      componentProps: {
        allowClear: true,
        maxlength: 200,
        placeholder: '客户名称、联系人、邮箱或电话',
      },
      fieldName: 'keyword',
      label: '关键词',
    },
    {
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 600 },
      fieldName: 'countryAddressText',
      label: '国家/地区及地址',
    },
    {
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 100 },
      fieldName: 'sourceText',
      label: '客户来源',
    },
    {
      component: 'Select',
      componentProps: { allowClear: true, options: VIP_OPTIONS },
      fieldName: 'vipFlag',
      label: 'VIP',
    },
    {
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 32 },
      fieldName: 'alibabaLevelText',
      label: '阿里 L 等级',
    },
    {
      component: 'RangePicker',
      componentProps: {
        ...getRangePickerDefaultProps(),
        allowClear: true,
      },
      fieldName: 'createTime',
      label: '创建时间',
    },
  ];
}
