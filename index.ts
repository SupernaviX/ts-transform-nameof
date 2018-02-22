/*
export function nameof<T>() {
  return function(target: Object, propertyKey: string | symbol, parameterIndex: number) {
    // does nothing... at runtime
  }
}
*/

export function nameof<T>() {
  return 'unknown';
}