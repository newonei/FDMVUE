import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmxuiPanelApi } from '#/api/fdmxui/panel';

import { getRangePickerDefaultProps } from '#/utils';

export const FDMXUI_PANEL_DEFAULTS: Partial<FdmxuiPanelApi.Panel> = {
  enabled: true,
  connectionStatus: 0,
  webBasePath: '',
  subPath: '/sub/',
  jsonPath: '/json/',
  clashPath: '/clash/',
};

export const ENABLED_OPTIONS = [
  { label: '启用', value: true },
  { label: '停用', value: false },
];

export const CONNECTION_STATUS_OPTIONS = [
  { label: '未知', value: 0 },
  { label: '正常', value: 1 },
  { label: '异常', value: 2 },
];

function formatBoolean({ cellValue }: { cellValue: unknown }) {
  return cellValue ? '是' : '否';
}

function formatConnectionStatus({ cellValue }: { cellValue: unknown }) {
  return (
    CONNECTION_STATUS_OPTIONS.find((item) => item.value === cellValue)?.label ??
    '未知'
  );
}

export function useFormSchema(): VbenFormSchema[] {
  return [
    { fieldName: 'id', component: 'Input', formItemClass: 'hidden' },
    {
      fieldName: 'panelName',
      label: '面板名称',
      component: 'Input',
      rules: 'required',
      componentProps: { allowClear: true, maxlength: 64 },
    },
    {
      fieldName: 'enabled',
      label: '启用状态',
      component: 'Switch',
      componentProps: {
        checkedChildren: '启用',
        unCheckedChildren: '停用',
      },
    },
    {
      fieldName: 'panelUrl',
      label: '面板地址',
      component: 'Input',
      rules: 'required',
      formItemClass: 'col-span-2',
      componentProps: {
        allowClear: true,
        maxlength: 255,
        placeholder: 'https://192.220.99.62:50252',
      },
    },
    {
      fieldName: 'apiToken',
      label: 'API令牌',
      component: 'InputPassword',
      formItemClass: 'col-span-2',
      help: '填写 3XUI 面板安全设置里的 API 令牌；编辑时留空表示不修改当前令牌',
      componentProps: {
        allowClear: true,
        maxlength: 1024,
        placeholder: 'Authorization: Bearer 使用的 API 令牌',
      },
    },
    {
      fieldName: 'webBasePath',
      label: 'Web Base Path',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 128, placeholder: '/' },
    },
    {
      fieldName: 'subBaseUrl',
      label: '订阅基础地址',
      component: 'Input',
      help: '填写用户实际访问订阅的地址，不一定等于面板管理地址，例如 https://192.220.99.62:2096',
      formItemClass: 'col-span-2',
      componentProps: {
        allowClear: true,
        maxlength: 255,
        placeholder: 'https://192.220.99.62:2096',
      },
    },
    {
      fieldName: 'subPath',
      label: '订阅路径',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 64 },
    },
    {
      fieldName: 'jsonPath',
      label: 'JSON订阅路径',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 64 },
    },
    {
      fieldName: 'clashPath',
      label: 'Clash订阅路径',
      component: 'Input',
      componentProps: { allowClear: true, maxlength: 64 },
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

export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'panelName',
      label: '面板名称',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'panelUrl',
      label: '面板地址',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'enabled',
      label: '启用状态',
      component: 'Select',
      componentProps: { allowClear: true, options: ENABLED_OPTIONS },
    },
    {
      fieldName: 'connectionStatus',
      label: '连接状态',
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: CONNECTION_STATUS_OPTIONS,
      },
    },
    {
      fieldName: 'createTime',
      label: '创建时间',
      component: 'RangePicker',
      componentProps: { ...getRangePickerDefaultProps(), allowClear: true },
    },
  ];
}

export function useGridColumns(): VxeTableGridOptions<FdmxuiPanelApi.Panel>['columns'] {
  return [
    { type: 'checkbox', width: 40, fixed: 'left' },
    {
      field: 'panelName',
      title: '面板名称',
      minWidth: 160,
      fixed: 'left',
      showOverflow: 'tooltip',
    },
    {
      field: 'panelUrl',
      title: '面板地址',
      minWidth: 240,
      showOverflow: 'tooltip',
    },
    {
      field: 'hasApiToken',
      title: 'API令牌',
      minWidth: 100,
      formatter: formatBoolean,
    },
    {
      field: 'enabled',
      title: '启用',
      minWidth: 90,
      formatter: formatBoolean,
    },
    {
      field: 'connectionStatus',
      title: '连接状态',
      minWidth: 100,
      formatter: formatConnectionStatus,
    },
    {
      field: 'subBaseUrl',
      title: '订阅基础地址',
      minWidth: 220,
      showOverflow: 'tooltip',
    },
    { field: 'subPath', title: '订阅路径', minWidth: 110 },
    { field: 'jsonPath', title: 'JSON路径', minWidth: 110 },
    { field: 'clashPath', title: 'Clash路径', minWidth: 120 },
    {
      field: 'lastCheckTime',
      title: '最后检测时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    {
      field: 'lastError',
      title: '最后错误',
      minWidth: 220,
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
