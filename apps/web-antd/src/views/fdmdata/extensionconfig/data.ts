import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataExtensionConfigApi } from '#/api/fdmdata/extensionconfig';

import { getRangePickerDefaultProps } from '#/utils';

export const ENABLED_OPTIONS = [
  { label: '启用', value: 1 },
  { label: '停用', value: 0 },
];

export const EXTENSION_CONFIG_DEFAULTS: Partial<FdmdataExtensionConfigApi.ExtensionConfig> = {
  channel: 'stable',
  configKey: 'runtime',
  configJson: '{\n  "checkIntervalMinutes": 360,\n  "updateReminderHours": 24,\n  "featureFlags": {}\n}',
  enabled: 1,
};

export function useFormSchema(): VbenFormSchema[] {
  return [
    { fieldName: 'id', component: 'Input', formItemClass: 'hidden' },
    {
      fieldName: 'channel',
      label: '发布通道',
      component: 'Input',
      componentProps: { placeholder: 'stable' },
      rules: 'required',
    },
    {
      fieldName: 'configKey',
      label: '配置键',
      component: 'Input',
      componentProps: { placeholder: '例如 runtime 或 jdSelectors' },
      rules: 'required',
    },
    {
      fieldName: 'enabled',
      label: '状态',
      component: 'Select',
      componentProps: { options: ENABLED_OPTIONS },
      rules: 'required',
    },
    {
      fieldName: 'configJson',
      label: 'JSON 配置',
      component: 'Textarea',
      componentProps: { rows: 16, class: 'font-mono', placeholder: '必须是 JSON 对象' },
      formItemClass: 'md:col-span-2',
      rules: 'required',
    },
    {
      fieldName: 'remark',
      label: '备注',
      component: 'Textarea',
      componentProps: { rows: 3, maxlength: 512, showCount: true },
      formItemClass: 'md:col-span-2',
    },
  ];
}

export function useGridFormSchema(): VbenFormSchema[] {
  return [
    { fieldName: 'configKey', label: '配置键', component: 'Input' },
    { fieldName: 'channel', label: '通道', component: 'Input' },
    {
      fieldName: 'enabled',
      label: '状态',
      component: 'Select',
      componentProps: { allowClear: true, options: ENABLED_OPTIONS },
    },
    {
      fieldName: 'createTime',
      label: '创建时间',
      component: 'RangePicker',
      componentProps: { ...getRangePickerDefaultProps(), allowClear: true },
    },
  ];
}

export function useGridColumns(): VxeTableGridOptions<FdmdataExtensionConfigApi.ExtensionConfig>['columns'] {
  return [
    { type: 'checkbox', width: 40, fixed: 'left' },
    { field: 'configKey', title: '配置键', minWidth: 180, fixed: 'left' },
    { field: 'channel', title: '通道', minWidth: 100 },
    { field: 'configVersion', title: '配置版本', minWidth: 100 },
    {
      field: 'enabled',
      title: '状态',
      minWidth: 80,
      formatter: ({ cellValue }: { cellValue: unknown }) => Number(cellValue) === 1 ? '启用' : '停用',
    },
    { field: 'configJson', title: 'JSON 配置', minWidth: 360, showOverflow: 'tooltip' },
    { field: 'remark', title: '备注', minWidth: 200, showOverflow: 'tooltip' },
    { field: 'updateTime', title: '更新时间', minWidth: 160, formatter: 'formatDateTime' },
    { title: '操作', width: 150, fixed: 'right', slots: { default: 'actions' } },
  ];
}
