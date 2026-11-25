/**
 * Profile photos are centre-cropped to a square and scaled to 600 px as JPEG
 * in the browser: small, and the same shape everywhere (/profile, Admin → Profiles).
 * @param {Blob} file @returns {Promise<Blob>}
 */
export async function squareJpeg(file) {
	const img = await createImageBitmap(file);
	const side = Math.min(img.width, img.height);
	const size = Math.min(600, side);
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Could not read the image');
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, size, size);
	ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
	return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read the image'))), 'image/jpeg', 0.88));
}
