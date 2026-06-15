<script lang="ts" setup>
import type { FileType } from 'ant-design-vue/es/upload/interface';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, Input, message, Upload } from 'ant-design-vue';

import { importExpressReconOrders } from '#/api/fdmdata/expressreconperiod';

defineOptions({ name: 'ExpressReconImportOrdersModal' });

const emit = defineEmits<{ success: [periodId?: number] }>();

const periodName = ref('');
const billMonth = ref('');
const orderFileName = ref('');
let orderFile: File | null = null;

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    if (!orderFile) {
      message.warning('请选择订单明细 Excel');
      return;
    }
    modalApi.lock();
    try {
      const res = await importExpressReconOrders({
        orderFile,
        periodName: periodName.value.trim(),
        billMonth: billMonth.value.trim(),
      });
      message.success(`订单导入任务已提交，账期号：${res.periodNo}`);
      emit('success', res.periodId);
      await modalApi.close();
    } finally {
      modalApi.unlock();
    }
  },
  onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      reset();
    }
  },
});

function reset() {
  periodName.value = '';
  billMonth.value = '';
  orderFile = null;
  orderFileName.value = '';
}

function beforeOrderUpload(file: FileType) {
  orderFile = file as File;
  orderFileName.value = file.name;
  return false;
}
</script>

<template>
  <Modal title="导入当月订单（新建账期）" class="w-[560px] max-w-[calc(100vw-2rem)]">
    <div class="space-y-4 px-1">
      <p class="mb-0 text-xs text-muted-foreground">
        一份整月订单只需导入一次，生成一个账期；之后可在账期下分别上传各家快递公司的对账单。
      </p>
      <div class="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <div class="mb-1 text-sm font-medium">账期名称</div>
          <Input
            v-model:value="periodName"
            allow-clear
            placeholder="可选，如 2026年5月订单"
          />
        </div>
        <div>
          <div class="mb-1 text-sm font-medium">账单月份</div>
          <Input v-model:value="billMonth" allow-clear placeholder="如 2026-05" />
        </div>
      </div>
      <div>
        <div class="mb-1 text-sm font-medium">订单明细 Excel</div>
        <Upload
          :before-upload="beforeOrderUpload"
          :max-count="1"
          accept=".xls,.xlsx"
        >
          <Button type="primary">
            <template #icon>
              <IconifyIcon icon="lucide:upload" />
            </template>
            选择订单明细
          </Button>
        </Upload>
        <div v-if="orderFileName" class="mt-1 text-xs text-muted-foreground">
          {{ orderFileName }}
        </div>
      </div>
    </div>
  </Modal>
</template>
