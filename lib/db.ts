import { Pool, types } from "pg";

// Prevent pg from parsing DATE (OID 1082) into JS Date objects (which shift timezone).
// Return as plain "YYYY-MM-DD" strings instead.
types.setTypeParser(1082, (val: string) => val);

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 5,
});

export default pool;
