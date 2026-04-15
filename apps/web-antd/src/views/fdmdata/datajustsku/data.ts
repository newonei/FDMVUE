import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataDataJustSkuApi } from '#/api/fdmdata/datajustsku';

import { getRangePickerDefaultProps } from '#/utils';

/** 新增/修改的表单 */
export function useFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'id',
      component: 'Input',
      dependencies: {
        triggerFields: [''],
        show: () => false,
      },
    },
    {
      fieldName: 'picUrl',
      label: '图片（URL 或存储路径）',
      component: 'Input',
      componentProps: {
        placeholder: '请输入图片（URL 或存储路径）',
      },
    },
    {
      fieldName: 'productShortName',
      label: '商品简称',
      component: 'Input',
      componentProps: {
        placeholder: '请输入商品简称',
      },
    },
    {
      fieldName: 'styleCode',
      label: '款式编码（纯文本，不关联他表）',
      component: 'Input',
      componentProps: {
        placeholder: '请输入款式编码（纯文本，不关联他表）',
      },
    },
    {
      fieldName: 'itemCode',
      label: '商品编码（租户内业务唯一标识）',
      rules: 'required',
      component: 'Input',
      componentProps: {
        placeholder: '请输入商品编码（租户内业务唯一标识）',
      },
    },
    {
      fieldName: 'productName',
      label: '商品名称',
      component: 'Input',
      componentProps: {
        placeholder: '请输入商品名称',
      },
    },
    {
      fieldName: 'colorSpec',
      label: '颜色及规格',
      component: 'Input',
      componentProps: {
        placeholder: '请输入颜色及规格',
      },
    },
    {
      fieldName: 'categoryName',
      label: '分类（文本）',
      component: 'Input',
      componentProps: {
        placeholder: '请输入分类（文本）',
      },
    },
    {
      fieldName: 'costPrice',
      label: '成本价',
      component: 'Input',
      componentProps: {
        placeholder: '请输入成本价',
      },
    },
    {
      fieldName: 'attr1',
      label: '其它属性1（尺寸）',
      component: 'Input',
      componentProps: {
        placeholder: '如 185*70*0.6cm',
      },
    },
    {
      fieldName: 'attr2',
      label: '其它属性2（颜色）',
      component: 'Input',
      componentProps: {
        placeholder: '如 薄荷绿',
      },
    },
    {
      fieldName: 'attr3',
      label: '其它属性3（空白版填「空白版」）',
      component: 'Input',
      componentProps: {
        placeholder: '空白版 SKU 填：空白版',
      },
    },
    {
      fieldName: 'weightKg',
      label: '重量（千克）',
      component: 'Input',
      componentProps: {
        placeholder: '请输入重量（千克）',
      },
    },
    {
      fieldName: 'lengthCm',
      label: '长（厘米）',
      component: 'Input',
      componentProps: {
        placeholder: '请输入长（厘米）',
      },
    },
    {
      fieldName: 'widthCm',
      label: '宽（厘米）',
      component: 'Input',
      componentProps: {
        placeholder: '请输入宽（厘米）',
      },
    },
    {
      fieldName: 'heightCm',
      label: '高（厘米）',
      component: 'Input',
      componentProps: {
        placeholder: '请输入高（厘米）',
      },
    },
    {
      fieldName: 'remark',
      label: '备注',
      component: 'Input',
      componentProps: {
        placeholder: '请输入备注',
      },
    },
    {
      fieldName: 'jstSkuId',
      label: '聚水潭 SKU ID',
      component: 'Input',
      dependencies: {
        triggerFields: ['id'],
        show: (values) => !!values?.id,
      },
      componentProps: {
        readonly: true,
        placeholder: '同步成功后由系统写入',
      },
    },
    {
      fieldName: 'status',
      label: '聚水潭同步状态',
      rules: 'required',
      component: 'RadioGroup',
      componentProps: {
        options: [
          { label: '未同步', value: 1 },
          { label: '已同步', value: 2 },
          { label: '同步失败', value: 3 },
        ],
        buttonStyle: 'solid',
        optionType: 'button',
      },
    },
  ];
}

/** 列表的搜索表单（仅保留常用条件，其余字段在编辑弹窗中维护） */
export function useGridFormSchema(): VbenFormSchema[] {
  return [
    {
      fieldName: 'itemCode',
      label: '商品编码',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '请输入商品编码',
      },
    },
    {
      fieldName: 'productName',
      label: '商品名称',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '模糊查询商品名称',
      },
    },
    {
      fieldName: 'styleCode',
      label: '款式编码',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '模糊查询款式编码',
      },
    },
    {
      fieldName: 'categoryName',
      label: '分类',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '模糊查询分类',
      },
    },
    {
      fieldName: 'status',
      label: '聚水潭同步',
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: [
          { label: '未同步', value: 1 },
          { label: '已同步', value: 2 },
          { label: '同步失败', value: 3 },
        ],
        placeholder: '请选择',
      },
    },
    {
      fieldName: 'createTime',
      label: '创建时间',
      component: 'RangePicker',
      componentProps: {
        ...getRangePickerDefaultProps(),
        allowClear: true,
      },
    },
  ];
}

export type DataJustSkuGridColumnOptions = {
  /** 图案列表 Tab：在商品编码前展示 picUrl 缩略图 */
  patternPicPreview?: boolean;
  /** 空白版列表 Tab：展示 picUrl 缩略图 */
  blankPicPreview?: boolean;
  /** 成品编码列表 Tab：展示 picUrl 缩略图 */
  finishedPicPreview?: boolean;
};

/** 列表字段（与搜索一致：主信息 + 成本 + 状态 + 时间；其余在编辑中查看） */
export function buildDataJustSkuGridColumns(
  options?: DataJustSkuGridColumnOptions,
): VxeTableGridOptions<FdmdataDataJustSkuApi.DataJustSku>['columns'] {
  const blankPicColumn = {
    field: 'picUrl',
    title: '图片',
    width: 76,
    cellRender: {
      name: 'CellImage',
      props: {
        width: 48,
        height: 48,
        class: 'rounded object-cover',
      },
    },
  } as const;

  const patternPicColumn = {
    field: 'picUrl',
    title: '图案',
    width: 76,
    cellRender: {
      name: 'CellImage',
      props: {
        width: 48,
        height: 48,
        class: 'rounded object-cover',
      },
    },
  } as const;

  return [
    { type: 'checkbox', width: 40 },
    ...(options?.blankPicPreview ? [blankPicColumn] : []),
    ...(options?.finishedPicPreview ? [blankPicColumn] : []),
    ...(options?.patternPicPreview ? [patternPicColumn] : []),
    {
      field: 'itemCode',
      title: '商品编码',
      minWidth: 140,
    },
    {
      field: 'productShortName',
      title: '商品简称',
      minWidth: 120,
    },
    {
      field: 'productName',
      title: '商品名称',
      minWidth: 160,
    },
    {
      field: 'styleCode',
      title: '款式编码',
      minWidth: 120,
    },
    {
      field: 'colorSpec',
      title: '颜色及规格',
      minWidth: 120,
    },
    {
      field: 'categoryName',
      title: '分类',
      minWidth: 100,
    },
    {
      field: 'costPrice',
      title: '成本价',
      minWidth: 100,
    },
    {
      field: 'status',
      title: '聚水潭同步',
      minWidth: 110,
      slots: { default: 'colSyncStatus' },
    },
    {
      field: 'jstSkuId',
      title: '聚水潭SKU ID',
      minWidth: 130,
    },
    {
      field: 'creatorName',
      title: '创建人',
      minWidth: 100,
    },
    {
      field: 'createTime',
      title: '创建时间',
      minWidth: 160,
      formatter: 'formatDateTime',
    },
    {
      title: '操作',
      width: 280,
      fixed: 'right',
      slots: { default: 'actions' },
    },
  ];
}

export function useGridColumns(): VxeTableGridOptions<FdmdataDataJustSkuApi.DataJustSku>['columns'] {
  return buildDataJustSkuGridColumns();
}

