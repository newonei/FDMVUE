import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmdataDataJustSkuApi } from '#/api/fdmdata/datajustsku';

import { getRangePickerDefaultProps } from '#/utils';

const SYNC_STATUS_OPTIONS = [
  { label: '未同步', value: 1 },
  { label: '已同步', value: 2 },
  { label: '同步失败', value: 3 },
];

const ACCESSORY_KIND_OPTIONS = [
  { label: '纸箱', value: 'CARTON' },
  { label: '彩盒', value: 'COLOR_BOX' },
  { label: '网包', value: 'NET_BAG' },
  { label: '捆绳', value: 'ROPE' },
  { label: '魔术扣', value: 'MAGIC_TAPE' },
  { label: '平板支撑垫', value: 'SUPPORT_PAD' },
  { label: '袋类', value: 'BAG' },
];

const ACCESSORY_MATCH_TYPE_OPTIONS = [
  { label: '通用配件', value: 'UNIVERSAL' },
  { label: '规格精确匹配', value: 'SPEC_EXACT' },
  { label: '宽度精确匹配', value: 'WIDTH_EXACT' },
  { label: '宽度上限匹配', value: 'WIDTH_MAX' },
  { label: '多个规格集合', value: 'SPEC_SET' },
];

/** 列表展示：枚举 value → 中文 label（与表单下拉一致；不识别时回退原值） */
function accessoryEnumGridLabel(
  cellValue: unknown,
  options: readonly { label: string; value: string }[],
): string {
  if (cellValue === null || cellValue === undefined) {
    return '-';
  }
  const raw = String(cellValue).trim();
  if (!raw) {
    return '-';
  }
  const key = raw.toUpperCase();
  const hit = options.find((o) => o.value.toUpperCase() === key);
  return hit?.label ?? raw;
}

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
      fieldName: '__listTab',
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
        options: SYNC_STATUS_OPTIONS,
        buttonStyle: 'solid',
        optionType: 'button',
      },
    },
    {
      fieldName: 'accessoryKind',
      label: '配件品类',
      component: 'Select',
      dependencies: {
        triggerFields: ['__listTab'],
        show: (values) => values?.__listTab === 'accessory',
      },
      componentProps: {
        allowClear: true,
        options: ACCESSORY_KIND_OPTIONS,
      },
    },
    {
      fieldName: 'matchType',
      label: '匹配类型',
      component: 'Select',
      dependencies: {
        triggerFields: ['__listTab'],
        show: (values) => values?.__listTab === 'accessory',
      },
      componentProps: {
        allowClear: true,
        options: ACCESSORY_MATCH_TYPE_OPTIONS,
      },
    },
    {
      fieldName: 'matchSpecLwKey',
      label: '长宽匹配',
      component: 'Input',
      dependencies: {
        triggerFields: ['__listTab'],
        show: (values) => values?.__listTab === 'accessory',
      },
      componentProps: {
        placeholder: '如 200*100',
      },
    },
    {
      fieldName: 'matchSpecFullKey',
      label: '完整规格',
      component: 'Input',
      dependencies: {
        triggerFields: ['__listTab'],
        show: (values) => values?.__listTab === 'accessory',
      },
      componentProps: {
        placeholder: '如 200*100*1',
      },
    },
    {
      fieldName: 'matchWidthCm',
      label: '精确宽度',
      component: 'Input',
      dependencies: {
        triggerFields: ['__listTab'],
        show: (values) => values?.__listTab === 'accessory',
      },
      componentProps: {
        placeholder: '如 70',
      },
    },
    {
      fieldName: 'matchWidthMaxCm',
      label: '宽度上限',
      component: 'Input',
      dependencies: {
        triggerFields: ['__listTab'],
        show: (values) => values?.__listTab === 'accessory',
      },
      componentProps: {
        placeholder: '如 80，表示 80 以内',
      },
    },
    {
      fieldName: 'matchBundleCount',
      label: '条装数量',
      component: 'Input',
      dependencies: {
        triggerFields: ['__listTab'],
        show: (values) => values?.__listTab === 'accessory',
      },
      componentProps: {
        placeholder: '仅作标记，按勾选加入',
      },
    },
    {
      fieldName: 'matchRuleJson',
      label: '规则 JSON',
      component: 'Input',
      dependencies: {
        triggerFields: ['__listTab'],
        show: (values) => values?.__listTab === 'accessory',
      },
      componentProps: {
        placeholder: '如 [\"183*70*0.6\",\"183*70*0.8\"]',
      },
    },
    {
      fieldName: 'matchRemark',
      label: '规则备注',
      component: 'Input',
      dependencies: {
        triggerFields: ['__listTab'],
        show: (values) => values?.__listTab === 'accessory',
      },
      componentProps: {
        placeholder: '请输入匹配规则备注',
      },
    },
  ];
}

/** 配件列表专用表单：字段顺序与 fdm_data_just_accessory 表结构保持一致 */
export function useAccessoryFormSchema(): VbenFormSchema[] {
  const fullWidth = 'col-span-2';
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
      fieldName: '__listTab',
      component: 'Input',
      dependencies: {
        triggerFields: [''],
        show: () => false,
      },
    },
    {
      fieldName: 'picUrl',
      label: '图片地址',
      component: 'Input',
      formItemClass: fullWidth,
      componentProps: {
        allowClear: true,
        placeholder: '请输入图片 URL 或存储路径',
      },
    },
    {
      fieldName: 'styleCode',
      label: '款式编码',
      rules: 'required',
      component: 'Input',
      help: '配件行要求以「配件-」开头，例如：配件-纸箱',
      componentProps: {
        allowClear: true,
        placeholder: '请输入款式编码，必须以 配件- 开头',
      },
    },
    {
      fieldName: 'itemCode',
      label: '商品编码',
      rules: 'required',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '请输入聚水潭商品编码',
      },
    },
    {
      fieldName: 'productName',
      label: '商品名称',
      rules: 'required',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '请输入商品名称',
      },
    },
    {
      fieldName: 'productShortName',
      label: '商品简称',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '请输入商品简称',
      },
    },
    {
      fieldName: 'colorSpec',
      label: '颜色及规格',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '请输入颜色及规格',
      },
    },
    {
      fieldName: 'categoryName',
      label: '分类',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '请输入分类',
      },
    },
    {
      fieldName: 'costPrice',
      label: '成本价',
      component: 'InputNumber',
      componentProps: {
        min: 0,
        precision: 2,
        step: 0.01,
        placeholder: '请输入成本价',
      },
    },
    {
      fieldName: 'attr1',
      label: '其它属性1',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '通常用于规格/尺寸',
      },
    },
    {
      fieldName: 'attr2',
      label: '其它属性2',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '通常用于颜色/型号',
      },
    },
    {
      fieldName: 'attr3',
      label: '其它属性3',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '请输入其它属性3',
      },
    },
    {
      fieldName: 'weightKg',
      label: '重量 kg',
      component: 'InputNumber',
      componentProps: {
        min: 0,
        precision: 3,
        step: 0.001,
        placeholder: '请输入重量',
      },
    },
    {
      fieldName: 'lengthCm',
      label: '长 cm',
      component: 'InputNumber',
      componentProps: {
        min: 0,
        precision: 2,
        step: 0.01,
        placeholder: '请输入长度',
      },
    },
    {
      fieldName: 'widthCm',
      label: '宽 cm',
      component: 'InputNumber',
      componentProps: {
        min: 0,
        precision: 2,
        step: 0.01,
        placeholder: '请输入宽度',
      },
    },
    {
      fieldName: 'heightCm',
      label: '高 cm',
      component: 'InputNumber',
      componentProps: {
        min: 0,
        precision: 2,
        step: 0.01,
        placeholder: '请输入高度',
      },
    },
    {
      fieldName: 'remark',
      label: '备注',
      component: 'Textarea',
      formItemClass: fullWidth,
      componentProps: {
        allowClear: true,
        rows: 2,
        placeholder: '请输入备注',
      },
    },
    {
      fieldName: 'accessoryKind',
      label: '配件品类',
      rules: 'required',
      component: 'Select',
      componentProps: {
        allowClear: true,
        options: ACCESSORY_KIND_OPTIONS,
        placeholder: '请选择配件品类',
      },
    },
    {
      fieldName: 'matchType',
      label: '匹配类型',
      rules: 'required',
      component: 'Select',
      help: '用于组合编码生成：通用配件会加入所有组合，其它类型按规格或宽度过滤。',
      componentProps: {
        allowClear: true,
        options: ACCESSORY_MATCH_TYPE_OPTIONS,
        placeholder: '请选择匹配类型',
      },
    },
    {
      fieldName: 'matchSpecLwKey',
      label: '长宽规格',
      component: 'Input',
      dependencies: {
        triggerFields: ['matchType'],
        show: (values) => values?.matchType === 'SPEC_EXACT',
      },
      componentProps: {
        allowClear: true,
        placeholder: '如 200*100',
      },
    },
    {
      fieldName: 'matchSpecFullKey',
      label: '完整规格',
      component: 'Input',
      dependencies: {
        triggerFields: ['matchType'],
        show: (values) => values?.matchType === 'SPEC_EXACT',
      },
      componentProps: {
        allowClear: true,
        placeholder: '如 200*100*1',
      },
    },
    {
      fieldName: 'matchWidthCm',
      label: '精确宽度',
      component: 'InputNumber',
      dependencies: {
        triggerFields: ['matchType'],
        show: (values) => values?.matchType === 'WIDTH_EXACT',
      },
      componentProps: {
        min: 0,
        precision: 2,
        step: 0.01,
        placeholder: '如 70',
      },
    },
    {
      fieldName: 'matchWidthMaxCm',
      label: '宽度上限',
      component: 'InputNumber',
      dependencies: {
        triggerFields: ['matchType'],
        show: (values) => values?.matchType === 'WIDTH_MAX',
      },
      componentProps: {
        min: 0,
        precision: 2,
        step: 0.01,
        placeholder: '如 80，表示 80 以内',
      },
    },
    {
      fieldName: 'matchBundleCount',
      label: '条装数量',
      component: 'InputNumber',
      dependencies: {
        triggerFields: ['matchType'],
        show: (values) => values?.matchType === 'SPEC_EXACT',
      },
      componentProps: {
        min: 0,
        precision: 0,
        placeholder: '仅作标记',
      },
    },
    {
      fieldName: 'matchRuleJson',
      label: '规则 JSON',
      component: 'Textarea',
      formItemClass: fullWidth,
      dependencies: {
        triggerFields: ['matchType'],
        show: (values) => values?.matchType === 'SPEC_SET',
      },
      componentProps: {
        allowClear: true,
        rows: 3,
        placeholder: '如 ["183*70*0.6","183*70*0.8","183*70*1"]',
      },
    },
    {
      fieldName: 'matchRemark',
      label: '规则备注',
      component: 'Textarea',
      formItemClass: fullWidth,
      componentProps: {
        allowClear: true,
        rows: 2,
        placeholder: '请输入匹配规则备注',
      },
    },
    {
      fieldName: 'status',
      label: '同步状态',
      component: 'RadioGroup',
      help: '新增默认未同步；编辑时后端会保留原同步状态。',
      componentProps: {
        options: SYNC_STATUS_OPTIONS,
        buttonStyle: 'solid',
        optionType: 'button',
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
  /** 当前列表 Tab */
  listTab?: 'blank' | 'pattern' | 'finished' | 'combo' | 'accessory' | 'custom_combo';
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

  const isComboLikeTab =
    options?.listTab === 'combo' || options?.listTab === 'custom_combo';

  return [
    { type: 'checkbox', width: 40 },
    ...(options?.blankPicPreview || options?.listTab === 'accessory' ? [blankPicColumn] : []),
    ...(options?.finishedPicPreview || options?.listTab === 'combo' ? [blankPicColumn] : []),
    ...(options?.patternPicPreview ? [patternPicColumn] : []),
    {
      field: 'itemCode',
      title:
        options?.listTab === 'custom_combo' || options?.listTab === 'combo'
          ? '组合商品编码'
          : '商品编码',
      minWidth: 140,
    },
    ...(options?.listTab === 'custom_combo' || options?.listTab === 'combo'
      ? [
          ...(options?.listTab === 'custom_combo'
            ? [
                {
                  field: 'entyItemCode',
                  title: '对应实体编码',
                  minWidth: 160,
                },
              ]
            : []),
          {
            field: '_customComboChildren',
            title: '子商品',
            width: 100,
            slots: { default: 'colCustomComboChildren' },
          },
        ]
      : []),
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
    ...(isComboLikeTab
      ? []
      : [
          {
            field: 'colorSpec',
            title: '颜色及规格',
            minWidth: 120,
          },
        ]),
    {
      field: 'categoryName',
      title: '分类',
      minWidth: 100,
    },
    ...(options?.listTab === 'combo'
      ? [
          {
            field: 'materialKey',
            title: '材质',
            minWidth: 90,
          },
          {
            field: 'tmallPrice',
            title: '天猫价',
            minWidth: 90,
          },
          {
            field: 'pddPrice',
            title: '拼多多价',
            minWidth: 100,
          },
          {
            field: 'douyinPrice',
            title: '抖音价',
            minWidth: 100,
          },
          {
            field: 'sphPrice',
            title: '商品号价',
            minWidth: 100,
          },
          {
            field: 'xhsPrice',
            title: '小红书价',
            minWidth: 100,
          },
        ]
      : []),
    ...(options?.listTab === 'accessory'
      ? [
          {
            field: 'accessoryKind',
            title: '配件品类',
            minWidth: 110,
            formatter: ({ cellValue }: { cellValue?: unknown }) =>
              accessoryEnumGridLabel(cellValue, ACCESSORY_KIND_OPTIONS),
          },
          {
            field: 'matchType',
            title: '匹配类型',
            minWidth: 130,
            formatter: ({ cellValue }: { cellValue?: unknown }) =>
              accessoryEnumGridLabel(cellValue, ACCESSORY_MATCH_TYPE_OPTIONS),
          },
          {
            field: 'matchSpecFullKey',
            title: '完整规格',
            minWidth: 120,
          },
          {
            field: 'matchSpecLwKey',
            title: '长宽规格',
            minWidth: 110,
          },
          {
            field: 'matchWidthCm',
            title: '精确宽度',
            minWidth: 100,
          },
          {
            field: 'matchWidthMaxCm',
            title: '宽度上限',
            minWidth: 100,
          },
        ]
      : []),
    ...(isComboLikeTab
      ? []
      : [
          {
            field: 'costPrice',
            title: '成本价',
            minWidth: 100,
          },
        ]),
    {
      field: 'status',
      title: '聚水潭同步',
      minWidth: 110,
      slots: { default: 'colSyncStatus' },
    },
    ...(isComboLikeTab
      ? []
      : [
          {
            field: 'jstSkuId',
            title: '聚水潭SKU ID',
            minWidth: 130,
          },
        ]),
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
