# ts-transform-nameof

A custom TypeScript transformation that gives your code access to the names of types at runtime.

## Setup
- Install [ttypescript](https://github.com/cevek/ttypescript)
- Add this to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "plugins": {
      "customTransformers": {
        "before": [
          "ts-transform-nameof/transformer"
        ]
      }
    }
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
```

## How does it work
```typescript
// At compile time, this...
const repo = new Repository<SomeInterface>();

// gets transpiled to this...
const repo = new Repository<SomeInterface>("SomeInterface");
```
This custom transformer uses the TypeChecker API to find the name of `nameof`'s generic argument.