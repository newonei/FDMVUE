/**
 * 工厂部门各页面按菜单里登记的页面名称跳转，不写死地址：
 * 菜单在「工厂部门 / 生产管理 / 人员与工资」之间挪动时链接不用改。
 */
export const FACTORY_ROUTES = {
  dashboard: { name: 'FdmGongchangDashboard' },
  productionOrder: { name: 'FdmGongchangProductionOrder' },
  schedule: { name: 'FdmGongchangSchedule' },
  setting: { name: 'FdmGongchangFactorySetting' },
  stageStock: { name: 'FdmGongchangStageStock' },
  wage: { name: 'FdmGongchangWage' },
  workbench: { name: 'FdmGongchangWorkbench' },
  worker: { name: 'FdmGongchangWorker' },
} as const;

export type FactoryRoute = (typeof FACTORY_ROUTES)[keyof typeof FACTORY_ROUTES];
