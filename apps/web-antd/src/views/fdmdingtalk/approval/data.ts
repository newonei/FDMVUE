import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';

import { beginOfDay, formatDateTime } from '@vben/utils';

import { getRangePickerDefaultProps } from '#/utils';

const DEFAULT_LOOKBACK_DAYS = 30;

/** 当前用户审批单的搜索条件。 */
export function useGridFormSchema(): VbenFormSchema[] {
  const now = new Date();
  const start = new Date(
    now.getTime() - DEFAULT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );

  return [
    {
      fieldName: 'keyword',
      label: '关键词',
      component: 'Input',
      componentProps: {
        allowClear: true,
        maxlength: 100,
        placeholder: '审批标题、流程、发起人或部门',
      },
    },
    {
      fieldName: 'timeRange',
      label: '发起时间',
      component: 'RangePicker',
      componentProps: {
        ...getRangePickerDefaultProps(),
        allowClear: true,
      },
      defaultValue: [formatDateTime(beginOfDay(start)), formatDateTime(now)],
    },
  ];
}

/** 审批列表字段。 */
export function useGridColumns(): VxeTableGridOptions['columns'] {
  return [
    {
      field: 'title',
      title: '审批单',
      minWidth: 260,
      align: 'left',
      slots: { default: 'approval-title' },
    },
    {
      field: 'templateName',
      title: '审批流程',
      minWidth: 170,
    },
    {
      field: 'originatorUserId',
      title: '发起人',
      minWidth: 150,
      slots: { default: 'originator' },
    },
    {
      field: 'createTime',
      title: '发起时间',
      minWidth: 175,
      formatter: 'formatDateTime',
    },
    {
      field: 'finishTime',
      title: '完成时间',
      minWidth: 175,
      formatter: 'formatDateTime',
    },
    {
      field: 'status',
      title: '审批状态',
      minWidth: 150,
      slots: { default: 'approval-status' },
    },
    {
      field: 'processInstanceId',
      title: '审批实例 ID',
      minWidth: 290,
      showOverflow: 'tooltip',
    },
    {
      title: '操作',
      width: 100,
      fixed: 'right',
      slots: { default: 'actions' },
    },
  ];
}
