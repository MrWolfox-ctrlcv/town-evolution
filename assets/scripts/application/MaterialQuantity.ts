/** Exact binary material quantities. Whole-unit items retain their existing labels. */
export function materialQuantity(amount: number): string {
  if (Number.isInteger(amount) || !Number.isFinite(amount)) return String(amount);
  const quanta = amount * 4096;
  if (!Number.isSafeInteger(quanta) || amount < 0) return String(amount);
  const whole = Math.floor(amount);
  let numerator = quanta - whole * 4096;
  let denominator = 4096;
  while (numerator % 2 === 0 && denominator > 1) {
    numerator /= 2;
    denominator /= 2;
  }
  return `${whole ? `${whole}+` : ''}${numerator}/${denominator}`;
}
