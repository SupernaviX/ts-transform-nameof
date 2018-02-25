import * as ts from 'typescript';

function getText(node: ts.Node, sourceFile: ts.SourceFile): string {
  return sourceFile.text.substring(node.pos, node.end).trim();
}

function getSourceFile(node: ts.Node): ts.SourceFile {
  while (!ts.isSourceFile(node)) {
    node = node.parent;
  }
  return node;
}

function isNameofCall(node: ts.Node, sourceFile: ts.SourceFile): node is ts.CallExpression {
  if (!ts.isCallExpression(node)) {
    return false;
  }
  return getText(node.expression, sourceFile) === 'nameof';
}

function findTypeNodeToName(parameter: ts.ParameterDeclaration, sourceFile: ts.SourceFile): ts.TypeNode | undefined {
  const initializer = parameter.initializer;
  if (!initializer) {
    return;
  }
  if (!isNameofCall(initializer, sourceFile)) {
    return;
  }
  if (!initializer.typeArguments || !initializer.typeArguments.length) {
    return;
  }
  return initializer.typeArguments[0];
}

// HACK: uses undocumented/private functionality from the type checker.
function getTypeArguments(typeChecker: ts.TypeChecker, signature: ts.Signature): ts.TypeNode[] {
  // Generate a "call signature" declaration for this signature,
  // passing a specific set of undocumented flags which tell it to resolve the full type arguments.
  const decl = typeChecker.signatureToSignatureDeclaration(
    signature,
    ts.SyntaxKind.CallSignature,
    undefined,
    ts.TypeFormatFlags.WriteTypeArgumentsOfSignature | ts.NodeBuilderFlags.WriteTypeParametersInQualifiedName
  );
  // This signature now has a private "typeArguments" property containing the inferred type arguments of the call.
  return decl['typeArguments'] || [];
}

const firstDefinedHelper: ts.EmitHelper = {
  name: 'xtsc-nameof:orDefault',
  scoped: false,
  text: `
    var __orDefault = (this && this.__orDefault) || function(val, def) {
      return val === void 0 ? def : val;
    };
  `
};

function createNameofOrDefaultHelper(context: ts.TransformationContext, name: string, input?: ts.Expression) {
  if (!input) {
    return ts.createLiteral(name);
  }
  if (ts.isLiteralExpression(input)) {
    return input;
  }
  context.requestEmitHelper(firstDefinedHelper);
  return ts.createCall(
    ts.createIdentifier('__orDefault'), [],
    [input, ts.createLiteral(name)]
  );
}

export default function nameofTransformer(ctx: ts.TransformationContext, program: ts.Program): ts.Transformer<ts.SourceFile> {
  const typeChecker = program.getTypeChecker();
  return sourceFile => {
    function visitor(node: ts.Node): ts.Node {
      if (!ts.isCallOrNewExpression(node)) {
        return ts.visitEachChild(node, visitor, ctx);
      }
      if (isNameofCall(node, sourceFile) && !node.arguments.length) {
        const typeArg = node.typeArguments && node.typeArguments[0];
        if (typeArg) {
          const namedType = typeChecker.getTypeFromTypeNode(typeArg);
          const name = typeChecker.typeToString(namedType);
          return ts.updateCall(node, node.expression, node.typeArguments, [ts.createLiteral(name)])
        }
      }

      // Use the type checker to search the signature of the method call for a nameof initializer.
      // We're expecting a signature like myFunc<T>(foo: string, bar: string, name = typeof<T>())
      const signature = typeChecker.getResolvedSignature(node);
      const declaration = signature && signature.declaration;
      if (!declaration || !declaration.parameters.length) {
        // No declaration, no transformation
        return ts.visitEachChild(node, visitor, ctx);
      }
      const functionSourceFile = getSourceFile(declaration);

      const printer = ts.createPrinter();

      // Keep track of the arguments that will be passed in
      // Don't forget to visit each argument, in case it uses a nameof internally too
      const newArgs = Array.from(node.arguments).map(node => ts.visitNode(node, visitor));
      let updated = false;
      for (let i = 0; i < declaration.parameters.length; ++i) {
        const parameter = declaration.parameters[i];
        const typeNodeToName = findTypeNodeToName(parameter, functionSourceFile);
        if (!typeNodeToName) {
          continue;
        }

        const type = typeChecker.getTypeFromTypeNode(typeNodeToName);
        const typeDeclaration = type.symbol.declarations[0];
        let name: string;
        if (ts.isTypeParameterDeclaration(typeDeclaration)) {
          // Find the actual name of the type parameter here
          const owner = typeDeclaration.parent;
          const inputIndex = owner.typeParameters.indexOf(typeDeclaration);
          
          if (ts.isCallExpression(node) && ts.isClassDeclaration(owner)) {
            // The type parameter belongs to the class itself
            // Get the value from the instance which the method was called on
            const method = node.expression as ts.PropertyAccessExpression; // foo.bar
            const instance = method.expression; // foo
            const instanceType = typeChecker.getTypeAtLocation(instance) as ts.TypeReference;
            name = typeChecker.typeToString(instanceType.typeArguments[inputIndex]);
          } else {
            // The node is either a CallExpression for a generic method,
            // or a NewExpression for a generic class.
            // Either way, we can find the type argument in the node's signature.
            const signatureTypeArgs = getTypeArguments(typeChecker, signature);
            name = printer.printNode(ts.EmitHint.Unspecified, signatureTypeArgs[inputIndex], sourceFile);
          }

        } else {
          // If it's not a type parameter, just fall back to the exact text of T
          name = printer.printNode(ts.EmitHint.Unspecified, typeNodeToName, functionSourceFile);
        }

        // Update the args to pass
        newArgs[i] = createNameofOrDefaultHelper(ctx, name, newArgs[i]);
        updated = true;
      }

      // if we didn't change anything, keep on trucking
      if (!updated) {
        return ts.visitEachChild(node, visitor, ctx);
      }
      // insert `undefined` for any parameters that are not in fact defined
      for (let i = 0; i < newArgs.length; ++i) {
        if (!newArgs[i]) {
          newArgs[i] = ts.createVoidZero();
        }
      }
      // Finally, return the transformed node
      return ts.isCallExpression(node)
        ? ts.updateCall(node, node.expression, node.typeArguments, newArgs)
        : ts.updateNew(node, node.expression, node.typeArguments, newArgs);
    }

    return ts.visitNode(sourceFile, visitor);
  };
}