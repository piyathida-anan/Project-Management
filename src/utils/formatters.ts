import type { Timestamp } from 'firebase/firestore';
import type { BudgetProject, InstallmentItem } from '../types/budget';

const THAI_SHORT_MONTHS = [
  'ม.ค.',
  'ก.พ.',
  'มี.ค.',
  'เม.ย.',
  'พ.ค.',
  'มิ.ย.',
  'ก.ค.',
  'ส.ค.',
  'ก.ย.',
  'ต.ค.',
  'พ.ย.',
  'ธ.ค.',
];

export function getCurrentThaiYear(): number {
  return new Date().getFullYear() + 543;
}

export function getFiscalYearOptions(): number[] {
  const current = getCurrentThaiYear();
  const years: number[] = [];
  for (let y = current - 10; y <= current + 10; y++) {
    years.push(y);
  }
  return years;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function formatCurrency(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(safe);
}

export function formatPercent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return Number.isInteger(safe)
    ? String(safe)
    : safe.toFixed(2).replace(/\.?0+$/, '');
}

export function generateSafeId(prefix: string): string {
  const randomPart = Math.random().toString(36).slice(2, 8);
  const timePart = Date.now().toString(36);
  return `${prefix}_${timePart}_${randomPart}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

export function toDateObject(value?: Timestamp | Date | null): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof (value as Timestamp).toDate === 'function') {
    return (value as Timestamp).toDate();
  }
  return new Date();
}

export function formatThaiDateTime(value?: Timestamp | Date | null): string {
  const d = toDateObject(value);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const thaiYear = d.getFullYear() + 543;
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${thaiYear} ${hours}:${minutes}:${seconds} น.`;
}

export function getTodayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function formatIsoToThaiDate(isoDate?: string | null): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return '-';
  const [yStr, mStr, dStr] = isoDate.split('-');
  const year = Number(yStr) + 543;
  const monthIdx = Number(mStr) - 1;
  const day = Number(dStr);
  const monthLabel = THAI_SHORT_MONTHS[monthIdx] ?? mStr;
  return `${day} ${monthLabel} ${year}`;
}

export function daysUntilIsoDate(isoDate?: string | null): number | null {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const [y, m, d] = isoDate.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = target.getTime() - today.getTime();
  return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

export function computeTorBudgetStats(project: BudgetProject): {
  approvedBudget: number;
  receivedBudget: number;
  pendingBudget: number;
  latestReceiptLabel: string;
  isComplete: boolean;
} {
  if (project.proposalStatus !== 'approved') {
    return {
      approvedBudget: 0,
      receivedBudget: 0,
      pendingBudget: 0,
      latestReceiptLabel: '-',
      isComplete: false,
    };
  }

  const approvedBudget = round2(
    project.approvedBudget > 0 ? project.approvedBudget : project.totalBudget
  );

  const installments = project.torInstallments ?? [];
  const receivedInstallments = installments.filter(
    (item) =>
      item.status === 'received_from_funder' ||
      item.status === 'received_from_university'
  );

  const receivedBudget = round2(
    receivedInstallments.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  );
  const pendingBudget = round2(Math.max(0, approvedBudget - receivedBudget));

  const torPlanTotal = round2(
    installments.reduce((sum, item) => sum + (Number(item.amount) || 0), 0)
  );

  const isComplete =
    installments.length > 0 &&
    receivedInstallments.length === installments.length &&
    (approvedBudget <= 0 || torPlanTotal > 0);

  let latestReceiptLabel = 'ยังไม่มีแผนงวดรับงบ';
  if (installments.length > 0) {
    if (receivedInstallments.length === 0) {
      latestReceiptLabel = 'รอรับงบงวดที่ 1';
    } else {
      const latest = receivedInstallments.reduce((a, b) =>
        b.order > a.order ? b : a
      );
      const statusText =
        latest.status === 'received_from_university'
          ? 'รับจากมหาวิทยาลัยแล้ว'
          : 'รับจากแหล่งทุนแล้ว';
      latestReceiptLabel = `รับงบงวดที่ ${latest.order} (${statusText})`;
    }
  }

  return {
    approvedBudget,
    receivedBudget,
    pendingBudget,
    latestReceiptLabel,
    isComplete,
  };
}

export function computeInstallmentAmounts(
  totalAmount: number,
  installments: InstallmentItem[]
): number[] {
  if (installments.length === 0) return [];
  const totalPct = round2(
    installments.reduce((sum, item) => sum + (Number(item.percentage) || 0), 0)
  );
  const isFull100 = Math.abs(totalPct - 100) < 0.01;

  let accumulated = 0;
  return installments.map((inst, idx) => {
    if (isFull100 && idx === installments.length - 1) {
      return round2(Math.max(0, totalAmount - accumulated));
    }
    const share = round2((totalAmount * (Number(inst.percentage) || 0)) / 100);
    accumulated = round2(accumulated + share);
    return share;
  });
}

export function parseBudgetNumber(raw: string): number {
  const cleaned = raw.replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num < 0) return 0;
  return round2(num);
}

export function formatBudgetInputWhileTyping(raw: string): string {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  if (!cleaned) return '';

  const dotIndex = cleaned.indexOf('.');
  let intPart = dotIndex >= 0 ? cleaned.slice(0, dotIndex) : cleaned;
  const decPart =
    dotIndex >= 0
      ? cleaned.slice(dotIndex + 1).replace(/\./g, '').slice(0, 2)
      : null;

  if (intPart === '' && decPart !== null) {
    intPart = '0';
  } else if (intPart.length > 1) {
    intPart = intPart.replace(/^0+(?=\d)/, '');
  }

  const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return decPart !== null ? `${formattedInt}.${decPart}` : formattedInt;
}

export function formatBudgetWithCaret(inputEl: HTMLInputElement): string {
  const raw = inputEl.value;
  const selectionStart = inputEl.selectionStart ?? raw.length;
  const nonCommaBeforeCaret = raw
    .slice(0, selectionStart)
    .replace(/[^0-9.]/g, '').length;

  const formatted = formatBudgetInputWhileTyping(raw);

  let remaining = nonCommaBeforeCaret;
  let newCaretPos = 0;
  while (newCaretPos < formatted.length && remaining > 0) {
    if (formatted[newCaretPos] !== ',') {
      remaining--;
    }
    newCaretPos++;
  }

  window.requestAnimationFrame(() => {
    if (document.activeElement === inputEl) {
      inputEl.setSelectionRange(newCaretPos, newCaretPos);
    }
  });

  return formatted;
}
