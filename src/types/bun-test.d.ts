/**
 * Minimal ambient types so `bun test` files typecheck under tsc without adding
 * `@types/bun` or changing tsconfig (both outside the product-app write set).
 */
declare module "bun:test" {
  export function describe(name: string, fn: () => void): void;
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function expect(actual: unknown): {
    toBe(expected: unknown): void;
    toHaveLength(length: number): void;
    toBeDefined(): void;
    toBeNull(): void;
    toEqual(expected: unknown): void;
    /** `actual` must be a thunk; the argument matches against the message. */
    toThrow(expected?: string | RegExp): void;
  };
}
