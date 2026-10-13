import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { HARDWARE, HARDWARE_CODES } from '@data';
import { expand, shorten, unnumbered } from '@/link';
import { PLATFORMS } from '@/platforms';
import { vocabulary as pspVocabulary } from '@/platforms/psp/url';
import { vocabulary as switchVocabulary } from '@/platforms/switch/url';
import { decodeState, defaultState, encodeState, spellOut } from '@/state';
import { BuildState, LinkCodes, PLATFORM_IDS, Vocabulary } from '@/types';
import { Params, query } from '@/url';
import { customState } from './fixtures';

const SWITCH_LINK = PLATFORMS.switch.link;
const SWITCH_KEYS = Object.values(SWITCH_LINK.keys).flat();
const VOCABULARIES: {[platform: string]: Vocabulary} = { switch: switchVocabulary(), psp: pspVocabulary() };

// Links as they were given out. They have to read the same for good: when one of them does not, the numbers of data/**/link.tsv
// or the way short links are written have changed, and so has what every link made before says
const GIVEN_OUT = [
	[
		'h=JP&s=__H',
		'hw=oled&hos=23.0.0&sw=hekate,atmosphere,daybreak,sys_patch,fusee,lockpick_rcm,tegraexplorer,common_problem_resolver,hwfly_toolbox,picofly_toolbox,dbi,jksv,appstore,aio_updater,ovlmenu'
	],
	[
		'h=JP&s=fQ4AAAE&l=LNgT4GB3TSD01PNgZ9NIPTWGinNM8xJn1YiZ44CdZSNgZ9NIPTWReFB&f=w87xv5p8YBNkzosA&o=LDCJGA&sm=sfqGROV0UBAJGk59sZonK6Dr3q5WsocfXgxEfg'
			+ '&c=kvAIB5YAitsABIySwCRorPE1eb3yOkpHyU2fs4A&db=jR-uPRM83W9hQxrXNaBf30JzQvtC00YuhjWv5YJ2EMAQ4A&a=KPwg',
		'hw=oled&hos=23.0.0&sw=hekate,atmosphere,daybreak,sys_patch,fusee,dbi,ultrahand,sys_clk,status_monitor,retroarch&boot=emummc,stock&emummc=SD01&autoboot=emummc-SD01'
			+ '&logo.noticker=1&hekate.backlight=50&nyx.themecolor=200&nyx.themebg=%23123456&launch.emummc-SD01.usb3force=1'
			+ '&atmosphere.sd_card_log_output_directory=logs%2Fof%20mine&tesla.key_combo=ZL,ZR,DDOWN'
			+ '&ultrahand_status_monitor.modes=Micro%3DL,R,DDOWN%3D--microOverlay&status_monitor_mini.background_color=%23111F'
			+ '&oc=0100F2C0115B6000.performance,0123456789ABCDEF.custom.docked_cpu-1785'
			+ '&dbi_local_sources.sources=Homebrew%3Dsdmc:%2Fswitch&dbi_local_sources.sources=%D0%9C%D0%BE%D0%B4%D1%8B%3Dsdmc:%2Fa%3Db,%20c&img.bootlogo=hekate-a'
	],
	[
		'h=cv&s=n&f=OdlcGLI&p=L6Y9Ez3qEBTrxYtQBInzYsDzSOKCcA',
		'hw=pspgo&fw=5.70&sw=ark,gclite,cmfilemanager,aemu&clock.game=333&xmb.region=jp&aemu.hotspot=Home,%20sweet%20home&plugin.gclite=vsh,game&plugin.aemu='
	]
];

const params = (link: string): Params => [...new URLSearchParams(link)];
const spelled = (short: Params, link: LinkCodes = SWITCH_LINK): Params => [...expand(new URLSearchParams(short), link)];
const full = (short: Params, link: LinkCodes = SWITCH_LINK) => query(spelled(short, link));
// Nothing but the params of a short link, each made of its characters
const isShort = (short: Params, link: LinkCodes = SWITCH_LINK) => short.every(([key, value]) =>
	['h', 's', ...Object.keys(link.keys)].includes(key) && /^[\w-]*$/.test(value));
const SHORT = /^h=[\w-]+&s=[\w-]+(&[a-z]{1,2}=[\w-]+)*$/;

// The same numbers every run
function random(seed: number) {
	return () => (seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
}

describe('short links', () => {
	it.each(GIVEN_OUT)('read %s as it was given out', (short, said) => {
		expect(spellOut(short)).toBe(said);
	});

	// More words get numbers with time, so the same may be written shorter than it once was, never to say anything else
	it.each(GIVEN_OUT)('say the same written again as %s did', (short, said) => {
		const { link } = PLATFORMS[decodeState(short).platform];
		const again = shorten(params(said), link);
		expect(isShort(again, link)).toBe(true);
		expect(full(again, link)).toBe(said);
	});

	it('pack a build into a param for everything it sets up', () => {
		expect(encodeState(defaultState())).toMatch(/^h=[\w-]+&s=[\w-]+$/);
		const short = encodeState(customState());
		expect(short).toMatch(SHORT);
		// The launch, the firmware, sys-ftpd-light, MissionControl, Tesla, the overclock and the pictures of the custom build
		expect(params(short).map(([key]) => key)).toEqual(['h', 's', 'l', 'f', 'o', 'mc', 'ft', 'c', 'a']);
		expect(spellOut(short).length / short.length).toBeGreaterThan(3);
	});

	it('say the same as the link spelled in full', () => {
		const state = customState();
		expect(decodeState(encodeState(state))).toEqual(decodeState(spellOut(encodeState(state))));
		expect(encodeState(decodeState(spellOut(encodeState(state))))).toBe(encodeState(state));
	});

	it('tell the platform by the console', () => {
		for (const hw of HARDWARE) {
			const state = defaultState();
			state.platform = hw.platform;
			(state.builds[hw.platform] as BuildState).hardware = hw.id;
			expect(decodeState(encodeState(state)), hw.id).toMatchObject({ platform: hw.platform, builds: { [hw.platform]: { hardware: hw.id } } });
		}
	});

	// A link pasted into a chat loses a dash or an underscore it ends with
	it('never end with a mark', () => {
		const first = SWITCH_LINK.software.slice(0, 6).join(',');
		const short = shorten(params(`hw=erista&hos=21.0.0&sw=${first}`), SWITCH_LINK);
		expect(short.at(-1)).toEqual(['s', '_A']);
		expect(full(short)).toBe(`hw=erista&hos=21.0.0&sw=${first}`);
		expect(full([['s', '_']])).toBe(`sw=${first}`);
		// Records that end with a text may end with a mark too. A character of zeros follows it and reads as the end of the records
		const records = SWITCH_KEYS.slice(0, 40).flatMap(key => ['_', 'x_', 'xy-', 'name_', '--', 'FF', 'ff', '+_', 'a ^'].map(text => shorten([[key, text]], SWITCH_LINK)[0]));
		const marked = records.filter(([, value]) => /[-_]A$/.test(value));
		expect(records.filter(([, value]) => /[-_]$/.test(value))).toEqual([]);
		expect(marked.length).toBeGreaterThan(0);
		for (const [param, value] of marked) expect(spelled([[param, value.slice(0, -1)]])).toEqual(spelled([[param, value]]));
	});

	it('take any text as it is', () => {
		const texts = [
			'', '0', '1', '00', '01', '10', '-1', '1.25', '1.05', '007', '9007199254740993', '1'.repeat(40),
			',', ',,', 'a,', ',a', 'a,,b', 'L,R', 'L, R', 'LR', 'ZL+ZR', 'ZL+ZR+DDOWN,L', 'emummc-SD01', 'sdmc:/switch/DBI/logs',
			'#111F', '#a1b2c3', '#A1b2C3', '#', '0100F2C0115B6000', '0100f2c0115b6000', 'DEADBEEF', 'a=b=c', '=', '--microOverlay',
			'Консоль', 'コンソール 🎮', '🎮', 'a\tb', 'tab\there', ' leading and trailing ', '~!@$%^&*()_+{}|:"<>?`[]\\;\'./'
		];
		const short = shorten(texts.map((text, index) => [SWITCH_KEYS[index * 7], text]), SWITCH_LINK);
		expect(isShort(short)).toBe(true);
		expect(spelled(short).map(([, value]) => value)).toEqual(texts);
		// As a key that has no number, of what the launch sets up
		const keyed = shorten(texts.map(text => [`launch.${text}`, '1']), SWITCH_LINK);
		expect(keyed.map(([key]) => key)).toEqual(['l']);
		expect(spelled(keyed).map(([key]) => key)).toEqual(texts.map(text => `launch.${text}`));
	});

	it('take any mix of words, numbers, marks and letters', () => {
		const next = random(1);
		const parts = [...SWITCH_LINK.words.slice(0, 60), ',', ',', '.', '-', '=', '#', ':', '/', ' ', '0', '7', '42', '1785', 'x', 'Ab', 'я', '🎮', '+', '_'];
		const texts = Array.from({ length: 300 }, () => Array.from({ length: Math.floor(next() * 8) }, () => parts[Math.floor(next() * parts.length)]).join(''));
		const short = shorten(texts.map((text, index) => [SWITCH_KEYS[index], text]), SWITCH_LINK);
		expect(isShort(short)).toBe(true);
		expect(spelled(short).map(([, value]) => value)).toEqual(texts);
	});

	it('keep the rows of a list in their order under one key', () => {
		const rows: Params = [['dbi_local_sources.sources', 'B=2'], ['nyx.themecolor', '5'], ['dbi_local_sources.sources', 'A=1'], ['dbi_local_sources.sources', '']];
		const short = shorten(rows, SWITCH_LINK);
		expect(short.map(([key]) => key)).toEqual(['l', 'db']);
		expect(spelled(short)).toEqual([rows[1], rows[0], rows[2], rows[3]]);
	});

	it('spell what has no number yet', () => {
		const said = params('hw=oled&hos=23.0.0&sw=hekate,atmosphere,dbi&nyx.themecolor=200&nyx.new=ZL,new&tesla.key_combo=ZL,ZR');
		// A key and a word without numbers stay inside the record
		const short = shorten(said, SWITCH_LINK);
		expect(short.map(([key]) => key)).toEqual(['h', 's', 'l', 'o']);
		expect(full(short)).toBe(query(said));
		// A console, a system version or a component without a number keeps its param, and so does what nothing sets up
		const { hardware, firmware, software } = SWITCH_LINK;
		const old = { ...SWITCH_LINK, hardware: hardware.slice(0, 2), firmware: firmware.slice(0, 5), software: software.slice(0, 5) };
		const mixed = shorten([...said, ['new.option', '1']], old);
		expect(mixed.map(([key]) => key)).toEqual(['hw', 'hos', 'sw', 'l', 'o', 'new.option']);
		expect(full(mixed, old)).toBe(`${query(said)}&new.option=1`);
		// What was numbered later is not there for the page that does not know it yet, the rest is
		const keys = Object.fromEntries(Object.entries(SWITCH_LINK.keys).map(([param, list]) => [param, list.slice(0, 20)]));
		expect(full(short, { ...SWITCH_LINK, keys, words: [] })).toBe('hw=oled&hos=23.0.0&sw=hekate,atmosphere,dbi&nyx.themecolor=200');
	});

	it('give way to what a link spells in full', () => {
		const [short] = GIVEN_OUT[1];
		expect(decodeState(`${short}&hos=20.0.0`).builds.switch).toMatchObject({ hardware: 'oled', firmware: '20.0.0' });
		// Another console takes the system version along
		expect(decodeState(`${short}&hw=lite`).builds.switch).toMatchObject({ hardware: 'lite', firmware: defaultState().builds.switch.firmware });
		expect(decodeState(`${short}&nyx.themecolor=100&sw=dbi`).builds.switch).toMatchObject({ tuning: { nyx: { themecolor: 100 }, hekate: { backlight: 50 } } });
		expect(decodeState(`${short}&nyx.themecolor=100&sw=dbi`).builds.switch.selectedComponentIDs).toEqual(decodeState('sw=dbi').builds.switch.selectedComponentIDs);
		expect(spellOut(`${short}&dbi_local_sources.sources=Only%3Dsdmc:/`)).toContain('&dbi_local_sources.sources=Only%3Dsdmc:%2F');
		expect(spellOut(`${short}&dbi_local_sources.sources=Only%3Dsdmc:/`)).not.toContain('Homebrew');
	});

	it('read a damaged link as far as it goes', () => {
		// Cut anywhere, the records of a param say only what the whole of them does and nothing else
		for (const [param, records] of params(GIVEN_OUT[1][0]).slice(2)) {
			const said = spelled([[param, records]]);
			for (let length = 0; length <= records.length; length++) {
				const cut = spelled([[param, records.slice(0, length)]]);
				expect(cut, `${param} ${length}`).toEqual(said.slice(0, cut.length));
			}
		}
		expect(decodeState('h=!!&s=%25%25&l=**&sm=%20')).toEqual(defaultState());
		expect(decodeState('h=&s=&l=&f=').builds.switch.selectedComponentIDs).toEqual(decodeState('sw=').builds.switch.selectedComponentIDs);
		expect(decodeState('h=AAAAAAAAAA&s=AAAA').builds.switch.hardware).toBe(defaultState().builds.switch.hardware);
		expect(decodeState('h=____').platform).toBe('switch');
		// A param named after what every object has is not one of a short link
		expect(decodeState('constructor=AAAA&toString=BBBB&__proto__=CCCC&hasOwnProperty=DDDD')).toEqual(defaultState());
		// Noise of any kind is read without a failure and never reaches an option it does not fit
		const next = random(2);
		const noise = () => Array.from({ length: Math.floor(next() * 60) }, () => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'[Math.floor(next() * 64)]).join('');
		for (let index = 0; index < 500; index++) {
			const link = `h=${noise().slice(0, 3)}&s=${noise()}&${Object.keys(SWITCH_LINK.keys).map(param => `${param}=${noise()}`).join('&')}`;
			const state = decodeState(link);
			expect(decodeState(encodeState(state)), link).toEqual(state);
		}
	});

	it('pack every option there is', () => {
		const state = defaultState();
		const { catalog } = PLATFORMS.switch;
		const build = state.builds.switch;
		build.selectedComponentIDs = catalog.components.map(comp => comp.id);
		for (const group of catalog.tuning) {
			for (const option of group.options.filter(option => !option.secret)) {
				const tuning = build.tuning[group.id];
				if (option.type == 'toggle') tuning[option.id] = !option.default;
				if (option.type == 'range' || option.type == 'number') tuning[option.id] = option.default == option.max ? option.min : option.max;
				if (option.type == 'select') tuning[option.id] = [...option.values].reverse().find(value => value != option.default)!;
				if (option.type == 'multiselect') tuning[option.id] = option.values.slice(-Math.min(option.max ?? 3, option.values.length));
				if (option.type == 'text') tuning[option.id] = `${option.default}x`.slice(0, option.maxLength);
				if (option.type == 'list') tuning[option.id] = [option.fields.map(field => field.values?.at(-1) ?? 'x')];
			}
		}
		const short = encodeState(state);
		expect(short).toMatch(SHORT);
		expect(decodeState(short)).toEqual(state);
		// A character or so for an option on average, a few for the ones with a text
		expect(short.length).toBeLessThan(spellOut(short).length / 8);
	});
});

describe('numbers of links', () => {
	const tables = ['data/link.tsv', ...PLATFORM_IDS.map(platform => `data/${platform}/link.tsv`)].map(path => {
		const [header, ...rows] = readFileSync(path, 'utf8').trimEnd().split('\n').map(line => line.split('\t'));
		return [path, header, rows] as const;
	});

	// A number missing in the middle is the row of something links made before still name
	it.each(tables)('are given once each in %s', (path, header, rows) => {
		expect(header).toEqual(['list', 'code', 'id']);
		for (const list of new Set(rows.map(([name]) => name))) {
			const numbered = rows.filter(([name]) => name == list);
			expect(numbered.map(([, code]) => Number(code)).sort((a, b) => a - b), list).toEqual(numbered.map((row, index) => index));
			expect(new Set(numbered.map(([, , id]) => id)).size, list).toBe(numbered.length);
		}
	});

	it('are there for every console', () => {
		expect(unnumbered(HARDWARE.map(hw => hw.id), HARDWARE_CODES), 'run `bun run number`').toEqual([]);
	});

	it.each(PLATFORM_IDS)('are there for everything links of %s name', platform => {
		const { link } = PLATFORMS[platform];
		const { keys, ...lists } = VOCABULARIES[platform];
		for (const [list, ids] of Object.entries(lists)) {
			expect(unnumbered(ids, link[list as keyof typeof lists]), `${list}: run \`bun run number\``).toEqual([]);
		}
		for (const [param, ids] of Object.entries(keys)) {
			expect(unnumbered(ids, link.keys[param] ?? []), `${param}: run \`bun run number\``).toEqual([]);
		}
	});

	it.each(PLATFORM_IDS)('leave room for the system versions of %s next to the console', platform => {
		expect(PLATFORMS[platform].link.firmware.length).toBeLessThanOrEqual(256);
	});

	// A param of a short link named as one of a link spelled in full would be read as that one
	it.each(PLATFORM_IDS)('name the params of a short link of %s apart from the ones spelled in full', platform => {
		const { link } = PLATFORMS[platform];
		const spelledKeys = ['hw', 'sw', link.firmwareKey, ...Object.values(link.keys).flat()];
		for (const param of Object.keys(link.keys)) {
			expect(param).toMatch(/^[a-z]{1,2}$/);
			expect(['h', 's', ...spelledKeys]).not.toContain(param);
		}
	});

	it.each(PLATFORM_IDS)('pack the options of %s with the component they set up', platform => {
		const { components, tuning } = PLATFORMS[platform].catalog;
		for (const group of tuning) {
			// A group that needs no component sets up one of those every build has
			const owners = group.requires ? components.filter(comp => group.requires!.flat().includes(comp.id)) : components.filter(comp => comp.required);
			expect(owners.map(comp => comp.link), group.id).toContain(group.link);
		}
		// The sections of the overlays in the list of Ultrahand go with the overlays, not with Ultrahand
		for (const group of tuning.filter(group => group.section)) {
			expect(components.find(comp => comp.id == group.requires!.at(-1))?.link, group.id).toBe(group.link);
		}
	});
});
