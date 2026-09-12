/**
 * Price cache scan — extract a tracked customer/group's CUSTOM prices from
 * Rackbeat into the local `custom_price` table. Runs in the portal (env-correct
 * DB + RACKBEAT_API_KEY), so it works on both dev and prod.
 */
const RB = 'https://app.rackbeat.com/api';

function num(x) {
	if (x == null || x === '') return null;
	if (typeof x === 'number') return x;
	const n = parseFloat(String(x).trim().replace(/\./g, '').replace(',', '.'));
	return Number.isFinite(n) ? n : null;
}

async function rbGet(apiKey, path) {
	const res = await fetch(`${RB}${path}`, { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } });
	if (res.status === 429) { await new Promise((r) => setTimeout(r, 1000)); return rbGet(apiKey, path); }
	if (!res.ok) return null;
	return res.json();
}

function chunk(a, n) { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; }

/** Scan one price_source (by id) and cache its custom prices. Returns a summary. */
export async function scanPriceSource(db, apiKey, sourceId) {
	const src = await db.prepare('SELECT * FROM price_source WHERE id = ?').bind(sourceId).first();
	if (!src) return { ok: false, error: 'source not found' };
	if (!apiKey) {
		await db.prepare('UPDATE price_source SET status=?, error=? WHERE id=?').bind('error', 'RACKBEAT_API_KEY not set', sourceId).run();
		return { ok: false, error: 'RACKBEAT_API_KEY not set' };
	}
	const base = src.type === 'group'
		? `/customer-groups/${encodeURIComponent(src.ref)}`
		: `/customers/${encodeURIComponent(src.ref)}`;
	try {
		let name = src.name, currency = src.currency;
		const meta = await rbGet(apiKey, base);
		if (meta) {
			const obj = meta.customer ?? meta.customer_group ?? meta;
			name = obj.name ?? name;
			currency = obj.currency ?? obj.currency_code ?? currency ?? null;
		}

		const customs = []; let scanned = 0; let page = 1, pages = 1;
		do {
			const b = await rbGet(apiKey, `${base}/lineables?limit=1000&page=${page}`);
			if (!b) break;
			pages = b.pages || 1;
			for (const it of b.items || []) {
				scanned++;
				if (it.is_custom_sales_price && it.number != null) {
					customs.push({ sku: String(it.number), custom_price: num(it.sales_price), regular_price: num(it.regular_sales_price) });
				}
			}
			page++;
		} while (page <= pages);

		const now = new Date().toISOString();
		await db.prepare('DELETE FROM custom_price WHERE source_id = ?').bind(sourceId).run();
		for (const c of chunk(customs, 50)) {
			await db.batch(c.map((x) => db.prepare(
				'INSERT OR REPLACE INTO custom_price (source_id, sku, custom_price, regular_price, updated_at) VALUES (?,?,?,?,?)'
			).bind(sourceId, x.sku, x.custom_price, x.regular_price, now)));
		}
		await db.prepare('UPDATE price_source SET name=?, currency=?, product_count=?, scanned_count=?, last_synced_at=?, status=?, error=NULL WHERE id=?')
			.bind(name, currency, customs.length, scanned, now, 'ok', sourceId).run();
		return { ok: true, source_id: sourceId, name, currency, product_count: customs.length, scanned_count: scanned };
	} catch (e) {
		await db.prepare('UPDATE price_source SET status=?, error=? WHERE id=?').bind('error', String(e?.message ?? e), sourceId).run();
		return { ok: false, error: String(e?.message ?? e) };
	}
}
