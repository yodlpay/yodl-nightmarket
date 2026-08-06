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
// Privy depends on `jose`, whose exports map offers `browser`, `import` and
// `require` in that order. Without `browser` active, Metro takes `import` and
// pulls in jose's *Node* build, which opens with `import * as crypto from
// 'crypto'` — a module React Native does not have. The bundle then fails with
// "Unable to resolve module crypto", several layers away from anything this app
// wrote, which is a memorably unhelpful place to start debugging.
//
// Conditions are a set, not a priority list: precedence comes from the order of
// the keys in each package's own exports map. Adding `browser` simply makes the
// browser branch eligible, and every well-formed exports map lists it before the
// Node branches.
config.resolver.unstable_conditionNames = ['react-native', 'browser', 'require', 'import'];

module.exports = config;
