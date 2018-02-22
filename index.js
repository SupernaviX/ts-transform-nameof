"use strict";
/*
export function nameof<T>() {
  return function(target: Object, propertyKey: string | symbol, parameterIndex: number) {
    // does nothing... at runtime
  }
}
*/
Object.defineProperty(exports, "__esModule", { value: true });
function nameof() {
    return 'unknown';
}
exports.nameof = nameof;
