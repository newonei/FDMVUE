<script lang="ts" setup>
import type { UploadFile } from 'ant-design-vue';

import { ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { Alert, Form, FormItem, Input, Upload, message } from 'ant-design-vue';

import { importJdEcShopDailyExcel } from '#/api/fdmdata/ecshopdaily';

const emit = defineEmits<{ success: [] }>();

const shopName = ref('');
const shopId = ref('');
const fileList = ref<UploadFile[]>([]);
const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    if (!shopName.value.trim()) {
      message.warning('请填写店铺名称（与后台店铺一致，用于区分多店）');
      return;
    }
    const uploadItem = fileList.value[0];
    const file =
      (uploadItem?.originFileObj as File | undefined) ??
      (uploadItem as unknown as File | undefined);
    if (!file || !(file instanceof File)) {
      message.warning('请选择京东商智导出的 Excel 文件');
      return;
    }
    modalApi.lock();
    try {
      const res = await importJdEcShopDailyExcel(
        file,
        shopName.value.trim(),
        shopId.value.trim(),
      );
      message.success(
        `导入完成：店铺「${res.shopName}」共 ${res.total} 行，新增 ${res.created} 条，更新 ${res.updated} 条`,
      );
      await modalApi.close();
      emit('success');
    } finally {
      modalApi.unlock();
    }
  },
  onOpenChange(isOpen) {
    if (!isOpen) {
      shopName.value = '';
      shopId.value = '';
      fileList.value = [];
    }
  },
});
</script>

<template>
  <Modal title="京东 Excel 导入" class="w-[520px]">
    <Alert
      class="mb-4"
      type="info"
      show-icon
      message="导入说明"
      description="使用京东商智导出的 Excel：第 1 行为列标题，第 2 行起为数据（「时间」非空）。营销费用列支持 ￥ 前缀；平台固定为 JD；同一统计日+店铺已存在则覆盖更新。"
    />
    <Form layout="vertical">
      <FormItem label="店铺名称" required>
        <Input
          v-model:value="shopName"
          allow-clear
          placeholder="必填，参与唯一键"
        />
      </FormItem>
      <FormItem label="店铺 ID">
        <Input
          v-model:value="shopId"
          allow-clear
          placeholder="选填，无则留空"
        />
      </FormItem>
      <FormItem label="Excel 文件" required>
        <Upload
          v-model:file-list="fileList"
          :max-count="1"
          accept=".xlsx,.xls"
          :before-upload="() => false"
        >
          <a class="text-primary">点击选择 .xlsx / .xls</a>
        </Upload>
      </FormItem>
    </Form>
  </Modal>
</template>
