/**
 * Join class names, dropping anything falsy. Lets a component write
 * `cx(styles.a, cond && styles.b, "global-class")` without worrying that a CSS
 * Module lookup is typed `string | undefined` under `noUncheckedIndexedAccess`.
 */

/**
 * @param parts - class name strings, or falsy values to skip
 * @returns the truthy parts joined by a single space
 */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}
