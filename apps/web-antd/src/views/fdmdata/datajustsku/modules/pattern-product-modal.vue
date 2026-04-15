<script lang="ts" setup>
import type { ColumnsType } from 'ant-design-vue/es/table';

import { reactive, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import {
  Button,
  Form,
  FormItem,
  Image,
  Input,
  message,
  Spin,
  Table,
} from 'ant-design-vue';

import ImageUpload from '#/components/upload/image-upload.vue';

import type { FdmdataDataJustPatternApi } from '#/api/fdmdata/datajustpattern';
import {
  createDataJustPatternCost,
  getDataJustPatternCostPage,
} from '#/api/fdmdata/datajustpattern';

const emit = defineEmits(['success']);

const loading = ref(false);
const savingPattern = ref(false);

const createForm = reactive({
  styleCode: '',
  itemCode: '',
  productName: '',
  picUrl: '',
  remark: '',
});

const listLoading = ref(false);
const list = ref<FdmdataDataJustPatternApi.PatternCost[]>([]);

const columns: ColumnsType = [
  { title: '预览图', key: 'pic', width: 120 },
  { title: '图案名称', dataIndex: 'patternName', key: 'patternName' },
  { title: '对照编码', dataIndex: 'itemCode', key: 'itemCode', width: 140 },
];

function normalizeItemCode(raw: string) {
  return (raw ?? '').trim().toUpperCase();
}

function isValidItemCode(code: string) {
  return /^[A-Z]{1,4}$/.test(code);
}

async function reloadList() {
  listLoading.value = true;
  try {
    const res = await getDataJustPatternCostPage({ pageNo: 1, pageSize: 200 });
    list.value = res.list ?? [];
  } finally {
    listLoading.value = false;
  }
}

async function handleCreatePattern() {
  const patternName = createForm.productName?.trim();
  const itemCode = normalizeItemCode(createForm.itemCode ?? '');
  const picUrl = (createForm.picUrl ?? '').trim();
  const remark = (createForm.remark ?? '').trim();
  if (!itemCode) return message.warning('请输入对照编码');
  if (!patternName) return message.warning('请输入图案名称');
  if (!isValidItemCode(itemCode)) {
    return message.warning('对照编码仅支持 1~4 位大写英文字母（例如 ABCD）');
  }
  savingPattern.value = true;
  try {
    await createDataJustPatternCost({
      itemCode,
      patternName,
      picUrl: picUrl || undefined,
      remark: remark || undefined,
    });
    message.success('新增成功');
    createForm.styleCode = '';
    createForm.itemCode = '';
    createForm.productName = '';
    createForm.picUrl = '';
    createForm.remark = '';
    await reloadList();
    emit('success');
  } finally {
    savingPattern.value = false;
  }
}

const [VbenModal, modalApi] = useVbenModal({
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      createForm.styleCode = '';
      createForm.itemCode = '';
      createForm.productName = '';
      createForm.picUrl = '';
      createForm.remark = '';
      list.value = [];
      return;
    }
    modalApi.lock();
    try {
      loading.value = true;
      await reloadList();
    } finally {
      loading.value = false;
      modalApi.unlock();
    }
  },
});
</script>

<template>
  <VbenModal
    title="维护图案编码（图案=商品）"
    class="w-[min(1280px,calc(100vw-2rem))]"
    :show-cancel-button="false"
    :show-confirm-button="false"
  >
    <Spin :spinning="loading">
      <div class="mb-4 rounded-md border border-border bg-muted/30 p-3">
        <div class="mb-2 text-sm font-medium text-foreground">新增图案商品</div>
        <Form layout="vertical" class="mb-0">
          <div class="flex flex-wrap gap-4">
            <FormItem label="对照编码" class="mb-0 min-w-[220px] flex-1">
              <Input
                v-model:value="createForm.itemCode"
                placeholder="例如 ABCD（1~4 位大写字母）"
                allow-clear
                @blur="createForm.itemCode = normalizeItemCode(createForm.itemCode as any)"
              />
            </FormItem>
            <FormItem label="图案名称" class="mb-0 min-w-[260px] flex-1">
              <Input v-model:value="createForm.productName" placeholder="例如 玉兰花" allow-clear />
            </FormItem>
          </div>
          <FormItem label="图片（选填）" class="mb-0 mt-2">
            <ImageUpload v-model="createForm.picUrl" :max-number="1" />
          </FormItem>
          <FormItem label="备注" class="mb-0 mt-2">
            <Input v-model:value="createForm.remark" placeholder="备注" allow-clear />
          </FormItem>
          <Button type="primary" :loading="savingPattern" @click="handleCreatePattern">
            保存新增
          </Button>
        </Form>
      </div>

      <div class="rounded-md border border-border p-3">
        <div class="mb-2 text-sm font-medium text-foreground">已有图案列表</div>
        <Spin :spinning="listLoading">
          <Table
            size="small"
            :columns="columns"
            :pagination="false"
            :data-source="list"
            row-key="id"
            bordered
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'pic'">
                <Image
                  v-if="record.picUrl"
                  :src="record.picUrl"
                  :width="48"
                  :height="48"
                  class="rounded object-cover"
                />
                <span v-else class="text-muted-foreground">-</span>
              </template>
              <template v-else-if="column.key === 'patternName'">
                <span>{{ record.patternName }}</span>
              </template>
              <template v-else-if="column.key === 'itemCode'">
                <span class="font-mono">{{ record.itemCode }}</span>
              </template>
            </template>
            <template #emptyText>
              <div class="py-4 text-center text-muted-foreground">暂无图案数据</div>
            </template>
          </Table>
        </Spin>
      </div>

    </Spin>

    <div class="mt-4 flex justify-end border-t border-border pt-3">
      <Button @click="modalApi.close()">关闭</Button>
    </div>
  </VbenModal>
</template>

