// 지급 금액 해석 로직.
// payments.amount 는 '공급가'로 저장될 수도, '실지급액'으로 저장될 수도 있고
// 어느 쪽인지는 메모 앞에 붙는 플래그로 구분한다. 화면과 엑셀 내보내기가
// 같은 값을 보여야 하므로 이 파일 하나만 고치면 되도록 모아 둔다.

export const PAYMENT_AMOUNT_MODE_PREFIX = '[[pebs_amount_mode:actual]]';

export type PaymentAmountMode = 'supply' | 'actual';

export function parsePaymentMemoMeta(memo: string | null | undefined): {
  amountMode: PaymentAmountMode;
  displayMemo: string;
} {
  if (!memo) {
    return { amountMode: 'supply', displayMemo: '' };
  }
  if (memo.startsWith(PAYMENT_AMOUNT_MODE_PREFIX)) {
    const displayMemo = memo.slice(PAYMENT_AMOUNT_MODE_PREFIX.length).replace(/^\n/, '');
    return { amountMode: 'actual', displayMemo };
  }
  return { amountMode: 'supply', displayMemo: memo };
}

export function buildPaymentMemo(displayMemo: string, amountMode: PaymentAmountMode) {
  const trimmedMemo = displayMemo.trim();
  if (amountMode === 'actual') {
    return trimmedMemo ? `${PAYMENT_AMOUNT_MODE_PREFIX}\n${trimmedMemo}` : PAYMENT_AMOUNT_MODE_PREFIX;
  }
  return trimmedMemo;
}

/** 공급가 → 실지급액 (세금계산서는 부가세 가산, 원천징수는 3.3% 차감) */
export function getActualAmountFromBase(baseAmount: number, methodName: string) {
  if (methodName === '세금계산서') return Math.round(baseAmount * 1.1);
  if (methodName === '원천징수') return Math.round(baseAmount * 0.967);
  return baseAmount;
}

/** 실지급액 → 공급가 */
export function getBaseAmountFromActual(actualAmount: number, methodName: string) {
  if (methodName === '세금계산서') return Math.round(actualAmount / 1.1);
  if (methodName === '원천징수') return Math.round(actualAmount / 0.967);
  return actualAmount;
}

/**
 * 저장된 금액과 지급방식으로 공급가·실지급액을 함께 구한다.
 * amountMode 가 'actual' 이면 저장값이 이미 실지급액이라 공급가는 알 수 없다(null).
 */
export function resolvePaymentAmounts(
  amount: number | null | undefined,
  memo: string | null | undefined,
  methodName: string
): { supply: number | null; actual: number } {
  const base = amount || 0;
  const { amountMode } = parsePaymentMemoMeta(memo);
  if (amountMode === 'actual') {
    return { supply: null, actual: base };
  }
  return { supply: base, actual: getActualAmountFromBase(base, methodName) };
}
