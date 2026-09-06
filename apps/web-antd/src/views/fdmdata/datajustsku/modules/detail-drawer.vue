<script lang="ts" setup>
import type { SkuDisplayRow, SkuListTab } from '../display';

import { computed, ref, shallowRef } from 'vue';

import { useVbenDrawer } from '@vben/common-ui';
import { formatDateTime } from '@vben/utils';

import {
  Button,
  Descriptions,
  DescriptionsItem,
  Image,
  Tag,
} from 'ant-design-vue';

import {
  displaySkuValue,
  formatSkuMoney,
  getAccessoryKindLabel,
  getAccessoryMatchLabel,
  SKU_PLATFORM_PRICES,
} from '../display';

interface DetailData {
  row: SkuDisplayRow;
  listTab: SkuListTab;
  listLabel: string;
}

interface DetailField {
  label: string;
  value: string;
}

const emit = defineEmits<{
  children: [payload: { comboId: number; itemCode?: string }];
  edit: [payload: { row: SkuDisplayRow; listTab: SkuListTab }];
}>();

const detail = shallowRef<DetailData>();
const imageFailed = ref(false);
const row = computed(() => detail.value?.row);
const createdAt = computed(() => {
  const value = row.value?.createTime;
  return value == null || !String(value).trim()
    ? '—'
    : displaySkuValue(formatDateTime(value));
});
const isCombo = computed(
  () =>
    detail.value?.listTab === 'combo' ||
    detail.value?.listTab === 'custom_combo',
);
const syncStatus = computed(() => {
  switch (Number(row.value?.status)) {
    case 1:
      return { color: 'default', label: '未同步' };
    case 2:
      return { color: 'success', label: '已同步' };
    case 3:
      return { color: 'error', label: '同步失败' };
    default:
      return { color: 'default', label: '—' };
  }
});

function field(label: string, value: unknown): DetailField {
  return { label, value: displaySkuValue(value) };
}

const basicFields = computed(() => {
  const data = row.value;
  const fields = [
    field('商品编码', data?.itemCode),
    field('商品名称', data?.productName),
    field('商品简称', data?.productShortName),
    field('款式编码', data?.styleCode),
    field('分类', data?.categoryName),
    field('颜色及规格', data?.colorSpec),
    field('材质', data?.materialKey),
  ];
  if (isCombo.value) fields.push(field('对应实体编码', data?.entyItemCode));
  return fields;
});

const accessoryFields = computed(() => [
  field('配件品类', getAccessoryKindLabel(row.value?.accessoryKind)),
  field('匹配类型', getAccessoryMatchLabel(row.value?.matchType)),
  field('完整规格', row.value?.matchSpecFullKey),
  field('长宽规格', row.value?.matchSpecLwKey),
  field('精确宽度（cm）', row.value?.matchWidthCm),
  field('宽度上限（cm）', row.value?.matchWidthMaxCm),
  field('套装数量', row.value?.matchBundleCount),
  field('规格规则', row.value?.matchRuleJson),
  field('匹配备注', row.value?.matchRemark),
]);

const extraFields = computed(() => [
  field('其它属性 1', row.value?.attr1),
  field('其它属性 2', row.value?.attr2),
  field('其它属性 3', row.value?.attr3),
  field('重量（kg）', row.value?.weightKg),
  field('卷包长（cm）', row.value?.lengthCm),
  field('卷包宽（cm）', row.value?.widthCm),
  field('卷包高（cm）', row.value?.heightCm),
  field('备注', row.value?.remark),
]);

const [Drawer, drawerApi] = useVbenDrawer({
  onOpenChange(isOpen) {
    if (isOpen) {
      detail.value = drawerApi.getData<DetailData>();
      imageFailed.value = false;
    }
  },
});

async function handleEdit() {
  if (!detail.value || isCombo.value) return;
  const { row: selectedRow, listTab } = detail.value;
  await drawerApi.close();
  emit('edit', { row: selectedRow, listTab });
}

async function handleChildren() {
  if (!row.value || !isCombo.value) return;
  const { id: comboId, itemCode } = row.value;
  await drawerApi.close();
  emit('children', { comboId, itemCode });
}
</script>

<template>
  <Drawer
    class="w-[680px] max-w-[calc(100vw-2rem)]"
    content-class="sku-detail-content p-5"
    title="商品资料"
    :show-confirm-button="false"
  >
    <div v-if="detail && row" class="space-y-6">
      <div
        class="flex items-start gap-4 rounded-xl border border-border bg-muted/30 p-4"
      >
        <div
          class="sku-detail-image shrink-0 overflow-hidden rounded-lg border border-border bg-background"
        >
          <Image
            v-if="row.picUrl && !imageFailed"
            :src="row.picUrl"
            :width="96"
            :height="96"
            :alt="row.productName || row.itemCode || '商品图片'"
            @error="imageFailed = true"
          />
          <div
            v-else
            class="flex size-24 items-center justify-center text-xs text-muted-foreground"
          >
            {{ imageFailed ? '图片加载失败' : '暂无图片' }}
          </div>
        </div>
        <div class="min-w-0 flex-1 space-y-2">
          <div
            class="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
          >
            <span>{{ detail.listLabel }}</span>
            <Tag class="m-0" :color="syncStatus.color">{{
              syncStatus.label
            }}</Tag>
          </div>
          <div
            class="break-words text-base font-semibold [overflow-wrap:anywhere]"
          >
            {{ displaySkuValue(row.productName) }}
          </div>
          <div class="break-all font-mono text-xs text-muted-foreground">
            {{ displaySkuValue(row.itemCode) }}
          </div>
        </div>
      </div>

      <Descriptions title="基本信息" :column="1" bordered size="small">
        <DescriptionsItem
          v-for="item in basicFields"
          :key="item.label"
          :label="item.label"
        >
          {{ item.value }}
        </DescriptionsItem>
      </Descriptions>

      <Descriptions
        v-if="!isCombo"
        title="价格成本"
        :column="1"
        bordered
        size="small"
      >
        <DescriptionsItem label="成本价（元）">{{
          formatSkuMoney(row.costPrice)
        }}</DescriptionsItem>
      </Descriptions>
      <Descriptions
        v-else-if="detail.listTab === 'combo'"
        title="平台价格（元）"
        :column="1"
        bordered
        size="small"
      >
        <DescriptionsItem
          v-for="platform in SKU_PLATFORM_PRICES"
          :key="platform.key"
          :label="platform.label"
        >
          {{ formatSkuMoney(row[platform.key]) }}
        </DescriptionsItem>
      </Descriptions>

      <Descriptions
        v-if="detail.listTab === 'accessory'"
        title="配件匹配规则"
        :column="1"
        bordered
        size="small"
      >
        <DescriptionsItem
          v-for="item in accessoryFields"
          :key="item.label"
          :label="item.label"
        >
          {{ item.value }}
        </DescriptionsItem>
      </Descriptions>

      <Descriptions title="同步及创建信息" :column="1" bordered size="small">
        <DescriptionsItem label="聚水潭同步">
          <Tag class="m-0" :color="syncStatus.color">{{
            syncStatus.label
          }}</Tag>
        </DescriptionsItem>
        <DescriptionsItem label="聚水潭 SKU ID">{{
          displaySkuValue(row.jstSkuId)
        }}</DescriptionsItem>
        <DescriptionsItem label="创建人">{{
          displaySkuValue(row.creatorName || row.creator)
        }}</DescriptionsItem>
        <DescriptionsItem label="创建时间">{{ createdAt }}</DescriptionsItem>
      </Descriptions>

      <Descriptions
        v-if="!isCombo"
        title="其它资料"
        :column="1"
        bordered
        size="small"
      >
        <DescriptionsItem
          v-for="item in extraFields"
          :key="item.label"
          :label="item.label"
        >
          {{ item.value }}
        </DescriptionsItem>
      </Descriptions>
    </div>

    <template #footer>
      <Button @click="drawerApi.close()">关闭</Button>
      <Button
        v-if="detail && isCombo"
        v-access:code="['fdmdata:data-just-sku:query']"
        type="primary"
        @click="handleChildren"
        >查看子商品</Button
      >
      <Button
        v-else-if="detail"
        v-access:code="['fdmdata:data-just-sku:update']"
        type="primary"
        @click="handleEdit"
      >
        编辑资料
      </Button>
    </template>
  </Drawer>
</template>

<style scoped>
:deep(.ant-descriptions-view table) {
  table-layout: fixed;
}

:deep(.ant-descriptions-item-label) {
  width: 144px;
}

:deep(.ant-descriptions-item-content) {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.sku-detail-image :deep(.ant-image-img) {
  object-fit: contain;
}

@media (max-width: 480px) {
  :deep(.ant-descriptions-item-label) {
    width: 112px;
  }
}
</style>
