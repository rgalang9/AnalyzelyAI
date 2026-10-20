// Type info for the sql.js build with the database engine baked in (same API as "sql.js")
declare module "sql.js/dist/sql-wasm-inline.js" {
  import initSqlJs from "sql.js";
  export default initSqlJs;
}
