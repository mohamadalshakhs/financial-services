import type { FinancialExpense, FinancialConfig } from '@workspace/api-client-react';

export type Kind = 'outing' | 'basic';
/** Amounts stored in integer fils (1 KD = 1000 fils) to keep totals exact. */
export type Expense = FinancialExpense;
export type Config = FinancialConfig; // salary/limit/fixed in fils
export const MAX_EXPENSES = 1000;
export const MAX_TITLE = 120;

/** Upper bound for any single entered amount: under 1,000,000 KD. */
export const MAX_FILS = 999_999_999;

export const toFils = (n: number) => Math.round(n * 1000);
export const fromFils = (f: number) => f / 1000;

/** Exact decimal string for an integer fils amount, e.g. 8450000 -> "8450.000". */
export function filsToStr(f: number): string {
  const neg = f < 0, a = Math.abs(Math.trunc(f));
  return `${neg ? '-' : ''}${Math.floor(a / 1000)}.${String(a % 1000).padStart(3, '0')}`;
}

/**
 * Parses a KD amount string into integer fils without float rounding.
 * Accepts non-negative numbers with up to 3 decimals; rejects sub-fils precision,
 * exponents, non-finite and amounts at or above 1,000,000 KD. Returns null if invalid.
 */
export function parseMoney(raw: string): number | null {
  const s = raw.trim().replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660)).replace('٫', '.');
  const m = /^(\d{1,9})(?:\.(\d{0,3}))?$|^\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const whole = Number(m[1] ?? '0');
  const frac = Number((m[2] ?? m[3] ?? '').padEnd(3, '0') || '0');
  const f = whole * 1000 + frac;
  return Number.isSafeInteger(f) && f <= MAX_FILS ? f : null;
}

/** Parses a user-entered number; returns NaN for empty/invalid/non-finite input. */
export function parseNum(raw: string): number {
  const s = raw.trim();
  if (!s) return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const lastDay = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

/** Whole days until next payday, clamped to month length; 0 on payday. */
export function daysUntil(payday: number, now = new Date()) {
  const y = now.getFullYear(), m = now.getMonth();
  const today = Date.UTC(y, m, now.getDate());
  let target = Date.UTC(y, m, Math.min(payday, lastDay(y, m)));
  if (target < today) target = Date.UTC(y, m + 1, Math.min(payday, lastDay(y, m + 1)));
  return Math.round((target - today) / 86400000);
}

export function totals(expenses: Pick<Expense, 'fils' | 'kind'>[], cfg: Config) {
  const spent = expenses.reduce((s, e) => s + e.fils, 0);
  const outSpent = expenses.filter((e) => e.kind === 'outing').reduce((s, e) => s + e.fils, 0);
  const remaining = cfg.salary - cfg.fixed - spent;
  const outLeft = cfg.outingLimit - outSpent;
  const days = daysUntil(cfg.payday);
  const perDay = Math.floor(days > 0 ? Math.max(0, remaining) / days : Math.max(0, remaining));
  const outPct = cfg.outingLimit > 0 ? Math.min(100, (outSpent / cfg.outingLimit) * 100) : outSpent > 0 ? 100 : 0;
  return {
    spent: fromFils(spent), outSpent: fromFils(outSpent), remaining: fromFils(remaining),
    outLeft: fromFils(outLeft), days, perDay: fromFils(perDay), outPct,
  };
}
