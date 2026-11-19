<script setup lang="ts">
import type { FdmgongchangProductionOrderApi as Api, FdmgongchangSupplyMatchApi as MatchApi } from '#/api/fdmgongchang/production-order';
import type { ProductStructure } from '#/api/fdmplatform/products';

import { computed } from 'vue';

import { colorModeText, constructionText, productDimensionsText } from '#/views/fdmplatform/products/manufacturing';

import { dimensionToDisplay } from '../../shared/dimensions';

const props = defineProps<{ item: Api.Item; options?: MatchApi.TargetOptions; purchase: ProductStructure; }>();

const fields = computed(() => {
  const source = props.purchase;
  const target = props.item;
  const options = props.options;
  const display = (value?: null | string, dict?: MatchApi.DictOption[], label?: null | string) =>
    value ? (label || dict?.find((option) => option.value === value)?.label || value) : '';
  const dimensions = (length?: null | number, width?: null | number, thickness?: null | number) =>
    productDimensionsText({ lengthMm: length, widthMm: width, finishedThicknessMm: thickness });
  const pair = (label: string, purchased: string, confirmed: string, different = purchased !== confirmed) => ({
    label, purchased, confirmed, different,
  });
  const codedPair = (label: string, purchased?: null | string, confirmed?: null | string, dictionary?: MatchApi.DictOption[], sourceLabel?: null | string) =>
    pair(label, display(purchased, dictionary, sourceLabel), display(confirmed, dictionary), (purchased || '') !== (confirmed || ''));
  const factoryMode = () => {
    if (!target.processes?.length) return undefined;
    return target.processes.includes('ENGRAVE') ? 'LASER' : 'NONE';
  };
  const engraving = (mode?: null | string, pattern?: null | string) => {
    if (mode === 'NONE') return '无雕刻';
    return mode === 'LASER' ? `激光雕刻 · ${pattern || '图案待补'}` : '';
  };
  const factoryTexture = (code?: null | string, opposite?: null | string) => {
    if (target.processes?.length && !target.processes.includes('EMBOSS')) return 'NONE';
    if (!code && opposite && target.processes?.includes('EMBOSS')) return 'NONE';
    return code;
  };
  const textures = [{ value: 'NONE', label: '无纹路' }, ...(options?.textures ?? [])];
  const frontColor = source.frontColor || (source.colorMode === 'SINGLE' ? source.colorCode : '');
  const frontName = source.frontColor ? source.frontColorLabel : source.colorCodeLabel;
  const thickness = (value?: null | number) => (value === null || value === undefined) ? '' : `${value} mm`;
  return [
    pair('成品长宽厚', dimensions(source.lengthMm, source.widthMm, source.finishedThicknessMm),
      dimensions(dimensionToDisplay(target.targetLength, 'mm'), dimensionToDisplay(target.targetWidth, 'mm'), dimensionToDisplay(target.targetThickness, 'mm'))),
    pair('材质', display(source.material, options?.materials), display(target.targetMaterial, options?.materials)),
    pair('颜色方式', colorModeText(source), colorModeText({ colorMode: target.targetColorMode })),
    pair('制造结构', constructionText(source), constructionText({ constructionType: target.targetConstructionType })),
    ...(source.constructionType === 'DOUBLE_LAYER' || target.targetConstructionType === 'DOUBLE_LAYER' ? [
      pair('正面层厚', thickness(source.frontThicknessMm), thickness(dimensionToDisplay(target.targetFrontThickness, 'mm'))),
      pair('反面层厚', thickness(source.backThicknessMm), thickness(dimensionToDisplay(target.targetBackThickness, 'mm'))),
    ] : []),
    codedPair('正面颜色', frontColor, target.targetFrontColor, options?.colors, frontName),
    codedPair('反面颜色', source.backColor || (source.colorMode === 'SINGLE' ? frontColor : ''), target.targetBackColor,
      options?.colors, source.backColor ? source.backColorLabel : frontName),
    codedPair('正面纹路', source.textureFront, factoryTexture(target.targetTextureFront, target.targetTextureBack), textures, source.textureFrontLabel),
    codedPair('反面纹路', source.textureBack, factoryTexture(target.targetTextureBack, target.targetTextureFront), textures, source.textureBackLabel),
    pair('雕刻', engraving(source.patternMode, source.patternCode), engraving(factoryMode(), target.targetPattern)),
  ];
});
const differences = computed(() => fields.value.filter((field) => field.different));
</script>

<template>
  <div class="my-1 rounded border border-border bg-background p-2">
    <p class="m-0 font-medium">工厂执行规格 <span class="text-xs font-normal text-muted-foreground">已确认 · 排单与车间报工使用</span></p>
    <dl class="m-0 mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
      <div v-for="field in fields" :key="field.label" class="flex gap-1">
        <dt class="text-muted-foreground">{{ field.label }}</dt><dd class="m-0">{{ field.confirmed || '未记录' }}</dd>
      </div>
    </dl>
    <table v-if="differences.length" class="mt-2 w-full text-left text-xs">
      <caption class="text-left text-orange-700">需核对的来源差异</caption>
      <thead><tr><th>字段</th><th>下单时采购资料</th><th>工厂已确认</th></tr></thead>
      <tbody><tr v-for="field in differences" :key="field.label"><td>{{ field.label }}</td><td>{{ field.purchased || '未记录' }}</td><td>{{ field.confirmed || '未记录' }}</td></tr></tbody>
    </table>
  </div>
</template>
