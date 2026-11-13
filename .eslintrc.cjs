// root: true stops ESLint walking up past this repository. Without it, a
// checkout inside another workspace inherits that workspace's rules, which is
// exactly how a submodule ends up linted by its parent's configuration.
module.exports = {
  root: true,
  env: { es2023: true, node: true },
  parserOptions: { ecmaVersion: 2023, sourceType: 'module' },
  extends: [
    'eslint:recommended',
    // Last, so formatting rules that would fight Prettier are turned off.
    'prettier',
  ],
}
