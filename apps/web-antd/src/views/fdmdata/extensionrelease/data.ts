import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataExtensionReleaseApi } from '#/api/fdmdata/extensionrelease';

import { getRangePickerDefaultProps } from '#/utils';

export const CHANNEL_OPTIONS = [{ label: '稳定通道', value: 'stable' }];
export const BROWSER_OPTIONS = [
  { label: 'Chrome 和 Edge', value: 'ALL' },
  { label: '仅 Chrome', value: 'CHROME' },
  { label: '仅 Edge', value: 'EDGE' },
];
export const YES_NO_OPTIONS = [
  { label: '是', value: 1 },
  { label: '否', value: 0 },
];
export const PUBLISHED_OPTIONS = [
  { label: '已发布', value: 1 },
  { label: '草稿', value: 0 },
];

export const EXTENSION_RELEASE_DEFAULTS: Partial<FdmdataExtensionReleaseApi.ExtensionRelease> = {
  channel: 'stable',
  browser: 'ALL',
  forceUpdate: 0,
  rolloutPercent: 100,
  published: 0,
};

export function useFormSchema(): VbenFormSchema[] {
  return [
    { fieldName: 'id', component: 'Input', formItemClass: 'hidden' },
    {
      fieldName: 'channel',
      label: '发布通道',
      component: 'Select',
      componentProps: { options: CHANNEL_OPTIONS },
      rules: 'required',
    },
    {
      fieldName: 'browser',
      label: '适用浏览器',
      component: 'Select',
      componentProps: { options: BROWSER_OPTIONS },
      rules: 'required',
    },
    {
      fieldName: 'version',
      label: '版本号',
      component: 'Input',
      componentProps: { placeholder: '例如 0.0.4' },
      rules: 'required',
    },
    {
      fieldName: 'minSupportedVersion',
      label: '最低支持版本',
      component: 'Input',
      componentProps: { allowClear: true, placeholder: '低于此版本时强制更新' },
    },
    {
      fieldName: 'rolloutPercent',
      label: '灰度比例',
      component: 'InputNumber',
      componentProps: { class: 'w-full', min: 0, max: 100, precision: 0, addonAfter: '%' },
      rules: 'required',
    },
    {
      fieldName: 'forceUpdate',
      label: '强制更新',
      component: 'Select',
      componentProps: { options: YES_NO_OPTIONS },
      rules: 'required',
    },
    {
      fieldName: 'published',
      label: '发布状态',
      component: 'Select',
      componentProps: { options: PUBLISHED_OPTIONS },
      rules: 'required',
    },
    {
      fieldName: 'publishTime',
      label: '发布时间',
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
      fieldName: 'downloadUrl',
      label: '人工下载地址',
      component: 'Input',
      componentProps: { allowClear: true, placeholder: 'ZIP 安装包的 HTTPS 地址' },
      formItemClass: 'md:col-span-2',
    },
    {
      fieldName: 'crxUrl',
      label: 'CRX 地址',
      component: 'Input',
      componentProps: { allowClear: true, placeholder: '企业策略自托管 CRX 地址' },
      formItemClass: 'md:col-span-2',
    },
    {
      fieldName: 'updateUrl',
      label: '更新清单地址',
      component: 'Input',
      componentProps: { allowClear: true, placeholder: 'updates.xml 的 HTTPS 地址' },
      formItemClass: 'md:col-span-2',
    },
    {
      fieldName: 'sha256',
      label: 'SHA-256',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 64 },
      formItemClass: 'md:col-span-2',
    },
    {
      fieldName: 'releaseNotes',
      label: '更新说明',
      component: 'Textarea',
      componentProps: { rows: 5, maxlength: 4000, showCount: true },
      formItemClass: 'md:col-span-2',
    },
  ];
}

export function useGridFormSchema(): VbenFormSchema[] {
  return [
    { fieldName: 'version', label: '版本号', component: 'Input' },
    {
      fieldName: 'browser',
      label: '浏览器',
      component: 'Select',
      componentProps: { allowClear: true, options: BROWSER_OPTIONS },
    },
    {
      fieldName: 'published',
      label: '发布状态',
      component: 'Select',
      componentProps: { allowClear: true, options: PUBLISHED_OPTIONS },
    },
    {
      fieldName: 'createTime',
      label: '创建时间',
      component: 'RangePicker',
      componentProps: { ...getRangePickerDefaultProps(), allowClear: true },
    },
  ];
}

function optionLabel(options: Array<{ label: string; value: string | number }>, value: unknown) {
  return options.find((item) => item.value === value)?.label ?? String(value ?? '');
}

export function useGridColumns(): VxeTableGridOptions<FdmdataExtensionReleaseApi.ExtensionRelease>['columns'] {
  return [
    { type: 'checkbox', width: 40, fixed: 'left' },
    { field: 'version', title: '版本号', minWidth: 100, fixed: 'left' },
    {
      field: 'browser',
      title: '浏览器',
      minWidth: 130,
      formatter: ({ cellValue }: { cellValue: unknown }) => optionLabel(BROWSER_OPTIONS, cellValue),
    },
    { field: 'channel', title: '通道', minWidth: 90 },
    {
      field: 'published',
      title: '发布状态',
      minWidth: 90,
      formatter: ({ cellValue }: { cellValue: unknown }) => optionLabel(PUBLISHED_OPTIONS, cellValue),
    },
    { field: 'rolloutPercent', title: '灰度比例', minWidth: 90, formatter: ({ cellValue }: { cellValue: unknown }) => `${cellValue ?? 0}%` },
    { field: 'minSupportedVersion', title: '最低支持版本', minWidth: 120 },
    {
      field: 'forceUpdate',
      title: '强制更新',
      minWidth: 90,
      formatter: ({ cellValue }: { cellValue: unknown }) => optionLabel(YES_NO_OPTIONS, cellValue),
    },
    { field: 'downloadUrl', title: '下载地址', minWidth: 220, showOverflow: 'tooltip' },
    { field: 'publishTime', title: '发布时间', minWidth: 160, formatter: 'formatDateTime' },
    { field: 'releaseNotes', title: '更新说明', minWidth: 220, showOverflow: 'tooltip' },
    { title: '操作', width: 150, fixed: 'right', slots: { default: 'actions' } },
  ];
}
