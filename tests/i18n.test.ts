import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { LANGUAGES, I18N } from '@i18n';

// The page reads its texts by the Translation type, but the compiler cannot hold YAML to a type.
// So the compiler is asked what the type expects, and the texts of every language are held to that
function declaredTranslation() {
	const config = ts.getParsedCommandLineOfConfigFile('tsconfig.json', {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} })!;
	const program = ts.createProgram(['i18n/types.ts'], config.options);
	const checker = program.getTypeChecker();
	const module = checker.getSymbolAtLocation(program.getSourceFile('i18n/types.ts')!)!;
	const translation = checker.getExportsOfModule(module).find(symbol => symbol.name == 'Translation')!;
	return { checker, type: checker.getDeclaredTypeOfSymbol(translation) };
}

const DECLARED = declaredTranslation();

const isText = (type: ts.Type): boolean => type.isUnion() ? type.types.every(isText) : !!(type.flags & ts.TypeFlags.StringLike);

// Where the texts depart from the type: a text it asks for is missing, or it knows nothing of a text.
// Sections with any keys, such as the components of a catalog, are held to the type of their items
function mismatches(declared: ts.Type, value: unknown, path: string): string[] {
	const { checker } = DECLARED;
	const type = checker.getNonNullableType(declared);
	if (isText(type)) return typeof value === 'string' ? [] : [`${path}: not a text`];
	if (!value || typeof value !== 'object') return [`${path}: not a section`];

	const section = value as Record<string, unknown>;
	const properties = checker.getPropertiesOfType(type);
	const names = new Set(properties.map(property => property.name));
	const items = checker.getIndexTypeOfType(type, ts.IndexKind.String);
	return [
		...properties.flatMap(property => property.name in section
			? mismatches(checker.getTypeOfSymbol(property), section[property.name], `${path}.${property.name}`)
			: property.flags & ts.SymbolFlags.Optional ? [] : [`${path}.${property.name}: missing`]),
		...Object.keys(section).filter(key => !names.has(key)).flatMap(key => items
			? mismatches(items, section[key], `${path}.${key}`)
			: [`${path}.${key}: unknown`])
	];
}

// Every text with its path: `pages.hardware.size`
function texts(node: object, path = ''): [string, string][] {
	return Object.entries(node).flatMap(([key, value]): [string, string][] => typeof value === 'string'
		? [[`${path}${key}`, value]]
		: texts(value, `${path}${key}.`));
}

// Paths of the texts with the placeholders they fill: `pages.hardware.size {height} {width}`
const shape = (node: object) => texts(node)
	.map(([path, text]) => [path, ...[...text.matchAll(/\{(\w+)\}/g)].map(match => `{${match[1]}}`).sort()].join(' '))
	.sort();

describe('texts', () => {
	it.each(LANGUAGES)('give the page everything it reads in %s and nothing it does not', lang => {
		expect(mismatches(DECLARED.type, I18N[lang], lang)).toEqual([]);
	});

	// The type leaves the names of components, options and values open, there the English texts tell what every language has to say
	it.each(LANGUAGES.filter(lang => lang != 'en'))('say in %s what they say in English, with the same placeholders', lang => {
		expect(shape(I18N[lang])).toEqual(shape(I18N.en));
	});

	it.each(LANGUAGES)('leave no text of %s empty', lang => {
		expect(texts(I18N[lang]).filter(([, text]) => text.trim() == '').map(([path]) => path)).toEqual([]);
	});
});
