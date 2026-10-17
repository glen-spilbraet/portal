import { json, error } from '@sveltejs/kit';
import { verifySession } from '$lib/auth.js';
import { getVideos, addVideo, deleteVideo } from '$lib/db.js';

async function checkAuth(cookies, platform) {
	const token = cookies.get('session');
	const secret = platform?.env?.APP_SECRET ?? 'dev-secret';
	return verifySession(token ?? '', secret);
}

/** Keep sales_sheets.youtube_url = the first video, so the current sheet/catalogue output is unchanged. */
async function syncPrimary(db, sheetId) {
	const { updateSheet } = await import('$lib/db.js');
	const vids = await getVideos(db, sheetId);
	await updateSheet(db, sheetId, { youtube_url: vids[0]?.url ?? null });
	return vids;
}

/** POST /api/sheets/:id/videos  { url, orientation? }  — orientation auto-detected from /shorts/ when omitted. */
export async function POST({ params, request, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	const body = await request.json().catch(() => ({}));
	const url = (body.url ?? '').trim();
	if (!url) error(400, 'url required');
	const orientation = body.orientation === '9:16' || body.orientation === '16:9'
		? body.orientation
		: (/\/shorts\//.test(url) ? '9:16' : '16:9');
	const existing = await getVideos(db, params.id);
	const id = await addVideo(db, params.id, url, orientation, existing.length);
	const videos = await syncPrimary(db, params.id);
	return json({ ok: true, id, videos });
}

/** DELETE /api/sheets/:id/videos?videoId=… */
export async function DELETE({ params, url, cookies, platform }) {
	if (!(await checkAuth(cookies, platform))) error(401, 'Unauthorized');
	const db = platform?.env?.DB;
	if (!db) error(500, 'DB unavailable');
	const videoId = url.searchParams.get('videoId');
	if (!videoId) error(400, 'videoId required');
	await deleteVideo(db, videoId);
	const videos = await syncPrimary(db, params.id);
	return json({ ok: true, videos });
}
