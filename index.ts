/** 
 * When used as a parameter initializer,
 * this tells the compiler to pass the name of T as a string at compile-time.
 * If T is a type parameter, the caller will be updated to pass the correct name.
 * @param {string} localName The value to print if the caller does not get transpiled. The compiler will also set this automatically.
*/
export function nameof<T>(localName?: string): string {
  if (typeof localName === 'string') {
    return localName;
  }
  throw new Error("A call to ts-transform-nameof failed to transpile.");
}