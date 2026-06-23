import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmxuiInboundApi } from '#/api/fdmxui/inbound';

import { getSimpleFdmxuiPanelList } from '#/api/fdmxui/panel';
import { getRangePickerDefaultProps } from '#/utils';

export const INBOUND_AVAILABLE_OPTIONS = [
  { label: '可用', value: true },
  { label: '不可用', value: false },
];

function formatBoolean({ cellValue }: { cellValue: unknown }) {
  return cellValue ? '是' : '否';
}

function formatAvailable({ cellValue }: { cellValue: unknown }) {
  return cellValue ? '可用' : '不可用';
}

export function useGridFormSchema(): VbenFormSchema[] {
  return [
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
      fieldName: 'remark',
      label: '节点名称',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'tag',
      label: '节点标识',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'protocol',
      label: '协议',
      component: 'Input',
      componentProps: { allowClear: true },
    },
    {
      fieldName: 'available',
      label: '可用状态',
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: INBOUND_AVAILABLE_OPTIONS,
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

export function useGridColumns(): VxeTableGridOptions<FdmxuiInboundApi.Inbound>['columns'] {
  return [
    { type: 'checkbox', width: 40, fixed: 'left' },
    {
      field: 'panelName',
      title: '面板',
      minWidth: 150,
      fixed: 'left',
      showOverflow: 'tooltip',
    },
    { field: 'xuiInboundId', title: 'Inbound ID', minWidth: 110 },
    {
      field: 'remark',
      title: '节点名称',
      minWidth: 180,
      showOverflow: 'tooltip',
    },
    {
      field: 'tag',
      title: '节点标识',
      minWidth: 160,
      showOverflow: 'tooltip',
    },
    { field: 'protocol', title: '协议', minWidth: 90 },
    { field: 'port', title: '端口', minWidth: 90 },
    {
      field: 'ssMethod',
      title: 'SS加密',
      minWidth: 130,
      showOverflow: 'tooltip',
    },
    {
      field: 'tlsFlowCapable',
      title: 'TLS Flow',
      minWidth: 100,
      formatter: formatBoolean,
    },
    {
      field: 'available',
      title: '可用状态',
      minWidth: 100,
      formatter: formatAvailable,
    },
    {
      field: 'lastSyncTime',
      title: '最后同步时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    {
      field: 'lastSyncError',
      title: '最后同步错误',
      minWidth: 220,
      showOverflow: 'tooltip',
    },
    {
      field: 'createTime',
      title: '创建时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
  ];
}
