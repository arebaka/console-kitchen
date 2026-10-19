import { LinkCodes } from './types';
import { Params } from './url';

// Short links. A link spelled in full names everything by its id, a param for everything it says:
//     hw=oled&hos=23.0.0&sw=atmosphere,hekate,sys_patch&nyx.themecolor=200&tesla.key_combo=ZL,ZR,DDOWN
// A short one names things by the numbers the tables in data/**/link.tsv give them:
//     h       the console and its system version, one number
//     s       the software, a bit per component
//     l, f... everything else by what it sets up: the launch, the firmware, a component with its overlay and the like.
//             A record per param spelled in full: the number of its key and its value
// A short link is read by spelling it in full, so both kinds are checked by the same rules.
//
// The records are bits, six to a character:
//     number  three bits at a time from the lowest ones, a bit before each telling whether more follow
//     record  a number, then a value. 0 ends the records, 1 comes before a key that has no number, spelled out in pieces up to
//             the mark of the end, anything above is the number of the key less the one of the record before, plus 2
//     value   00 is 0 and 01 is 1, 10 comes before a single piece, 11 before pieces up to the mark of the end
//     piece   00 and the number of a word, 01 and a number, 10 and three bits of a mark, 110 and the ID of a game, its
//             sixteen hex digits four bits each, 111 and a text: two bits of its spelling, the number of its characters
//             less one, the characters, which are bytes in UTF-8
// Pieces are read one after another, with a comma between two of them that have no mark in between

// The characters the short params are made of, six bits each
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const PACKED = /^[\w-]*$/;

// Marks between the pieces of a value, numbered from 1: 0 is the mark of the end
const MARKS = ',.-=#:/';

// Ways to spell a text out, each with its characters and the bits one of them takes: hex digits, the characters of a link,
// any printable ASCII and the bytes of UTF-8 for everything else. Hex digits take a bit more to tell their case
interface Spelling {
	bits: number;
	alphabet?: string;
}

const SPELLINGS: Spelling[] = [
	{ bits: 4, alphabet: '0123456789ABCDEF' },
	{ bits: 4, alphabet: '0123456789abcdef' },
	{ bits: 6, alphabet: ALPHABET },
	{ bits: 7, alphabet: Array.from({ length: 95 }, (_, index) => String.fromCharCode(0x20 + index)).join('') },
	{ bits: 8 }
];

// A number goes as a number when its digits read back the same
const NUMBER = /^(0|[1-9]\d{0,14})$/;

// A piece of a value: a word of the platform by its number, a number, a mark, an ID of a game or a text spelled out one of the ways
type Piece =
	| { type: 'word'; code: number }
	| { type: 'number'; value: number }
	| { type: 'game'; id: string }
	| { type: 'mark'; code: number }
	| { type: 'text'; spelling: number; text: string };

// Bits of a param in the order they are written
class Writer {
	bits: number[] = [];

	put(value: number, width: number): void {
		for (let shift = width - 1; shift >= 0; shift--) this.bits.push(value >> shift & 1);
	}

	number(value: number): void {
		for (; value >= 8; value = Math.floor(value / 8)) this.put(8 | value % 8, 4);
		this.put(value, 4);
	}

	// Six bits to a character, the last one is filled up with zeros
	toString(): string {
		let text = '';
		for (let at = 0; at < this.bits.length; at += 6) {
			text += ALPHABET[this.bits.slice(at, at + 6).reduce((value, bit, index) => value | bit << 5 - index, 0)];
		}
		return text;
	}
}

// Bits of a param as they are read. A param that ends before what it started to say is damaged
class Reader {
	bits: number[];
	position = 0;

	constructor(text: string) {
		this.bits = [...text].flatMap(char => [5, 4, 3, 2, 1, 0].map(shift => ALPHABET.indexOf(char) >> shift & 1));
	}

	get left(): number {
		return this.bits.length - this.position;
	}

	take(width: number): number {
		if (width > this.left) throw new RangeError('The param is cut short');
		let value = 0;
		for (; width > 0; width--) value = value * 2 + this.bits[this.position++];
		return value;
	}

	number(): number {
		let value = 0;
		for (let scale = 1; ; scale *= 0b1000) {
			const group = this.take(4);
			value += group % 0b1000 * scale;
			if (group < 0b1000) return value;
			if (scale >= 2 ** 48) throw new RangeError('The number is too big');
		}
	}
}

// Bits a number takes
function numberBits(value: number): number {
	let bits = 4;
	for (; value >= 8; value = Math.floor(value / 8)) bits += 4;
	return bits;
}

// Numbers of the ids of a list and the length of the longest of them
interface Index {
	codes: Map<string, number>;
	longest: number;
}

const INDEXES = new WeakMap<string[], Index>();

function index(ids: string[]): Index {
	if (!INDEXES.has(ids)) {
		const codes = new Map<string, number>();
		ids.forEach((id, code) => codes.set(id, code));
		INDEXES.set(ids, { codes, longest: Math.max(0, ...[...codes.keys()].map(id => id.length)) });
	}
	return INDEXES.get(ids)!;
}

const isPair = (text: string, at: number) => /^[\ud800-\udbff][\udc00-\udfff]$/.test(text.substr(at, 2));

// Units of a way of spelling the character at a position takes, none when the way has no such character.
// UTF-8 writes a pair of surrogates as one character of four bytes
function units({ alphabet }: Spelling, text: string, at: number): number {
	if (alphabet) return alphabet.includes(text[at]) ? 1 : 0;
	const code = text.charCodeAt(at);
	return code < 0x80 ? 1 : code < 0x800 ? 2 : isPair(text, at) ? 4 : 3;
}

// The pieces that say a text in the fewest bits: the shortest of the ways through the text, found position by position.
// Two pieces in a row are read with a comma between them, so a list of words takes no more than the words
function pieces(text: string, words: Index): Piece[] {
	type Way = { bits: number; from?: Way; piece?: Piece };
	// The shortest way to every position, apart for the ways that end with a mark and with a piece a comma is read after
	const ways: Way[][] = Array.from({ length: text.length + 1 }, () => [{ bits: Infinity }, { bits: Infinity }]);
	ways[0][0] = { bits: 0 };
	const reach = (from: Way, at: number, open: number, bits: number, piece: Piece) => {
		if (from.bits + bits < ways[at][open].bits) ways[at][open] = { bits: from.bits + bits, from, piece };
	};

	for (let at = 0; at < text.length; at++) {
		for (const open of [0, 1]) {
			const way = ways[at][open];
			if (way.bits == Infinity) continue;
			const mark = MARKS.indexOf(text[at]) + 1;
			if (mark) reach(way, at + 1, 0, 5, { type: 'mark', code: mark });

			const startGames = open ? text[at] == ',' ? at + 1 : text.length : at;
			if (startGames + 16 <= text.length && /^[0-9A-F]{16}$/.test(text.substr(startGames, 16))) {
				reach(way, startGames + 16, 1, 3 + 64, { type: 'game', id: text.substr(startGames, 16) });
			}

			// After a piece the next one starts behind the comma that is read by itself
			const start = open ? text[at] == ',' ? at + 1 : text.length : at;
			for (let length = 1; length <= Math.min(words.longest, text.length - start); length++) {
				const code = words.codes.get(text.substr(start, length));
				if (code !== undefined) reach(way, start + length, 1, 2 + numberBits(code), { type: 'word', code });
			}

			for (let length = 1; start + length <= text.length && NUMBER.test(text.substr(start, length)); length++) {
				const value = Number(text.substr(start, length));
				reach(way, start + length, 1, 2 + numberBits(value), { type: 'number', value });
			}

			SPELLINGS.forEach((spelling, kind) => {
				for (let end = start, count = 0; end < text.length && units(spelling, text, end); end++) {
					count += units(spelling, text, end);
					if (!spelling.alphabet && isPair(text, end)) end++;
					const bits = (kind < 2 ? 6 : 5) + numberBits(count - 1) + spelling.bits * count;
					reach(way, end + 1, 1, bits, { type: 'text', spelling: kind, text: text.slice(start, end + 1) });
				}
			});
		}
	}

	const result: Piece[] = [];
	const [marked, open] = ways[text.length];
	for (let way: Way | undefined = marked.bits <= open.bits ? marked : open; way?.piece; way = way.from) result.unshift(way.piece);
	return result;
}

// Units of a text as a way of spelling writes them
const spell = ({ alphabet }: Spelling, text: string): number[] => alphabet
	? [...text].map(char => alphabet.indexOf(char))
	: [...new TextEncoder().encode(text)];

// The text a way of spelling wrote, undefined when the units are not a text
function read({ alphabet }: Spelling, codes: number[]): string | undefined {
	if (alphabet) return codes.every(code => code < alphabet.length) ? codes.map(code => alphabet[code]).join('') : undefined;
	try {
		return new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(codes));
	} catch {
		return undefined;
	}
}

function putPiece(out: Writer, piece: Piece): void {
	switch (piece.type) {
		case 'word':
			out.put(0b00, 2);
			return out.number(piece.code);
		case 'number':
			out.put(0b01, 2);
			return out.number(piece.value);
		case 'mark':
			out.put(0b10, 2);
			return out.put(piece.code, 3);
		case 'game':
			out.put(0b110, 3);
			for (let i = 0; i < 16; i++) {
				out.put(parseInt(piece.id[i], 16), 4);
			}
			return;
		case 'text':
			const codes = spell(SPELLINGS[piece.spelling], piece.text);
			out.put(0b111, 3);
			// Both cases of hex digits are the spelling 0, the bit of the case tells them apart
			out.put(Math.max(piece.spelling - 1, 0), 2);
			if (piece.spelling < 2) out.put(piece.spelling, 1);
			out.number(codes.length - 1);
			for (const code of codes) out.put(code, SPELLINGS[piece.spelling].bits);
	}
}

const putEnd = (out: Writer) => putPiece(out, { type: 'mark', code: 0 });

// The next piece: what it says, undefined when it cannot be said here, and whether it is a mark. Nothing at the mark of the end
function takePiece(input: Reader, words: string[]): { text: string | undefined; isMark?: boolean } | undefined {
	switch (input.take(2)) {
		case 0b00:
			return { text: words[input.number()] };
		case 0b01:
			return { text: String(input.number()) };
		case 0b10:
			const mark = input.take(3);
			return mark ? { text: MARKS[mark - 1], isMark: true } : undefined;
		default:
			switch (input.take(1)) {
				case 0b0:
					let id = '';
					for (let i = 0; i < 16; i++) {
						id += input.take(4).toString(16).toUpperCase();
					}
					return { text: id };
				default:
					const kind = input.take(2);
					const spelling = SPELLINGS[kind ? kind + 1 : input.take(1)];
					const length = input.number() + 1;
					if (length * spelling.bits > input.left) throw new RangeError('The param is cut short');
					return { text: read(spelling, Array.from({ length }, () => input.take(spelling.bits))) };
			}
	}
}

// Pieces put together up to the mark of the end. Undefined when one of them cannot be said here: a word without a number,
// bytes that are no text
function takeText(input: Reader, words: string[]): string | undefined {
	let text: string | undefined = '';
	for (let isOpen = false; ;) {
		const piece = takePiece(input, words);
		if (!piece) return text;
		if (text !== undefined) text = piece.text === undefined ? undefined : text + (isOpen && !piece.isMark ? ',' : '') + piece.text;
		isOpen = !piece.isMark;
	}
}

// Most options are set to 0 or 1, so these take two bits
function putValue(out: Writer, value: string, words: Index): void {
	if (value == '0' || value == '1') return out.put(Number(value), 2);
	const parts = pieces(value, words);
	const isSingle = parts.length == 1 && parts[0].type != 'mark';
	out.put(isSingle ? 0b10 : 0b11, 2);
	parts.forEach(piece => putPiece(out, piece));
	if (!isSingle) putEnd(out);
}

function takeValue(input: Reader, words: string[]): string | undefined {
	const kind = input.take(2);
	if (kind < 0b10) return String(kind);
	if (kind == 0b11) return takeText(input, words);
	const piece = takePiece(input, words);
	if (!piece || piece.isMark) throw new RangeError('Not a piece');
	return piece.text;
}

// Records of the params that go into one param of a short link. The numbered keys go in the order of their numbers, each
// telling how far its number is from the one before: next to each other they take four bits. The rows of a list follow
// one another under the same key
function pack(params: Params, keys: string[], words: string[]): string {
	const codes = index(keys).codes;
	const out = new Writer();
	let previous = 0;
	for (const [key, value] of params.filter(([key]) => codes.has(key)).sort(([a], [b]) => codes.get(a)! - codes.get(b)!)) {
		out.number(codes.get(key)! - previous + 2);
		previous = codes.get(key)!;
		putValue(out, value, index(words));
	}
	for (const [key, value] of params.filter(([key]) => !codes.has(key))) {
		out.number(1);
		pieces(key, index(words)).forEach(piece => putPiece(out, piece));
		putEnd(out);
		putValue(out, value, index(words));
	}
	return out.toString();
}

// Params of the records. A record that names what has no number here is left out, a damaged param keeps what it said before the damage
function unpack(text: string, keys: string[], words: string[]): Params {
	const params: Params = [];
	const input = new Reader(text);
	try {
		for (let previous = 0; input.left >= 4;) {
			const step = input.number();
			if (step == 0) break;
			const key = step == 1 ? takeText(input, words) : keys[previous += step - 2];
			const value = takeValue(input, words);
			if (key !== undefined && value !== undefined) params.push([key, value]);
		}
	} catch (error) {
		if (!(error instanceof RangeError)) throw error;
	}
	return params;
}

// A number in the characters of a link, the highest six bits first
const digits = (value: number): string => (value >= 64 ? digits(Math.floor(value / 64)) : '') + ALPHABET[value % 64];

// The number of the console and its system version, undefined when the param is not one
const consoleCode = (text: string): number | undefined => /^[\w-]{1,5}$/.test(text)
	? [...text].reduce((value, char) => value * 64 + ALPHABET.indexOf(char), 0)
	: undefined;

// A bit per component, six components to a character from the lowest numbers
function mask(codes: number[]): string {
	const values: number[] = [];
	for (const code of codes) values[Math.floor(code / 6)] = (values[Math.floor(code / 6)] ?? 0) | 1 << code % 6;
	return Array.from(values, value => ALPHABET[value ?? 0]).join('');
}

const unmask = (text: string, ids: string[]) => ids.filter((id, code) => ALPHABET.indexOf(text[Math.floor(code / 6)] ?? 'A') >> code % 6 & 1);

// Messengers leave a mark at the end of a link out of it. A character of zeros behind the mark says nothing and keeps it in
const closed = (text: string) => /[-_]$/.test(text) ? `${text}A` : text;

// What the params say whatever their order is: only the params of one key, the rows of a list, keep theirs
const said = (params: Iterable<[string, string]>) => JSON.stringify([...params]
	.map(([key, value]) => [key, key == 'sw' ? value.split(',').sort().join() : value])
	.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));

// The console a link is of, whichever way the link names it
export function hardwareOf(params: URLSearchParams, hardware: string[]): string | undefined {
	const code = consoleCode(params.get('h') ?? '');
	return params.get('hw') ?? (code === undefined ? undefined : hardware[Math.floor(code / 256)]);
}

// The params of a link packed into the ones of a short link. What has no number yet stays spelled: the console with its
// system version and the software as the params they are, a key or a word inside its record
export function shorten(params: Params, link: LinkCodes): Params {
	const value = (key: string) => params.find(param => param[0] == key)?.[1] ?? '';
	const short: Params = [];

	// The console takes the bits above the eight of its system version
	const hardware = index(link.hardware).codes.get(value('hw'));
	const firmware = index(link.firmware).codes.get(value(link.firmwareKey));
	if (hardware !== undefined && firmware !== undefined && firmware < 256) short.push(['h', digits(hardware * 256 + firmware)]);
	else short.push(...params.filter(([key]) => key == 'hw' || key == link.firmwareKey));

	const software = value('sw').split(',').filter(Boolean).map(id => index(link.software).codes.get(id));
	if (params.some(([key]) => key == 'sw') && !software.includes(undefined)) short.push(['s', closed(mask(software as number[]))]);
	else short.push(...params.filter(([key]) => key == 'sw'));

	// Everything else goes into the param of what it sets up, the params in the order of their lists.
	// A param with no list to number its keys yet stays spelled
	const options = params.filter(([key]) => !['hw', link.firmwareKey, 'sw'].includes(key));
	const places = options.map(([key]) => [link.paramOf(key)].find(param => param !== undefined && Object.hasOwn(link.keys, param)));
	for (const [param, keys] of Object.entries(link.keys)) {
		const records = options.filter((option, at) => places[at] == param);
		if (records.length > 0) short.push([param, closed(pack(records, keys, link.words))]);
	}
	short.push(...options.filter((option, at) => places[at] === undefined));

	// A short link is read back before it is given out: one that would say anything else stays spelled in full
	return said(expand(new URLSearchParams(short), link)) == said(params) ? short : params;
}

// Params of a link spelled in full, whichever way the link spells them. What it spells in full wins over what it packs,
// so a short link can be amended by hand
export function expand(params: URLSearchParams, link: LinkCodes): URLSearchParams {
	const full: Params = [];
	const add = (key: string, value: string | undefined) => {
		if (value !== undefined && !params.has(key)) full.push([key, value]);
	};

	for (const [key, value] of params) {
		if (key == 'h') {
			// A console spelled in full comes with a system version of its own
			const code = consoleCode(value);
			if (code !== undefined && !params.has('hw') && link.hardware[Math.floor(code / 256)] !== undefined) {
				add('hw', link.hardware[Math.floor(code / 256)]);
				add(link.firmwareKey, link.firmware[code % 256]);
			}
		} else if (key == 's') {
			if (PACKED.test(value)) add('sw', unmask(value, link.software).join(','));
		} else if (Object.hasOwn(link.keys, key)) {
			if (PACKED.test(value)) unpack(value, link.keys[key], link.words).forEach(([name, text]) => add(name, text));
		} else {
			full.push([key, value]);
		}
	}
	return new URLSearchParams(full);
}

// Ids links would name by a number and have none for yet. The ones used more come first: lower numbers take fewer characters.
// A number is said as it is, and what a cell of a table would not keep stays a text
export function unnumbered(ids: string[], numbered: string[]): string[] {
	const uses = new Map<string, number>();
	for (const id of ids) uses.set(id, (uses.get(id) ?? 0) + 1);
	return [...uses.keys()]
		.filter(id => !numbered.includes(id) && id != '' && id.trim() == id && !/[\t\r\n"]/.test(id) && !NUMBER.test(id))
		.sort((a, b) => uses.get(b)! - uses.get(a)!);
}
