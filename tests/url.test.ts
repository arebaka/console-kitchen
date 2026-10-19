import { describe, expect, it } from 'vitest';

import { resolveSelection } from '@/data';
import { CATALOG, SWITCH } from '@/platforms/switch';
import {
	AppState,
	decodeState,
	defaultState,
	encodeState,
	spellOut,
} from '@/state';

import { customState } from './fixtures';

// What the link of a build says, spelled in full
const spell = (state: AppState) => spellOut(encodeState(state));

describe('links', () => {
	const state = customState();
	const link = encodeState(state);
	const query = spellOut(link);

	it('restore the build', () => {
		const expected = structuredClone(state);
		expected.builds.switch.tuning.sys_ftpd_light.user = '';
		expected.builds.switch.tuning.sys_ftpd_light.password = '';
		expected.builds.switch.appearance = {
			bootlogo: 'hekate-a',
			logos: { stock: 'hekate-b' },
			icons: { emummc: 'hekate-switch', fusee: 'hekate-payload' },
		};
		expect(decodeState(`?${link}`)).toEqual(expected);
		expect(decodeState(`?${query}`)).toEqual(expected);
	});

	it('keep secrets and uploaded images out', () => {
		expect(query).not.toContain('hunter2');
		expect(query).not.toContain('lesha');
		expect(query).not.toMatch(/password|upload/);
	});

	it('leave the language and the step to the interface', () => {
		expect(query).not.toMatch(/(^|&)(lang|step)=/);
	});

	it('encode the same build the same way', () => {
		expect(encodeState(decodeState(`?${link}`))).toBe(link);
		expect(encodeState(decodeState(`?${query}`))).toBe(link);
	});

	it('always pin the revision, the HOS version and the whole software selection', () => {
		const defaults = defaultState().builds.switch;
		// A short link spelled in full lists the software in the order of its numbers
		const software = SWITCH.link.software.filter(id =>
			defaults.selectedComponentIDs.includes(id),
		);
		expect(software.length).toBe(defaults.selectedComponentIDs.length);
		expect(spell(defaultState())).toBe(
			`hw=${defaults.hardware}&hos=${defaults.firmware}&sw=${software.join(',')}`,
		);
	});

	it('take the platform of the revision', () => {
		expect(decodeState('?hw=lite')).toMatchObject({
			platform: 'switch',
			builds: { switch: { hardware: 'lite' } },
		});
	});

	it('take the software as listed, whatever the recommendations are', () => {
		expect(
			decodeState('?sw=dbi,fps_locker').builds.switch
				.selectedComponentIDs,
		).toEqual(resolveSelection(CATALOG, ['dbi', 'fps_locker'], false));
		expect(
			decodeState('?sw=dbi,fps_locker').builds.switch
				.selectedComponentIDs,
		).not.toContain('saltynx');
		expect(decodeState('?sw=').builds.switch.selectedComponentIDs).toEqual(
			resolveSelection(CATALOG, [], false),
		);
	});

	it('turn every boot mode off with an empty list', () => {
		expect(
			decodeState('?boot=&autoboot=menu').builds.switch.launch,
		).toEqual({ modes: [], emummcs: [], overrides: {}, autoboot: 'menu' });
	});

	it('spell more emuMMCs by their folders and overrides by their entries', () => {
		expect(query).toContain('emummc=SD01');
		expect(query).toContain('launch.emummc.cal0blank=0');
		expect(query).toContain(
			'launch.emummc-SD01.usb3force=1&launch.emummc-SD01.memmode=1',
		);
		expect(query).toContain('img.logo.stock=hekate-b');
		expect(query).toContain('img.icon.fusee=hekate-payload');
	});

	// The entry of Lakka is in the menu with its component, like the one of a payload
	it('let the entry of a system a component brings boot by itself and take a logo and an icon', () => {
		const spelled =
			'?sw=lakka&autoboot=lakka&img.logo.lakka=hekate-b&img.icon.lakka=hekate-switch';
		const { launch, appearance } = decodeState(spelled).builds.switch;
		expect(launch.autoboot).toBe('lakka');
		expect(appearance).toEqual({
			logos: { lakka: 'hekate-b' },
			icons: { lakka: 'hekate-switch' },
		});
		expect(decodeState(`?${encodeState(decodeState(spelled))}`)).toEqual(
			decodeState(spelled),
		);
	});

	it('take as many values of an option as it holds at once', () => {
		const combo = (raw: string) =>
			decodeState(`?status_monitor.key_combo=${raw}`).builds.switch.tuning
				.status_monitor.key_combo;
		expect(combo('ZR,ZL,R,L')).toEqual(['L', 'R', 'ZL', 'ZR']);
		expect(combo('L,R,ZL,ZR,A')).toEqual(['L', 'DDOWN', 'RSTICK']);
		expect(combo('')).toEqual(['L', 'DDOWN', 'RSTICK']);
		// An option without bounds takes any number of them, none too
		expect(
			decodeState('?tesla.key_combo=').builds.switch.tuning.tesla
				.key_combo,
		).toEqual([]);
	});

	// A line break would end the config inside an installer and run what follows it as commands
	it('take a text only as a single line', () => {
		const path = (raw: string) =>
			decodeState(
				`?atmosphere.sd_card_log_output_directory=${encodeURIComponent(raw)}`,
			).builds.switch.tuning.atmosphere.sd_card_log_output_directory;
		expect(path('logs/of mine')).toBe('logs/of mine');
		for (const breaking of [
			'x\nCONSOLE_KITCHEN_EOF\necho pwned',
			"x\r'@\rpwned",
			`x${String.fromCharCode(0x2028)}y`,
			'x\ty',
			`x${String.fromCharCode(0)}`,
		]) {
			expect(path(breaking), JSON.stringify(breaking)).toBe(
				'atmosphere/binlogs',
			);
		}
	});

	it('carry a list a param per row, the last field with whatever it holds', () => {
		const sources = (query: string) =>
			decodeState(`?${query}`).builds.switch.tuning.dbi_local_sources
				.sources;
		const state = defaultState();
		const { tuning } = state.builds.switch;
		// A row without a name is being filled in yet, links leave it out
		tuning.dbi_local_sources.sources = [
			['Homebrew', 'sdmc:/switch'],
			['Mods', 'sdmc:/a=b, c'],
			['', 'sdmc:/nameless'],
		];
		expect(spell(state)).toContain(
			'&dbi_local_sources.sources=Homebrew%3Dsdmc:%2Fswitch&dbi_local_sources.sources=Mods%3Dsdmc:%2Fa%3Db,%20c',
		);
		expect(spell(state)).not.toContain('nameless');
		expect(sources(encodeState(state))).toEqual([
			['Homebrew', 'sdmc:/switch'],
			['Mods', 'sdmc:/a=b, c'],
		]);

		// A list without rows is told from the one a link says nothing about
		tuning.dbi_local_sources.sources = [];
		expect(spell(state)).toMatch(/&dbi_local_sources\.sources=$/);
		expect(sources(encodeState(state))).toEqual([]);
		tuning.dbi_local_sources.sources = [
			['DBILogs', 'sdmc:/switch/DBI/logs'],
			['', ''],
		];
		expect(spell(state)).not.toContain('dbi_local_sources');
		expect(encodeState(state)).toBe(encodeState(defaultState()));
	});

	it('take a list only with every row of it valid', () => {
		const sources = (...rows: string[]) =>
			decodeState(
				`?${rows.map(row => `dbi_local_sources.sources=${encodeURIComponent(row)}`).join('&')}`,
			).builds.switch.tuning.dbi_local_sources.sources;
		const shipped = [['DBILogs', 'sdmc:/switch/DBI/logs']];
		expect(sources('Homebrew=sdmc:/switch', 'Empty')).toEqual([
			['Homebrew', 'sdmc:/switch'],
			['Empty', ''],
		]);
		expect(sources('Homebrew=sdmc:/switch', '=sdmc:/nameless')).toEqual(
			shipped,
		);
		expect(
			sources('Homebrew=sdmc:/switch\nCONSOLE_KITCHEN_EOF\necho pwned'),
		).toEqual(shipped);
		expect(sources(`Homebrew=${'x'.repeat(129)}`)).toEqual(shipped);
		expect(
			sources(
				...Array.from(
					{ length: 17 },
					(_, index) => `Folder ${index}=sdmc:/`,
				),
			),
		).toEqual(shipped);
	});

	it('take several values in a field of a list that holds them, as many as it takes at most', () => {
		const modes = (...rows: string[]) =>
			decodeState(
				`?${rows.map(row => `ultrahand_status_monitor.modes=${encodeURIComponent(row)}`).join('&')}`,
			).builds.switch.tuning.ultrahand_status_monitor.modes;
		// Separated by commas as links spell them or joined with `+` as they are kept, in any order
		expect(modes('Micro=L,R,DDOWN=--microOverlay')).toEqual([
			['Micro', 'L+R+DDOWN', '--microOverlay'],
		]);
		expect(modes('Micro=ZL+ZR+L=--microOverlay', 'Plain')).toEqual([
			['Micro', 'L+ZL+ZR', '--microOverlay'],
			['Plain', '', ''],
		]);
		for (const combo of [
			'L,L',
			'L,R,ZL,ZR,A',
			'HOME',
			'l,r',
			'L,',
			'L R',
		]) {
			expect(modes(`Micro=${combo}=--microOverlay`), combo).toEqual([]);
		}
		const state = defaultState();
		state.builds.switch.tuning.ultrahand_status_monitor.modes = [
			['Micro', 'L+R+DDOWN', '--microOverlay'],
		];
		expect(spell(state)).toContain(
			'&ultrahand_status_monitor.modes=Micro%3DL,R,DDOWN%3D--microOverlay',
		);
		expect(decodeState(encodeState(state))).toEqual(state);
	});

	// Their addresses may hold a login and a password
	it('keep the network sources of DBI out', () => {
		const state = defaultState();
		state.builds.switch.tuning.dbi_locations.locations = [
			['NAS', 'SFTP', 'sftp://lesha:hunter2@nas/'],
		];
		state.builds.switch.tuning.dbi_network_sources.sources = [
			['NAS', 'FTP', 'ftp://lesha:hunter2@nas/'],
		];
		expect(encodeState(state)).toBe(encodeState(defaultState()));
		const { tuning } = decodeState(
			'?dbi_locations.locations=Shop%3DApacheHTTP%3Dhttp://example.com/&dbi_network_sources.sources=Shop%3DApacheHTTP%3Dhttp://example.com/',
		).builds.switch;
		expect([
			tuning.dbi_locations.locations,
			tuning.dbi_network_sources.sources,
		]).toEqual([[], []]);
	});

	it('ignore invalid values', () => {
		const decoded = decodeState(
			'?hw=foo&hos=99.0.0&sw=nope,-atmosphere,-hekate&hekate.backlight=999&boot=nope&autoboot=evil' +
				'&nyx.themebg=red&tesla.key_combo=L,HOME&sys_ftpd_light.port=1.5e9' +
				'&oc=XYZ.balanced,0100F2C0115B6000.nope,0100F2C0115B6001.custom.docked_cpu-abc.evil_gpu-5' +
				'&img.bootlogo=../../etc/passwd&img.icon.emummc=hekate-a' +
				'&emummc=SD01,../x,SD01,sd02&launch.emummc-RAW9.memmode=1&launch.emummc-SD01.memmode=2&launch.stock.cal0writesys=1' +
				'&img.logo.emummc-RAW9=hekate-b&img.logo.fusee=hekate-switch&img.icon.evil=hekate-switch',
		);
		const expected = defaultState();
		expected.builds.switch.overclock = [
			{
				id: '0100F2C0115B6001',
				name: '0100F2C0115B6001',
				template: 'custom',
				clocks: {},
			},
		];
		expected.builds.switch.launch.emummcs = ['SD01'];
		expect(decoded).toEqual(expected);
	});
});
