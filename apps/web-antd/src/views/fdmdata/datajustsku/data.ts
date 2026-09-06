import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { SkuDisplayRow } from './display';

import { useUserStore } from '@vben/stores';

import { getSimpleUserList } from '#/api/system/user';
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

/** 新增/修改的表单（blank / pattern / finished 三个 Tab 共用，2 列布局） */
export function useFormSchema(): VbenFormSchema[] {
  const fullWidth = 'col-span-full';
  return [
    // ── 隐藏字段 ──────────────────────────────────────────────
    {
      fieldName: 'id',
      component: 'Input',
      dependencies: { triggerFields: [''], show: () => false },
    },
    {
      fieldName: '__listTab',
      component: 'Input',
      dependencies: { triggerFields: [''], show: () => false },
    },

    // ── 基本信息 ──────────────────────────────────────────────
    {
      fieldName: '_divider_basic',
      label: '',
      component: 'Divider',
      formItemClass: fullWidth,
      componentProps: {
        orientation: 'left',
        plain: true,
        children: '基本信息',
      },
    },
    {
      fieldName: 'itemCode',
      label: '商品编码',
      rules: 'required',
      component: 'Input',
      help: '租户内业务唯一标识',
      componentProps: {
        allowClear: true,
        placeholder: '请输入商品编码',
      },
    },
    {
      fieldName: 'styleCode',
      label: '款式编码',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '请输入款式编码',
      },
    },
    {
      fieldName: 'productName',
      label: '商品名称',
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
      fieldName: 'picUrl',
      label: '图片地址',
      component: 'Input',
      formItemClass: fullWidth,
      componentProps: {
        allowClear: true,
        placeholder: '请输入图片 URL 或存储路径',
      },
    },

    // ── 属性字段 ──────────────────────────────────────────────
    {
      fieldName: '_divider_attr',
      label: '',
      component: 'Divider',
      formItemClass: fullWidth,
      componentProps: {
        orientation: 'left',
        plain: true,
        children: '属性字段',
      },
    },
    {
      fieldName: 'attr1',
      label: '属性1（尺寸）',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '如 185*70*0.6cm',
      },
    },
    {
      fieldName: 'attr2',
      label: '属性2（颜色）',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '如 薄荷绿',
      },
    },
    {
      fieldName: 'attr3',
      label: '属性3',
      component: 'Input',
      // 空白版 tab 提示填「空白版」；图案/成品 tab 可留空
      dependencies: {
        triggerFields: ['__listTab'],
        componentProps: (values) => ({
          allowClear: true,
          placeholder:
            values?.__listTab === 'blank'
              ? '空白版 SKU 填：空白版'
              : '请输入属性3（可留空）',
        }),
      },
    },

    // ── 规格尺寸 ──────────────────────────────────────────────
    {
      fieldName: '_divider_size',
      label: '',
      component: 'Divider',
      formItemClass: fullWidth,
      componentProps: {
        orientation: 'left',
        plain: true,
        children: '规格尺寸（卷包）',
      },
    },
    {
      fieldName: 'weightKg',
      label: '重量 (kg)',
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
      label: '长 (cm)',
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
      label: '宽 (cm)',
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
      label: '高 (cm)',
      component: 'InputNumber',
      componentProps: {
        min: 0,
        precision: 2,
        step: 0.01,
        placeholder: '请输入高度',
      },
    },

    // ── 备注 ──────────────────────────────────────────────────
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

    // ── 同步信息 ──────────────────────────────────────────────
    {
      fieldName: '_divider_sync',
      label: '',
      component: 'Divider',
      formItemClass: fullWidth,
      componentProps: {
        orientation: 'left',
        plain: true,
        children: '聚水潭同步',
      },
    },
    {
      fieldName: 'status',
      label: '同步状态',
      rules: 'required',
      component: 'RadioGroup',
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

/** 配件列表专用表单：字段顺序与 fdm_data_just_accessory 表结构保持一致 */
export function useAccessoryFormSchema(): VbenFormSchema[] {
  const fullWidth = 'col-span-full';
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

/** 列表的搜索表单（高频字段靠前；分类、创建时间靠后可配合表单「收起」） */
export function useGridFormSchema(): VbenFormSchema[] {
  const userStore = useUserStore();
  return [
    {
      fieldName: 'creator',
      label: '创建人',
      component: 'ApiSelect',
      defaultValue: userStore.userInfo?.id,
      help: '默认查询自己创建的编码；可选择其他创建人，清空则查询全部。',
      componentProps: {
        allowClear: true,
        showSearch: true,
        optionFilterProp: 'label',
        api: getSimpleUserList,
        labelField: 'nickname',
        valueField: 'id',
        placeholder: '全部创建人',
      },
    },
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
      help: '支持英文或中文逗号分隔多个关键词，匹配包含任一关键词的商品（如：软萌小马,8折萌熊）',
      componentProps: {
        allowClear: true,
        placeholder: '模糊查询，多个用逗号分隔',
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
      fieldName: 'categoryName',
      label: '分类',
      component: 'Input',
      componentProps: {
        allowClear: true,
        placeholder: '模糊查询分类',
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
  listTab?:
    | 'accessory'
    | 'blank'
    | 'combo'
    | 'custom_combo'
    | 'finished'
    | 'pattern';
  compact?: boolean;
};

/** 将相关字段放在同一单元格，所有列共用一个滚动区域，避免固定层挤占内容。 */
export function buildDataJustSkuGridColumns(
  options: DataJustSkuGridColumnOptions = {},
): VxeTableGridOptions<SkuDisplayRow>['columns'] {
  const { compact = false, listTab = 'pattern' } = options;
  return [
    { type: 'checkbox', width: 44, align: 'center' },
    {
      field: 'itemCode',
      title: '商品信息',
      minWidth: compact ? 220 : 300,
      align: 'left',
      showOverflow: false,
      slots: { default: 'colProduct' },
    },
    ...(compact
      ? []
      : [
          {
            field: 'colorSpec',
            title: listTab === 'accessory' ? '配件与匹配规则' : '规格与分类',
            minWidth: 165,
            align: 'left' as const,
            showOverflow: false,
            slots: { default: 'colSpecifications' },
          },
          ...(listTab === 'custom_combo'
            ? []
            : [
                {
                  field: 'costPrice',
                  title: listTab === 'combo' ? '平台价格' : '成本价',
                  width: listTab === 'combo' ? 200 : 100,
                  align: 'left' as const,
                  showOverflow: false,
                  slots: { default: 'colPrice' },
                },
              ]),
        ]),
    {
      field: 'status',
      title: '聚水潭同步',
      width: compact ? 108 : 135,
      align: 'left',
      showOverflow: false,
      slots: { default: 'colSyncStatus' },
    },
    ...(compact
      ? []
      : [
          {
            field: 'creatorName',
            title: '创建信息',
            width: 140,
            align: 'left' as const,
            showOverflow: false,
            slots: { default: 'colCreated' },
          },
        ]),
    {
      field: '_actions',
      title: '操作',
      width: 128,
      align: 'left',
      showOverflow: false,
      slots: { default: 'actions' },
    },
  ];
}

export function useGridColumns(): VxeTableGridOptions<SkuDisplayRow>['columns'] {
  return buildDataJustSkuGridColumns();
}
