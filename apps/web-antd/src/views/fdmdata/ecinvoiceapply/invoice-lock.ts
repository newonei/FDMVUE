export interface InvoiceApplyLockState {
  invoiceFileUrl?: null | string;
  invoiceStatus?: unknown;
}

/**
 * 已开票记录不可再修改。
 *
 * 附件是已经完成开票的强证据：即使旧版重复录入曾把状态回退为未开票，
 * 只要发票附件仍然存在，也必须继续锁定该记录。
 */
export function isInvoiceApplyLocked(
  record?: InvoiceApplyLockState | null,
): boolean {
  return (
    Number(record?.invoiceStatus) === 1 ||
    Boolean(record?.invoiceFileUrl?.trim())
  );
}
