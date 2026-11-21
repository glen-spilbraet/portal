/**
 * Shared rules for files that end up in R2 and are served back from the
 * Portal's own origin (/api/img/…). Anything a browser could run as a page
 * (HTML, SVG, …) must never be stored under an attacker-chosen key or served
 * inline.
 */

import { error } from '@sveltejs/kit';

/** Widths the browser may upload as pre-resized WebP copies next to an original. */
const VARIANT_KEY = /^[A-Za-z0-9][A-Za-z0-9_\-./]*_(300|400|600|1000|1600)\.webp$/;

/**
 * A "variant" upload is a resized WebP copy stored next to an original
 * (`<key>_<width>.webp`). Only that exact shape may be written, and only as
 * WebP — otherwise the endpoint would be "write any file to any key".
 * Throws 400 if not.
 * @param {string} key @param {File} file
 */
export function assertVariantUpload(key, file) {
	if (!VARIANT_KEY.test(key) || key.includes('..') || key.includes('//')) error(400, 'Invalid variant key');
	if (file.type !== 'image/webp') error(400, 'Variants must be WebP images');
}

/** Raster image types accepted for uploads shown in the Portal / shop. */
const IMAGE_EXT = /** @type {Record<string, string>} */ ({
	'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif',
	'image/heic': 'heic', 'image/heif': 'heif', 'image/tiff': 'tiff',
});

/**
 * File extension for an uploaded image, from its declared type (never from the
 * file name). Throws 400 for anything that is not a raster image.
 * @param {File} file
 */
export function imageExt(file) {
	let ext = IMAGE_EXT[String(file.type).toLowerCase()];
	// Some browsers send no type for HEIC/TIFF — then trust a known image extension.
	if (!ext && !file.type) {
		const named = file.name?.split('.').pop()?.toLowerCase() ?? '';
		if (Object.values(IMAGE_EXT).includes(named) || named === 'jpeg' || named === 'tif') ext = named;
	}
	if (!ext) error(400, 'Only image files (JPG, PNG, WebP, GIF, AVIF, HEIC, TIFF) can be uploaded here');
	return ext;
}

/** Types a browser may display directly from /api/img; everything else downloads. */
const INLINE = /^(image\/(jpeg|png|webp|gif|avif|heic|heif|tiff)|video\/[\w.+-]+|audio\/[\w.+-]+|application\/pdf)$/i;

/**
 * Harden the headers of a stored file being served from the Portal's origin:
 * no content sniffing, and no inline display of types that can carry script.
 * @param {Headers} headers
 */
export function hardenServedFile(headers) {
	headers.set('X-Content-Type-Options', 'nosniff');
	const type = (headers.get('Content-Type') ?? '').split(';')[0].trim();
	if (!INLINE.test(type)) headers.set('Content-Disposition', 'attachment');
}
