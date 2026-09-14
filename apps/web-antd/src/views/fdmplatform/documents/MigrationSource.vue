<script setup lang="ts">
import type { MigrationInfo } from '#/api/fdmplatform/business-documents';
import type { NativeSourceRef } from '#/api/fdmplatform/legacy';

import { ref } from 'vue';

import { Alert, Button, Descriptions, Space, Tag } from 'ant-design-vue';

import LegacyDetail from '../legacy/LegacyDetail.vue';

defineProps<{
  blockReasons?: string[];
  migration?: MigrationInfo;
  nativeSource?: NativeSourceRef;
}>();
const sourceOpen = ref(false);
</script>
<template>
  <Space v-if="migration" direction="vertical" style="width: 100%">
    <Descriptions size="small" :column="3">
      <Descriptions.Item label="来源">
        <Tag>
          {{
            migration.sourceSystem === 'JINZHI'
              ? '金智'
              : migration.sourceSystem
          }}
        </Tag>
      </Descriptions.Item>
      <Descriptions.Item label="原单号">
        {{ migration.documentNo || '未注明' }}
      </Descriptions.Item>
      <Descriptions.Item label="原状态">
        {{ migration.sourceStatus || '未注明' }}
      </Descriptions.Item>
      <Descriptions.Item label="原金额">
        {{ migration.sourceAmount ?? '未注明' }}
        {{ migration.sourceCurrency || '（币种未注明）' }}
      </Descriptions.Item>
      <Descriptions.Item label="原业务日期">
        {{ migration.sourceDate || '未注明' }}
      </Descriptions.Item>
      <Descriptions.Item v-if="migration.recordId" label="来源记录">
        <Button type="link" size="small" @click="sourceOpen = true">
          查看原始字段与溯源
        </Button>
      </Descriptions.Item>
    </Descriptions>
    <Alert
      v-if="blockReasons?.length"
      type="warning"
      show-icon
      message="办理前需要补齐资料"
      :description="blockReasons.join('；')"
    />
    <Alert
      v-else-if="migration.issues?.length"
      type="info"
      show-icon
      message="来源资料待核对"
      :description="migration.issues.map((item) => item.reason).join('；')"
    />
  </Space>
  <LegacyDetail
    :id="migration?.recordId"
    :native-source="nativeSource"
    :open="sourceOpen"
    @close="sourceOpen = false"
  />
</template>
