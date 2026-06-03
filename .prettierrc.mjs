const config = {
  plugins: ["@trivago/prettier-plugin-sort-imports"],
  importOrder: ["^@/(.*)$", "^[./]"],
  importOrderSeparation: true,
  importOrderSortSpecifiers: true,
};

export default config;
