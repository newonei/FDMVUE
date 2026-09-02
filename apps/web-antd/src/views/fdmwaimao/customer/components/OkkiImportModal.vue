<script lang="ts" setup>
import type { FdmWaimaoCustomerApi } from '#/api/fdmwaimao/customer';

import { computed, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Checkbox,
  Input,
  message,
  Modal,
  Pagination,
  Progress,
  Select,
  Skeleton,
  Spin,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import {
  formatOkkiError,
  getBusinessErrorCode,
  getCustomer,
  importOkkiCustomer,
  previewOkkiCustomer,
  searchOkkiCustomers,
  updateCustomerProfile,
} from '#/api/fdmwaimao/customer';

import {
  CUSTOMER_PROFILE_VERSION_CONFLICT,
  isBusinessCode,
  isValidPreviewHash,
  isValidProfileVersion,
  OKKI_IMPORT_CONFIRM_REQUIRED,
  OKKI_IMPORT_PREVIEW_STALE,
} from './okki-import/concurrency';
import {
  cleanOkkiText,
  formatOkkiDateTime,
  formatOkkiPhone,
  hasContactChannel,
  stageLabel,
} from './okki-import/display';
import OkkiCandidateCard from './okki-import/OkkiCandidateCard.vue';
import OkkiProfileEditor from './okki-import/OkkiProfileEditor.vue';

defineOptions({ name: 'FdmWaimaoOkkiImportModal' });

const props = defineProps<{
  allowImport: boolean;
  allowUpdateProfile: boolean;
  open: boolean;
}>();

const emit = defineEmits<{
  imported: [customerId: string];
  openExisting: [customerId: string];
  saved: [customerId: string];
  'update:open': [open: boolean];
}>();

const SEARCH_FIELD_OPTIONS: Array<{
  label: string;
  value: FdmWaimaoCustomerApi.OkkiSearchField;
}> = [
  { label: '公司名称 / 简称', value: 'name' },
  { label: 'OKKI 客户编号', value: 'serial_id' },
  { label: '联系人姓名', value: 'customer_list.name' },
  { label: '联系人邮箱', value: 'customer_list.email' },
  { label: '邮箱域名', value: 'customer_list.email.domain' },
  { label: '联系人电话', value: 'customer_list.tel' },
  { label: '社交账号', value: 'customer_list.contact.value' },
];

const form = reactive<{
  keyword: string;
  pageNo: number;
  pageSize: number;
  searchField: FdmWaimaoCustomerApi.OkkiSearchField;
}>({
  keyword: '',
  pageNo: 1,
  pageSize: 20,
  searchField: 'name',
});

const candidates = ref<FdmWaimaoCustomerApi.OkkiCandidate[]>([]);
const total = ref(0);
const searching = ref(false);
const previewing = ref(false);
const importing = ref(false);
const selected = ref<FdmWaimaoCustomerApi.OkkiCandidate>();
const preview = ref<FdmWaimaoCustomerApi.OkkiPreview>();
const draft = ref<FdmWaimaoCustomerApi.CustomerProfileDraft>();
const draftBaseline = ref('');
const draftOrigin = ref<'LOCAL' | 'OKKI'>('OKKI');
const loadedProfileVersion = ref<number>();
const duplicateConfirmed = ref(false);
const serverConfirmationRequired = ref(false);
const searchError = ref('');
const previewError = ref('');
let searchRequestId = 0;
let previewRequestId = 0;

const duplicateMatches = computed(() =>
  Array.isArray(preview.value?.duplicateMatches)
    ? preview.value.duplicateMatches
    : [],
);
const duplicateCount = computed(() => duplicateMatches.value.length);
const confirmationRequired = computed(
  () => duplicateCount.value > 0 || serverConfirmationRequired.value,
);
const contacts = computed(() =>
  Array.isArray(preview.value?.contacts) ? preview.value.contacts : [],
);
const mappedCustomerId = computed(
  () => preview.value?.mappedCustomerId ?? selected.value?.mappedCustomerId,
);
const alreadyMapped = computed(
  () =>
    preview.value?.mapped ??
    selected.value?.mapped ??
    Boolean(mappedCustomerId.value),
);
const mappedVisible = computed(
  () =>
    preview.value?.mappedCustomerVisible ??
    selected.value?.mappedCustomerVisible ??
    Boolean(mappedCustomerId.value),
);
const draftErrors = computed(() => validateDraft(draft.value));
const draftValid = computed(
  () => Boolean(draft.value) && Object.keys(draftErrors.value).length === 0,
);
const draftDirty = computed(
  () =>
    Boolean(draft.value) && serializeDraft(draft.value) !== draftBaseline.value,
);
const canEditDraft = computed(
  () =>
    !importing.value &&
    (alreadyMapped.value
      ? mappedVisible.value && props.allowUpdateProfile
      : props.allowImport),
);
const canImport = computed(
  () =>
    Boolean(preview.value) &&
    Boolean(preview.value?.previewHash) &&
    draftValid.value &&
    props.allowImport &&
    !importing.value &&
    !alreadyMapped.value &&
    (!confirmationRequired.value || duplicateConfirmed.value),
);
const canSaveMapped = computed(
  () =>
    Boolean(mappedCustomerId.value) &&
    alreadyMapped.value &&
    mappedVisible.value &&
    props.allowUpdateProfile &&
    draftDirty.value &&
    draftValid.value &&
    !importing.value,
);
const selectedName = computed(
  () => cleanOkkiText(selected.value?.name) || '尚未选择客户',
);
const previewName = computed(
  () => cleanOkkiText(preview.value?.name) || selectedName.value,
);
const previewShortName = computed(() => {
  const value = cleanOkkiText(preview.value?.shortName);
  return value && value !== previewName.value ? value : '';
});
const ownerText = computed(() => {
  const owners = Array.isArray(preview.value?.owners)
    ? preview.value.owners
    : [];
  const names = owners
    .map((owner) => cleanOkkiText(owner.name))
    .filter(Boolean);
  return names.join('、');
});
const companyPhoneText = computed(() =>
  formatOkkiPhone(
    preview.value?.companyTelAreaCode,
    preview.value?.companyPhone,
  ),
);
const regionText = computed(
  () =>
    cleanOkkiText(preview.value?.countryRegionRaw) ||
    cleanOkkiText(preview.value?.countryName) ||
    cleanOkkiText(preview.value?.countryCode),
);
const sourceCompleteness = computed(() => {
  if (!preview.value) return { filled: 0, percent: 0, total: 10 };
  const fields = [
    previewName.value,
    cleanOkkiText(preview.value.serialId),
    regionText.value,
    cleanOkkiText(preview.value.stageName),
    ownerText.value,
    cleanOkkiText(preview.value.homepage),
    companyPhoneText.value,
    cleanOkkiText(preview.value.address),
    cleanOkkiText(preview.value.remoteUpdateTime),
    contacts.value.some(hasContactChannel) ? 'contact-channel' : '',
  ];
  const filled = fields.filter(Boolean).length;
  return { filled, percent: filled * 10, total: fields.length };
});
const footerHint = computed(() => {
  if (!preview.value) return '请先从左侧选择并核对客户';
  if (alreadyMapped.value && !mappedVisible.value)
    return '该客户已经导入，但你无权查看现有记录';
  if (!draftValid.value) return '请先修正草稿中的必填项或格式错误';
  if (alreadyMapped.value && mappedVisible.value && draftDirty.value)
    return '有未保存修改，保存后将打开客户详情';
  if (alreadyMapped.value && mappedVisible.value)
    return props.allowUpdateProfile
      ? '当前显示现有 FDM 资料，可直接修改'
      : '当前账号没有客户资料修改权限';
  if (confirmationRequired.value && !duplicateConfirmed.value)
    return '请先确认疑似重复客户';
  if (!props.allowImport && !alreadyMapped.value) return '当前账号没有导入权限';
  if (draftDirty.value)
    return '草稿已修改；提交时服务端会重新读取 OKKI 身份并查重';
  return 'OKKI 已自动回填，可直接编辑后再导入';
});

function value(value: unknown) {
  return cleanOkkiText(value);
}

function profileFromPreview(
  source: FdmWaimaoCustomerApi.OkkiPreview,
): FdmWaimaoCustomerApi.CustomerProfileDraft {
  return {
    address: value(source.address),
    companyPhone: value(source.companyPhone),
    companyTelAreaCode: value(source.companyTelAreaCode),
    contacts: (Array.isArray(source.contacts) ? source.contacts : []).map(
      (contact, index) => ({
        draftKey: `okki-${source.companyId}-${index}`,
        email: value(contact.email),
        externalContactKey:
          value(contact.externalContactKey) || value(contact.id) || undefined,
        linkedin: value(contact.linkedin),
        name: value(contact.name),
        phone: value(contact.phone),
        position: value(contact.position),
        primaryFlag: Boolean(contact.primaryFlag),
        source: 'OKKI',
        telAreaCode: value(contact.telAreaCode),
        wechat: value(contact.wechat),
        whatsapp: value(contact.whatsapp),
      }),
    ),
    countryCode: value(source.countryCode),
    countryName: value(source.countryName),
    countryRegionRaw: value(source.countryRegionRaw),
    fax: value(source.fax),
    homepage: value(source.homepage),
    name: value(source.name),
    remark: value(source.remark),
    shortName: value(source.shortName),
  };
}

function profileFromCustomer(
  source: FdmWaimaoCustomerApi.CustomerDetail,
  remote: FdmWaimaoCustomerApi.OkkiPreview,
): FdmWaimaoCustomerApi.CustomerProfileDraft {
  const manualFields = new Set(
    (Array.isArray(source.manualOverrideFields)
      ? source.manualOverrideFields
      : []
    ).map((field) =>
      cleanOkkiText(field).replaceAll(/[_-]/g, '').toLowerCase(),
    ),
  );
  const mergedValue = (
    field: string,
    local: null | string | undefined,
    fallback: null | string | undefined,
  ) => {
    const localValue = value(local);
    return manualFields.has(field.toLowerCase())
      ? localValue
      : localValue || value(fallback);
  };
  return {
    address: mergedValue('address', source.address, remote.address),
    companyPhone: mergedValue(
      'companyPhone',
      source.companyPhone,
      remote.companyPhone,
    ),
    companyTelAreaCode: mergedValue(
      'companyTelAreaCode',
      source.companyTelAreaCode,
      remote.companyTelAreaCode,
    ),
    contacts: (Array.isArray(source.contacts) ? source.contacts : []).map(
      (contact) => ({
        draftKey: `local-${contact.id}`,
        email: value(contact.email),
        externalContactKey: value(contact.externalContactKey) || undefined,
        id: contact.id,
        linkedin: value(contact.linkedin),
        name: value(contact.name),
        phone: value(contact.phone),
        position: value(contact.position),
        primaryFlag: Boolean(contact.primaryFlag),
        source: contact.source,
        telAreaCode: value(contact.telAreaCode),
        wechat: value(contact.wechat),
        whatsapp: value(contact.whatsapp),
      }),
    ),
    countryCode: mergedValue(
      'countryCode',
      source.countryCode,
      remote.countryCode,
    ),
    countryName: mergedValue(
      'countryName',
      source.countryName,
      remote.countryName,
    ),
    countryRegionRaw: mergedValue(
      'countryRegionRaw',
      source.countryRegionRaw,
      remote.countryRegionRaw,
    ),
    fax: mergedValue('fax', source.fax, remote.fax),
    homepage: mergedValue('homepage', source.homepage, remote.homepage),
    name: mergedValue('name', source.name, remote.name),
    remark: mergedValue('remark', source.remark, remote.remark),
    shortName: mergedValue('shortName', source.shortName, remote.shortName),
  };
}

function serializeDraft(
  source: FdmWaimaoCustomerApi.CustomerProfileDraft | undefined,
) {
  return source ? JSON.stringify(source) : '';
}

function setDraft(
  source: FdmWaimaoCustomerApi.CustomerProfileDraft,
  origin: 'LOCAL' | 'OKKI',
) {
  draft.value = source;
  draftOrigin.value = origin;
  draftBaseline.value = serializeDraft(source);
}

function optionalText(input: null | string | undefined) {
  const normalized = String(input ?? '').trim();
  return normalized || null;
}

function profilePayload(): FdmWaimaoCustomerApi.CustomerProfileDraft {
  if (!draft.value) throw new Error('客户草稿尚未初始化');
  return {
    address: optionalText(draft.value.address),
    companyPhone: optionalText(draft.value.companyPhone),
    companyTelAreaCode: optionalText(draft.value.companyTelAreaCode),
    contacts: draft.value.contacts.map((contact) => ({
      email: optionalText(contact.email),
      externalContactKey: optionalText(contact.externalContactKey),
      id: optionalText(contact.id),
      linkedin: optionalText(contact.linkedin),
      name: optionalText(contact.name),
      phone: optionalText(contact.phone),
      position: optionalText(contact.position),
      primaryFlag: Boolean(contact.primaryFlag),
      telAreaCode: optionalText(contact.telAreaCode),
      wechat: optionalText(contact.wechat),
      whatsapp: optionalText(contact.whatsapp),
    })),
    countryCode: optionalText(draft.value.countryCode),
    countryName: optionalText(draft.value.countryName),
    countryRegionRaw: optionalText(draft.value.countryRegionRaw),
    fax: optionalText(draft.value.fax),
    homepage: optionalText(draft.value.homepage),
    name: String(draft.value.name ?? '').trim(),
    remark: optionalText(draft.value.remark),
    shortName: optionalText(draft.value.shortName),
  };
}

function isWebAddress(input: string) {
  try {
    const parsed = new URL(
      /^https?:\/\//i.test(input) ? input : `https://${input}`,
    );
    return (
      (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
      Boolean(parsed.hostname) &&
      (parsed.hostname === 'localhost' || parsed.hostname.includes('.'))
    );
  } catch {
    return false;
  }
}

function validateDraft(
  source: FdmWaimaoCustomerApi.CustomerProfileDraft | undefined,
) {
  const errors: Record<string, string> = {};
  if (!source) return errors;
  const checkLength = (
    key: string,
    input: null | string | undefined,
    max: number,
  ) => {
    if (String(input ?? '').trim().length > max)
      errors[key] = `不能超过 ${max} 个字符`;
  };
  if (!String(source.name ?? '').trim()) errors.name = '客户名称不能为空';
  checkLength('name', source.name, 255);
  checkLength('shortName', source.shortName, 255);
  checkLength('countryCode', source.countryCode, 32);
  checkLength('countryName', source.countryName, 128);
  checkLength('countryRegionRaw', source.countryRegionRaw, 255);
  checkLength('companyTelAreaCode', source.companyTelAreaCode, 32);
  checkLength('companyPhone', source.companyPhone, 128);
  checkLength('homepage', source.homepage, 512);
  checkLength('fax', source.fax, 128);
  checkLength('address', source.address, 512);
  checkLength('remark', source.remark, 2000);
  const homepage = String(source.homepage ?? '').trim();
  if (homepage && !isWebAddress(homepage))
    errors.homepage = '请输入有效网址，例如 https://example.com';
  if (source.contacts.length > 100)
    errors.contacts = '单个客户最多保存 100 位联系人';
  let primaryCount = 0;
  source.contacts.forEach((contact, index) => {
    const prefix = `contacts.${index}`;
    const hasLocalIdentity = [
      contact.name,
      contact.email,
      contact.phone,
      contact.whatsapp,
      contact.wechat,
      contact.linkedin,
    ].some((item) => Boolean(String(item ?? '').trim()));
    if (contact.source === 'LOCAL' && !hasLocalIdentity)
      errors[`${prefix}.name`] = '新增联系人至少填写姓名或一种联系方式';
    checkLength(`${prefix}.name`, contact.name, 128);
    checkLength(`${prefix}.position`, contact.position, 128);
    checkLength(`${prefix}.email`, contact.email, 320);
    checkLength(`${prefix}.telAreaCode`, contact.telAreaCode, 32);
    checkLength(`${prefix}.phone`, contact.phone, 128);
    checkLength(`${prefix}.whatsapp`, contact.whatsapp, 255);
    checkLength(`${prefix}.wechat`, contact.wechat, 255);
    checkLength(`${prefix}.linkedin`, contact.linkedin, 512);
    const email = String(contact.email ?? '').trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors[`${prefix}.email`] = '请输入有效邮箱地址';
    if (contact.primaryFlag) primaryCount += 1;
  });
  if (primaryCount > 1) errors.contacts = '只能设置一位主联系人';
  return errors;
}

function confirmDiscardDraft() {
  if (!draftDirty.value) return Promise.resolve(true);
  return new Promise<boolean>((resolve) => {
    Modal.confirm({
      cancelText: '继续编辑',
      content: '离开后，本次对公司资料和联系人的修改不会保存。',
      okText: '放弃修改',
      onCancel: () => resolve(false),
      onOk: () => resolve(true),
      title: '放弃未保存的修改？',
    });
  });
}

function clearLoadedSnapshot() {
  preview.value = undefined;
  draft.value = undefined;
  draftBaseline.value = '';
  draftOrigin.value = 'OKKI';
  loadedProfileVersion.value = undefined;
  previewing.value = false;
  previewError.value = '';
  duplicateConfirmed.value = false;
  serverConfirmationRequired.value = false;
}

function resetSelection() {
  previewRequestId += 1;
  selected.value = undefined;
  clearLoadedSnapshot();
}

watch(
  () => props.open,
  (open) => {
    if (open) return;
    candidates.value = [];
    total.value = 0;
    selected.value = undefined;
    preview.value = undefined;
    draft.value = undefined;
    draftBaseline.value = '';
    draftOrigin.value = 'OKKI';
    loadedProfileVersion.value = undefined;
    searchRequestId += 1;
    previewRequestId += 1;
    searching.value = false;
    previewing.value = false;
    duplicateConfirmed.value = false;
    serverConfirmationRequired.value = false;
    searchError.value = '';
    previewError.value = '';
    form.keyword = '';
    form.pageNo = 1;
  },
);

watch(
  () => serializeDraft(draft.value),
  (next, previous) => {
    if (previous && next !== previous) duplicateConfirmed.value = false;
  },
);

async function close() {
  if (importing.value) return;
  if (!(await confirmDiscardDraft())) return;
  emit('update:open', false);
}

async function runSearch(resetPage = true, skipDiscardCheck = false) {
  if (importing.value) return;
  const keyword = form.keyword.trim();
  if (!keyword) {
    message.warning('请输入 OKKI 客户搜索内容');
    return;
  }
  if (!skipDiscardCheck && !(await confirmDiscardDraft())) return;
  if (resetPage) form.pageNo = 1;
  const requestId = ++searchRequestId;
  resetSelection();
  searchError.value = '';
  searching.value = true;
  try {
    const result = await searchOkkiCustomers({
      keyword,
      pageNo: form.pageNo,
      pageSize: form.pageSize,
      searchField: form.searchField,
    });
    if (requestId !== searchRequestId) return;
    candidates.value = result.list ?? [];
    total.value = result.total ?? 0;
  } catch (error) {
    if (requestId !== searchRequestId) return;
    candidates.value = [];
    total.value = 0;
    searchError.value = formatOkkiError(error);
  } finally {
    if (requestId === searchRequestId) searching.value = false;
  }
}

async function changePage(pageNo: number, pageSize: number) {
  if (!(await confirmDiscardDraft())) return;
  form.pageNo = pageNo;
  form.pageSize = pageSize;
  await runSearch(false, true);
}

interface CandidateSnapshot {
  localCustomer?: FdmWaimaoCustomerApi.CustomerDetail;
  preview: FdmWaimaoCustomerApi.OkkiPreview;
}

async function fetchCandidateSnapshot(
  candidate: FdmWaimaoCustomerApi.OkkiCandidate,
): Promise<CandidateSnapshot> {
  const result = await previewOkkiCustomer(candidate.companyId);
  if (String(result.companyId) !== String(candidate.companyId))
    throw new Error('OKKI 返回了不一致的客户身份，请重新选择');
  if (!isValidPreviewHash(result.previewHash))
    throw new Error('OKKI 预览缺少有效版本摘要，请重新获取');
  const resultMappedCustomerId =
    result.mappedCustomerId ?? candidate.mappedCustomerId;
  const resultMappedVisible =
    result.mappedCustomerVisible ??
    candidate.mappedCustomerVisible ??
    Boolean(resultMappedCustomerId);
  const localCustomer =
    (result.mapped ?? candidate.mapped ?? Boolean(resultMappedCustomerId)) &&
    resultMappedVisible &&
    resultMappedCustomerId
      ? await getCustomer(resultMappedCustomerId)
      : undefined;
  if (localCustomer && !isValidProfileVersion(localCustomer.profileVersion))
    throw new Error('FDM 客户资料缺少有效版本号，请重新获取');
  return { localCustomer, preview: result };
}

function applyCandidateSnapshot(
  candidate: FdmWaimaoCustomerApi.OkkiCandidate,
  requestId: number,
  snapshot: CandidateSnapshot,
) {
  if (
    requestId !== previewRequestId ||
    selected.value?.companyId !== candidate.companyId ||
    String(snapshot.preview.companyId) !== String(candidate.companyId)
  )
    return false;
  preview.value = snapshot.preview;
  loadedProfileVersion.value = snapshot.localCustomer?.profileVersion;
  setDraft(
    snapshot.localCustomer
      ? profileFromCustomer(snapshot.localCustomer, snapshot.preview)
      : profileFromPreview(snapshot.preview),
    snapshot.localCustomer ? 'LOCAL' : 'OKKI',
  );
  return true;
}

async function reloadSelectedSnapshot(successMessage: string) {
  const candidate = selected.value;
  if (!candidate) return;
  const requestId = ++previewRequestId;
  clearLoadedSnapshot();
  previewing.value = true;
  try {
    const snapshot = await fetchCandidateSnapshot(candidate);
    if (applyCandidateSnapshot(candidate, requestId, snapshot))
      message.warning(successMessage);
  } catch (error) {
    if (requestId === previewRequestId) {
      previewError.value = formatOkkiError(error);
      message.error('最新资料重新载入失败，请稍后重试');
    }
  } finally {
    if (requestId === previewRequestId) previewing.value = false;
  }
}

async function selectCandidate(candidate: FdmWaimaoCustomerApi.OkkiCandidate) {
  if (importing.value) return;
  if (
    selected.value?.companyId === candidate.companyId &&
    preview.value &&
    !previewError.value
  )
    return;
  if (
    selected.value?.companyId !== candidate.companyId &&
    !(await confirmDiscardDraft())
  )
    return;
  const requestId = ++previewRequestId;
  selected.value = candidate;
  clearLoadedSnapshot();
  previewing.value = true;
  try {
    const snapshot = await fetchCandidateSnapshot(candidate);
    applyCandidateSnapshot(candidate, requestId, snapshot);
  } catch (error) {
    if (requestId === previewRequestId) {
      previewError.value = formatOkkiError(error);
    }
  } finally {
    if (requestId === previewRequestId) previewing.value = false;
  }
}

async function backToSearch() {
  if (importing.value) return;
  if (!(await confirmDiscardDraft())) return;
  resetSelection();
}

async function clearSearch() {
  if (importing.value) return;
  if (!(await confirmDiscardDraft())) return;
  searchRequestId += 1;
  form.keyword = '';
  form.pageNo = 1;
  candidates.value = [];
  total.value = 0;
  searchError.value = '';
  resetSelection();
}

async function openMappedCustomer() {
  if (!mappedCustomerId.value || !mappedVisible.value || importing.value)
    return;
  if (!(await confirmDiscardDraft())) return;
  emit('openExisting', mappedCustomerId.value);
  emit('update:open', false);
}

function discardAndOpenMappedCustomer() {
  if (!mappedCustomerId.value || !mappedVisible.value || importing.value)
    return;
  emit('openExisting', mappedCustomerId.value);
  emit('update:open', false);
}

async function confirmImport() {
  if (!preview.value || !draft.value || importing.value) return;
  if (!draftValid.value) {
    message.warning('请先修正草稿中的必填项或格式错误');
    return;
  }
  if (!canImport.value) return;
  const companyId = preview.value.companyId;
  const previewHash = preview.value.previewHash;
  importing.value = true;
  try {
    const result = await importOkkiCustomer({
      confirmPotentialDuplicate: duplicateConfirmed.value,
      okkiCompanyId: companyId,
      previewHash,
      profile: profilePayload(),
    });
    message.success(
      result.created ? '交易客户导入成功' : '该客户已导入，已打开现有记录',
    );
    emit('imported', result.customerId);
    emit('update:open', false);
  } catch (error) {
    const code = getBusinessErrorCode(error);
    if (
      isBusinessCode(code, OKKI_IMPORT_PREVIEW_STALE) &&
      selected.value?.companyId === companyId
    ) {
      message.warning(
        'OKKI 数据已变化，本次导入已停止，正在重新载入最新资料。',
      );
      await reloadSelectedSnapshot(
        '已重新载入最新 OKKI 资料；请重新核对并确认导入。',
      );
      return;
    }
    if (
      isBusinessCode(code, OKKI_IMPORT_CONFIRM_REQUIRED) &&
      selected.value?.companyId === companyId
    ) {
      message.error(formatOkkiError(error));
      serverConfirmationRequired.value = true;
      duplicateConfirmed.value = false;
      const requestId = ++previewRequestId;
      previewing.value = true;
      try {
        const result = await previewOkkiCustomer(companyId);
        if (
          requestId === previewRequestId &&
          selected.value?.companyId === companyId &&
          String(result.companyId) === String(companyId) &&
          isValidPreviewHash(result.previewHash)
        ) {
          preview.value = result;
          message.warning('本地客户数据已变化，请重新核对重复提醒');
        }
      } catch (previewRefreshError) {
        if (requestId === previewRequestId) {
          message.warning(
            `重复详情暂未刷新；仍可核对当前草稿后确认：${formatOkkiError(previewRefreshError)}`,
          );
        }
      } finally {
        if (requestId === previewRequestId) previewing.value = false;
      }
    } else {
      message.error(formatOkkiError(error));
    }
  } finally {
    importing.value = false;
  }
}

async function saveMappedCustomer() {
  const customerId = mappedCustomerId.value;
  if (!customerId || !draft.value || importing.value) return;
  if (!draftValid.value) {
    message.warning('请先修正草稿中的必填项或格式错误');
    return;
  }
  if (!canSaveMapped.value) return;
  const expectedProfileVersion = loadedProfileVersion.value;
  if (
    expectedProfileVersion === undefined ||
    !isValidProfileVersion(expectedProfileVersion)
  ) {
    message.warning('客户资料版本已失效，请重新载入后再保存');
    await reloadSelectedSnapshot('已重新载入最新 FDM 客户资料，请再次核对。');
    return;
  }
  importing.value = true;
  try {
    const payload = profilePayload();
    await updateCustomerProfile({
      expectedProfileVersion,
      id: customerId,
      profile: payload,
    });
    setDraft(
      {
        ...payload,
        contacts: payload.contacts.map((contact, index) => ({
          ...contact,
          draftKey:
            contact.id ||
            contact.externalContactKey ||
            `saved-${customerId}-${index}`,
          source:
            draft.value?.contacts[index]?.source ??
            (contact.id || contact.externalContactKey ? 'OKKI' : 'LOCAL'),
        })),
      },
      'LOCAL',
    );
    message.success('FDM 客户资料已保存');
    emit('saved', customerId);
    emit('update:open', false);
  } catch (error) {
    if (
      isBusinessCode(
        getBusinessErrorCode(error),
        CUSTOMER_PROFILE_VERSION_CONFLICT,
      )
    ) {
      message.warning(
        '资料已被他人或 OKKI 刷新更新，本次保存已停止，正在重新载入。',
      );
      await reloadSelectedSnapshot(
        '已重新载入最新 FDM 客户资料；请核对后再次保存。',
      );
    } else {
      message.error(formatOkkiError(error));
    }
  } finally {
    importing.value = false;
  }
}

function displayValue(value: unknown) {
  return cleanOkkiText(value) || 'OKKI 未提供';
}

function duplicateReason(reason: string) {
  return (
    {
      EMAIL: '邮箱相同',
      NAME: '名称相同',
      PHONE: '电话相同',
    }[reason] ?? reason
  );
}
</script>

<template>
  <Modal
    :closable="!importing"
    :keyboard="!importing"
    :mask-closable="!importing"
    :open="open"
    width="min(1240px, calc(100vw - 32px))"
    wrap-class-name="okki-import-modal"
    @cancel="close"
  >
    <template #title>
      <div class="okki-import-title">
        <span class="okki-import-title__icon" aria-hidden="true">
          <IconifyIcon icon="lucide:cloud-download" />
        </span>
        <div>
          <h2>从 OKKI 导入交易客户</h2>
          <p>用 OKKI 自动回填，再按实际业务需要编辑并保存到 FDM</p>
        </div>
      </div>
    </template>

    <div
      class="okki-import-workspace"
      :class="{ 'okki-import-workspace--selected': Boolean(selected) }"
    >
      <aside class="okki-search-pane" aria-label="搜索 OKKI 客户">
        <div class="okki-pane-heading">
          <div>
            <span>第 1 步</span>
            <h3>搜索 OKKI 客户</h3>
          </div>
          <Tooltip title="关键词仅用于本次实时查询，不会保存在同步日志中">
            <IconifyIcon
              class="okki-pane-heading__help"
              icon="lucide:circle-help"
              aria-label="搜索隐私说明"
            />
          </Tooltip>
        </div>

        <div class="okki-search-form">
          <Select
            v-model:value="form.searchField"
            aria-label="OKKI 搜索字段"
            :disabled="searching || importing"
            :options="SEARCH_FIELD_OPTIONS"
          />
          <Input
            v-model:value="form.keyword"
            allow-clear
            aria-label="OKKI 搜索关键词"
            :disabled="importing"
            placeholder="输入公司、编号、联系人或联系方式"
            @press-enter="runSearch(true)"
          />
          <Button :loading="searching" type="primary" @click="runSearch(true)">
            <template #icon><IconifyIcon icon="lucide:search" /></template>
            搜索
          </Button>
        </div>

        <div class="okki-search-summary" aria-live="polite">
          <span v-if="searching">正在查询 OKKI…</span>
          <span v-else-if="form.keyword && !searchError">
            找到 <strong>{{ total }}</strong> 个结果
          </span>
          <span v-else>支持名称、编号、联系人、邮箱或电话查询</span>
          <Button
            v-if="form.keyword && !searching"
            size="small"
            type="link"
            @click="clearSearch"
          >
            清空
          </Button>
        </div>

        <Alert v-if="searchError" :message="searchError" show-icon type="error">
          <template #action>
            <Button size="small" @click="runSearch(false)">重新搜索</Button>
          </template>
        </Alert>

        <div class="okki-candidate-area">
          <div
            v-if="searching && candidates.length === 0"
            class="okki-candidate-skeletons"
          >
            <div v-for="index in 4" :key="index">
              <Skeleton active :paragraph="{ rows: 2 }" :title="false" />
            </div>
          </div>

          <Spin v-else :spinning="searching">
            <div
              v-if="candidates.length"
              class="okki-candidate-list"
              role="listbox"
            >
              <OkkiCandidateCard
                v-for="candidate in candidates"
                :key="candidate.companyId"
                :candidate="candidate"
                :selected="selected?.companyId === candidate.companyId"
                @select="selectCandidate"
              />
            </div>

            <div v-else-if="!searchError" class="okki-search-empty">
              <span aria-hidden="true">
                <IconifyIcon
                  :icon="form.keyword ? 'lucide:search-x' : 'lucide:search'"
                />
              </span>
              <strong>
                {{ form.keyword ? '没有找到匹配客户' : '从一次精确搜索开始' }}
              </strong>
              <p v-if="form.keyword">
                可切换搜索字段，尝试联系人姓名、邮箱或 OKKI 编号。
              </p>
              <p v-else>输入关键词后，候选客户会显示在这里。</p>
            </div>
          </Spin>
        </div>

        <Pagination
          v-if="total > 0"
          :current="form.pageNo"
          :page-size="form.pageSize"
          :show-size-changer="false"
          :total="total"
          size="small"
          @change="changePage"
        />
      </aside>

      <main class="okki-preview-pane" aria-label="核对 OKKI 客户资料">
        <Button class="okki-mobile-back" type="link" @click="backToSearch">
          <template #icon><IconifyIcon icon="lucide:arrow-left" /></template>
          返回搜索结果
        </Button>

        <div v-if="previewing" class="okki-preview-loading">
          <Skeleton active avatar :paragraph="{ rows: 3 }" />
          <Skeleton active :paragraph="{ rows: 5 }" :title="false" />
          <Skeleton active :paragraph="{ rows: 4 }" :title="false" />
        </div>

        <div v-else-if="previewError" class="okki-preview-error">
          <span aria-hidden="true"><IconifyIcon icon="lucide:cloud-off" /></span>
          <h3>客户详情读取失败</h3>
          <p>{{ previewError }}</p>
          <Button
            v-if="selected"
            type="primary"
            @click="selectCandidate(selected)"
          >
            重新获取详情
          </Button>
        </div>

        <template v-else-if="preview">
          <div class="okki-preview-content">
            <header class="okki-company-hero">
              <span class="okki-company-hero__icon" aria-hidden="true">
                <IconifyIcon icon="lucide:building-2" />
              </span>
              <div class="okki-company-hero__identity">
                <span>第 2 步 · 核对资料</span>
                <h3>{{ previewName }}</h3>
                <p v-if="previewShortName">{{ previewShortName }}</p>
                <div class="okki-company-hero__tags">
                  <Tag color="blue">{{ stageLabel(preview.stageName) }}</Tag>
                  <Tag v-if="preview.publicCustomer" color="orange">
                    公海客户
                  </Tag>
                  <Tag v-if="alreadyMapped" color="success">已导入 FDM</Tag>
                </div>
              </div>
              <div class="okki-source-score">
                <div>
                  <span>OKKI 本次返回</span>
                  <strong>
                    {{ sourceCompleteness.filled }}/{{
                      sourceCompleteness.total
                    }}
                    项核心资料
                  </strong>
                </div>
                <Progress
                  :percent="sourceCompleteness.percent"
                  :show-info="false"
                  size="small"
                  status="active"
                />
                <small>缺失项可在下方草稿中手工补充</small>
              </div>
            </header>

            <Alert
              v-if="alreadyMapped"
              :message="
                mappedVisible
                  ? allowUpdateProfile
                    ? '已载入现有 FDM 客户资料，可直接修改并保存；OKKI 身份映射不会改变。'
                    : '该 OKKI 客户已经导入 FDM，你可以查看但没有资料修改权限。'
                  : '该 OKKI 客户已经导入，但你无权查看现有记录。'
              "
              show-icon
              type="warning"
            />

            <section
              class="okki-info-card okki-info-card--identity"
              aria-labelledby="okki-company-info"
            >
              <div class="okki-section-heading">
                <div>
                  <div class="okki-section-heading__title">
                    <h4 id="okki-company-info">OKKI 身份信息</h4>
                    <Tag>只读</Tag>
                  </div>
                  <p>用于保持远端映射和审计，不会被本地草稿修改</p>
                </div>
                <span>
                  更新时间 {{ formatOkkiDateTime(preview.remoteUpdateTime) }}
                </span>
              </div>

              <div class="okki-info-grid">
                <div class="okki-info-item">
                  <IconifyIcon icon="lucide:badge-check" aria-hidden="true" />
                  <span>OKKI 编号</span>
                  <strong>{{ displayValue(preview.serialId) }}</strong>
                </div>
                <div class="okki-info-item">
                  <IconifyIcon icon="lucide:fingerprint" aria-hidden="true" />
                  <span>OKKI 公司 ID</span>
                  <strong>{{ preview.companyId }}</strong>
                </div>
                <div class="okki-info-item">
                  <IconifyIcon icon="lucide:user-round" aria-hidden="true" />
                  <span>OKKI 负责人</span>
                  <strong>{{ ownerText || 'OKKI 未提供' }}</strong>
                </div>
                <div class="okki-info-item">
                  <IconifyIcon icon="lucide:workflow" aria-hidden="true" />
                  <span>OKKI 阶段</span>
                  <strong>{{ stageLabel(preview.stageName) }}</strong>
                </div>
                <div class="okki-info-item">
                  <IconifyIcon icon="lucide:history" aria-hidden="true" />
                  <span>最近跟进</span>
                  <strong>{{
                    formatOkkiDateTime(preview.recentFollowUpTime)
                  }}</strong>
                </div>
                <div class="okki-info-item">
                  <IconifyIcon icon="lucide:calendar-plus" aria-hidden="true" />
                  <span>远端创建</span>
                  <strong>{{
                    formatOkkiDateTime(preview.remoteCreateTime)
                  }}</strong>
                </div>
              </div>
            </section>

            <OkkiProfileEditor
              v-if="draft"
              v-model="draft"
              :disabled="!canEditDraft"
              :errors="draftErrors"
              :origin="draftOrigin"
            />

            <section
              class="okki-duplicate-card"
              :class="{
                'okki-duplicate-card--warning': confirmationRequired,
                'okki-duplicate-card--success': !confirmationRequired,
              }"
              aria-labelledby="okki-duplicate-heading"
            >
              <div class="okki-duplicate-card__title">
                <span aria-hidden="true">
                  <IconifyIcon
                    :icon="
                      duplicateCount > 0 || serverConfirmationRequired
                        ? 'lucide:triangle-alert'
                        : 'lucide:shield-check'
                    "
                  />
                </span>
                <div>
                  <h4 id="okki-duplicate-heading">导入检查</h4>
                  <p v-if="duplicateCount > 0">
                    发现 {{ duplicateCount }} 个本地疑似重复客户，请逐项核对。
                  </p>
                  <p v-else-if="serverConfirmationRequired">
                    编辑后的 FDM 草稿命中本地疑似重复，请确认后再次提交。
                  </p>
                  <p v-else>未发现本地疑似重复客户，可以继续导入。</p>
                </div>
              </div>

              <div v-if="confirmationRequired" class="okki-duplicate-list">
                <div
                  v-for="(match, index) in duplicateMatches"
                  :key="match.customerId || index"
                  class="okki-duplicate-item"
                >
                  <div>
                    <strong>
                      {{
                        match.visible
                          ? match.customerName || match.customerCode
                          : '无权查看的本地客户'
                      }}
                    </strong>
                    <span v-if="match.visible && match.customerCode">
                      {{ match.customerCode }}
                    </span>
                  </div>
                  <div>
                    <Tag
                      v-for="reason in match.matchReasons"
                      :key="reason"
                      color="orange"
                    >
                      {{ duplicateReason(reason) }}
                    </Tag>
                  </div>
                </div>

                <Checkbox
                  v-if="!alreadyMapped"
                  v-model:checked="duplicateConfirmed"
                  class="okki-duplicate-confirm"
                >
                  {{
                    duplicateCount > 0
                      ? '我已核对以上疑似重复，仍要导入为新客户'
                      : '我已确认编辑后的资料，仍要导入为新客户'
                  }}
                </Checkbox>
              </div>
            </section>
          </div>
        </template>

        <div v-else class="okki-preview-empty">
          <span class="okki-preview-empty__icon" aria-hidden="true">
            <IconifyIcon icon="lucide:file-search-2" />
          </span>
          <h3>选择客户后核对完整资料</h3>
          <p>搜索列表只展示安全摘要；选中后，FDM 才会实时读取 OKKI 详情。</p>
          <div class="okki-preview-steps">
            <div>
              <span><IconifyIcon icon="lucide:search" /></span>
              <strong>搜索</strong>
              <small>按公司或联系人定位</small>
            </div>
            <IconifyIcon icon="lucide:chevron-right" aria-hidden="true" />
            <div>
              <span><IconifyIcon icon="lucide:scan-search" /></span>
              <strong>核对</strong>
              <small>查看详情与重复提醒</small>
            </div>
            <IconifyIcon icon="lucide:chevron-right" aria-hidden="true" />
            <div>
              <span><IconifyIcon icon="lucide:import" /></span>
              <strong>导入</strong>
              <small>创建 FDM 交易客户</small>
            </div>
          </div>
          <div class="okki-security-note">
            <IconifyIcon icon="lucide:shield-check" aria-hidden="true" />
            OKKI 凭据仅保存在服务端，浏览器不会接触 Token 或密钥。
          </div>
        </div>
      </main>
    </div>

    <template #footer>
      <div class="okki-import-footer">
        <div class="okki-import-footer__selection">
          <span aria-hidden="true">
            <IconifyIcon
              :icon="selected ? 'lucide:building-2' : 'lucide:circle-dashed'"
            />
          </span>
          <div>
            <div class="okki-import-footer__title">
              <strong>{{
                selected ? `将处理：${selectedName}` : '尚未选择客户'
              }}</strong>
              <Tag v-if="draftDirty" color="orange">未保存</Tag>
            </div>
            <small>{{ footerHint }}</small>
          </div>
        </div>

        <div class="okki-import-footer__actions">
          <Button :disabled="importing" @click="close">取消</Button>
          <Button
            v-if="
              alreadyMapped && mappedVisible && allowUpdateProfile && draftDirty
            "
            :disabled="importing"
            @click="discardAndOpenMappedCustomer"
          >
            不保存，直接打开
          </Button>
          <Button
            v-if="
              alreadyMapped && mappedVisible && allowUpdateProfile && draftDirty
            "
            :disabled="!canSaveMapped"
            :loading="importing"
            type="primary"
            @click="saveMappedCustomer"
          >
            <template #icon><IconifyIcon icon="lucide:save" /></template>
            保存修改并打开
          </Button>
          <Button
            v-else-if="alreadyMapped && mappedVisible"
            type="primary"
            @click="openMappedCustomer"
          >
            <template #icon>
              <IconifyIcon icon="lucide:external-link" />
            </template>
            打开现有客户
          </Button>
          <Button v-else-if="alreadyMapped" disabled type="primary">
            客户已导入
          </Button>
          <Button
            v-else-if="allowImport"
            :disabled="!canImport"
            :loading="importing"
            type="primary"
            @click="confirmImport"
          >
            <template #icon><IconifyIcon icon="lucide:import" /></template>
            保存草稿并导入
          </Button>
        </div>
      </div>
    </template>
  </Modal>
</template>

<style scoped>
:global(.okki-import-modal .ant-modal) {
  top: 24px;
  max-width: calc(100vw - 32px);
  padding-bottom: 0;
}

:global(.okki-import-modal .ant-modal-content) {
  padding: 0;
  overflow: hidden;
}

:global(.okki-import-modal .ant-modal-header) {
  padding: 18px 24px 14px;
  margin: 0;
  border-bottom: 1px solid var(--ant-color-border-secondary);
}

:global(.okki-import-modal .ant-modal-body) {
  padding: 0;
}

:global(.okki-import-modal .ant-modal-footer) {
  padding: 12px 20px;
  margin: 0;
  border-top: 1px solid var(--ant-color-border-secondary);
}

.okki-import-title {
  display: flex;
  gap: 11px;
  align-items: center;
  padding-right: 30px;
}

.okki-import-title__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 38px;
  height: 38px;
  font-size: 19px;
  color: var(--ant-color-primary);
  background: var(--ant-color-primary-bg);
  border-radius: 10px;
}

.okki-import-title h2,
.okki-import-title p {
  margin: 0;
}

.okki-import-title h2 {
  font-size: 16px;
  font-weight: 650;
  line-height: 24px;
}

.okki-import-title p {
  margin-top: 1px;
  font-size: 12px;
  font-weight: 400;
  color: var(--ant-color-text-secondary);
}

.okki-import-workspace {
  display: grid;
  grid-template-columns: 420px minmax(0, 1fr);
  height: clamp(460px, calc(100vh - 190px), 640px);
  min-height: 0;
  background: var(--ant-color-bg-layout);
}

.okki-search-pane,
.okki-preview-pane {
  min-width: 0;
  min-height: 0;
}

.okki-search-pane {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
  background: var(--ant-color-bg-container);
  border-right: 1px solid var(--ant-color-border-secondary);
}

.okki-pane-heading,
.okki-section-heading {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
}

.okki-pane-heading span,
.okki-company-hero__identity > span {
  font-size: 11px;
  font-weight: 650;
  color: var(--ant-color-primary);
  letter-spacing: 0.06em;
}

.okki-pane-heading h3,
.okki-pane-heading p,
.okki-section-heading h4,
.okki-section-heading p,
.okki-company-hero h3,
.okki-company-hero p,
.okki-duplicate-card h4,
.okki-duplicate-card p,
.okki-preview-empty h3,
.okki-preview-empty p,
.okki-preview-error h3,
.okki-preview-error p,
.okki-company-remark p {
  margin: 0;
}

.okki-pane-heading h3 {
  margin-top: 2px;
  font-size: 15px;
  line-height: 22px;
}

.okki-pane-heading__help {
  margin-top: 4px;
  font-size: 17px;
  color: var(--ant-color-text-tertiary);
  cursor: help;
}

.okki-search-form {
  display: grid;
  grid-template-columns: 148px minmax(0, 1fr) auto;
  gap: 8px;
}

.okki-search-summary {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
  min-height: 24px;
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

.okki-search-summary strong {
  color: var(--ant-color-text);
}

.okki-candidate-area {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.okki-candidate-area > :deep(.ant-spin-nested-loading),
.okki-candidate-area > :deep(.ant-spin-nested-loading > .ant-spin-container) {
  height: 100%;
}

.okki-candidate-list,
.okki-candidate-skeletons {
  display: grid;
  gap: 9px;
  align-content: start;
  height: 100%;
  padding: 2px;
  overflow: auto;
  scrollbar-width: thin;
}

.okki-candidate-skeletons > div {
  padding: 14px;
  background: var(--ant-color-bg-container);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 10px;
}

.okki-search-empty {
  display: grid;
  place-items: center;
  align-content: center;
  height: 100%;
  padding: 28px;
  text-align: center;
}

.okki-search-empty > span {
  display: grid;
  place-items: center;
  width: 46px;
  height: 46px;
  margin-bottom: 12px;
  font-size: 22px;
  color: var(--ant-color-primary);
  background: var(--ant-color-primary-bg);
  border-radius: 12px;
}

.okki-search-empty strong {
  font-size: 14px;
}

.okki-search-empty p {
  max-width: 270px;
  margin: 5px 0 0;
  font-size: 12px;
  line-height: 20px;
  color: var(--ant-color-text-secondary);
}

.okki-search-pane > :deep(.ant-pagination) {
  align-self: center;
  margin-top: auto;
}

.okki-preview-pane {
  position: relative;
  overflow: auto;
  scrollbar-width: thin;
}

.okki-preview-content {
  display: grid;
  gap: 14px;
  padding: 20px;
}

.okki-company-hero {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) 210px;
  gap: 14px;
  align-items: center;
  padding: 16px;
  background: linear-gradient(
    115deg,
    var(--ant-color-primary-bg) 0%,
    var(--ant-color-bg-container) 58%
  );
  border: 1px solid var(--ant-color-primary-border);
  border-radius: 12px;
}

.okki-company-hero__icon {
  display: grid;
  place-items: center;
  width: 52px;
  height: 52px;
  font-size: 24px;
  color: var(--ant-color-primary);
  background: var(--ant-color-bg-container);
  border: 1px solid var(--ant-color-primary-border);
  border-radius: 13px;
  box-shadow: 0 5px 16px rgb(22 119 255 / 10%);
}

.okki-company-hero__identity {
  min-width: 0;
}

.okki-company-hero h3 {
  margin-top: 3px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 19px;
  line-height: 27px;
  white-space: nowrap;
}

.okki-company-hero p {
  margin-top: 1px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: var(--ant-color-text-secondary);
  white-space: nowrap;
}

.okki-company-hero__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}

.okki-company-hero__tags :deep(.ant-tag) {
  margin-inline-end: 0;
}

.okki-source-score {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding-left: 15px;
  border-left: 1px solid var(--ant-color-border-secondary);
}

.okki-source-score > div {
  display: grid;
  gap: 1px;
}

.okki-source-score span,
.okki-source-score small {
  font-size: 11px;
  color: var(--ant-color-text-tertiary);
}

.okki-source-score strong {
  font-size: 13px;
}

.okki-info-card,
.okki-duplicate-card {
  padding: 16px;
  background: var(--ant-color-bg-container);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 12px;
}

.okki-section-heading h4 {
  font-size: 14px;
  line-height: 22px;
}

.okki-section-heading__title {
  display: flex;
  gap: 7px;
  align-items: center;
}

.okki-section-heading__title :deep(.ant-tag) {
  margin: 0;
  font-size: 11px;
}

.okki-section-heading p,
.okki-section-heading > span {
  margin-top: 2px;
  font-size: 11px;
  color: var(--ant-color-text-tertiary);
}

.okki-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 24px;
  margin-top: 12px;
}

.okki-info-card--identity {
  background: var(--ant-color-fill-quaternary);
}

.okki-info-item {
  display: grid;
  grid-template-columns: 18px 88px minmax(0, 1fr);
  gap: 7px;
  align-items: center;
  min-width: 0;
  padding: 9px 0;
  border-top: 1px solid var(--ant-color-border-secondary);
}

.okki-info-item > svg {
  color: var(--ant-color-text-tertiary);
}

.okki-info-item span {
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

.okki-info-item strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  font-weight: 550;
  white-space: nowrap;
}

.okki-source-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 18px;
  padding-top: 10px;
  margin-top: 3px;
  font-size: 11px;
  color: var(--ant-color-text-quaternary);
  border-top: 1px dashed var(--ant-color-border-secondary);
}

.okki-company-remark {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  padding: 11px 12px;
  margin-top: 12px;
  font-size: 12px;
  background: var(--ant-color-fill-quaternary);
  border-radius: 9px;
}

.okki-company-remark > svg {
  flex: none;
  margin-top: 2px;
  color: var(--ant-color-text-tertiary);
}

.okki-company-remark span {
  color: var(--ant-color-text-secondary);
}

.okki-company-remark p {
  margin-top: 3px;
  line-height: 20px;
  white-space: pre-wrap;
}

.okki-duplicate-card--success {
  background: var(--ant-color-success-bg);
  border-color: var(--ant-color-success-border);
}

.okki-duplicate-card--warning {
  background: var(--ant-color-warning-bg);
  border-color: var(--ant-color-warning-border);
}

.okki-duplicate-card__title {
  display: flex;
  gap: 10px;
  align-items: center;
}

.okki-duplicate-card__title > span {
  display: grid;
  flex: none;
  place-items: center;
  width: 34px;
  height: 34px;
  font-size: 17px;
  color: var(--ant-color-success);
  background: var(--ant-color-bg-container);
  border-radius: 9px;
}

.okki-duplicate-card--warning .okki-duplicate-card__title > span {
  color: var(--ant-color-warning);
}

.okki-duplicate-card h4 {
  font-size: 13px;
}

.okki-duplicate-card p {
  margin-top: 2px;
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

.okki-duplicate-list {
  display: grid;
  gap: 8px;
  padding-top: 12px;
  margin-top: 12px;
  border-top: 1px solid var(--ant-color-warning-border);
}

.okki-duplicate-item {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 9px 10px;
  background: var(--ant-color-bg-container);
  border-radius: 8px;
}

.okki-duplicate-item > div:first-child {
  display: grid;
  min-width: 0;
}

.okki-duplicate-item strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  white-space: nowrap;
}

.okki-duplicate-item span {
  font-size: 11px;
  color: var(--ant-color-text-secondary);
}

.okki-duplicate-item :deep(.ant-tag) {
  margin-inline: 4px 0;
  font-size: 11px;
}

.okki-duplicate-confirm {
  font-size: 12px;
}

.okki-preview-loading {
  display: grid;
  gap: 26px;
  padding: 30px;
}

.okki-preview-error,
.okki-preview-empty {
  display: grid;
  place-items: center;
  align-content: center;
  height: 100%;
  padding: 40px;
  text-align: center;
}

.okki-preview-error > span,
.okki-preview-empty__icon {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  margin-bottom: 14px;
  font-size: 26px;
  color: var(--ant-color-primary);
  background: var(--ant-color-primary-bg);
  border-radius: 15px;
}

.okki-preview-error > span {
  color: var(--ant-color-error);
  background: var(--ant-color-error-bg);
}

.okki-preview-error h3,
.okki-preview-empty h3 {
  font-size: 16px;
}

.okki-preview-error p,
.okki-preview-empty > p {
  max-width: 520px;
  margin-top: 7px;
  font-size: 12px;
  line-height: 20px;
  color: var(--ant-color-text-secondary);
}

.okki-preview-error button {
  margin-top: 16px;
}

.okki-preview-steps {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) 20px minmax(120px, 1fr) 20px minmax(
      120px,
      1fr
    );
  gap: 10px;
  align-items: center;
  width: min(100%, 560px);
  margin-top: 26px;
}

.okki-preview-steps > div {
  display: grid;
  gap: 4px;
  place-items: center;
}

.okki-preview-steps > div > span {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  margin-bottom: 3px;
  font-size: 17px;
  color: var(--ant-color-primary);
  background: var(--ant-color-bg-container);
  border: 1px solid var(--ant-color-primary-border);
  border-radius: 10px;
}

.okki-preview-steps strong {
  font-size: 12px;
}

.okki-preview-steps small {
  font-size: 11px;
  color: var(--ant-color-text-tertiary);
}

.okki-preview-steps > svg {
  color: var(--ant-color-text-quaternary);
}

.okki-security-note {
  display: flex;
  gap: 7px;
  align-items: center;
  padding: 9px 12px;
  margin-top: 28px;
  font-size: 11px;
  color: var(--ant-color-text-secondary);
  background: var(--ant-color-bg-container);
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 8px;
}

.okki-security-note > svg {
  color: var(--ant-color-success);
}

.okki-mobile-back {
  display: none;
}

.okki-import-footer {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  min-height: 36px;
}

.okki-import-footer__selection {
  display: flex;
  gap: 9px;
  align-items: center;
  min-width: 0;
  text-align: left;
}

.okki-import-footer__selection > span {
  display: grid;
  flex: none;
  place-items: center;
  width: 32px;
  height: 32px;
  color: var(--ant-color-primary);
  background: var(--ant-color-primary-bg);
  border-radius: 8px;
}

.okki-import-footer__selection > div {
  display: grid;
  min-width: 0;
}

.okki-import-footer__title {
  display: flex;
  gap: 7px;
  align-items: center;
  min-width: 0;
}

.okki-import-footer__title :deep(.ant-tag) {
  flex: none;
  margin: 0;
  font-size: 10px;
  line-height: 17px;
}

.okki-import-footer__selection strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  white-space: nowrap;
}

.okki-import-footer__selection small {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--ant-color-text-tertiary);
  white-space: nowrap;
}

.okki-import-footer__actions {
  display: flex;
  flex: none;
  gap: 8px;
}

@media (max-width: 1080px) {
  .okki-import-workspace {
    grid-template-columns: 350px minmax(0, 1fr);
  }

  .okki-search-form {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .okki-search-form > :deep(.ant-select) {
    grid-column: 1 / -1;
  }

  .okki-company-hero {
    grid-template-columns: 46px minmax(0, 1fr);
  }

  .okki-company-hero__icon {
    width: 46px;
    height: 46px;
  }

  .okki-source-score {
    grid-column: 1 / -1;
    padding: 10px 0 0;
    border-top: 1px solid var(--ant-color-border-secondary);
    border-left: 0;
  }
}

@media (max-width: 900px) {
  :global(.okki-import-modal .ant-modal) {
    top: 0;
    width: 100vw !important;
    max-width: 100vw;
    height: 100dvh;
    margin: 0;
  }

  :global(.okki-import-modal .ant-modal-content) {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    border-radius: 0;
  }

  :global(.okki-import-modal .ant-modal-body) {
    flex: 1;
    min-height: 0;
  }

  .okki-import-workspace {
    grid-template-columns: minmax(0, 1fr);
    height: 100%;
  }

  .okki-search-pane {
    border-right: 0;
  }

  .okki-preview-pane {
    display: none;
  }

  .okki-import-workspace--selected .okki-search-pane {
    display: none;
  }

  .okki-import-workspace--selected .okki-preview-pane {
    display: block;
  }

  .okki-mobile-back {
    position: sticky;
    top: 0;
    z-index: 2;
    display: inline-flex;
    margin: 8px 10px 0;
    background: var(--ant-color-bg-layout);
  }

  .okki-preview-content {
    padding-top: 10px;
  }

  .okki-import-footer__selection {
    display: none;
  }

  .okki-import-footer {
    justify-content: flex-end;
  }
}

@media (max-width: 640px) {
  :global(.okki-import-modal .ant-modal-header) {
    padding: 13px 16px 11px;
  }

  :global(.okki-import-modal .ant-modal-footer) {
    padding: 10px 12px;
  }

  .okki-import-title p {
    display: none;
  }

  .okki-search-pane,
  .okki-preview-content {
    padding: 14px;
  }

  .okki-search-form {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .okki-company-hero {
    padding: 14px;
  }

  .okki-info-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .okki-preview-steps {
    grid-template-columns: minmax(0, 1fr);
  }

  .okki-preview-steps > svg {
    display: none;
  }

  .okki-duplicate-item {
    flex-direction: column;
    align-items: flex-start;
  }

  .okki-import-footer__actions {
    width: 100%;
  }

  .okki-import-footer__actions > :deep(.ant-btn:last-child) {
    flex: 1;
  }
}
</style>
