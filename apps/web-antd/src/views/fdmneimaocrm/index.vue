<script lang="ts" setup>
import { getFdmNeimaoCrmModuleStatus } from '#/api/fdmneimaocrm';
import ModuleFoundationWorkbench from '#/components/fdm-crm/module-foundation-workbench.vue';

defineOptions({ name: 'FdmNeimaoCrmWorkbench' });

const roadmap = [
  {
    capability: 'customer',
    description: '内贸客户资料；字段、状态和权限等待内贸需求冻结。',
    title: '客户',
  },
  {
    capability: 'contact',
    description: '内贸联系人；不复制外贸客户准入或分类规则。',
    title: '联系人',
  },
  {
    capability: 'order',
    description: '内贸销售订单、固定 DOMESTIC 选品与历史快照。',
    title: '销售订单',
  },
  {
    capability: 'follow-up',
    description: '内贸跟进记录；具体类型和权限等待业务确认。',
    title: '跟进',
  },
  {
    capability: 'document-relation',
    description: '与其他权威模块的单据关联，不直接读取其内部表。',
    title: '单据关系',
  },
  {
    capability: 'permission-audit',
    description: '对象权限、附件访问和操作审计，状态与外贸完全隔离。',
    title: '权限与审计',
  },
] as const;
</script>

<template>
  <ModuleFoundationWorkbench
    description="内贸 CRM 独立壳层。M8 模型冻结前只展示服务端状态和候选入口，不引入外贸专属字段、流程或枚举。"
    expected-market-type="DOMESTIC"
    expected-module-key="fdmneimaocrm"
    :load-status="getFdmNeimaoCrmModuleStatus"
    :roadmap="roadmap"
    title="内贸 CRM 工作台"
  />
</template>
