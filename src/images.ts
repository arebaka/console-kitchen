import { ImageTarget } from './types';

// Hekate reads 32-bit bitmaps: a boot logo up to 1280×720, the Nyx background of 1280×720 and 192×192 icons
const SIZES: Record<ImageTarget, [number, number]> = {
	bootlogo: [1280, 720],
	background: [1280, 720],
	icon: [192, 192]
};

// Decodes the image of a URL or a blob
async function loadImage(source: Blob | string): Promise<ImageBitmap> {
	return createImageBitmap(typeof source === 'string' ? await (await fetch(source)).blob() : source);
}

// Boot logos keep their size unless too big and hekate centers them, backgrounds cover the screen, icons fit the square
function render(image: ImageBitmap, target: ImageTarget): ImageData {
	const [width, height] = SIZES[target];
	const scale = target == 'background'
		? Math.max(width / image.width, height / image.height)
		: Math.min(width / image.width, height / image.height, target == 'bootlogo' ? 1 : Infinity);
	const drawnWidth = Math.round(image.width * scale);
	const drawnHeight = Math.round(image.height * scale);

	const canvas = document.createElement('canvas');
	canvas.width = target == 'bootlogo' ? drawnWidth : width;
	canvas.height = target == 'bootlogo' ? drawnHeight : height;
	const context = canvas.getContext('2d')!;
	// Hekate ignores the alpha of boot logos and backgrounds, so transparent parts are laid over black
	if (target != 'icon') {
		context.fillStyle = '#000';
		context.fillRect(0, 0, canvas.width, canvas.height);
	}
	context.drawImage(image, (canvas.width - drawnWidth) / 2, (canvas.height - drawnHeight) / 2, drawnWidth, drawnHeight);
	return context.getImageData(0, 0, canvas.width, canvas.height);
}

// Rows go bottom-up. The boot logo is drawn on the portrait framebuffer, so it is stored rotated 90° counterclockwise.
// Nyx blends backgrounds with their alpha, only icons may stay transparent
export function encodeBitmap(image: ImageData, target: ImageTarget): Uint8Array<ArrayBuffer> {
	const rotated = target == 'bootlogo';
	const width = rotated ? image.height : image.width;
	const height = rotated ? image.width : image.height;
	const size = 54 + width * height * 4;

	const bytes = new Uint8Array(size);
	const view = new DataView(bytes.buffer);
	view.setUint16(0, 0x4d42, true);
	view.setUint32(2, size, true);
	view.setUint32(10, 54, true);
	view.setUint32(14, 40, true);
	view.setInt32(18, width, true);
	view.setInt32(22, height, true);
	view.setUint16(26, 1, true);
	view.setUint16(28, 32, true);
	view.setUint32(34, width * height * 4, true);

	for (let row = 0; row < height; row++) {
		const y = height - 1 - row;
		for (let x = 0; x < width; x++) {
			const source = rotated
				? (x * image.width + image.width - 1 - y) * 4
				: (y * image.width + x) * 4;
			const offset = 54 + (row * width + x) * 4;
			bytes[offset] = image.data[source + 2];
			bytes[offset + 1] = image.data[source + 1];
			bytes[offset + 2] = image.data[source];
			bytes[offset + 3] = target == 'icon' ? image.data[source + 3] : 0xff;
		}
	}
	return bytes;
}

// The bitmap hekate or Nyx expects for the target, converted from any image the browser reads
export async function convertImage(source: Blob | string, target: ImageTarget): Promise<Uint8Array<ArrayBuffer>> {
	return encodeBitmap(render(await loadImage(source), target), target);
}

async function gzip(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
	return new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
}

function base64(data: Uint8Array): string {
	let binary = '';
	for (let i = 0; i < data.length; i += 0x8000) {
		binary += String.fromCharCode(...data.subarray(i, i + 0x8000));
	}
	return btoa(binary);
}

// Conversions are kept by source and target, so the installers rebuild instantly after every option change
const encoded = new Map<string, Promise<string>>();

// Base64 of the gzip-compressed bitmap for the installers, wrapped at 76 characters like the base64 tool does.
// `source` is a public path of a gallery image or an object URL of an upload
export function encodeImage(source: string, target: ImageTarget): Promise<string> {
	const key = `${target} ${source}`;
	if (!encoded.has(key)) {
		const promise = convertImage(source, target)
			.then(async bitmap => base64(await gzip(bitmap)).replaceAll(/.{76}(?=.)/g, '$&\n'));
		promise.catch(() => encoded.delete(key));
		encoded.set(key, promise);
	}
	return encoded.get(key)!;
}
