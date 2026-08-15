<script lang="ts" setup>
import { getFdmWaimaoCrmModuleStatus } from '#/api/fdmwaimaocrm';
import ModuleFoundationWorkbench from '#/components/fdm-crm/module-foundation-workbench.vue';

defineOptions({ name: 'FdmWaimaoCrmWorkbench' });

const roadmap = [
  {
    capability: 'customer-application-draft',
    description:
      '本人客户申请草稿的创建、查询、编辑与删除；暂不开放提交或审批。',
    title: '客户申请草稿',
  },
  {
    capability: 'customer',
    description: '正式客户、负责人、联系人聚合与客户分类历史。',
    title: '正式客户',
  },
  {
    capability: 'contact',
    description: '客户联系人维护、主联系人设置与访问权限。',
    title: '联系人',
  },
  {
    capability: 'order',
    description: '合同订单、固定 EXPORT 选品、金额预览与最终快照。',
    title: '合同订单',
  },
  {
    capability: 'receipt',
    description: '原币回款、汇率快照、核销、冲销与审计。',
    title: '回款记录',
  },
  {
    capability: 'shipment',
    description: '分批发货、本次/累计/未发数量与权威状态同步。',
    title: '发货单',
  },
  {
    capability: 'classification',
    description: '分类结果、触发订单、原因与规则版本的只读历史。',
    title: '客户分类历史',
  },
  {
    capability: 'collaboration',
    description: '跟进、附件、对象权限、审批历史和操作日志。',
    title: '协作与审计',
  },
] as const;
</script>

<template>
  <ModuleFoundationWorkbench
    description="外贸 CRM 独立壳层。当前只读取服务端模块状态，不复用官方 CRM 运行时代码，也不会提前开放未完成业务。"
    expected-market-type="EXPORT"
    expected-module-key="fdmwaimaocrm"
    :load-status="getFdmWaimaoCrmModuleStatus"
    :roadmap="roadmap"
    title="外贸 CRM 工作台"
  />
</template>
