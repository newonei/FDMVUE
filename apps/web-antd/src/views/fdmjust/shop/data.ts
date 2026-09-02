import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmjustShopApi } from '#/api/fdmjust/shop';

export const ENABLED_OPTIONS = [
  { label: '启用', value: 1 },
  { label: '停用', value: 0 },
];

export const SESSION_STATUS_OPTIONS = [
  { label: '未授权', value: 0 },
  { label: '已过期', value: 1 },
  { label: '已授权', value: 2 },
  { label: '无需授权', value: 3 },
];

export function getSessionStatusMeta(status?: number) {
  switch (Number(status)) {
    case 1: {
      return { color: 'error', label: '已过期' };
    }
    case 2: {
      return { color: 'success', label: '已授权' };
    }
    case 3: {
      return { color: 'blue', label: '无需授权' };
    }
    default: {
      return { color: 'default', label: '未授权' };
    }
  }
}

/** 店铺列表搜索表单 */
export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'shopId',
      label: '店铺 ID',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '请输入聚水潭店铺 ID',
      },
    },
    {
      fieldName: 'shopName',
      label: '店铺名称',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '请输入店铺名称',
      },
    },
    {
      fieldName: 'shopSite',
      label: '平台',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '请输入店铺平台',
      },
    },
    {
      fieldName: 'enabled',
      label: '启用状态',
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: ENABLED_OPTIONS,
        placeholder: '请选择启用状态',
      },
    },
    {
      fieldName: 'sessionStatus',
      label: '授权状态',
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: SESSION_STATUS_OPTIONS,
        placeholder: '请选择授权状态',
      },
    },
  ];
}

/** 店铺列表字段 */
export function useGridColumns(): VxeTableGridOptions<FdmjustShopApi.Shop>['columns'] {
  return [
    {
      field: 'id',
      title: '系统 ID',
      width: 100,
      fixed: 'left',
    },
    {
      field: 'shopId',
      title: '店铺 ID',
      minWidth: 120,
      fixed: 'left',
    },
    {
      field: 'shopName',
      title: '店铺名称',
      minWidth: 210,
      fixed: 'left',
      showOverflow: 'tooltip',
    },
    {
      field: 'enabled',
      title: '启用状态',
      width: 100,
      slots: { default: 'enabled' },
    },
    {
      field: 'shopSite',
      title: '平台',
      minWidth: 120,
      showOverflow: 'tooltip',
    },
    {
      field: 'shortName',
      title: '店铺简称',
      minWidth: 150,
      showOverflow: 'tooltip',
    },
    {
      field: 'platformShopName',
      title: '平台店铺名称',
      minWidth: 190,
      showOverflow: 'tooltip',
    },
    {
      field: 'shopUrl',
      title: '店铺网址',
      minWidth: 180,
      slots: { default: 'shopUrl' },
    },
    {
      field: 'coId',
      title: '公司编号',
      minWidth: 110,
    },
    {
      field: 'nick',
      title: '主账号',
      minWidth: 150,
      showOverflow: 'tooltip',
    },
    {
      field: 'nickType',
      title: '账号类型',
      minWidth: 110,
      showOverflow: 'tooltip',
    },
    {
      field: 'sessionStatus',
      title: '授权状态',
      width: 110,
      slots: { default: 'sessionStatus' },
    },
    {
      field: 'sessionExpired',
      title: '授权过期时间',
      minWidth: 170,
      formatter: 'formatDateTime',
    },
    {
      field: 'sessionUid',
      title: '会话用户编号',
      minWidth: 150,
      showOverflow: 'tooltip',
    },
    {
      field: 'groupId',
      title: '分组 ID',
      minWidth: 100,
    },
    {
      field: 'groupName',
      title: '分组名称',
      minWidth: 140,
      showOverflow: 'tooltip',
    },
    {
      field: 'created',
      title: '聚水潭创建时间',
      minWidth: 170,
      formatter: 'formatDateTime',
    },
    {
      field: 'jstCreator',
      title: '聚水潭创建人',
      minWidth: 140,
      showOverflow: 'tooltip',
    },
    {
      field: 'lastSyncTime',
      title: '最后同步时间',
      minWidth: 170,
      formatter: 'formatDateTime',
    },
    {
      field: 'remark',
      title: '备注',
      minWidth: 200,
      showOverflow: 'tooltip',
    },
    {
      field: 'createTime',
      title: '系统创建时间',
      minWidth: 170,
      formatter: 'formatDateTime',
    },
    {
      field: 'updateTime',
      title: '系统更新时间',
      minWidth: 170,
      formatter: 'formatDateTime',
    },
    {
      title: '操作',
      width: 100,
      fixed: 'right',
      slots: { default: 'actions' },
    },
  ];
}

/** 店铺可维护字段表单 */
export function useUpdateFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'id',
      component: 'Input',
      formItemClass: 'hidden',
    },
    {
      fieldName: 'enabled',
      label: '启用状态',
      component: 'RadioGroup',
      componentProps: {
        buttonStyle: 'solid',
        optionType: 'button',
        options: ENABLED_OPTIONS,
      },
      rules: 'selectRequired',
    },
    {
      fieldName: 'remark',
      label: '备注',
      component: 'Textarea',
      componentProps: {
        maxlength: 512,
        placeholder: '请输入备注',
        rows: 4,
        showCount: true,
      },
    },
  ];
}
