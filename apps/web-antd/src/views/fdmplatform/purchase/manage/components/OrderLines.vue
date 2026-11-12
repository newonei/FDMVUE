<script setup lang="ts">
import type { LineColumn } from '../../../components/line-table-model';

import type { ProcurementOrderView } from '#/api/fdmplatform/procurement';

import { computed } from 'vue';

import LineTable from '../../../components/LineTable.vue';
import { rows } from '../../../data';
import { procurementLineAmount } from '../../../finance/procurement/model';
import {
  colorModeText,
  constructionText,
} from '../../../products/manufacturing';
import { productStructure, structureValue } from '../../../products/structure';

/**
 * 采购单产品明细：放在供应商信息下方、页签上方，切换页签时一直可见。
 */
const props = defineProps<{ view: ProcurementOrderView }>();
const columns: LineColumn[] = [
  { key: 'skuName', title: '产品名称', width: 220, locked: true },
  { key: 'skuCode', title: '产品编号', width: 140, optional: true },
  { key: 'specification', title: '规格', width: 200 },
  { key: 'material', title: '材质', width: 100 },
  { key: 'size', title: '尺寸', width: 160 },
  { key: 'colorMode', title: '颜色方式', width: 100 },
  { key: 'constructionType', title: '制造结构', width: 110 },
  { key: 'finishedThickness', title: '成品厚度', width: 100 },
  { key: 'layerThickness', title: '分层厚度', width: 160, optional: true },
  { key: 'frontColor', title: '正面颜色', width: 120 },
  { key: 'backColor', title: '反面颜色', width: 120 },
  { key: 'textureFront', title: '正面压花', width: 120, optional: true },
  { key: 'textureBack', title: '反面压花', width: 120, optional: true },
  { key: 'productStage', title: '生产分类', width: 120, optional: true },
  { key: 'matType', title: '垫子类型', width: 120, optional: true },
  { key: 'colorCode', title: '单色', width: 120, optional: true },
  { key: 'weight', title: '克重', width: 100, optional: true },
  { key: 'color', title: '颜色', optional: true },
  { key: 'shape', title: '形状', width: 110 },
  { key: 'printing', title: '印刷', optional: true },
  { key: 'packaging', title: '包装', optional: true },
  { key: 'quantity', title: '订购数量', width: 110, align: 'right' },
  { key: 'unit', title: '单位', width: 80 },
  { key: 'unitPrice', title: '单价', width: 110, align: 'right' },
  { key: 'amount', title: '有效金额', width: 130, align: 'right' },
  { key: 'arrivedQuantity', title: '已到货', width: 100, align: 'right' },
  { key: 'returnedQuantity', title: '已退货', width: 100, align: 'right' },
  {
    key: 'cancelledQuantity',
    title: '已取消',
    width: 100,
    align: 'right',
    optional: true,
  },
];
const productLines = computed(() =>
  rows(props.view.order.lines).map((line) => {
    const snapshot = (line.specificationSnapshot ?? line) as Record<
      string,
      unknown
    >;
    const pick = (field: string) => snapshot[field];
    const structure = productStructure(snapshot);
    return {
      ...line,
      skuName: pick('skuName') ?? '产品',
      skuCode: pick('skuCode'),
      specification: pick('specification') ?? '—',
      material: structureValue(structure, 'material'),
      size: structureValue(structure, 'size'),
      colorMode: colorModeText(structure),
      constructionType: constructionText(structure),
      finishedThickness:
        structure.finishedThicknessMm === null ||
        structure.finishedThicknessMm === undefined
          ? '未维护'
          : `${structure.finishedThicknessMm} mm`,
      layerThickness:
        structure.constructionType === 'DOUBLE_LAYER'
          ? `正面 ${structure.frontThicknessMm ?? '未维护'} + 反面 ${structure.backThicknessMm ?? '未维护'} mm`
          : '—',
      frontColor: structureValue(structure, 'frontColor', 'frontColorLabel'),
      backColor: structureValue(structure, 'backColor', 'backColorLabel'),
      textureFront: structureValue(
        structure,
        'textureFront',
        'textureFrontLabel',
      ),
      textureBack: structureValue(structure, 'textureBack', 'textureBackLabel'),
      productStage: structureValue(
        structure,
        'productStage',
        'productStageLabel',
      ),
      matType: structureValue(structure, 'matType', 'matTypeLabel'),
      colorCode: structureValue(structure, 'colorCode', 'colorCodeLabel'),
      weight: structureValue(structure, 'weight'),
      color: pick('color'),
      shape: structureValue(structure, 'shape'),
      printing: pick('printing'),
      packaging: pick('packaging'),
      unit: pick('unit'),
      amount: procurementLineAmount(line, String(props.view.order.currency)),
    };
  }),
);
</script>
<template>
  <section class="order-lines">
    <LineTable
      table="purchase-order"
      :columns="columns"
      :data-source="productLines"
    >
      <template #extra>
        <span class="muted">
          产品、数量和单价以下单时为准，不直接覆盖已下单的资料；剩余不再采购的数量可在「更多操作」里结束余额。
        </span>
      </template>
      <template #emptyText>采购单没有产品明细</template>
    </LineTable>
  </section>
</template>
<style scoped>
.order-lines {
  min-width: 0;
  padding: 12px 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>
