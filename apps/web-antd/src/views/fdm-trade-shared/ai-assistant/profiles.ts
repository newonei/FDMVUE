import type {
  TradeAiIntent,
  TradeAiPageKey,
  TradeAiPageProfile,
  TradeAiQuestion,
} from './types';

function question(
  id: string,
  label: string,
  intent: TradeAiIntent,
  prompt = label,
): TradeAiQuestion {
  return { id, intent, label, prompt };
}

export const TRADE_AI_PAGE_PROFILES: Record<
  TradeAiPageKey,
  TradeAiPageProfile
> = {
  workbench: {
    department: '跨部门经营视角',
    greeting: '我会按合同订单的四条并行业务链，解释当前风险、证据和建议顺序。',
    pageKey: 'workbench',
    questions: [
      question('workbench-priority', '今天最该优先处理什么？', 'NEXT_ACTIONS'),
      question('workbench-risk', '当前最高风险是什么？', 'RISK'),
      question('workbench-blocked', '哪些单据正在阻塞订单？', 'TRACE'),
      question('workbench-receivable', '还有多少未回款？', 'EXPLAIN'),
      question('workbench-order', '主演示订单现在卡在哪里？', 'OVERVIEW'),
    ],
    role: '经营负责人',
    scope:
      '可查看外贸、采购、供应链和财务的原型数据，只给建议，不代替责任人确认。',
    title: '外贸工作台',
  },
  customer: {
    department: '外贸部门',
    greeting: '我可以结合交易、回款和 OKKI 映射，分析客户经营风险。',
    pageKey: 'customer',
    questions: [
      question('customer-outstanding', '哪个客户未回款最高？', 'RISK'),
      question('customer-import', '哪些 OKKI 客户适合导入？', 'RECOMMEND'),
      question('customer-risk', '哪些客户需要重点跟进？', 'NEXT_ACTIONS'),
      question('customer-sync', '客户资料同步是否有异常？', 'TRACE'),
      question('customer-selected', '分析当前客户的交易情况', 'OVERVIEW'),
    ],
    role: '外贸业务员',
    scope: '可读取交易客户、联系人、OKKI 映射与订单汇总，不覆盖中台经营字段。',
    title: '交易客户',
  },
  'contract-order': {
    department: '外贸部门',
    greeting: '我会从回款、供给采购、发货报关和订单费用四条链分析订单。',
    pageKey: 'contract-order',
    questions: [
      question('order-stuck', '这张订单现在卡在哪里？', 'RISK'),
      question('order-receivable', '回款与冲销口径是什么？', 'EXPLAIN'),
      question('order-supply', '供给和采购是否齐套？', 'TRACE'),
      question('order-shipment', '发货前还缺什么？', 'NEXT_ACTIONS'),
      question(
        'order-draft-readiness',
        '生成需求草稿前还缺什么？',
        'RECOMMEND',
      ),
    ],
    role: '外贸负责人',
    scope:
      '可读取合同订单及关联单据，AI 只生成草稿和建议，不提交正式业务动作。',
    title: '合同订单',
  },
  'demand-analysis': {
    department: '外贸部门',
    greeting: '我会检查订单数量是否等于库存、工厂和外采三类供给之和。',
    pageKey: 'demand-analysis',
    questions: [
      question('demand-conservation', '哪些产品数量不守恒？', 'RISK'),
      question('demand-pending', '哪些订单还没有需求分析？', 'NEXT_ACTIONS'),
      question(
        'demand-recommendation',
        '库存、工厂和外采如何调整？',
        'RECOMMEND',
      ),
      question('demand-confidence', 'AI 建议的可信度如何？', 'EXPLAIN'),
      question('demand-impact', '确认后会生成哪些草稿？', 'TRACE'),
    ],
    role: '外贸业务员',
    scope: '可读取订单行与供给建议；数量不守恒时必须阻止生成下游草稿。',
    title: 'AI 需求分析',
  },
  supplier: {
    department: '采购部门',
    greeting: '我会基于资质、报价、交期、准时率、质量与负荷给出可解释建议。',
    pageKey: 'supplier',
    questions: [
      question('supplier-best-fit', '哪个供应商更适合当前产品？', 'RECOMMEND'),
      question('supplier-risk', '哪些供应商风险最高？', 'RISK'),
      question('supplier-quote', '报价与交期如何比较？', 'EXPLAIN'),
      question('supplier-capacity', '谁的当前产能更稳妥？', 'OVERVIEW'),
      question('supplier-quality', '质量和准时率是否达标？', 'TRACE'),
    ],
    role: '采购专员',
    scope: '可比较已审核供应商的确定性数据，最终供应商仍由采购人员确认。',
    title: '供应商',
  },
  requisition: {
    department: '采购部门',
    greeting: '我可以解释外采需求来源、供应商建议和转采购单草稿的前置条件。',
    pageKey: 'requisition',
    questions: [
      question(
        'requisition-ready',
        '哪些申请可以转采购单草稿？',
        'NEXT_ACTIONS',
      ),
      question('requisition-supplier', '供应商建议的依据是什么？', 'EXPLAIN'),
      question('requisition-risk', '哪些申请存在采购风险？', 'RISK'),
      question('requisition-unsourced', '哪些产品还没有选供应商？', 'TRACE'),
      question(
        'requisition-source',
        '这张申请来自哪些订单产品行？',
        'OVERVIEW',
      ),
    ],
    role: '采购专员',
    scope: '可采用建议形成采购单草稿，不发送正式订单，也不替代采购确认。',
    title: '采购申请',
  },
  'purchase-order': {
    department: '采购部门',
    greeting: '我会联查采购来源、交期、入库、付款与供应商发票差异。',
    pageKey: 'purchase-order',
    questions: [
      question('purchase-delay', '哪些采购单可能延期？', 'RISK'),
      question('purchase-payable', '还有多少采购款未付？', 'EXPLAIN'),
      question('purchase-invoice', '采购金额与发票差多少？', 'TRACE'),
      question('purchase-inbound', '采购数量与入库数量是否一致？', 'TRACE'),
      question('purchase-source', '采购单对应哪些合同产品行？', 'OVERVIEW'),
    ],
    role: '采购负责人',
    scope: '可读取采购执行与财务摘要；付款、发票和入库仍由权威页面确认。',
    title: '采购订单',
  },
  'follow-up-customs': {
    department: '采购部门',
    greeting: '我会检查发货批次的节点与报关资料齐套情况，只提示风险。',
    pageKey: 'follow-up-customs',
    questions: [
      question('customs-missing', '还缺哪些报关资料？', 'RISK'),
      question('customs-next', '当前任务下一节点是什么？', 'NEXT_ACTIONS'),
      question('customs-blocked', '哪些批次被资料问题阻塞？', 'TRACE'),
      question('customs-batch', '采购与发货来源是否齐套？', 'OVERVIEW'),
      question('customs-check', 'AI 资料检查能确认放行吗？', 'EXPLAIN'),
    ],
    role: '采购跟单',
    scope: '可检查资料缺项与里程碑，不能确认海关放行或替代人工申报。',
    title: '采购跟单与报关',
  },
  'supply-execution': {
    department: '供应链部门',
    greeting: '我会聚合工厂供货、采购入库与直发验收的数量和进度。',
    pageKey: 'supply-execution',
    questions: [
      question('supply-overdue', '哪些工厂任务有延期风险？', 'RISK'),
      question('supply-remaining', '还有多少数量未完成？', 'EXPLAIN'),
      question('supply-inbound', '采购入库进度如何？', 'OVERVIEW'),
      question('supply-outbound', '哪些出库单仍是草稿？', 'NEXT_ACTIONS'),
      question('supply-source', '当前执行单来自哪个订单行？', 'TRACE'),
    ],
    role: '供应链执行专员',
    scope: '可解释执行数量与来源；库存只能由正式入库、出库单据改变。',
    title: '供给执行',
  },
  'shipment-outbound': {
    department: '供应链部门',
    greeting: '我会分析发货批次、多来源供给、出库草稿与报关节点。',
    pageKey: 'shipment-outbound',
    questions: [
      question('shipment-readiness', '当前批次是否具备发货条件？', 'RISK'),
      question('shipment-outbound', '还有哪些出库草稿待确认？', 'NEXT_ACTIONS'),
      question('shipment-customs', '报关资料和进度如何？', 'TRACE'),
      question('shipment-progress', '本批次已完成多少？', 'OVERVIEW'),
      question('shipment-source', '产品来自哪些工厂或仓库？', 'EXPLAIN'),
    ],
    role: '发货协调员',
    scope: '可读取发货与出库草稿，不直接扣减库存或确认装船开航。',
    title: '发货与出库',
  },
  'receipt-writeoff': {
    department: '财务部门',
    greeting: '我会严格区分真实资金流入、余额消费、减免、冲销和未回款。',
    pageKey: 'receipt-writeoff',
    questions: [
      question('receipt-formula', '为什么实际回款和冲销不同？', 'EXPLAIN'),
      question('receipt-outstanding', '哪个订单未回款最高？', 'RISK'),
      question('receipt-allocation', '回款分配到了哪些订单？', 'TRACE'),
      question('receipt-balance', '客户余额和减免分别是多少？', 'OVERVIEW'),
      question('receipt-risk', '哪些回款记录需要财务关注？', 'NEXT_ACTIONS'),
    ],
    role: '应收会计',
    scope: '可解释和建议匹配；不能直接核销回款、批准减免或修改汇率。',
    title: '回款与冲销',
  },
  'payable-expense': {
    department: '财务部门',
    greeting: '我会联查采购付款、供应商发票和订单费用，并说明分配差额。',
    pageKey: 'payable-expense',
    questions: [
      question('payable-gap', '哪些采购单还有未付款？', 'RISK'),
      question('payable-invoice', '哪些供应商发票还未验真？', 'NEXT_ACTIONS'),
      question('payable-expense', '哪些订单费用需要优先处理？', 'NEXT_ACTIONS'),
      question('payable-allocation', '付款和发票分配到哪些采购单？', 'TRACE'),
      question('payable-priority', '今天财务应先处理什么？', 'RECOMMEND'),
    ],
    role: '应付会计',
    scope: '可读取应付与费用数据；不能确认付款、验真发票或批准费用。',
    title: '应付与费用',
  },
};

export function getTradeAiPageProfile(
  pageKey: TradeAiPageKey,
): TradeAiPageProfile {
  return TRADE_AI_PAGE_PROFILES[pageKey];
}

export function getTradeAiCommonQuestions(
  pageKey: TradeAiPageKey,
): TradeAiQuestion[] {
  return TRADE_AI_PAGE_PROFILES[pageKey].questions;
}
