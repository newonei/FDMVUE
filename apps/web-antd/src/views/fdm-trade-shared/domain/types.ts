export type EntityId = string;
export type DecimalString = string;
export type MoneyString = DecimalString;
export type RateString = DecimalString;
export type QuantityString = DecimalString;

export type CurrencyCode = 'CNY' | 'EUR' | 'USD';
export type RiskLevel = 'HIGH' | 'LOW' | 'MEDIUM';
export type AuditEventType =
  | 'AI_SUGGESTION'
  | 'HUMAN_CONFIRMATION'
  | 'RULE_BLOCK'
  | 'SYSTEM';

export type CustomerSyncStatus = 'PENDING' | 'SYNCED';
export type OrderStatus =
  | 'CANCELLED'
  | 'COMPLETED'
  | 'CONFIRMED'
  | 'DRAFT'
  | 'IN_PROGRESS'
  | 'PARTIALLY_SHIPPED';
export type DemandAnalysisStatus = 'AI_DRAFT' | 'CONFIRMED' | 'PENDING';
export type SupplierStatus = 'APPROVED' | 'DISABLED' | 'PENDING';
export type PurchaseRequisitionStatus =
  | 'CONFIRMED'
  | 'DRAFT'
  | 'PARTIALLY_SOURCED'
  | 'SOURCED';
export type PurchaseOrderStatus =
  | 'CANCELLED'
  | 'COMPLETED'
  | 'CONFIRMED'
  | 'DRAFT'
  | 'IN_PRODUCTION'
  | 'PARTIALLY_RECEIVED';
export type FactoryTaskStatus =
  | 'ACCEPTED'
  | 'COMPLETED'
  | 'DELIVERED'
  | 'DRAFT'
  | 'IN_PROGRESS';
export type FollowUpTaskStatus =
  | 'BLOCKED'
  | 'COMPLETED'
  | 'DRAFT'
  | 'IN_PROGRESS';
export type FollowUpStage =
  | 'BOOKING'
  | 'CUSTOMS_PREPARATION'
  | 'CUSTOMS_RELEASED'
  | 'INSPECTION'
  | 'PRODUCTION'
  | 'SAILED'
  | 'SUPPLIER_CONFIRMATION';
export type AiReadinessStatus = 'BLOCKED' | 'NOT_CHECKED' | 'READY';
export type ShipmentStatus =
  | 'COMPLETED'
  | 'CUSTOMS_PREPARATION'
  | 'DRAFT'
  | 'FOLLOW_UP_PENDING'
  | 'SAILED';
export type InventoryDocumentStatus = 'CANCELLED' | 'CONFIRMED' | 'DRAFT';
export type ReceiptStatus = 'CONFIRMED' | 'DRAFT';
export type ReceiptAllocationStatus = 'CONFIRMED' | 'REVERSED';
export type WriteOffStatus = 'APPROVED' | 'DRAFT' | 'REVERSED';
export type PaymentStatus = 'CONFIRMED' | 'DRAFT';
export type SupplierInvoiceStatus =
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'VOID';
export type ExpenseStatus = 'APPROVED' | 'DRAFT' | 'PAID' | 'PENDING_APPROVAL';

export interface Contact {
  id: EntityId;
  customerId: EntityId;
  email: string;
  isPrimary: boolean;
  name: string;
  phone: string;
  source: 'MANUAL' | 'OKKI';
}

export interface Customer {
  id: EntityId;
  code: string;
  country: string;
  firstOrderDate?: string;
  level: 'A' | 'B' | 'C';
  name: string;
  okkiOwner?: string;
  okkiSerialId?: string;
  orderCount: number;
  outstandingAmount: MoneyString;
  owner: string;
  syncStatus: CustomerSyncStatus;
  transactionAmount: MoneyString;
}

export interface OkkiCustomer {
  id: EntityId;
  companyId: string;
  contactEmail: string;
  contactName: string;
  contactPhone: string;
  country: string;
  mappedCustomerId?: EntityId;
  name: string;
  owner: string;
  serialId: string;
  stage: string;
}

export interface OrderLine {
  id: EntityId;
  amount: MoneyString;
  availableStockQty: QuantityString;
  customerSku?: string;
  packagingVersion?: string;
  productName: string;
  productVersion?: string;
  quantity: QuantityString;
  sku: string;
  specification: string;
  suggestedFactoryQty: QuantityString;
  suggestedPurchaseQty: QuantityString;
  suggestedStockQty: QuantityString;
  unit: string;
  unitPrice: MoneyString;
}

export interface ContractOrder {
  id: EntityId;
  additionalFee: MoneyString;
  company: string;
  currency: CurrencyCode;
  customerId: EntityId;
  destinationPort: string;
  exchangeRate: RateString;
  incoterm: string;
  lines: OrderLine[];
  originPort: string;
  owner: string;
  paymentTerms: string;
  requiredShipAt: string;
  risk: RiskLevel;
  signedAt: string;
  status: OrderStatus;
  totalAmount: MoneyString;
  type: 'BULK' | 'SAMPLE';
}

export interface DemandAnalysisLine {
  id: EntityId;
  confidence: DecimalString;
  factoryQty: QuantityString;
  orderLineId: EntityId;
  purchaseQty: QuantityString;
  stockQty: QuantityString;
  strategy: string;
}

export interface DemandAnalysis {
  id: EntityId;
  confirmedAt?: string;
  confirmedBy?: string;
  generatedAt?: string;
  lines: DemandAnalysisLine[];
  orderId: EntityId;
  status: DemandAnalysisStatus;
}

export interface SupplierQuote {
  id: EntityId;
  currency: CurrencyCode;
  leadTimeDays: number;
  minimumOrderQty: QuantityString;
  sku: string;
  unitPrice: MoneyString;
  validUntil: string;
  version: string;
}

export interface Supplier {
  id: EntityId;
  categories: string[];
  contactName: string;
  currentLoad: string;
  name: string;
  onTimeRate: DecimalString;
  paymentTerms: string;
  phone: string;
  qualityRate: DecimalString;
  quotes: SupplierQuote[];
  risk: RiskLevel;
  status: SupplierStatus;
}

export interface SupplierSuggestion {
  confidence: DecimalString;
  reason: string;
  supplierId: EntityId;
}

export interface PurchaseRequisitionLine {
  id: EntityId;
  orderLineId: EntityId;
  productName: string;
  quantity: QuantityString;
  selectedSupplierId?: EntityId;
  sku: string;
  suggestions: SupplierSuggestion[];
  unit: string;
}

export interface PurchaseRequisition {
  id: EntityId;
  confirmedAt?: string;
  createdAt: string;
  lines: PurchaseRequisitionLine[];
  orderId: EntityId;
  requiredAt: string;
  risk: string;
  status: PurchaseRequisitionStatus;
}

export interface PurchaseOrderItem {
  id: EntityId;
  amount: MoneyString;
  orderLineId: EntityId;
  productName: string;
  quantity: QuantityString;
  requisitionLineId: EntityId;
  sku: string;
  unit: string;
  unitPrice: MoneyString;
}

export interface PurchaseOrder {
  id: EntityId;
  currency: CurrencyCode;
  expectedAt: string;
  invoicedAmount: MoneyString;
  items: PurchaseOrderItem[];
  orderId: EntityId;
  paidAmount: MoneyString;
  requisitionId: EntityId;
  status: PurchaseOrderStatus;
  supplierId: EntityId;
  totalAmount: MoneyString;
}

export interface FactoryTask {
  id: EntityId;
  completedQty: QuantityString;
  estimatedReadyAt: string;
  factory: string;
  orderId: EntityId;
  orderLineId: EntityId;
  owner: string;
  requiredAt: string;
  requiredQty: QuantityString;
  status: FactoryTaskStatus;
}

export interface CustomsDocumentCheck {
  id: EntityId;
  label: string;
  status: 'MISSING' | 'READY';
}

export interface FollowUpMilestone {
  id: EntityId;
  completedAt?: string;
  label: string;
  status: 'COMPLETED' | 'PENDING';
}

export interface FollowUpTask {
  id: EntityId;
  aiReadiness: AiReadinessStatus;
  aiReadinessMessage: string;
  customsDocuments: CustomsDocumentCheck[];
  lastAiCheckedAt?: string;
  milestones: FollowUpMilestone[];
  orderId: EntityId;
  owner: string;
  purchaseOrderIds: EntityId[];
  shipmentId?: EntityId;
  stage: FollowUpStage;
  status: FollowUpTaskStatus;
}

export interface ShipmentSourceAllocation {
  quantity: QuantityString;
  sourceId?: EntityId;
  sourceLocation: string;
  sourceType: 'EXTERNAL_SUPPLIER' | 'FACTORY' | 'WAREHOUSE';
}

export interface ShipmentLine {
  id: EntityId;
  orderLineId: EntityId;
  quantity: QuantityString;
  sources: ShipmentSourceAllocation[];
}

export interface Shipment {
  id: EntityId;
  batch: string;
  createdAt: string;
  eta: string;
  etd: string;
  lines: ShipmentLine[];
  orderId: EntityId;
  progress: DecimalString;
  status: ShipmentStatus;
}

export interface InventoryDocumentItem {
  id: EntityId;
  orderLineId: EntityId;
  quantity: QuantityString;
}

export interface InboundDocument {
  id: EntityId;
  items: InventoryDocumentItem[];
  purchaseOrderId: EntityId;
  receivedAt?: string;
  status: InventoryDocumentStatus;
  warehouse: string;
}

export interface OutboundDocument {
  id: EntityId;
  confirmedAt?: string;
  items: InventoryDocumentItem[];
  location: string;
  orderId: EntityId;
  shipmentId: EntityId;
  status: InventoryDocumentStatus;
}

export interface Receipt {
  id: EntityId;
  account: string;
  amount: MoneyString;
  cnyAmount: MoneyString;
  currency: CurrencyCode;
  payer: string;
  rate: RateString;
  receivedAt: string;
  status: ReceiptStatus;
}

export interface ReceiptAllocation {
  id: EntityId;
  amount: MoneyString;
  orderId: EntityId;
  receiptId: EntityId;
  status: ReceiptAllocationStatus;
}

export interface WriteOffItem {
  id: EntityId;
  amount: MoneyString;
  approvedAt: string;
  kind: 'CUSTOMER_BALANCE' | 'OTHER' | 'WAIVER';
  orderId: EntityId;
  remark: string;
  status: WriteOffStatus;
}

export interface PaymentAllocation {
  amount: MoneyString;
  purchaseOrderId: EntityId;
}

export interface Payment {
  id: EntityId;
  account: string;
  allocations: PaymentAllocation[];
  amount: MoneyString;
  currency: CurrencyCode;
  paidAt: string;
  status: PaymentStatus;
  supplierId: EntityId;
}

export interface SupplierInvoiceAllocation {
  amount: MoneyString;
  purchaseOrderId: EntityId;
}

export interface SupplierInvoice {
  id: EntityId;
  allocations: SupplierInvoiceAllocation[];
  amount: MoneyString;
  currency: CurrencyCode;
  invoiceNo: string;
  issuedAt: string;
  status: SupplierInvoiceStatus;
  supplierId: EntityId;
}

export interface OrderExpense {
  id: EntityId;
  amount: MoneyString;
  currency: CurrencyCode;
  expenseType: string;
  orderId: EntityId;
  paymentMode:
    | 'COMPANY_DIRECT'
    | 'EMPLOYEE_REIMBURSEMENT'
    | 'OTHER'
    | 'PETTY_CASH';
  relatedId: EntityId;
  relatedType: 'FOLLOW_UP' | 'ORDER' | 'PURCHASE_ORDER' | 'SHIPMENT';
  status: ExpenseStatus;
}

export type DocumentType =
  | 'CUSTOMER'
  | 'DEMAND_ANALYSIS'
  | 'FACTORY_TASK'
  | 'FOLLOW_UP_TASK'
  | 'INBOUND_DOCUMENT'
  | 'ORDER'
  | 'ORDER_EXPENSE'
  | 'OUTBOUND_DOCUMENT'
  | 'PAYMENT'
  | 'PURCHASE_ORDER'
  | 'PURCHASE_REQUISITION'
  | 'RECEIPT'
  | 'SHIPMENT'
  | 'SUPPLIER_INVOICE';

export interface DocumentRelation {
  id: EntityId;
  fromId: EntityId;
  fromType: DocumentType;
  relationType: string;
  toId: EntityId;
  toType: DocumentType;
}

export interface AuditEvent {
  id: EntityId;
  action: string;
  actor: string;
  createdAt: string;
  entityId?: EntityId;
  entityType?: DocumentType;
  result: string;
  type: AuditEventType;
}

export interface TradePrototypeState {
  schemaVersion: 2;
  auditEvents: AuditEvent[];
  contacts: Contact[];
  customers: Customer[];
  demandAnalyses: DemandAnalysis[];
  documentRelations: DocumentRelation[];
  factoryTasks: FactoryTask[];
  followUpTasks: FollowUpTask[];
  inboundDocuments: InboundDocument[];
  okkiCustomers: OkkiCustomer[];
  orderExpenses: OrderExpense[];
  orders: ContractOrder[];
  outboundDocuments: OutboundDocument[];
  payments: Payment[];
  purchaseOrders: PurchaseOrder[];
  purchaseRequisitions: PurchaseRequisition[];
  receiptAllocations: ReceiptAllocation[];
  receipts: Receipt[];
  shipments: Shipment[];
  supplierInvoices: SupplierInvoice[];
  suppliers: Supplier[];
  writeOffItems: WriteOffItem[];
}

export interface CreateOrderDraftInput {
  additionalFee: MoneyString;
  company: string;
  currency: CurrencyCode;
  customerId: EntityId;
  destinationPort: string;
  exchangeRate: RateString;
  incoterm: string;
  lines: Array<Omit<OrderLine, 'id'>>;
  originPort: string;
  owner: string;
  paymentTerms: string;
  requiredShipAt: string;
  signedAt: string;
  type: ContractOrder['type'];
}

export interface ShipmentDraftInput {
  batch: string;
  eta: string;
  etd: string;
  lines: Array<Omit<ShipmentLine, 'id'>>;
  orderId: EntityId;
  owner: string;
}

export interface ReceiptWriteOffInput {
  account: string;
  actor: string;
  actualAmount: MoneyString;
  consumedBalanceAmount: MoneyString;
  currency: CurrencyCode;
  orderId: EntityId;
  payer: string;
  rate: RateString;
  receivedAt: string;
  waiverAmount: MoneyString;
}

export interface ReceivableSummary {
  actualReceiptAmount: MoneyString;
  consumedBalanceAmount: MoneyString;
  contractAmount: MoneyString;
  outstandingAmount: MoneyString;
  waiverAmount: MoneyString;
  writeOffAmount: MoneyString;
}

export interface DemandConfirmationResult {
  analysis: DemandAnalysis;
  factoryTasks: FactoryTask[];
  purchaseRequisitions: PurchaseRequisition[];
}

export interface DemandSplitUpdate {
  factoryQty: QuantityString;
  purchaseQty: QuantityString;
  stockQty: QuantityString;
}

export interface SupplierAdoptionResult {
  purchaseOrder: PurchaseOrder;
  requisition: PurchaseRequisition;
}

export interface ShipmentDraftResult {
  followUpTask: FollowUpTask;
  outboundDocuments: OutboundDocument[];
  shipment: Shipment;
}

export interface ReceiptWriteOffResult {
  allocations: ReceiptAllocation[];
  receipt: Receipt;
  summary: ReceivableSummary;
  writeOffItems: WriteOffItem[];
}

export interface CustomsReadinessResult {
  missingDocumentIds: EntityId[];
  readiness: AiReadinessStatus;
  task: FollowUpTask;
}
