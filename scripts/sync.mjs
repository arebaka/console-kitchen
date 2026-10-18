// Refreshes the catalogs of every platform from the Homebrew App Store and GitHub: versions, sizes, release dates,
// the fresher source of every component, logos and the files every component puts onto the card.
// Maps HOS versions to the Atmosphere releases supporting them. Then numbers what is new for short links, as bun run number does.
//
// Usage: bun run sync                  GITHUB_TOKEN or a logged in gh CLI lifts the GitHub API limit
//        bun run sync --logos          downloads logos again, even the existing ones
//        bun run sync --files          only lists the files of the components again, the rest of the catalogs stays

import { readFile, writeFile, readdir, stat, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const APPSTORE = 'https://switch.cdn.fortheusers.org';
const SWITCHBREW_VERSIONS = 'https://switchbrew.org/wiki/System_Versions';

// Every platform keeps its catalog in data/<platform> and the logos of its components in public/logos/<platform>
const CATALOGS = ['switch', 'psp'].map(platform => ({
	platform,
	software: new URL(`../data/${platform}/software/index.tsv`, import.meta.url),
	sources: new URL(`../data/${platform}/software/sources.yaml`, import.meta.url),
	files: new URL(`../data/${platform}/software/files.tsv`, import.meta.url),
	tuning: new URL(`../data/${platform}/tuning/`, import.meta.url),
	logos: new URL(`../public/logos/${platform}/`, import.meta.url)
}));
const FIRMWARE = new URL('../data/switch/firmware.tsv', import.meta.url);

const MAX_ICON_SOURCE = 40 * 1024 * 1024; // archives bigger than this are not downloaded for an icon
const STUB_LOGO = 1024; // logos smaller than this are placeholders
const DEFAULT_ICON = 'a9f3fdc1312063579bee0fdf91cb79ed75804457'; // SHA-1 of the gray console with a question mark libnx gives homebrew without an icon

const REFRESH_LOGOS = process.argv.includes('--logos');
const FILES_ONLY = process.argv.includes('--files');
const TOKEN = process.env.GITHUB_TOKEN || ghToken();

// What archives leave on the card besides their files, the installers remove it
const LEFTOVERS = ['LICENSE.txt', 'README.txt', 'README.md', 'CHANGELOG.md', 'screen1.png', 'screen2.png', 'switch/breeze/.Breeze.nro.star'];

function ghToken() {
	try {
		return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
	} catch {
		return '';
	}
}

async function request(url, headers = {}) {
	const response = await fetch(url, { headers: { 'User-Agent': 'console-kitchen-sync', ...headers } });
	if (!response.ok) {
		throw new Error(`${response.status} ${url}`);
	}
	return response;
}

const github = async (path) => (await request(`https://api.github.com/${path}`, {
	Accept: 'application/vnd.github+json',
	...(TOKEN && { Authorization: `Bearer ${TOKEN}` })
})).json();

const download = async (url) => Buffer.from(await (await request(url)).arrayBuffer());

// Size of a download in bytes, 0 when the server does not tell. Some servers, such as the one of Sony, only tell it for a part.
// Compression is declined: asked for it, a server answers with the length of a packed empty body
async function contentLength(url) {
	const headers = { 'Accept-Encoding': 'identity' };
	try {
		const head = await fetch(url, { method: 'HEAD', headers });
		const length = head.ok ? Number(head.headers.get('content-length')) : 0;
		if (length) return length;
		const part = await fetch(url, { headers: { ...headers, Range: 'bytes=0-0' } });
		await part.body?.cancel();
		return part.ok ? Number(part.headers.get('content-range')?.split('/')[1]) || 0 : 0;
	} catch {
		return 0;
	}
}

// Numeric part of a version, v1.25.1 → [1, 25, 1]. Dates such as 12/02/2025 are not versions
function parseVersion(version) {
	const match = !/\d+\/\d+\/\d+/.test(version) && String(version).match(/\d+(?:\.\d+)*/);
	return match ? match[0].split('.').map(Number) : null;
}

function compareVersions(a, b) {
	const [x, y] = [parseVersion(a), parseVersion(b)];
	if (!x || !y) return 0;
	for (let i = 0; i < Math.max(x.length, y.length); i++) {
		const difference = (x[i] ?? 0) - (y[i] ?? 0);
		if (difference) return Math.sign(difference);
	}
	return 0;
}

// App Store dates are dd/mm/yyyy
const storeDate = (date) => date.split('/').reverse().join('-');

// Equal or unknown versions are decided by the release date, the App Store wins a tie
function pickSource(component, store, release) {
	if (!release) return 'appstore';
	if (!store) return 'github';
	return (compareVersions(store.version, release.version) || (store.date >= release.date ? 1 : -1)) > 0 ? 'appstore' : 'github';
}

// Icon from the asset section of a homebrew executable (.nro, .ovl), the default one of libnx tells nothing about it
function nroIcon(buffer) {
	if (buffer.length < 0x20 || buffer.toString('ascii', 0x10, 0x14) != 'NRO0') return null;
	const assets = buffer.readUInt32LE(0x18);
	if (buffer.length < assets + 0x18 || buffer.toString('ascii', assets, assets + 4) != 'ASET') return null;
	const offset = Number(buffer.readBigUInt64LE(assets + 8));
	const size = Number(buffer.readBigUInt64LE(assets + 16));
	const icon = size ? buffer.subarray(assets + offset, assets + offset + size) : null;
	return icon && createHash('sha1').update(icon).digest('hex') != DEFAULT_ICON ? icon : null;
}

// ICON0.PNG of a PSP executable (EBOOT.PBP): the header holds the offsets of its eight files, the icon is the second one
function pbpIcon(buffer) {
	if (buffer.length < 0x28 || buffer.toString('hex', 0, 4) != '00504250') return null;
	const start = buffer.readUInt32LE(0x0c);
	const end = buffer.readUInt32LE(0x10);
	return end > start ? buffer.subarray(start, end) : null;
}

const executableIcon = (name, data) => /\.pbp$/i.test(name) ? pbpIcon(data) : nroIcon(data);

// Largest executable of an archive is the application itself, not a bundled helper
async function archiveIcon(buffer) {
	const zip = await JSZip.loadAsync(buffer);
	const executables = Object.values(zip.files)
		.filter(file => !file.dir && /\.(nro|ovl|pbp)$/i.test(file.name) && !/hbmenu|reboot_to/i.test(file.name));
	const sizes = await Promise.all(executables.map(async file => ({ file, data: await file.async('nodebuffer') })));
	sizes.sort((a, b) => b.data.length - a.data.length);
	for (const { file, data } of sizes) {
		const icon = executableIcon(file.name, data);
		if (icon) return icon;
	}
	return null;
}

// Assets named after an option of the component, such as a language, are looked up with its default
function assetPattern(item, options) {
	return new RegExp(item.asset.replace(/\{\{(\w+)\}\}/g, (match, id) => options.find(option => option.id == id)?.default ?? match));
}

async function findLogo(component, release, packages, options) {
	for (const name of component.sources.appstore ?? []) {
		try {
			return { data: await download(`${APPSTORE}/packages/${name}/icon.png`), extension: 'png' };
		} catch {}
	}

	const assets = (component.sources.github ?? [])
		.map(item => release?.assets.find(asset => assetPattern(item, options).test(asset.name)))
		.filter(asset => asset && asset.size < MAX_ICON_SOURCE && /\.(nro|ovl|pbp|zip)$/i.test(asset.name));
	const archives = packages
		.filter(pkg => pkg.filesize * 1024 < MAX_ICON_SOURCE)
		.map(pkg => `${APPSTORE}/zips/${pkg.name}.zip`);

	for (const url of [...assets.map(asset => asset.browser_download_url), ...archives]) {
		try {
			const data = await download(url);
			const icon = /\.zip$/i.test(url) ? await archiveIcon(data) : executableIcon(url, data);
			if (icon) return { data: icon, extension: icon[0] == 0x89 ? 'png' : 'jpg' };
		} catch {}
	}
	return null;
}

async function existingLogo(component, logos) {
	if (!component.logo) return false;
	try {
		return (await stat(new URL(component.logo, logos))).size >= STUB_LOGO;
	} catch {
		return false;
	}
}

// A table is the names of its columns, then a row per line, cells separated by tabs
async function readTable(url) {
	const [header, ...lines] = (await readFile(url, 'utf8')).trimEnd().split('\n');
	const columns = header.split('\t');
	const rows = lines.map(line => {
		const cells = line.split('\t');
		return Object.fromEntries(columns.map((column, index) => [column, cells[index] ?? '']));
	});
	return { columns, rows };
}

// Cells left empty at the end of a row are not written, like in the hand written data
const writeTable = (url, columns, rows) => writeFile(url, [columns, ...rows.map(row => columns.map(column => String(row[column] ?? '').replace(/[\t\r\n]+/g, ' ')))]
	.map(cells => cells.join('\t').trimEnd())
	.join('\n') + '\n');

// Sources of the components by id, a single App Store package, asset or download may go without a list
async function readSources(file) {
	const many = (value) => value === undefined ? undefined : [].concat(value);
	return Object.fromEntries(Object.entries(Bun.YAML.parse(await readFile(file, 'utf8')) ?? {})
		.map(([id, { appstore, github, url, ...rest }]) => [id, { appstore: many(appstore), github: many(github), url: many(url), ...rest }]));
}

// Options of the config of a component, when it has a table of them
async function readOptions(directory, id) {
	try {
		return (await readTable(new URL(`${id}.tsv`, directory))).rows;
	} catch {
		return [];
	}
}

// Packages of the Homebrew App Store by name, fetched once for every catalog that uses the store
let storePackages;
async function appStore() {
	storePackages ??= Object.fromEntries((await (await request(`${APPSTORE}/repo.json`)).json()).packages.map(pkg => [pkg.name, pkg]));
	return storePackages;
}

async function syncSoftware({ platform, software: SOFTWARE, sources: SOURCES, tuning: TUNING, logos: LOGOS }) {
	const { columns, rows: software } = await readTable(SOFTWARE);
	const sources = await readSources(SOURCES);
	for (const component of software) {
		component.sources = sources[component.id] ?? {};
	}
	const store = software.some(component => component.sources.appstore) ? await appStore() : {};
	const releases = new Map();
	// A rolling release such as `latest` keeps its tag: its version is in the notes, its date is the last upload
	const release = async (repo) => {
		if (!releases.has(repo)) {
			const latest = await github(`repos/${repo}/releases/latest`);
			releases.set(repo, {
				version: /\d/.test(latest.tag_name) ? latest.tag_name : latest.body?.match(/\d+\.\d+(?:\.\d+)*/)?.[0] ?? latest.tag_name,
				date: [latest.published_at, ...latest.assets.map(asset => asset.updated_at)].sort().at(-1).slice(0, 10),
				assets: latest.assets
			});
		}
		return releases.get(repo);
	};

	const problems = [];
	for (const component of software) {
		const { appstore = [], github: items = [], url = [] } = component.sources;
		const options = await readOptions(TUNING, component.id);
		const packages = appstore.map(name => store[name]).filter(Boolean);
		if (packages.length < appstore.length) {
			problems.push(`${component.id}: no App Store package ${appstore.filter(name => !store[name]).join(', ')}`);
		}
		// The store lists sizes rounded down to KiB, the archives themselves tell the exact ones
		const storeInfo = packages.length == appstore.length && packages.length > 0
			? {
				version: packages.at(-1).version,
				date: storeDate(packages.at(-1).updated),
				size: (await Promise.all(packages.map(async pkg => await contentLength(`${APPSTORE}/zips/${pkg.name}.zip`) || pkg.filesize * 1024)))
					.reduce((sum, size) => sum + size, 0)
			}
			: null;

		let releaseInfo = null;
		if (items.length) {
			const matched = [];
			for (const item of items) {
				const info = await release(item.repo);
				const asset = info.assets.find(asset => assetPattern(item, options).test(asset.name));
				if (!asset) problems.push(`${component.id}: no asset ${item.asset} in ${item.repo} ${info.version}`);
				else matched.push(asset);
			}
			const main = await release(items[0].repo);
			releaseInfo = { ...main, size: matched.reduce((sum, asset) => sum + asset.size, 0) };
		}

		if (storeInfo || releaseInfo) {
			const source = pickSource(component, storeInfo, releaseInfo);
			const chosen = source == 'appstore' ? storeInfo : releaseInfo;
			Object.assign(component, { source, version: chosen.version.replace(/^v(?=\d)/, ''), size: chosen.size, released: chosen.date });
		} else if (url.length) {
			// A server that does not tell the size leaves the known one
			const sizes = await Promise.all(url.map(item => contentLength(item.url)));
			Object.assign(component, { source: 'url', size: sizes.reduce((a, b) => a + b, 0) || component.size });
		} else {
			component.source = component.sources.bundled ? 'bundled' : 'manual';
		}

		if (REFRESH_LOGOS || !(await existingLogo(component, LOGOS))) {
			const logo = await findLogo(component, items.length ? await release(items[0].repo) : null, packages, options);
			if (logo) {
				component.logo = `${component.id}.${logo.extension}`;
				await writeFile(new URL(component.logo, LOGOS), logo.data);
			} else if (!(await existingLogo(component, LOGOS))) {
				component.logo = '';
			}
		}

		const { id, source, version, released } = component;
		console.log(`${platform.padEnd(7)} ${id.padEnd(24)} ${String(source).padEnd(9)} ${String(version).padEnd(14)} ${released ?? ''}${component.logo ? '' : '  (no logo)'}`);
	}

	// Placeholders nobody refers to any more
	const logos = new Set(software.map(component => component.logo).filter(Boolean));
	for (const file of await readdir(LOGOS)) {
		const path = new URL(file, LOGOS);
		if (!logos.has(file) && (await stat(path)).size < STUB_LOGO) await unlink(path);
	}

	await writeTable(SOFTWARE, columns, software);
	return problems;
}

// A part of a download, from byte `start` to byte `end`
async function range(url, start, end) {
	const response = await request(url, { Range: `bytes=${start}-${end}`, 'Accept-Encoding': 'identity' });
	const data = Buffer.from(await response.arrayBuffer());
	// A server that does not take ranges sends the whole file
	return response.status == 200 ? data.subarray(start, end + 1) : data;
}

// Names of the files of a zip from its central directory, which the end of the archive points to, the size of the zip
// asked for when it is not known. GitHub does not take a range counted from the end.
// ZIP64 keeps the place of the directory in a record of its own, a locator right before the end tells where
async function zipEntries(url, known) {
	const total = known || await contentLength(url);
	if (!total) throw new Error(`no size of ${url}`);
	const tail = await range(url, Math.max(0, total - 66000), total - 1);
	const end = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
	if (end < 0) throw new Error(`no central directory in ${url}`);
	let size = tail.readUInt32LE(end + 12);
	let offset = tail.readUInt32LE(end + 16);
	if (size == 0xffffffff || offset == 0xffffffff) {
		const record = Number(tail.readBigUInt64LE(end - 20 + 8));
		const zip64 = await range(url, record, record + 55);
		size = Number(zip64.readBigUInt64LE(40));
		offset = Number(zip64.readBigUInt64LE(48));
	}
	const directory = await range(url, offset, offset + size - 1);
	const names = [];
	for (let at = 0; at + 46 <= directory.length && directory.readUInt32LE(at) == 0x02014b50;) {
		const length = directory.readUInt16LE(at + 28);
		// Names are UTF-8 with the flag for it, the old code page otherwise, which plain ASCII names read the same in
		names.push(directory.toString(directory.readUInt16LE(at + 8) & 0x800 ? 'utf8' : 'latin1', at + 46, at + 46 + length));
		at += 46 + length + directory.readUInt16LE(at + 30) + directory.readUInt16LE(at + 32);
	}
	return names;
}

// Names of the files of a tar from the headers of its entries, each read by itself, the data between them skipped.
// Long names come in an entry of their own before their file, as GNU tar writes them, or in a pax header
async function tarEntries(url) {
	const names = [];
	let longName;
	for (let offset = 0; ;) {
		const header = await range(url, offset, offset + 511);
		if (header.length < 512 || header.every(byte => byte == 0)) break;
		const field = (start, length) => header.toString('utf8', start, start + length).replace(/\0[\s\S]*$/, '');
		const size = parseInt(field(124, 12).trim() || '0', 8);
		const type = field(156, 1);
		const data = async () => (await range(url, offset + 512, offset + 512 + size - 1)).toString('utf8');
		if (type == 'L') {
			longName = (await data()).replace(/\0[\s\S]*$/, '');
		} else if (type == 'x') {
			longName = (await data()).match(/^\d+ path=(.*)$/m)?.[1] ?? longName;
		} else {
			const prefix = field(257, 5) == 'ustar' ? field(345, 155) : '';
			const name = longName ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
			longName = undefined;
			if (type == '0' || type == '') names.push(name);
		}
		offset += 512 + Math.ceil(size / 512) * 512;
	}
	return names;
}

// What the sources of a component put onto the card, the way the installers lay them out: every App Store package
// and every asset or download, whichever source a build takes, so a card installed from any of them is recognized
async function componentFiles(component, release, options) {
	const files = new Set();
	const add = (names, root = '', into = '') => {
		for (const name of names.map(name => name.replace(/\\/g, '/').replace(/^\.\//, ''))) {
			if (name.endsWith('/') || (root && !name.startsWith(`${root}/`))) continue;
			const path = `${into ? `${into}/` : ''}${root ? name.slice(root.length + 1) : name}`;
			if (!LEFTOVERS.includes(path)) files.add(path);
		}
	};
	for (const name of component.sources.appstore ?? []) {
		add((await zipEntries(`${APPSTORE}/zips/${name}.zip`)).filter(entry => entry != 'manifest.install' && entry != 'info.json'));
	}
	for (const item of component.sources.github ?? []) {
		const asset = (await release(item.repo)).assets.find(asset => assetPattern(item, options).test(asset.name));
		if (!asset) continue;
		if (item.path) files.add(item.path);
		else if (item.strip !== undefined) add((await tarEntries(asset.browser_download_url)).map(name => name.split('/').slice(item.strip).join('/')).filter(Boolean));
		else add(await zipEntries(asset.browser_download_url, asset.size), item.root, item.into);
	}
	for (const item of component.sources.url ?? []) {
		if (item.path) files.add(item.path);
		else add(await zipEntries(item.url), item.root, item.into);
	}
	return [...files].sort();
}

// The files of every component of a catalog, a row per file. They tell a card what is installed on it
// and an update what to remove with a component
async function listSoftware({ platform, software: SOFTWARE, sources: SOURCES, files: FILES, tuning: TUNING }) {
	const { rows: software } = await readTable(SOFTWARE);
	const sources = await readSources(SOURCES);
	const releases = new Map();
	const release = async (repo) => {
		if (!releases.has(repo)) releases.set(repo, await github(`repos/${repo}/releases/latest`));
		return releases.get(repo);
	};
	// A component whose release cannot be read now keeps the files it had
	const previous = (await readTable(FILES).catch(() => ({ rows: [] }))).rows;
	const rows = [];
	const problems = [];
	for (const component of software) {
		component.sources = sources[component.id] ?? {};
		try {
			const files = await componentFiles(component, release, await readOptions(TUNING, component.id));
			rows.push(...files.map(path => ({ id: component.id, path })));
			console.log(`${platform.padEnd(7)} ${component.id.padEnd(24)} ${files.length} files`);
		} catch (error) {
			rows.push(...previous.filter(row => row.id == component.id));
			problems.push(`${component.id}: no files, ${error.message}`);
		}
	}
	await writeTable(FILES, ['id', 'path'], rows);
	return problems;
}

// Every HOS version maps to the first Atmosphere release that supports it or an older version of the same line
async function syncFirmware() {
	const { columns, rows: firmware } = await readTable(FIRMWARE);

	const support = [];
	for (let page = 1; ; page++) {
		const releases = await github(`repos/Atmosphere-NX/Atmosphere/releases?per_page=100&page=${page}`);
		for (const release of releases) {
			const own = (release.body ?? '').split('And the following was changed in')[0];
			for (const [, hos] of own.matchAll(/[Ss]upport was added for (\d+\.\d+\.\d+)/g)) {
				support.push({ hos, atmosphere: release.tag_name, date: release.published_at.slice(0, 10) });
			}
		}
		if (releases.length < 100) break;
	}
	// Several releases may mention the same version, the earliest one added the support
	support.sort((a, b) => compareVersions(a.hos, b.hos) || b.date.localeCompare(a.date));

	const page = await (await request(SWITCHBREW_VERSIONS, { 'User-Agent': 'Mozilla/5.0' })).text();
	const released = new Map();
	for (const [, row] of page.matchAll(/<tr>(.*?)<\/tr>/gs)) {
		const cells = [...row.matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gs)].map(([, cell]) => cell.replace(/<[^>]+>/g, '').trim());
		if (/^\d+\.\d+\.\d+$/.test(cells[0] ?? '') && !isNaN(Date.parse(cells[1]))) {
			released.set(cells[0], new Date(`${cells[1].replace(/\s*\(UTC\)/, '')} UTC`).toISOString().slice(0, 10));
		}
	}

	const newest = firmware.reduce((max, entry) => compareVersions(entry.version, max) > 0 ? entry.version : max, '0.0.0');
	for (const [version, date] of released) {
		if (compareVersions(version, newest) > 0) {
			firmware.push({ version, date, status: 'stable' });
			console.log(`firmware: added ${version} released ${date}`);
		}
	}
	firmware.sort((a, b) => compareVersions(b.version, a.version));

	for (const entry of firmware) {
		const official = released.get(entry.version);
		if (isNaN(Date.parse(entry.date)) || /-00-/.test(entry.date)) {
			console.log(`firmware: ${entry.version} date ${entry.date} is invalid, using ${official}`);
			entry.date = official ?? entry.date;
		} else if (official && Math.abs(Date.parse(official) - Date.parse(entry.date)) > 24 * 60 * 60 * 1000) {
			// Switchbrew dates are UTC, a day off is the American evening of the same release
			console.log(`firmware: ${entry.version} date ${entry.date} differs from switchbrew ${official}`);
		}

		const supported = support.filter(item => compareVersions(item.hos, entry.version) <= 0).at(-1);
		entry.atmosphere = supported?.atmosphere;
		entry.supported = supported?.date;
	}
	for (const entry of firmware.filter(entry => compareVersions(entry.version, support.at(-1).hos) > 0)) {
		entry.atmosphere = entry.supported = undefined;
		console.log(`firmware: ${entry.version} is not supported by Atmosphere yet`);
	}

	await writeTable(FIRMWARE, columns, firmware);
}

const problems = [];
for (const catalog of CATALOGS) {
	if (!FILES_ONLY) problems.push(...await syncSoftware(catalog));
	problems.push(...await listSoftware(catalog));
}
if (!FILES_ONLY) {
	await syncFirmware();
	// What the catalogs got new, such as a system version, takes its number for short links
	execFileSync(process.execPath, [fileURLToPath(new URL('./number.mjs', import.meta.url))], { stdio: 'inherit' });
}

if (problems.length) {
	console.error(`\n${problems.join('\n')}`);
	process.exitCode = 1;
}
