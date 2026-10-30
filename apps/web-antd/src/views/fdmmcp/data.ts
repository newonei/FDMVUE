import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmMcpApi } from '#/api/fdmmcp';

import { getRangePickerDefaultProps } from '#/utils';

export const TOOL_RISK_META: Record<
  FdmMcpApi.ToolRisk,
  { color: string; label: string }
> = {
  READ: { color: 'green', label: '只读' },
  WRITE: { color: 'orange', label: '写入' },
  DESTRUCTIVE: { color: 'red', label: '修改/删除' },
};

export const SCOPE_LABELS: Record<string, string> = {
  'fdm.read': '读取',
  'fdm.write': '修改',
  'fdm.requirement.work': '需求自动化',
  'fdm.profile.read': '身份（旧版）',
  'fdm.ec_shop_daily.read': '店铺日汇总（旧版）',
  'fdm.data_just_sku.read': 'SKU 读取（旧版）',
  'fdm.data_just_sku.write': 'SKU 修改（旧版）',
  'fdm.requirement.read': '需求读取（旧版）',
};

export function scopeLabel(scope: string) {
  return SCOPE_LABELS[scope] ?? scope;
}

export const RESULT_CODE_OPTIONS = [
  'SUCCESS',
  'FORBIDDEN_SCOPE',
  'FORBIDDEN_RBAC',
  'VALIDATION_ERROR',
  'NOT_FOUND',
  'CONFLICT',
  'CONFIRMATION_INVALID',
  'RESPONSE_TOO_LARGE',
  'RATE_LIMITED',
  'UNAUTHORIZED',
  'INTERNAL_ERROR',
].map((value) => ({ label: value, value }));

export function useConnectionFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'userId',
      label: '用户编号',
      component: 'InputNumber',
      componentProps: { min: 1, class: 'w-full' },
    },
    {
      fieldName: 'active',
      label: '状态',
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: [
          { label: '有效', value: true },
          { label: '已撤销', value: false },
        ],
      },
      defaultValue: true,
    },
  ];
}

export function useConnectionColumns(): VxeTableGridOptions<FdmMcpApi.Connection>['columns'] {
  return [
    { field: 'userNickname', title: '用户', minWidth: 120 },
    { field: 'clientName', title: 'AI 客户端', minWidth: 160 },
    {
      field: 'scopes',
      title: '授权范围',
      minWidth: 180,
      formatter: ({ cellValue }) =>
        ((cellValue as string[]) ?? []).map((s) => scopeLabel(s)).join('、'),
    },
    {
      field: 'grantedTime',
      title: '授权时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    {
      field: 'lastUsedTime',
      title: '最近使用',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    {
      field: 'revokedTime',
      title: '状态',
      minWidth: 90,
      slots: { default: 'status' },
    },
    {
      title: '操作',
      width: 100,
      fixed: 'right',
      slots: { default: 'actions' },
    },
  ];
}

export function useClientFormSchema(): VbenFormSchema[] {
  return [
    { fieldName: 'clientName', label: '客户端名称', component: 'Input' },
    {
      fieldName: 'enabled',
      label: '状态',
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: [
          { label: '启用', value: true },
          { label: '停用', value: false },
        ],
      },
    },
  ];
}

export function useClientColumns(): VxeTableGridOptions<FdmMcpApi.Client>['columns'] {
  return [
    { field: 'clientName', title: '客户端名称', minWidth: 160 },
    { field: 'registrationSource', title: '注册方式', minWidth: 90 },
    {
      field: 'redirectUris',
      title: '回调地址',
      minWidth: 260,
      showOverflow: 'tooltip',
      formatter: ({ cellValue }) => ((cellValue as string[]) ?? []).join('\n'),
    },
    {
      field: 'scopes',
      title: '可申请范围',
      minWidth: 160,
      formatter: ({ cellValue }) =>
        ((cellValue as string[]) ?? []).map((s) => scopeLabel(s)).join('、'),
    },
    { field: 'activeConnectionCount', title: '授权用户数', minWidth: 100 },
    {
      field: 'createTime',
      title: '注册时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    {
      field: 'enabled',
      title: '启用',
      width: 90,
      fixed: 'right',
      slots: { default: 'enabled' },
    },
  ];
}

export function useAuditFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'userId',
      label: '用户编号',
      component: 'InputNumber',
      componentProps: { min: 1, class: 'w-full' },
    },
    { fieldName: 'toolName', label: '工具名称', component: 'Input' },
    {
      fieldName: 'resultCode',
      label: '结果',
      component: 'Select',
      componentProps: { allowClear: true, options: RESULT_CODE_OPTIONS },
    },
    {
      fieldName: 'createTime',
      label: '调用时间',
      component: 'RangePicker',
      componentProps: { ...getRangePickerDefaultProps(), allowClear: true },
    },
  ];
}

export function useAuditColumns(): VxeTableGridOptions<FdmMcpApi.AuditLog>['columns'] {
  return [
    {
      field: 'createTime',
      title: '调用时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    { field: 'userNickname', title: '用户', minWidth: 100 },
    { field: 'clientName', title: 'AI 客户端', minWidth: 140 },
    {
      field: 'toolTitle',
      title: '工具',
      minWidth: 220,
      formatter: ({ row }) =>
        row.toolTitle ? `${row.toolTitle}（${row.toolName}）` : row.toolName,
    },
    {
      field: 'resultCode',
      title: '结果',
      minWidth: 150,
      slots: { default: 'result' },
    },
    { field: 'durationMs', title: '耗时(ms)', minWidth: 90 },
    { field: 'itemCount', title: '条数', minWidth: 70 },
    { field: 'clientIp', title: 'IP', minWidth: 120 },
    {
      field: 'traceId',
      title: 'TraceId',
      minWidth: 240,
      showOverflow: 'tooltip',
    },
  ];
}
