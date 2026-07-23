<script lang="ts" setup>
import type { FdmdataExtensionReleaseApi } from '#/api/fdmdata/extensionrelease';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { Button, message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  createExtensionRelease,
  getExtensionRelease,
  updateExtensionRelease,
  uploadExtensionReleasePackage,
} from '#/api/fdmdata/extensionrelease';
import { $t } from '#/locales';

import { EXTENSION_RELEASE_DEFAULTS, useFormSchema } from '../data';

defineOptions({ name: 'ExtensionReleaseForm' });

const emit = defineEmits<{ success: [] }>();
const formData = ref<FdmdataExtensionReleaseApi.ExtensionRelease>();
const packageInputRef = ref<HTMLInputElement>();
const packageFileName = ref('');
const currentPackageUrl = ref('');
const packageUploading = ref(false);
let packageFile: File | null = null;
let uploadedPackage: FdmdataExtensionReleaseApi.PackageUploadResp | null = null;
let openSeq = 0;

const MAX_PACKAGE_SIZE = 50 * 1024 * 1024;

function selectPackage() {
  packageInputRef.value?.click();
}

function clearPackageSelection() {
  packageFile = null;
  uploadedPackage = null;
  packageFileName.value = '';
  if (packageInputRef.value) packageInputRef.value.value = '';
}

function handlePackageChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.name.toLowerCase().endsWith('.zip')) {
    message.error('请选择 ZIP 格式的插件安装包');
    return;
  }
  if (file.size > MAX_PACKAGE_SIZE) {
    message.error('插件 ZIP 不能超过 50 MB');
    return;
  }
  packageFile = file;
  uploadedPackage = null;
  packageFileName.value = file.name;
}

const [Form, formApi] = useVbenForm({
  schema: useFormSchema(),
  showDefaultActions: false,
  layout: 'horizontal',
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
  commonConfig: { labelWidth: 112, colon: true },
});

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) return;
    const data = await formApi.getValues();
    modalApi.lock();
    try {
      if (packageFile) {
        packageUploading.value = true;
        const uploaded =
          uploadedPackage ?? (await uploadExtensionReleasePackage(packageFile));
        uploadedPackage = uploaded;
        data.downloadUrl = uploaded.url;
        data.sha256 = uploaded.sha256;
      }
      if (data.id) {
        await updateExtensionRelease(
          data as FdmdataExtensionReleaseApi.ExtensionRelease,
        );
        message.success($t('ui.actionMessage.updateSuccess', [data.id]));
      } else {
        await createExtensionRelease(
          data as FdmdataExtensionReleaseApi.ExtensionRelease,
        );
        message.success($t('ui.actionMessage.createSuccess'));
      }
      emit('success');
      await modalApi.close();
    } finally {
      packageUploading.value = false;
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen) {
    if (!isOpen) {
      modalApi.unlock();
      formData.value = undefined;
      currentPackageUrl.value = '';
      clearPackageSelection();
      return;
    }
    const seq = ++openSeq;
    const row = modalApi.getData<FdmdataExtensionReleaseApi.ExtensionRelease>();
    await formApi.resetForm();
    await formApi.setValues(EXTENSION_RELEASE_DEFAULTS as any, false);
    currentPackageUrl.value = '';
    clearPackageSelection();
    if (!row?.id) return;
    modalApi.lock();
    try {
      const detail = await getExtensionRelease(row.id);
      if (seq !== openSeq) return;
      formData.value = detail;
      currentPackageUrl.value = detail.downloadUrl?.trim() ?? '';
      await formApi.setValues(detail as any, false);
    } finally {
      if (seq === openSeq) modalApi.unlock();
    }
  },
});

const title = computed(() =>
  formData.value?.id ? '修改插件版本' : '新增插件版本',
);
</script>

<template>
  <Modal :title="title" class="w-[920px] max-w-[calc(100vw-2rem)]">
    <div class="mb-4 flex min-h-8 items-center gap-3 px-1">
      <div class="w-[112px] shrink-0 text-right text-sm">插件 ZIP：</div>
      <input
        ref="packageInputRef"
        class="hidden"
        type="file"
        accept=".zip,application/zip,application/x-zip-compressed"
        @change="handlePackageChange"
      />
      <Button :loading="packageUploading" @click="selectPackage">
        <template #icon>
          <IconifyIcon icon="lucide:upload" />
        </template>
        {{ currentPackageUrl ? '替换 ZIP' : '选择 ZIP' }}
      </Button>
      <span
        v-if="packageFileName"
        class="min-w-0 truncate text-sm text-foreground"
        :title="packageFileName"
      >
        {{ packageFileName }}
      </span>
      <Button
        v-if="packageFileName"
        type="link"
        danger
        size="small"
        @click="clearPackageSelection"
      >
        移除
      </Button>
      <a
        v-else-if="currentPackageUrl"
        class="min-w-0 truncate text-sm"
        :href="currentPackageUrl"
        :title="currentPackageUrl"
        target="_blank"
        rel="noopener noreferrer"
      >
        当前安装包
      </a>
    </div>
    <Form />
  </Modal>
</template>
