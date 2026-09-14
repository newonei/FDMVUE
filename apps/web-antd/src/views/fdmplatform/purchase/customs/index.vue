<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Page } from '@vben/common-ui';

import { Alert, Button, Card, Space } from 'ant-design-vue';

import CustomsPanel from '../../components/CustomsPanel.vue';
import { queryContractId } from '../../documents/model';
defineOptions({ name: 'FdmPlatformPurchaseCustoms' });
const route = useRoute();
const router = useRouter();
const contractId = computed(() => queryContractId(route.query.contractId));
function clear() {
  const query = { ...route.query };
  delete query.contractId;
  void router.replace({ query });
}
</script>
<template>
  <Page
    title="报关跟进"
    description="按合同分批整理报关资料，跟进办理与补件，协同处理费用和财务资料。"
  >
    <Card>
      <Space direction="vertical" style="width: 100%">
        <Alert
          v-if="contractId"
          type="info"
          message="正在查看关联合同的报关批次"
        >
          <template #action>
            <Button size="small" @click="clear">清除合同筛选</Button>
          </template>
</Alert><CustomsPanel :company-id="0" :contract-id="contractId" />
      </Space>
    </Card>
  </Page>
</template>
