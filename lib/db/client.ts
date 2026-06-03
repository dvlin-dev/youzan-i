import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const sql = neon(url);
/** 原始 neon 标签模板：用于「单条原子语句」（neon-http 每条语句即一个事务），如守恒校验下的过账。 */
export const rawSql = sql;
export const db = drizzle(sql, { schema });
