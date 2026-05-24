// @react-native/babel-plugin-codegen (bundled in babel-preset-expo) fires on any
// file whose default export is `codegenNativeComponent(...)`. It then re-parses
// the raw source with RN 0.76's codegen, which doesn't understand the
// `CodegenTypes` namespace (`CT.WithDefault`, `CT.DirectEventHandler`, etc.)
// that react-native-screens 4.x ships in its fabric/*.ts files — the build
// dies with `Unknown prop type ... undefined`.
//
// We run before the codegen plugin and rewrite the matching exports to
//   const _c = codegenNativeComponent(...);
//   export default _c;
// so the codegen plugin's `isCodegenDeclaration` check fails and it no-ops on
// the file. Runtime behavior is preserved: `codegenNativeComponent` still runs,
// and on the new arch (Expo SDK 52 default) view configs come from native.
module.exports = function skipCodegenForScreens({ types: t }) {
  const MATCH = ['react-native-screens', 'fabric'];

  return {
    name: 'skip-codegen-for-screens',
    visitor: {
      ExportDefaultDeclaration(path, state) {
        const filename = state.filename || '';
        if (!MATCH.every((segment) => filename.includes(segment))) return;

        const decl = path.node.declaration;
        if (!t.isCallExpression(decl)) return;
        if (!t.isIdentifier(decl.callee, { name: 'codegenNativeComponent' })) return;

        const tempId = path.scope.generateUidIdentifier('nativeComponent');
        path.insertBefore(
          t.variableDeclaration('const', [t.variableDeclarator(tempId, decl)]),
        );
        path.node.declaration = tempId;
      },
    },
  };
};
