import { HARDWARE } from '@data';
import TEMPLATES, { README } from '@templates/psp';

import {
	BuildRequest,
	BuildResult,
	ConfigSpec,
	installerView,
	installers,
	render,
	renderConfigs,
	updateSummary,
} from '@/build';
import { missingGroup } from '@/data';
import {
	CardConfig,
	CardTexts,
	movedConfigs,
	readConfigs,
	uncoveredConfigs,
} from '@/read';
import { BUILD_FILE, buildToml } from '@/toml';
import { PspState, TuningValue } from '@/types';
import { Params } from '@/url';

import {
	CATALOG,
	COMPONENTS,
	isFirmwareSupported,
	pluginScope,
	selectedPlugins,
} from './data';
import { encode } from './url';

type Request = BuildRequest<PspState>;

// Where the installers leave the build and the files of its components: a folder of its own in the root, the XMB does not show it
export const TRACE_DIR = 'console-kitchen';

const onOff = (value: TuningValue | undefined) => (value ? 'on' : 'off');

// A setting with modes as the settings menu of ARK writes it: off, plain on or `key:mode`
const mode = (key: string, value: TuningValue | undefined, plain = 'on') =>
	value == 'off'
		? `always, ${key}, off`
		: `always, ${value == plain ? key : `${key}:${String(value)}`}, on`;

// Lines of the plugins file: runlevels, path relative to the file, on, or `always` and off for a plugin left off
const pluginLines = (request: Request) =>
	selectedPlugins(request.selectedComponentIDs).map(comp => {
		const scope = pluginScope(request, comp);
		return {
			runlevel: scope.join(' ') || 'always',
			path: comp.plugin!.path,
			state: onOff(scope.length),
		};
	});

// Lines of a file of ARK as their parts: runlevels, the setting or the path of a plugin, on or off
const settingLines = (card: CardConfig) =>
	card.sections
		.flatMap(section => section.lines)
		.map(line => line.split(',').map(part => part.trim()));

// The settings of ARK the template does not read by itself: the ones with modes, which are off, on in their plain mode
// or on in the mode after a colon, the clocks of games and of the XMB, set by one line when they are the same,
// and the region the XMB shows
function readSettings(card: CardConfig): Params {
	const lines = settingLines(card);
	const params: Params = [];
	for (const [key, group, plain] of [
		['highmem', 'memory', 'on'],
		['mscache', 'memory', 'on'],
		['infernocache', 'memory', 'on'],
		['skiplogos', 'xmb', 'all'],
		['hidepics', 'xmb', 'all'],
	] as const) {
		const line = lines.find(
			([runlevel, name]) =>
				runlevel == 'always' &&
				(name == key || name?.startsWith(`${key}:`)),
		);
		if (line) {
			const [, name = '', state] = line;
			params.push([
				`${group}.${key}`,
				state == 'off'
					? 'off'
					: name.includes(':')
						? name.slice(key.length + 1)
						: plain,
			]);
		}
	}
	const clock = (runlevel: string) =>
		lines
			.find(
				([level, name, state]) =>
					level == runlevel &&
					name?.startsWith('cpuclock:') &&
					state == 'on',
			)?.[1]
			?.slice('cpuclock:'.length);
	const both = clock('always');
	params.push(
		['clock.game', both ?? clock('game') ?? '0'],
		['clock.vsh', both ?? clock('vsh') ?? '0'],
	);
	const region = lines.find(
		([level, name, state]) =>
			level == 'vsh' && name?.startsWith('region_') && state == 'on',
	);
	params.push(['xmb.region', region?.[1]?.slice('region_'.length) ?? 'off']);
	return params;
}

// Runlevels of the plugins by their lines, none for a plugin left off. Other CFWs name a plugin from the root of the card
function readPlugins(card: CardConfig): Params {
	const lines = settingLines(card);
	return COMPONENTS.filter(comp => comp.plugin).flatMap((comp): Params => {
		const line = lines.find(
			([, path]) =>
				path?.replace(/^(ms0|ef0):\/seplugins\//i, '').toLowerCase() ==
				comp.plugin!.path.toLowerCase(),
		);
		return line
			? [
					[
						`plugin.${comp.id}`,
						line[2]?.toLowerCase() == 'on'
							? (line[0] ?? '').split(/\s+/).join(',')
							: '',
					],
				]
			: [];
	});
}

const CONFIGS: ConfigSpec<Request>[] = [
	{
		path: 'PSP/SAVEDATA/ARK_01234/SETTINGS.TXT',
		template: TEMPLATES.settingsTxt,
		read: readSettings,
		view: ({
			tuning: {
				clock = missingGroup('clock'),
				memory = missingGroup('memory'),
				xmb = missingGroup('xmb'),
				device = missingGroup('device'),
				go = missingGroup('go'),
			},
		}) => ({
			usbcharge: onOff(clock.usbcharge),
			// The same clock in games and the XMB takes one line, 0 leaves the clock alone
			clock:
				clock.game == clock.vsh
					? clock.game
						? [`always, cpuclock:${String(clock.game)}, on`]
						: []
					: [
							...(clock.game
								? [`game, cpuclock:${String(clock.game)}, on`]
								: []),
							...(clock.vsh
								? [`vsh, cpuclock:${String(clock.vsh)}, on`]
								: []),
						],
			wpa2: onOff(device.wpa2),
			launcher: onOff(xmb.launcher),
			highmem: mode('highmem', memory.highmem),
			mscache: mode('mscache', memory.mscache),
			infernocache: mode('infernocache', memory.infernocache),
			disablepause: onOff(go.disablepause),
			oldplugin: onOff(go.oldplugin),
			hibblock: onOff(go.hibblock),
			skiplogos: mode('skiplogos', xmb.skiplogos, 'all'),
			hidepics: mode('hidepics', xmb.hidepics, 'all'),
			hidemac: onOff(device.hidemac),
			hidedlc: onOff(xmb.hidedlc),
			noled: onOff(device.noled),
			noumd: onOff(device.noumd),
			deadef: onOff(go.deadef),
			noanalog: onOff(device.noanalog),
			vitamute: onOff(device.vitamute),
			qaflags: onOff(xmb.qaflags),
			region: xmb.region == 'off' ? undefined : xmb.region,
		}),
	},
	{
		// ARK also reads the plugins file of its own folder, which FasterARK overwrites on every install
		path: 'SEPLUGINS/PLUGINS.TXT',
		template: TEMPLATES.pluginsTxt,
		read: readPlugins,
		covers: ['plugin.'],
		view: request => ({ plugins: pluginLines(request) }),
		when: request =>
			selectedPlugins(request.selectedComponentIDs).length > 0,
	},
	{
		path: 'SEPLUGINS/hotspot.txt',
		template: TEMPLATES.hotspotTxt,
		read: card => [['aemu.hotspot', card.text.trim()]],
		view: ({ tuning: { aemu = missingGroup('aemu') } }) => ({
			hotspot: aemu.hotspot,
		}),
		when: ({
			selectedComponentIDs,
			tuning: { aemu = missingGroup('aemu') },
		}) => selectedComponentIDs.includes('aemu') && aemu.hotspot != '',
	},
];

export const CONFIG_PATHS = CONFIGS.map(config => config.path);

// What the configs of a card stand for, as the params of a link, with the groups of options they hold
export const readCard = (texts: CardTexts) =>
	readConfigs(CONFIGS, CATALOG.tuning, texts);

// Lines of the configs of a card the build would lose writing them again
export const uncoveredCard = (request: Request, texts: CardTexts) =>
	uncoveredConfigs(CONFIGS, texts, renderConfigs(CONFIGS, request));

// What moves out of the configs of a card an update writes again: nothing on a PSP so far
export const moveCard = (texts: CardTexts, written: string[]) =>
	movedConfigs(CONFIGS, texts, written);

// The installers, their readme and every config they write, for the chosen build
export function build(request: Request): BuildResult {
	const { t } = request;
	const hardware = HARDWARE.find(hw => hw.id == request.hardware)!;
	const selected = COMPONENTS.filter(comp =>
		request.selectedComponentIDs.includes(comp.id),
	);
	const manual = selected.filter(comp => comp.source == 'manual');

	const configs = renderConfigs(CONFIGS, request);
	const title = `${hardware.name}, firmware ${request.firmware}`;
	const exported = buildToml(CATALOG, title, encode(request));
	const trace = { dir: TRACE_DIR, build: exported };
	const view = {
		...installerView(request, hardware, selected, configs, [], trace),
		title,
		card: 'Memory Stick',
		console: 'PSP',
	};
	// The scripts of an update write the configs the plan has changed
	const { update } = request;
	const updates = update
		? installers(
				{
					...view,
					...installerView(
						request,
						hardware,
						selected,
						update.configs,
						[],
						trace,
						update,
					),
				},
				'update',
			)
		: [];

	const runlevels = t.pages.plugins.runlevels;
	const readmeView = {
		...view,
		// What the update of the card of a dump does, `update` is the one of the system
		cardUpdate: update && updateSummary(update, COMPONENTS),
		firmware: request.firmware,
		date: new Date().toISOString().slice(0, 10),
		components: selected.map(comp => ({
			name: comp.name,
			version: comp.version,
			description: t.software.psp[comp.id]?.description ?? '',
		})),
		manual: manual.map(comp => comp.name),
		update:
			!isFirmwareSupported(request.firmware) &&
			request.selectedComponentIDs.includes('update661'),
		go: request.hardware == 'pspgo',
		plugins: selectedPlugins(request.selectedComponentIDs).map(comp => ({
			name: comp.name,
			runlevels:
				pluginScope(request, comp)
					.map(level => runlevels[level])
					.join(', ') || t.pages.plugins.off,
		})),
		hasPlugins: selectedPlugins(request.selectedComponentIDs).length > 0,
	};

	return {
		configs,
		files: [
			...installers(view),
			...updates,
			{ path: BUILD_FILE, content: exported },
			{
				path: 'README.md',
				content: render(README[request.lang], readmeView),
			},
		],
		assets: [],
		manual,
	};
}
