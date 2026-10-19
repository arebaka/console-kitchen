// Gives a number to everything links name that has none yet: consoles, system versions, components, the words of the values
// and the params, which are numbered apart for every param of a short link they are packed into. Short links name things by
// these numbers, so a number is never changed, taken back or given again: rows of data/**/link.tsv are only added,
// and the row of what the catalog no longer has stays.
//
// Usage: bun run number

import { readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'vite';

// Adds the ids without a number to the table, each list numbered on from its last number
async function numberTable(file, lists, unnumbered) {
	const [header, ...lines] = (await readFile(file, 'utf8')).trimEnd().split('\n');
	const rows = lines.map(line => line.split('\t')).map(([list, code, id]) => ({ list, code: Number(code), id }));
	const added = [];
	for (const [list, ids] of Object.entries(lists)) {
		const numbered = rows.filter(row => row.list == list);
		let next = Math.max(-1, ...numbered.map(row => row.code)) + 1;
		for (const id of unnumbered(ids, numbered.map(row => row.id))) {
			rows.push({ list, code: next++, id });
			added.push(`${list} ${id}`);
		}
	}
	// The rows of a list stay together, a new list comes after the ones there are
	const order = [...new Set(rows.map(row => row.list))];
	rows.sort((a, b) => order.indexOf(a.list) - order.indexOf(b.list) || a.code - b.code);
	if (added.length > 0) {
		await writeFile(file, `${[header, ...rows.map(row => [row.list, row.code, row.id].join('\t'))].join('\n')}\n`);
	}
	return added;
}

// The catalogs are read the way the page reads them
const server = await createServer({ appType: 'custom', logLevel: 'error', server: { middlewareMode: true, hmr: false, watch: null } });
try {
	const { unnumbered } = await server.ssrLoadModule('/src/link.ts');
	const { HARDWARE } = await server.ssrLoadModule('/data/index.ts');
	const { PLATFORM_IDS } = await server.ssrLoadModule('/src/state.ts');
	const tables = [
		['data/link.tsv', { hardware: HARDWARE.map(hw => hw.id) }],
		...await Promise.all(PLATFORM_IDS.map(async platform => {
			const { keys, ...lists } = (await server.ssrLoadModule(`/src/platforms/${platform}/url.ts`)).vocabulary();
			return [`data/${platform}/link.tsv`, { ...lists, ...keys }];
		}))
	];
	for (const [path, lists] of tables) {
		const added = await numberTable(new URL(`../${path}`, import.meta.url), lists, unnumbered);
		console.log(`${path}: ${added.length > 0 ? `numbered ${added.join(', ')}` : 'nothing to number'}`);
	}
} finally {
	await server.close();
}
