<script setup lang="ts">
import type { ApprovalNotice } from '#/api/fdmplatform/approval-inbox';

import { onBeforeUnmount, ref, watch } from 'vue';

import { Page } from '@vben/common-ui';

import { Alert, Button, Card, Space, Table } from 'ant-design-vue';

import { getApprovalNotices } from '#/api/fdmplatform/approval-inbox';

import { errorText } from '../data';
import RelatedLink from '../documents/RelatedLink.vue';
import { useRouteOwner } from '../documents/useRouteOwner';
import { noticeStatuses, noticeTarget } from './model';

// Preserve the cached route identity while the former inbox serves business notices.
defineOptions({ name: 'FdmPlatformApprovalInbox' });
const page = ref(1);
const total = ref(0);
const notices = ref<ApprovalNotice[]>([]);
const loading = ref(false);
const loadError = ref('');
const routeActive = useRouteOwner();
let sequence = 0;
function date(value: string) {
  return value
    ? new Date(value).toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        hour12: false,
      })
    : '—';
}
async function load() {
  if (!routeActive.value) return;
  const run = ++sequence;
  loading.value = true;
  loadError.value = '';
  notices.value = [];
  total.value = 0;
  try {
    const result = await getApprovalNotices({
      pageNo: page.value,
      pageSize: 20,
    });
    if (run !== sequence || !routeActive.value) return;
    notices.value = result.list;
    total.value = result.total;
  } catch (error) {
    if (run === sequence && routeActive.value)
      loadError.value = errorText(error);
  } finally {
    if (run === sequence) loading.value = false;
  }
}
watch(
  routeActive,
  (active) => {
    if (active) void load();
    else {
      sequence++;
      loading.value = false;
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  sequence++;
});
function changePage(value: number) {
  page.value = value;
  void load();
}
</script>

<template>
  <Page
    title="业务通知"
    description="查看到货与入库通知，直接打开关联单据继续办理。"
  >
    <Card>
      <Space wrap class="mb-4">
        <Button :loading="loading" @click="load">刷新通知</Button>
      </Space>
      <Alert
        v-if="loadError"
        type="error"
        :message="loadError"
        class="mb-4"
        show-icon
      />
      <Table
        v-else
        :data-source="notices"
        row-key="id"
        :loading="loading"
        :pagination="{
          current: page,
          pageSize: 20,
          total,
          showSizeChanger: false,
          onChange: changePage,
        }"
        :columns="[
          { key: 'content', title: '通知内容' },
          { key: 'createdAt', title: '时间', width: 190 },
          { key: 'status', title: '发送状态', width: 150 },
        ]"
      >
        <template #emptyText>
          {{ loading ? '正在读取通知…' : '暂无到货通知' }}
        </template>
        <template #bodyCell="{ column, record }">
          <RelatedLink
            v-if="column.key === 'content'"
            :target="noticeTarget(record as ApprovalNotice)"
          >
            {{ record.content }}
          </RelatedLink>
          <span v-else-if="column.key === 'createdAt'">{{
            date(record.createdAt)
          }}</span>
          <span v-else-if="column.key === 'status'">{{
            noticeStatuses[record.status] ?? record.status
          }}</span>
        </template>
      </Table>
    </Card>
  </Page>
</template>
