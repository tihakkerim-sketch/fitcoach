/** Leeres Zahlenfeld = nicht ausgefüllt (undefined) statt NaN. */
export const optNum = { setValueAs: (v: unknown) => (v === '' || v == null || Number.isNaN(v) ? undefined : Number(v)) }
