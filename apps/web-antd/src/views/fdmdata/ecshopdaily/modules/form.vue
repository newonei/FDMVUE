<script lang="ts" setup>
import type { EcShopDailyShopSelectOption } from '../data';

import type { FdmdataEcShopDailyApi } from '#/api/fdmdata/ecshopdaily';

import { computed, ref } from 'vue';

import { useVbenModal } from '@vben/common-ui';

import { message } from 'ant-design-vue';

import { useVbenForm } from '#/adapter/form';
import {
  createEcShopDaily,
  getEcShopDaily,
  getEcShopDailyPage,
  getEcShopDailyPlatformDetail,
  getEcShopDailyShopOptions,
  updateEcShopDaily,
} from '#/api/fdmdata/ecshopdaily';
import { $t } from '#/locales';

import {
  buildEcShopDailySubmitPayload,
  formatEcPlatformLabel,
  getEcShopDailyCreateDefaults,
  mapEcShopDailyPlatformDetailToFormValues,
  mapEcShopDailyToFormValues,
  normalizeEcPlatformCode,
  useFormSchema,
} from '../data';

defineOptions({ name: 'EcShopDailyForm' });

const emit = defineEmits<{ success: [] }>();

// openSeq 用于防止多次快速切换时旧请求覆盖新请求
let openSeq = 0;

const formData = ref<FdmdataEcShopDailyApi.EcShopDaily | undefined>();
const currentPlatformCode = ref<string | undefined>();
const shopOptions = ref<EcShopDailyShopSelectOption[]>([]);
const shopOptionsLoading = ref(false);
const currentPlatformLabel = computed(() =>
  currentPlatformCode.value
    ? formatEcPlatformLabel(currentPlatformCode.value)
    : '',
);
let shopFetchSeq = 0;

function isPddPlatform(platformCode = currentPlatformCode.value) {
  return normalizeEcPlatformCode(platformCode) === 'PDD';
}

function toShopSelectOption(
  option: FdmdataEcShopDailyApi.EcShopDailyShopOption,
): EcShopDailyShopSelectOption {
  const shopId = String(option.shopId ?? '').trim();
  const shopName = String(option.shopName ?? '').trim();
  return {
    label: option.label || (shopName ? `${shopName} (${shopId})` : shopId),
    shopId,
    shopName,
    value: shopId,
  };
}

function mergeCurrentShopOption(
  options: EcShopDailyShopSelectOption[],
  shopId: unknown,
  shopName: unknown,
) {
  const id = String(shopId ?? '').trim();
  if (!id || options.some((item) => item.value === id)) return options;
  const name = String(shopName ?? '').trim();
  return [
    {
      label: name ? `${name} (${id})` : id,
      shopId: id,
      shopName: name,
      value: id,
    },
    ...options,
  ];
}

function ensureShopOption(shopId: unknown, shopName: unknown) {
  shopOptions.value = mergeCurrentShopOption(
    shopOptions.value,
    shopId,
    shopName,
  );
}

function toDailyShopSelectOptions(
  rows: Partial<FdmdataEcShopDailyApi.EcShopDaily>[],
) {
  const seen = new Set<string>();
  const options: EcShopDailyShopSelectOption[] = [];
  for (const row of rows) {
    const shopId = String(row.shopId ?? '').trim();
    if (!shopId || seen.has(shopId)) continue;
    const shopName = String(row.shopName ?? '').trim();
    seen.add(shopId);
    options.push({
      label: shopName ? `${shopName} (${shopId})` : shopId,
      shopId,
      shopName,
      value: shopId,
    });
  }
  return options;
}

async function fetchDailyShopOptionsFallback(keyword = '') {
  const page = await getEcShopDailyPage({
    pageNo: 1,
    pageSize: 100,
    platformCode: 'PDD',
    shopName: keyword || undefined,
  });
  return toDailyShopSelectOptions(page?.list ?? []);
}

function mergeShopOptions(
  primary: EcShopDailyShopSelectOption[],
  fallback: EcShopDailyShopSelectOption[],
) {
  const seen = new Set<string>();
  const merged: EcShopDailyShopSelectOption[] = [];
  for (const item of [...primary, ...fallback]) {
    if (!item.value || seen.has(item.value)) continue;
    seen.add(item.value);
    merged.push(item);
  }
  return merged;
}

async function loadShopOptions(keyword = '') {
  let justShopOptions: EcShopDailyShopSelectOption[] = [];
  try {
    const list = await getEcShopDailyShopOptions({
      keyword,
      limit: 50,
      platformCode: 'PDD',
    });
    justShopOptions = list
      .map((item) => toShopSelectOption(item))
      .filter((item) => item.value);
  } catch {
    // Existing daily rows still provide a usable shop ID list.
  }
  const dailyOptions = await fetchDailyShopOptionsFallback(keyword).catch(
    () => [],
  );
  return mergeShopOptions(justShopOptions, dailyOptions);
}

async function fetchShopOptions(keyword = '') {
  if (!isPddPlatform()) return;
  const mySeq = ++shopFetchSeq;
  shopOptionsLoading.value = true;
  try {
    const loadedOptions = await loadShopOptions(keyword);
    if (mySeq !== shopFetchSeq) return;
    const values = await formApi.getValues().catch(() => ({}));
    shopOptions.value = mergeCurrentShopOption(
      loadedOptions,
      values.shopId,
      values.shopName,
    );
  } catch (error) {
    if (mySeq === shopFetchSeq) {
      console.error('Load ec shop options failed', error);
      shopOptions.value = [];
    }
  } finally {
    if (mySeq === shopFetchSeq) {
      shopOptionsLoading.value = false;
    }
  }
}

function buildFormSchema() {
  return useFormSchema({
    fixedPlatform: !!currentPlatformCode.value,
    onShopSearch: (keyword) => {
      void fetchShopOptions(keyword);
    },
    platformCode: currentPlatformCode.value,
    shopOptions,
    shopOptionsLoading,
  });
}

const [Form, formApi] = useVbenForm({
  schema: useFormSchema(),
  showDefaultActions: false,
  layout: 'horizontal',
  wrapperClass: 'grid-cols-1 md:grid-cols-2',
  commonConfig: { labelWidth: 180, colon: true },
});

const [Modal, modalApi] = useVbenModal({
  async onConfirm() {
    const { valid } = await formApi.validate();
    if (!valid) return;
    const raw = await formApi.getValues();
    const data = buildEcShopDailySubmitPayload(raw, currentPlatformCode.value);
    modalApi.lock();
    try {
      if (data.id) {
        await updateEcShopDaily(data);
        message.success($t('ui.actionMessage.updateSuccess', [data.id]));
      } else {
        await createEcShopDaily(data);
        message.success($t('ui.actionMessage.createSuccess'));
      }
      emit('success');
      await modalApi.close();
    } finally {
      modalApi.unlock();
    }
  },
  async onOpenChange(isOpen: boolean) {
    if (!isOpen) {
      modalApi.unlock();
      formData.value = undefined;
      currentPlatformCode.value = undefined;
      shopFetchSeq++;
      shopOptions.value = [];
      shopOptionsLoading.value = false;
      await formApi.resetForm();
      return;
    }
    const mySeq = ++openSeq;
    const row = modalApi.getData<Partial<FdmdataEcShopDailyApi.EcShopDaily>>();
    formData.value = undefined;
    currentPlatformCode.value = normalizeEcPlatformCode(row?.platformCode);
    shopFetchSeq++;
    shopOptions.value = [];
    formApi.setState({
      schema: buildFormSchema(),
    });

    if (!row?.id) {
      await formApi.resetForm();
      await formApi.setValues(
        mapEcShopDailyToFormValues(
          getEcShopDailyCreateDefaults(currentPlatformCode.value),
        ),
        false,
      );
      void fetchShopOptions();
      return;
    }

    modalApi.lock();
    try {
      const [detail, platformDetail] = await Promise.all([
        getEcShopDaily(row.id),
        getEcShopDailyPlatformDetail(row.id).catch(() => undefined),
      ]);
      if (mySeq !== openSeq) return;
      if (!detail) {
        message.error('记录不存在或已被删除');
        await modalApi.close();
        return;
      }
      formData.value = detail;
      currentPlatformCode.value = normalizeEcPlatformCode(
        detail.platformCode ?? row.platformCode,
      );
      formApi.setState({
        schema: buildFormSchema(),
      });
      await formApi.resetForm();
      const values = mapEcShopDailyToFormValues({
        ...row,
        ...detail,
        ...mapEcShopDailyPlatformDetailToFormValues(
          currentPlatformCode.value,
          platformDetail?.detail,
        ),
      });
      ensureShopOption(values.shopId, values.shopName);
      await formApi.setValues(values, false);
      void fetchShopOptions();
    } catch (error) {
      if (mySeq === openSeq) {
        console.error('Load ecShopDaily detail failed', error);
        message.error('加载详情失败，请稍后再试');
        await modalApi.close();
      }
    } finally {
      if (mySeq === openSeq) modalApi.unlock();
    }
  },
});

const title = computed(() =>
  formData.value?.id
    ? `修改${currentPlatformLabel.value || '店铺'}日汇总`
    : `新增${currentPlatformLabel.value || '店铺'}日汇总`,
);
</script>

<template>
  <Modal :title="title" class="w-[960px]">
    <div
      class="ec-shop-daily-form-body overflow-y-auto pr-1"
      style="max-height: 70vh"
    >
      <Form />
    </div>
  </Modal>
</template>

<style scoped>
.ec-shop-daily-form-body :deep(.ant-form-item-label > label) {
  white-space: nowrap;
}

/* label 固定宽度，与 labelWidth:180 对齐 */
.ec-shop-daily-form-body :deep(.ant-form-item-label) {
  flex: 0 0 180px;
  max-width: 180px;
}
</style>
