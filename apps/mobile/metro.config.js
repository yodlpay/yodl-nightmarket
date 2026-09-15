// Metro, taught about the monorepo.
//
// Two changes over the default, both required by pnpm workspaces:
//
//   watchFolders     — so editing packages/theme reloads the app instead of
//                      serving a stale copy until the bundler is restarted.
//   nodeModulesPaths — so a package hoisted to the workspace root resolves from
//                      an app-local import. `.npmrc` sets `node-linker=hoisted`
//                      precisely because Metro does not follow pnpm's default
//                      symlinked layout reliably; this is the other half of that.
//
// https://docs.expo.dev/guides/monorepos/

const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Mark `browser` as an active export condition.
//
// The wallet stack's packages ship Node and browser builds behind one exports
// map, typically offering `browser`, `import` and `require` in that order. With
// only Metro's default conditions active, `import` wins and pulls in a *Node*
// build, which opens with something like `import * as crypto from 'crypto'` — a
// module React Native does not have. The bundle then fails with "Unable to
// resolve module crypto", several layers away from anything this app wrote,
// which is a memorably unhelpful place to start debugging. `jose` was the package
// that taught us this, and Openfort's own Metro guidance still special-cases it
// with a `resolveRequest` hook for the same reason.
//
// Conditions are a set, not a priority list: precedence comes from the order of
// the keys in each package's own exports map. Adding `browser` simply makes the
// browser branch eligible, and every well-formed exports map lists it before the
// Node branches — so this says the same thing once, for every package that ships
// a browser build, and leaves the resolver alone.
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require', 'import'];

module.exports = config;
