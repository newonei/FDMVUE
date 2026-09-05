<script lang="ts" setup>
import type { JstSyncBatchResp } from '#/api/fdmdata/datajustsku';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { Alert, Button, RadioGroup, Table, Tag } from 'ant-design-vue';

defineOptions({ name: 'DataJustSkuSyncResultModal' });

const emit = defineEmits<{ success: [] }>();

const listLabel = ref('');
const result = ref<JstSyncBatchResp>({
  successCount: 0,
  failCount: 0,
  items: [],
});
const filter = ref<'all' | 'failed'>('all');
const retrying = ref(false);
const retryError = ref('');
let retry: ((ids: number[]) => Promise<JstSyncBatchResp>) | undefined;

const failedItems = computed(() =>
  result.value.items.filter((item) => item.success !== true),
);
const visibleItems = computed(() =>
  filter.value === 'failed' ? failedItems.value : result.value.items,
);
const filterOptions = computed(() => [
  { label: `仅失败（${failedItems.value.length}）`, value: 'failed' },
  { label: `全部（${result.value.items.length}）`, value: 'all' },
]);

const columns = [
  { title: '商品编码', dataIndex: 'itemCode', key: 'itemCode', width: 240 },
  { title: '同步状态', dataIndex: 'success', key: 'success', width: 100 },
  { title: '同步结果 / 失败原因', dataIndex: 'message', key: 'message' },
];

const [Modal, modalApi] = useVbenModal({
  onBeforeClose: () => !retrying.value,
  onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      retry = undefined;
      return;
    }
    const data = modalApi.getData<{
      result: JstSyncBatchResp;
      listLabel: string;
      retry: (ids: number[]) => Promise<JstSyncBatchResp>;
    }>();
    listLabel.value = data.listLabel ?? '';
    result.value = {
      successCount: data.result?.successCount ?? 0,
      failCount: data.result?.failCount ?? 0,
      items: (data.result?.items ?? []).map((item) => ({ ...item })),
    };
    retry = data.retry;
    retryError.value = '';
    retrying.value = false;
    filter.value = failedItems.value.length > 0 ? 'failed' : 'all';
  },
});

async function handleRetry() {
  if (retrying.value || !retry || failedItems.value.length === 0) return;

  const ids = [...new Set(failedItems.value.map((item) => item.id))];
  const requestedIds = new Set(ids);
  retrying.value = true;
  retryError.value = '';
  modalApi.lock();
  try {
    const response = await retry(ids);
    const updates = new Map(response.items.map((item) => [item.id, item]));
    let successDelta = 0;
    const items = result.value.items.map((item) => {
      const update = requestedIds.has(item.id)
        ? updates.get(item.id)
        : undefined;
      if (!update) return item;

      successDelta +=
        Number(update.success === true) - Number(item.success === true);
      return {
        ...item,
        ...update,
        itemCode: update.itemCode ?? item.itemCode,
        message: update.message,
      };
    });
    // 重试响应只包含失败项；按变化更新汇总，保留之前已成功的商品和总数。
    result.value = {
      successCount: result.value.successCount + successDelta,
      failCount: result.value.failCount - successDelta,
      items,
    };
    if (failedItems.value.length === 0) filter.value = 'all';
    emit('success');
  } catch {
    retryError.value = '本次重试未完成，已保留上次结果。请稍后再次重试失败项。';
  } finally {
    retrying.value = false;
    modalApi.unlock();
  }
}
</script>

<template>
  <Modal
    :title="listLabel ? `批量同步结果 · ${listLabel}` : '批量同步结果'"
    :show-confirm-button="false"
    :show-cancel-button="false"
    class="w-[880px] max-w-[calc(100vw-2rem)]"
  >
    <div class="space-y-4 px-1 pb-2">
      <div class="flex flex-wrap items-center gap-2" aria-live="polite">
        <span class="mr-2 text-sm">
          本次共 {{ result.successCount + result.failCount }} 条
        </span>
        <Tag color="success">成功 {{ result.successCount }} 条</Tag>
        <Tag :color="result.failCount > 0 ? 'error' : 'default'">
          失败 {{ result.failCount }} 条
        </Tag>
      </div>

      <Alert
        :type="failedItems.length > 0 ? 'warning' : 'success'"
        :message="
          failedItems.length > 0
            ? '请查看失败原因，处理后可直接重试失败项。已成功的商品不会重复提交。'
            : '本次商品已全部同步成功。'
        "
        show-icon
      />
      <Alert v-if="retryError" type="error" :message="retryError" show-icon />

      <RadioGroup
        v-model:value="filter"
        :options="filterOptions"
        option-type="button"
        button-style="solid"
        aria-label="筛选同步结果"
      />

      <Table
        :columns="columns"
        :data-source="visibleItems"
        :pagination="{
          pageSize: 20,
          hideOnSinglePage: true,
          showSizeChanger: false,
          showTotal: (total: number) => `共 ${total} 条`,
        }"
        :scroll="{ x: 640, y: 380 }"
        :locale="{ emptyText: '没有失败的商品' }"
        row-key="id"
        size="small"
        bordered
      >
        <template #bodyCell="{ column, record }">
          <span v-if="column.key === 'itemCode'" class="break-all">
            {{ record.itemCode || `ID：${record.id}` }}
          </span>
          <Tag
            v-else-if="column.key === 'success'"
            :color="record.success === true ? 'success' : 'error'"
          >
            {{ record.success === true ? '成功' : '失败' }}
          </Tag>
          <div
            v-else-if="column.key === 'message'"
            class="whitespace-pre-wrap break-all"
          >
            {{
              record.message ||
              (record.success === true
                ? '同步成功'
                : '未返回具体原因，请检查商品资料后重试')
            }}
          </div>
        </template>
      </Table>
    </div>

    <template #footer>
      <div class="flex w-full flex-wrap items-center justify-end gap-2">
        <span
          v-if="retrying"
          class="mr-auto text-sm text-muted-foreground"
          role="status"
        >
          正在重试失败项，请稍候…
        </span>
        <Button
          :disabled="retrying"
          :type="failedItems.length > 0 ? 'default' : 'primary'"
          @click="modalApi.close()"
        >
          关闭
        </Button>
        <Button
          v-if="failedItems.length > 0"
          type="primary"
          :loading="retrying"
          :disabled="retrying || !retry"
          @click="handleRetry"
        >
          仅重试失败的 {{ failedItems.length }} 条
        </Button>
      </div>
    </template>
  </Modal>
</template>
