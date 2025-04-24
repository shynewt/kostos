// @ts-check

/** @type {import("prettier").Config} */
export default {
  plugins: ['prettier-plugin-tailwindcss'],
  tailwindFunctions: ['cn', 'clsx'],
  singleQuote: true,
  semi: false,
  tabWidth: 2,
  trailingComma: 'es5',
  printWidth: 110,
  bracketSpacing: true,
  endOfLine: 'lf',
}
