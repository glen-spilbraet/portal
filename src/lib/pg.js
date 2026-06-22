import pg from 'pg';
const { Client } = pg;

/** Run a callback with a connected Postgres client, auto-closing when done. */
export async function withPg(platform, fn) {
	const client = new Client({
		host:     platform?.env?.PGHOST,
		user:     platform?.env?.PGUSER,
		password: platform?.env?.PGPASSWORD,
		database: platform?.env?.PGDATABASE,
		ssl:      { rejectUnauthorized: false },
	});
	await client.connect();
	try {
		return await fn(client);
	} finally {
		await client.end().catch(() => {});
	}
}
