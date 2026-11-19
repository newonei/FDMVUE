import type { EmployeeSlip } from './model';

export type Delivery = {
  batchVersion: number;
  employeeKey: string;
  id: string;
  minutes: number;
  sentAt: number;
  slip: EmployeeSlip;
};

export const slipStorageKey = 'fdm-payroll-demo:slip';
export const viewedKey = (id: string) => `fdm-payroll-demo:viewed:${id}`;
export const settingsKey = 'fdm-payroll-demo:minutes';
export type SlipSession = Pick<Delivery, 'id' | 'minutes' | 'slip'> & {
  firstView?: number;
  preview?: boolean;
};

export function viewTime(id: string) {
  return Number(localStorage.getItem(viewedKey(id))) || undefined;
}

export function viewDeadline(delivery: Pick<Delivery, 'id' | 'minutes'>) {
  const firstView = viewTime(delivery.id);
  return firstView ? firstView + delivery.minutes * 60_000 : undefined;
}

export function openSlip(delivery: Delivery, preview = false) {
  const popup = window.open('', '_blank');
  if (!popup) return false;
  // Only the selected recipient's snapshot enters the standalone preview tab.
  const { id, minutes, slip } = delivery;
  const session: SlipSession = { id, minutes, slip, preview };
  popup.sessionStorage.setItem(slipStorageKey, JSON.stringify(session));
  popup.opener = null;
  popup.location.replace(new URL('slip.html', window.location.href));
  return true;
}
