import postgres from 'postgres';

/** Run a callback with a postgres.js sql instance, closing the connection after. */
export async function withPg(platform, fn) {
	const sql = postgres({
		host:            platform?.env?.PGHOST,
		username:        platform?.env?.PGUSER,
		password:        platform?.env?.PGPASSWORD,
		database:        platform?.env?.PGDATABASE,
		ssl:             'require',
		max:             1,
		connect_timeout: 10,
		idle_timeout:    20,
	});
	try {
		return await fn(sql);
	} finally {
		await sql.end({ timeout: 5 });
	}
}
