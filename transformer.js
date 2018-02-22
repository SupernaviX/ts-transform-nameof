"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var ts = require("typescript");
function getText(node, sourceFile) {
    return sourceFile.text.substring(node.pos, node.end).trim();
}
function getSourceFile(node) {
    while (!ts.isSourceFile(node)) {
        node = node.parent;
    }
    return node;
}
function isNameofCall(node, sourceFile) {
    if (!ts.isCallExpression(node)) {
        return false;
    }
    return getText(node.expression, sourceFile) === 'nameof';
}
function findTypeNodeToName(parameter, sourceFile) {
    var initializer = parameter.initializer;
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
function getTypeArguments(typeChecker, signature) {
    // Generate a "call signature" declaration for this signature,
    // passing a specific set of undocumented flags which tell it to resolve the full type arguments.
    var decl = typeChecker.signatureToSignatureDeclaration(signature, ts.SyntaxKind.CallSignature, undefined, ts.TypeFormatFlags.WriteTypeArgumentsOfSignature | ts.NodeBuilderFlags.WriteTypeParametersInQualifiedName);
    // This signature now has a private "typeArguments" property containing the inferred type arguments of the call.
    return decl['typeArguments'] || [];
}
var firstDefinedHelper = {
    name: 'xtsc-nameof:orDefault',
    scoped: false,
    text: "\n    var __orDefault = (this && this.__orDefault) || function(val, def) {\n      return val === void 0 ? def : val;\n    };\n  "
};
function createNameofOrDefaultHelper(context, name, input) {
    if (!input) {
        return ts.createLiteral(name);
    }
    if (ts.isLiteralExpression(input)) {
        return input;
    }
    context.requestEmitHelper(firstDefinedHelper);
    return ts.createCall(ts.createIdentifier('__orDefault'), [], [input, ts.createLiteral(name)]);
}
function nameofTransformer(ctx, program) {
    var typeChecker = program.getTypeChecker();
    return function (sourceFile) {
        function visitor(node) {
            if (!ts.isCallOrNewExpression(node)) {
                return ts.visitEachChild(node, visitor, ctx);
            }
            // Use the type checker to search the signature of the method call for a nameof initializer.
            // We're expecting a signature like myFunc<T>(foo: string, bar: string, name = typeof<T>())
            var signature = typeChecker.getResolvedSignature(node);
            var declaration = signature && signature.declaration;
            if (!declaration || !declaration.parameters.length) {
                // No declaration, no transformation
                return ts.visitEachChild(node, visitor, ctx);
            }
            var functionSourceFile = getSourceFile(declaration);
            var printer = ts.createPrinter();
            // Keep track of the arguments that will be passed in
            // Don't forget to visit each argument, in case it uses a nameof internally too
            var newArgs = Array.from(node.arguments).map(function (node) { return ts.visitNode(node, visitor); });
            var updated = false;
            for (var i = 0; i < declaration.parameters.length; ++i) {
                var parameter = declaration.parameters[i];
                var typeNodeToName = findTypeNodeToName(parameter, functionSourceFile);
                if (!typeNodeToName) {
                    continue;
                }
                var type = typeChecker.getTypeFromTypeNode(typeNodeToName);
                var typeDeclaration = type.symbol.declarations[0];
                var name = void 0;
                if (ts.isTypeParameterDeclaration(typeDeclaration)) {
                    // Find the actual name of the type parameter here
                    var owner = typeDeclaration.parent;
                    var inputIndex = owner.typeParameters.indexOf(typeDeclaration);
                    if (ts.isCallExpression(node) && ts.isClassDeclaration(owner)) {
                        // The type parameter belongs to the class itself
                        // Get the value from the instance which the method was called on
                        var method = node.expression; // foo.bar
                        var instance = method.expression; // foo
                        var instanceType = typeChecker.getTypeAtLocation(instance);
                        name = typeChecker.typeToString(instanceType.typeArguments[inputIndex]);
                    }
                    else {
                        // The node is either a CallExpression for a generic method,
                        // or a NewExpression for a generic class.
                        // Either way, we can find the type argument in the node's signature.
                        var signatureTypeArgs = getTypeArguments(typeChecker, signature);
                        name = printer.printNode(ts.EmitHint.Unspecified, signatureTypeArgs[inputIndex], sourceFile);
                    }
                }
                else {
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
            // Finally, return the transformed node
            return ts.isCallExpression(node)
                ? ts.updateCall(node, node.expression, node.typeArguments, newArgs)
                : ts.updateNew(node, node.expression, node.typeArguments, newArgs);
        }
        return ts.visitNode(sourceFile, visitor);
    };
}
exports.default = nameofTransformer;
