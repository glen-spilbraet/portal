import postgres from 'postgres';

/**
 * Run a callback inside a READ ONLY transaction against the PIM database.
 * The READ ONLY mode is enforced at the PostgreSQL level — any write attempt
 * (INSERT, UPDATE, DELETE) will be rejected by the database itself.
 *
 * Use a dedicated read-only DB user (GRANT SELECT only) as an additional layer.
 */
export async function withPg(platform, fn) {
	const sql = postgres({
		host:            platform?.env?.PGHOST,
		username:        platform?.env?.PGUSER,
		password:        platform?.env?.PGPASSWORD,
		database:        platform?.env?.PGDATABASE,
		ssl:             false,
		max:             1,
		connect_timeout: 10,
		idle_timeout:    20,
	});
	try {
		return await sql.begin('READ ONLY', fn);
	} finally {
		await sql.end({ timeout: 5 });
	}
}
