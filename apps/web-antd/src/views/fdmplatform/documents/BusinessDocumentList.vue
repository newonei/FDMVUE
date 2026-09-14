<script setup lang="ts">
import type { DocumentRow, PageResource } from '#/api/fdmplatform';

import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { Alert, Button, Input, Space, Table, Tag } from 'ant-design-vue';

import { getBusinessPage } from '#/api/fdmplatform';

import { errorText, label } from '../data';
import BusinessDocumentDetail from './BusinessDocumentDetail.vue';
import { withoutDetailQuery } from './navigation';
import { useRouteOwner } from './useRouteOwner';
const props = defineProps<{ resource: PageResource; title: string }>();
const route = useRoute();
const router = useRouter();
const active = useRouteOwner();
const records = ref<DocumentRow[]>([]);
const page = ref(1);
const pageSize = ref(20);
const total = ref(0);
const keyword = ref('');
const loading = ref(false);
const pageError = ref('');
let sequence = 0;
const selectedId = computed(() =>
  typeof route.query.standaloneId === 'string'
    ? route.query.standaloneId
    : undefined,
);
async function load() {
  const run = ++sequence;
  if (!active.value) return;
  loading.value = true;
  pageError.value = '';
  try {
    const result = await getBusinessPage<DocumentRow>(props.resource, {
      companyId: 0,
      pageNo: page.value,
      pageSize: pageSize.value,
      keyword: keyword.value.trim() || undefined,
    });
    if (run === sequence) {
      records.value = result.list;
      total.value = result.total;
    }
  } catch (error) {
    if (run === sequence) pageError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
watch(
  () => [props.resource, active.value],
  () => {
    page.value = 1;
    if (active.value) void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  ++sequence;
});
function open(row: DocumentRow) {
  if (!row.standaloneId) {
    pageError.value = '单据缺少有效身份，请刷新后重试';
    return;
  }
  void router.push({
    query: {
      ...withoutDetailQuery(route.query),
      standaloneId: row.standaloneId,
    },
  });
}
function close() {
  void router.replace({ query: withoutDetailQuery(route.query) });
}
</script>
<template>
  <Space direction="vertical" size="middle" style="width: 100%">
    <Space>
      <Input.Search
        v-model:value="keyword"
        :placeholder="`搜索${title}编号、名称或产品`"
        allow-clear
        @search="
          page = 1;
          load();
        "
      /><Button :loading="loading" @click="load">刷新</Button>
</Space><Alert v-if="pageError" type="error" :message="pageError" /><Table
      :data-source="records"
      row-key="id"
      :loading="loading"
      :pagination="{ current: page, pageSize, total, showSizeChanger: true }"
      :columns="[
        { title: '单号 / 名称', key: 'name' },
        { title: '状态', key: 'status' },
        { title: '数量 / 单位', key: 'quantity' },
        { title: '金额 / 币种', key: 'amount' },
        { title: '业务日期', key: 'date' },
        { title: '办理', key: 'action' },
      ]"
      @change="
        (value) => {
          page = value.current ?? 1;
          pageSize = value.pageSize ?? 20;
          load();
        }
      "
    >
      <template #bodyCell="{ column, record }">
        <Button
          v-if="column.key === 'name' || column.key === 'action'"
          type="link"
          @click="open(record as DocumentRow)"
        >
          {{
            column.key === 'action'
              ? '查看 / 办理'
              : record.code ||
                record.record.code ||
                record.name ||
                record.record.name ||
                '查看单据'
          }}
</Button><Tag v-else-if="column.key === 'status'">
          {{ label(record.record.status) }}
</Tag><span v-else-if="column.key === 'quantity'">{{ record.record.quantity ?? '未注明' }}
          {{ record.record.unit || '' }}</span><span v-else-if="column.key === 'amount'">{{ record.record.amount ?? '未注明' }}
          {{ record.record.currency || '（币种未注明）' }}</span><span v-else-if="column.key === 'date'">{{
          record.migration?.sourceDate ||
          record.record.occurredAt ||
          record.record.businessDate ||
          '未注明'
        }}</span>
      </template>
    </Table>
</Space><BusinessDocumentDetail
    :id="selectedId"
    :open="Boolean(selectedId) && active"
    @close="close"
    @updated="load"
  />
</template>
