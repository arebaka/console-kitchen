import { describe, expect, it } from 'vitest';

import {
	cellValues,
	compareVersions,
	listRow,
	listRows,
	pickedCell,
	pickedValues,
} from '@/data';
import {
	cellOf,
	compact,
	flag,
	list,
	number,
	oneOf,
	requirement,
	text,
} from '@/parse';
import { isObject } from '@/utils';

describe('cells of tables', () => {
	it('are read as their columns spell them, an empty one as nothing', () => {
		expect(text('')).toBeUndefined();
		expect(text('0')).toBe('0');
		expect(text(' ')).toBe(' ');
		expect(number('0')).toBe(0);
		expect(number('-1.5')).toBe(-1.5);
		expect(flag('1')).toBe(true);
		expect(flag('0')).toBe(false);
		expect(flag('')).toBe(false);
		expect(list('a,b')).toEqual(['a', 'b']);
		expect(list('')).toBeUndefined();
		expect(requirement('a|b')).toEqual(['a', 'b']);
		expect(requirement('a')).toBe('a');
	});

	it('stop the build at a cell its column does not allow', () => {
		expect(() => number('')).toThrow('Not a number');
		expect(() => number('1x')).toThrow('Not a number');
		expect(() => flag('yes')).toThrow('Not a flag');
		expect(oneOf(['stable', 'dead'], 'dead')).toBe('dead');
		expect(() => oneOf(['stable', 'dead'], 'Dead')).toThrow(
			'Not one of stable, dead: "Dead"',
		);
		expect(() => oneOf(['stable'], undefined)).toThrow('Not one of');
	});

	it('come from a column every row has, an empty cell too', () => {
		expect(cellOf({ name: '' }, 'name')).toBe('');
		expect(() => cellOf({ name: 'x' }, 'title')).toThrow(
			'No column title in the table',
		);
	});

	it('leave out the keys they have no values for, and the object they come from as it is', () => {
		const row = { a: 1, b: undefined, c: '', d: false };
		expect(Object.keys(compact(row))).toEqual(['a', 'c', 'd']);
		expect(Object.keys(row)).toEqual(['a', 'b', 'c', 'd']);
	});
});

describe('rows of lists', () => {
	it('fill the fields a row lacks and leave the sign to the last one', () => {
		expect(listRow('host', 3)).toEqual(['host', '', '']);
		expect(listRow('a=b=c=d', 3)).toEqual(['a', 'b', 'c=d']);
		expect(listRow('', 1)).toEqual(['']);
	});

	it('are worth writing only with a name', () => {
		expect(
			listRows([
				['a', '1'],
				['', '2'],
				[' ', '3'],
				['b', ''],
			]),
		).toEqual([
			['a', '1'],
			['b', ''],
		]);
		expect(listRows(undefined)).toEqual([]);
		expect(listRows('a')).toEqual([]);
	});

	it('hold several values of a field joined in its order', () => {
		const field = { id: 'combo', values: ['ZL', 'ZR', 'A'], max: 2 };
		expect(cellValues('')).toEqual([]);
		expect(cellValues('ZL+A')).toEqual(['ZL', 'A']);
		expect(pickedCell(field, ['A', 'ZL'])).toBe('ZL+A');
		expect(pickedCell(field, [])).toBe('');
		// Values the field lacks, twice the same and more than it takes
		expect(pickedCell(field, ['B'])).toBeUndefined();
		expect(pickedCell(field, ['A', 'A'])).toBeUndefined();
		expect(pickedCell(field, ['ZL', 'ZR', 'A'])).toBeUndefined();
		// A field takes one value unless it says more
		expect(
			pickedCell({ id: 'one', values: ['a', 'b'] }, ['a', 'b']),
		).toBeUndefined();
	});
});

describe('values of options', () => {
	it('of a multiselect are its words, and none of anything else', () => {
		expect(pickedValues(['a', 'b'])).toEqual(['a', 'b']);
		expect(pickedValues('a')).toEqual([]);
		expect(pickedValues(undefined)).toEqual([]);
		expect(pickedValues([['a']])).toEqual([]);
	});
});

describe('versions', () => {
	it('compare part by part as numbers, a missing part as zero', () => {
		expect(compareVersions('10.0.0', '9.2.0')).toBe(1);
		expect(compareVersions('1.2', '1.2.0')).toBe(0);
		expect(compareVersions('1.2.0', '1.2.1')).toBe(-1);
		expect(compareVersions('6.61', '6.60')).toBe(1);
	});
});

describe('parsed JSON', () => {
	it('is an object of keys only as an object', () => {
		expect(isObject({})).toBe(true);
		expect(isObject([])).toBe(false);
		expect(isObject(null)).toBe(false);
		expect(isObject('{}')).toBe(false);
	});
});
