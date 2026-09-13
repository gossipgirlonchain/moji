/** Wallets that may launch without a linked X account (the moji treasury). Compared case-insensitively. */
export const X_EXEMPT_ADDRESSES = ["0x5bbBD0779BF7077B24658e0BE18C5471D7ddab81"].map((a) => a.toLowerCase());

export function isXExempt(address?: string | null): boolean {
  return Boolean(address) && X_EXEMPT_ADDRESSES.includes((address as string).toLowerCase());
}
