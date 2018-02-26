# ts-transform-nameof

A custom TypeScript transformer that exposes the name of a type at runtime. It can also transform function calls to pass those names in automatically.

## Setup
- Install [ttypescript](https://github.com/cevek/ttypescript)
- Add this to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "plugins": [
      {
        "customTransformers": {
          "before": [
            "ts-transform-nameof/transformer"
          ]
        }
      }
    ]
  }
}
```

## How to use it
```typescript
import { nameof } from 'ts-transform-nameof';

class Repository<T> {
  public constructor(private typeName: string = nameof<T>()) {
    console.log(`Creating new repo for ${typeName}`);
  }
}

// In some other file...
const repo = new Repository<SomeInterface>();
// At runtime, this will be passed the string "SomeInterface"
```

## How does it work
```typescript
// At compile time, this typescript...
function getType<T>(param: T, type = nameof<T>()) {
  console.log(`param is a ${type}`);
}
getType(true);

// gets transpiled to this...
function getType(param, type) {
  if (type === void 0) { type = nameof("T"); }
  console.log(`param is a ${type}`);
}
getType(true, "boolean");
```
This custom transformer uses the TypeChecker API to find the name of `nameof`'s generic argument.

## Limitations
To transform a function call, the type checker needs to know about the function's body. This means that function calls won't be transpiled when:
- The function is being called through an interface
- The function was exported by another npm package

If a function call doesn't get transformed, `nameof<T>()` will actually get called, and return `"T"` (or whatever its parameter was named).