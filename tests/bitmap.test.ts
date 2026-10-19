import { describe, expect, it } from 'vitest';

import { encodeBitmap } from '@/images';
import { ImageTarget } from '@/types';

const WIDTH = 4;
const HEIGHT = 2;

// Every pixel has a color of its own, the last one is half transparent
const color = (x: number, y: number) => [
	x * 60 + 10,
	y * 120 + 20,
	200 - x * 40,
	x == 3 && y == 1 ? 128 : 255,
];

function image(): ImageData {
	const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
	for (let y = 0; y < HEIGHT; y++) {
		for (let x = 0; x < WIDTH; x++) {
			data.set(color(x, y), (y * WIDTH + x) * 4);
		}
	}
	return { width: WIDTH, height: HEIGHT, data, colorSpace: 'srgb' };
}

function read(target: ImageTarget) {
	const bitmap = encodeBitmap(image(), target);
	const view = new DataView(bitmap.buffer);
	const width = view.getInt32(18, true);
	const height = view.getInt32(22, true);
	const offset = view.getUint32(10, true);

	return {
		bitmap,
		view,
		width,
		height,
		// Pixel counted from the top as [r, g, b, a]: rows of the file go bottom-up and keep blue first
		pixel: (x: number, y: number) => {
			const at = offset + ((height - 1 - y) * width + x) * 4;
			return [bitmap[at + 2], bitmap[at + 1], bitmap[at], bitmap[at + 3]];
		},
	};
}

describe('bitmaps', () => {
	it('carry the 32-bit header hekate checks', () => {
		const { bitmap, view } = read('background');
		expect(String.fromCharCode(bitmap[0], bitmap[1])).toBe('BM');
		expect(view.getUint32(2, true)).toBe(bitmap.length);
		expect(view.getUint32(10, true)).toBe(54);
		expect(view.getUint16(28, true)).toBe(32);
	});

	it('keep backgrounds upright and opaque', () => {
		const { width, height, pixel } = read('background');
		expect([width, height]).toEqual([WIDTH, HEIGHT]);
		for (let y = 0; y < HEIGHT; y++) {
			for (let x = 0; x < WIDTH; x++) {
				expect(pixel(x, y)).toEqual([...color(x, y).slice(0, 3), 255]);
			}
		}
	});

	it('store boot logos rotated counterclockwise for the portrait screen', () => {
		const { width, height, pixel } = read('bootlogo');
		expect([width, height]).toEqual([HEIGHT, WIDTH]);
		for (let y = 0; y < WIDTH; y++) {
			for (let x = 0; x < HEIGHT; x++) {
				expect(pixel(x, y)).toEqual([
					...color(WIDTH - 1 - y, x).slice(0, 3),
					255,
				]);
			}
		}
	});

	it('keep the transparency of icons', () => {
		expect(read('icon').pixel(3, 1)).toEqual(color(3, 1));
	});
});
