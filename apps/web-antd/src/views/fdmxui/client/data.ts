import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmxuiClientApi } from '#/api/fdmxui/client';

import { getSimpleFdmxuiPanelList } from '#/api/fdmxui/panel';
import { getSimpleUserList } from '#/api/system/user';
import { getRangePickerDefaultProps } from '#/utils';

export interface SelectOption {
  label: string;
  value: number;
}

export const CLIENT_STATUS_OPTIONS = [
  { label: '正常', value: 1 },
  { label: '已回收', value: 2 },
  { label: '异常', value: 3 },
];

export const FDMXUI_CLIENT_DEFAULTS: Partial<FdmxuiClientApi.Client> = {
  totalGb: 0,
  limitIp: 0,
};

function formatStatus({ cellValue }: { cellValue: unknown }) {
  return (
    CLIENT_STATUS_OPTIONS.find((item) => item.value === cellValue)?.label ??
    '未知'
  );
}

function formatQuota({ cellValue }: { cellValue: unknown }) {
  const value = Number(cellValue || 0);
  return value > 0 ? `${value} GB` : '不限';
}

export function useFormSchema(
  onPanelChange: (panelId?: number) => void,
  inboundOptions: SelectOption[],
): VbenFormSchema[] {
  return [
    {
      fieldName: 'userId',
      label: '系统用户',
      component: 'ApiSelect',
      rules: 'required',
      componentProps: {
        api: getSimpleUserList,
        labelField: 'nickname',
        valueField: 'id',
        allowClear: true,
        class: '!w-full',
        placeholder: '请选择系统用户',
      },
    },
    {
      fieldName: 'panelId',
      label: '3XUI面板',
      component: 'ApiSelect',
      rules: 'required',
      componentProps: {
        api: getSimpleFdmxuiPanelList,
        labelField: 'panelName',
        valueField: 'id',
        allowClear: true,
        class: '!w-full',
        placeholder: '请选择面板',
        onChange: (value?: number) => onPanelChange(value),
      },
    },
    {
      fieldName: 'inboundIds',
      label: '3XUI节点',
      component: 'Select',
      rules: 'required',
      formItemClass: 'col-span-2',
      componentProps: {
        allowClear: true,
        class: '!w-full',
        disabled: inboundOptions.length === 0,
        maxTagCount: 'responsive',
        mode: 'multiple',
        options: inboundOptions,
        placeholder: '请选择节点',
      },
    },
    {
      fieldName: 'totalGb',
      label: '流量限制(GB)',
      component: 'InputNumber',
      componentProps: {
        class: '!w-full',
        min: 0,
        precision: 0,
        placeholder: '0 表示不限',
      },
    },
    {
      fieldName: 'limitIp',
      label: 'IP限制',
      component: 'InputNumber',
      componentProps: {
        class: '!w-full',
        min: 0,
        precision: 0,
        placeholder: '0 表示不限',
      },
    },
    {
      fieldName: 'expireTime',
      label: '过期时间',
      component: 'DatePicker',
      componentProps: {
        class: '!w-full',
        allowClear: true,
        showTime: true,
        valueFormat: 'YYYY-MM-DD HH:mm:ss',
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

export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'userId',
      label: '系统用户',
      component: 'ApiSelect',
      componentProps: {
        api: getSimpleUserList,
        labelField: 'nickname',
        valueField: 'id',
        allowClear: true,
        placeholder: '请选择系统用户',
      },
    },
    {
      fieldName: 'panelId',
      label: '面板',
      component: 'ApiSelect',
      componentProps: {
        api: getSimpleFdmxuiPanelList,
        labelField: 'panelName',
        valueField: 'id',
        allowClear: true,
        placeholder: '请选择面板',
      },
    },
    {
      fieldName: 'xuiEmail',
      label: '客户端标识',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'status',
      label: '状态',
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: CLIENT_STATUS_OPTIONS,
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

export function useGridColumns(): VxeTableGridOptions<FdmxuiClientApi.Client>['columns'] {
  return [
    { type: 'checkbox', width: 40, fixed: 'left' },
    {
      field: 'userNickname',
      title: '系统用户',
      minWidth: 120,
      fixed: 'left',
      showOverflow: 'tooltip',
    },
    {
      field: 'panelName',
      title: '面板',
      minWidth: 140,
      showOverflow: 'tooltip',
    },
    {
      field: 'inboundNames',
      title: '节点',
      minWidth: 220,
      showOverflow: 'tooltip',
    },
    {
      field: 'xuiEmail',
      title: '客户端标识',
      minWidth: 200,
      showOverflow: 'tooltip',
    },
    {
      field: 'subId',
      title: '订阅ID',
      minWidth: 150,
      showOverflow: 'tooltip',
    },
    {
      field: 'totalGb',
      title: '流量限制',
      minWidth: 100,
      formatter: formatQuota,
    },
    {
      field: 'expireTime',
      title: '过期时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    {
      field: 'status',
      title: '状态',
      minWidth: 90,
      formatter: formatStatus,
    },
    {
      field: 'subscriptionUrl',
      title: '普通订阅',
      minWidth: 240,
      showOverflow: 'tooltip',
    },
    {
      field: 'lastSyncTime',
      title: '最后同步时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    {
      field: 'lastSyncError',
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
      width: 240,
      fixed: 'right',
      slots: { default: 'actions' },
    },
  ];
}
