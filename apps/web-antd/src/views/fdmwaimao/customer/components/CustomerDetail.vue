<script lang="ts" setup>
import type { FdmWaimaoCustomerApi } from '#/api/fdmwaimao/customer';
import type {
  TradeRelationLink,
  TradeSummaryMetric,
} from '#/views/fdm-trade-shared/components';

import { computed } from 'vue';

import { useAccess } from '@vben/access';

import {
  Alert,
  Descriptions,
  DescriptionsItem,
  Empty,
  List,
  ListItem,
  Space,
  Table,
  Tag,
  TypographyText,
} from 'ant-design-vue';

import {
  TradeDetailLayout,
  TradeDetailSection,
  TradeRelatedDocuments,
  TradeSummaryPanel,
} from '#/views/fdm-trade-shared/components';
import {
  fdmTradeContractListRoute,
  fdmTradeReceiptListRoute,
  fdmTradeShipmentListRoute,
} from '#/views/fdm-trade-shared/document-links';

import { formatOkkiDateTime } from './okki-import/display';

defineOptions({ name: 'FdmWaimaoCustomerDetailContent' });

const props = defineProps<{
  customer?: FdmWaimaoCustomerApi.CustomerDetail | null;
}>();
const { hasAccessByCodes } = useAccess();

const contactColumns = [
  { dataIndex: 'name', key: 'name', title: '姓名', width: 130 },
  { dataIndex: 'position', key: 'position', title: '职位', width: 130 },
  { dataIndex: 'email', key: 'email', title: '邮箱', width: 220 },
  { dataIndex: 'phone', key: 'phone', title: '电话', width: 160 },
  { dataIndex: 'social', key: 'social', title: '社交账号', width: 240 },
  {
    dataIndex: 'primaryFlag',
    key: 'primaryFlag',
    title: '主联系人',
    width: 95,
  },
];

const ownerNames = computed(() =>
  (props.customer?.okkiOwnerSnapshot ?? [])
    .map((owner) => owner.name)
    .filter(Boolean)
    .join('、'),
);

const summaryMetrics = computed<TradeSummaryMetric[]>(() => {
  const customer = props.customer;
  if (!customer) return [];
  return [
    { key: 'level', label: '客户等级', value: `${customer.level} 级` },
    {
      key: 'country',
      label: '国家 / 地区',
      value: display(customer.countryName || customer.countryRegionRaw),
    },
    {
      key: 'contacts',
      label: '联系人',
      value: `${customer.contacts.length} 位`,
    },
    {
      key: 'sync',
      label: 'OKKI 同步',
      tone: customer.syncStatus === 'SYNCED' ? 'success' : 'warning',
      value: customer.syncStatus === 'SYNCED' ? '同步成功' : '同步失败',
    },
  ];
});

const relationDocuments = computed<TradeRelationLink[]>(() => {
  const customer = props.customer;
  if (!customer) return [];
  const canQueryContract = hasAccessByCodes(['fdmwaimao:contract-order:query']);
  const canQueryReceipt = hasAccessByCodes(['fdmwaimao:receipt-record:query']);
  const canQueryConsumption = hasAccessByCodes([
    'fdmwaimao:consumption-record:query',
  ]);
  const canQueryShipment = hasAccessByCodes(['fdmwaimao:shipment:query']);
  return [
    {
      disabled: !canQueryContract,
      icon: 'lucide:file-signature',
      key: 'contracts',
      label: '查看客户合同',
      meta: '按当前客户筛选合同订单',
      to: canQueryContract ? fdmTradeContractListRoute(customer.id) : undefined,
      type: '合同订单',
    },
    {
      disabled: !canQueryReceipt,
      icon: 'lucide:landmark',
      key: 'receipts',
      label: '查看回款记录',
      meta: '按当前客户筛选现金回款',
      to: canQueryReceipt
        ? fdmTradeReceiptListRoute({
            customerId: customer.id,
            type: 'receipt',
          })
        : undefined,
      type: '回款记录',
    },
    {
      disabled: !canQueryConsumption,
      icon: 'lucide:badge-minus',
      key: 'consumptions',
      label: '查看消费 / 冲销',
      meta: '按当前客户筛选非现金冲销',
      to: canQueryConsumption
        ? fdmTradeReceiptListRoute({
            customerId: customer.id,
            type: 'consumption',
          })
        : undefined,
      type: '消费记录',
    },
    {
      disabled: !canQueryShipment,
      icon: 'lucide:package-check',
      key: 'shipments',
      label: '查看发货单',
      meta: '按当前客户筛选发货管理',
      to: canQueryShipment
        ? fdmTradeShipmentListRoute({
            customerId: customer.id,
            customerName: customer.name,
          })
        : undefined,
      type: '发货管理',
    },
  ];
});

function display(value: null | string | undefined) {
  return value || '—';
}

function formatDateTime(value: unknown) {
  return formatOkkiDateTime(value, '—');
}

function socialText(record: Record<string, any>) {
  return [
    record.whatsapp ? `WhatsApp ${record.whatsapp}` : '',
    record.wechat ? `微信 ${record.wechat}` : '',
    record.linkedin ? `LinkedIn ${record.linkedin}` : '',
  ]
    .filter(Boolean)
    .join('；');
}
</script>

<template>
  <div v-if="customer" class="customer-detail">
    <Alert
      v-if="customer.syncStatus === 'FAILED'"
      class="customer-detail__alert"
      :message="
        customer.syncError ||
        '最近一次 OKKI 刷新失败，当前展示上一次成功同步的数据。'
      "
      show-icon
      type="warning"
    />

    <section class="customer-detail__hero">
      <div class="customer-detail__identity">
        <div>
          <Tag color="blue">交易客户</Tag>
          <Tag :color="customer.syncStatus === 'SYNCED' ? 'success' : 'error'">
            {{ customer.syncStatus === 'SYNCED' ? '已同步' : '同步异常' }}
          </Tag>
          <span>{{ customer.customerCode }}</span>
        </div>
        <h2>{{ customer.name }}</h2>
        <p>
          {{ display(customer.shortName) }} ·
          {{ display(customer.countryName || customer.countryRegionRaw) }}
        </p>
      </div>
    </section>

    <TradeDetailLayout>
      <TradeDetailSection icon="lucide:building-2" title="客户基础资料">
        <Descriptions :column="{ lg: 2, md: 2, sm: 1, xs: 1 }" size="small">
          <DescriptionsItem label="客户编号">
            {{ customer.customerCode }}
          </DescriptionsItem>
          <DescriptionsItem label="客户名称">
            {{ customer.name }}
          </DescriptionsItem>
          <DescriptionsItem label="客户简称">
            {{ display(customer.shortName) }}
          </DescriptionsItem>
          <DescriptionsItem label="国家/地区">
            {{ display(customer.countryName || customer.countryRegionRaw) }}
          </DescriptionsItem>
          <DescriptionsItem label="客户等级">
            <Tag color="blue">{{ customer.level }}</Tag>
          </DescriptionsItem>
          <DescriptionsItem label="FDM 负责人">
            {{ display(customer.ownerUserName) }}
            <TypographyText v-if="customer.ownerDeptName" type="secondary">
              · {{ customer.ownerDeptName }}
            </TypographyText>
          </DescriptionsItem>
          <DescriptionsItem label="公司电话">
            <a
              v-if="customer.companyPhone"
              class="customer-detail__action-link"
              :href="`tel:${customer.companyTelAreaCode || ''}${customer.companyPhone}`"
            >
              {{
                [customer.companyTelAreaCode, customer.companyPhone]
                  .filter(Boolean)
                  .join(' ')
              }}
            </a>
            <span v-else>—</span>
          </DescriptionsItem>
          <DescriptionsItem label="公司网站">
            <a
              v-if="customer.homepage"
              class="customer-detail__action-link"
              :href="customer.homepage"
              rel="noopener noreferrer"
              target="_blank"
            >
              {{ customer.homepage }}
            </a>
            <span v-else>—</span>
          </DescriptionsItem>
          <DescriptionsItem label="公司地址" :span="2">
            {{ display(customer.address) }}
          </DescriptionsItem>
          <DescriptionsItem label="备注" :span="2">
            {{ display(customer.remark) }}
          </DescriptionsItem>
        </Descriptions>
      </TradeDetailSection>

      <TradeDetailSection icon="lucide:contact-round" title="联系人">
        <Table
          :columns="contactColumns"
          :data-source="customer.contacts"
          :pagination="false"
          row-key="id"
          size="small"
          :scroll="{ x: 980 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'name'">
              {{ display(record.name) }}
            </template>
            <template v-else-if="column.key === 'position'">
              {{ display(record.position) }}
            </template>
            <template v-else-if="column.key === 'email'">
              <a
                v-if="record.email"
                class="customer-detail__action-link"
                :href="`mailto:${record.email}`"
              >
                {{ record.email }}
              </a>
              <span v-else>—</span>
            </template>
            <template v-else-if="column.key === 'phone'">
              <a
                v-if="record.phone"
                class="customer-detail__action-link"
                :href="`tel:${record.telAreaCode || ''}${record.phone}`"
              >
                {{
                  [record.telAreaCode, record.phone].filter(Boolean).join(' ')
                }}
              </a>
              <span v-else>—</span>
            </template>
            <template v-else-if="column.key === 'social'">
              {{ display(socialText(record)) }}
            </template>
            <template v-else-if="column.key === 'primaryFlag'">
              <Tag v-if="record.primaryFlag" color="blue">主联系人</Tag>
              <span v-else>—</span>
            </template>
          </template>
          <template #emptyText>
            <Empty description="OKKI 暂未返回联系人" />
          </template>
        </Table>
      </TradeDetailSection>

      <TradeDetailSection icon="lucide:refresh-cw" title="最近同步记录">
        <List
          v-if="customer.syncLogs.length"
          :data-source="customer.syncLogs"
          size="small"
        >
          <template #renderItem="{ item }">
            <ListItem>
              <ListItem.Meta>
                <template #title>
                  <Space>
                    <Tag
                      :color="item.result === 'SUCCESS' ? 'success' : 'error'"
                    >
                      {{ item.result === 'SUCCESS' ? '成功' : '失败' }}
                    </Tag>
                    <span>
                      {{
                        item.operation === 'IMPORT'
                          ? '从 OKKI 导入'
                          : '手工刷新'
                      }}
                    </span>
                    <TypographyText type="secondary">
                      {{ formatDateTime(item.createTime) }}
                    </TypographyText>
                  </Space>
                </template>
                <template #description>
                  <span v-if="item.errorMessage">{{ item.errorMessage }}</span>
                  <span v-else>同步完成</span>
                  <TypographyText v-if="item.traceId" type="secondary">
                    · Trace {{ item.traceId }}
                  </TypographyText>
                </template>
              </ListItem.Meta>
            </ListItem>
          </template>
        </List>
        <Empty v-else description="暂无同步记录" />
      </TradeDetailSection>

      <template #aside>
        <TradeSummaryPanel :metrics="summaryMetrics" />
        <TradeRelatedDocuments :items="relationDocuments" />
        <TradeDetailSection icon="lucide:cloud" title="OKKI 映射与同步">
          <Descriptions :column="1" size="small">
            <DescriptionsItem label="OKKI 公司 ID">
              {{ customer.okkiCompanyId }}
            </DescriptionsItem>
            <DescriptionsItem label="OKKI 客户编号">
              {{ display(customer.okkiSerialId) }}
            </DescriptionsItem>
            <DescriptionsItem label="OKKI 阶段">
              {{ display(customer.okkiStageName) }}
            </DescriptionsItem>
            <DescriptionsItem label="OKKI 负责人">
              {{ ownerNames || display(customer.okkiOwnerNames?.join('、')) }}
            </DescriptionsItem>
            <DescriptionsItem label="远端更新时间">
              {{ formatDateTime(customer.remoteUpdateTime) }}
            </DescriptionsItem>
            <DescriptionsItem label="最后成功同步">
              <Space :size="6">
                <Tag
                  :color="
                    customer.syncStatus === 'SYNCED' ? 'success' : 'error'
                  "
                >
                  {{
                    customer.syncStatus === 'SYNCED' ? '同步成功' : '同步失败'
                  }}
                </Tag>
                <span>{{ formatDateTime(customer.lastSyncTime) }}</span>
              </Space>
            </DescriptionsItem>
          </Descriptions>
        </TradeDetailSection>
      </template>
    </TradeDetailLayout>
  </div>
  <Empty v-else description="未选择客户" />
</template>

<style scoped>
.customer-detail {
  display: grid;
  gap: 12px;
}

.customer-detail__hero {
  padding: 15px 18px;
  background: #fff;
  border: 1px solid #e5eaf1;
  border-radius: 5px;
}

.customer-detail__identity > div {
  display: flex;
  gap: 7px;
  align-items: center;
  font-size: 12px;
  color: #64748b;
}

.customer-detail__identity h2 {
  margin: 8px 0 4px;
  font-size: 20px;
  color: #172033;
}

.customer-detail__identity p {
  margin: 0;
  color: #64748b;
}

.customer-detail__action-link {
  color: var(--ant-color-primary, #1677ff);
}

.customer-detail__action-link:hover {
  text-decoration: underline;
  text-underline-offset: 2px;
}

.customer-detail__alert {
  margin-bottom: 0;
}
</style>
