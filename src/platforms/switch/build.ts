import { HARDWARE } from '@data';
import TEMPLATES, { README } from '@templates/switch';

import {
	Asset,
	BuildRequest,
	BuildResult,
	ConfigSpec,
	installerView,
	installers,
	render,
	renderConfigs,
	updateSummary,
} from '@/build';
import { isTuningGroupActive, listRows } from '@/data';
import {
	CardConfig,
	CardTexts,
	movedConfigs,
	optionRaw,
	readConfigs,
	textOf,
	uncoveredConfigs,
} from '@/read';
import { BUILD_FILE, buildToml } from '@/toml';
import {
	ImageTarget,
	LaunchEntry,
	SwitchState,
	TuningOption,
	TuningValue,
} from '@/types';
import { Params } from '@/url';

import {
	BOOT_ENTRIES,
	CATALOG,
	COMPONENTS,
	COMPONENT_ENTRIES,
	ENTRY_OVERRIDES,
	GALLERY,
	OVERCLOCK,
	SPARE_INI,
	SYSTEM_ENTRIES,
	launchEntries,
	spareEntries,
	templateClocks,
} from './data';
import { encode } from './url';

type Request = BuildRequest<SwitchState>;

// Where the installers leave the build and the files of its components: a folder of its own in the root of the card
export const TRACE_DIR = 'console-kitchen';

// The file of More configs the entries of other builds move into once hekate_ipl.ini is written again
export const KEPT_INI = 'bootloader/ini/console_kitchen_kept.ini';

// Values as the configs spell them: hekate flags, Atmosphere u8 and u64 settings
const flag = (value: TuningValue) => (value ? 1 : 0);
const u8 = (value: TuningValue) => (value ? '0x1' : '0x0');
const u64 = (value: number) => `0x${value.toString(16)}`;
const MIB = 1024 * 1024;

// A path from the root of the card, as sys-tune takes it: /music
const cardPath = (path: TuningValue) =>
	String(path)
		.trim()
		.replace(/^(sdmc:)?\/*/, '/');

// Groups of settings that make up the config of Status Monitor, by the names its template gives to their sections
const STATUS_MONITOR = {
	status_monitor: 'status_monitor',
	full: 'status_monitor_full',
	mini: 'status_monitor_mini',
	micro: 'status_monitor_micro',
	fps_counter: 'status_monitor_fps_counter',
	fps_graph: 'status_monitor_fps_graph',
	game_resolutions: 'status_monitor_game_resolutions',
};

// The same for the config of DBI
const DBI = {
	general: 'dbi_general',
	album: 'dbi_album',
	filtering: 'dbi_filtering',
	activity_log: 'dbi_activity_log',
	main_menu: 'dbi_main_menu',
	applications: 'dbi_applications',
	install: 'dbi_install',
	mtp: 'dbi_mtp',
	ftp: 'dbi_ftp',
	http: 'dbi_http',
	access_point: 'dbi_access_point',
	mtp_storages: 'dbi_mtp_storages',
	fb2: 'dbi_fb2',
	network_sources: 'dbi_network_sources',
	local_sources: 'dbi_local_sources',
	mtp_custom_storages: 'dbi_mtp_custom_storages',
	title_name_override: 'dbi_title_name_override',
	disabled_titles_to_check_for_updates:
		'dbi_disabled_titles_to_check_for_updates',
};

// Nyx accepts backgrounds from 0x0B0B0B to 0xC7C7C7 only
function nyxBackground(color: TuningValue): string {
	const value = Math.min(
		Math.max(Number.parseInt(String(color).slice(1), 16) || 0, 0x0b0b0b),
		0xc7c7c7,
	);
	return value.toString(16).padStart(6, '0');
}

// Whether the hosts file of `emummc` or `sysmmc` blocks Nintendo servers
function isDNSBlocked({ tuning: { dns } }: Request, target: string): boolean {
	return dns.mode == 'block' && (dns.targets as string[]).includes(target);
}

// Whether the components a group of settings belongs to are selected: its config is then written, changed or not
function isGroupSelected(request: Request, id: string): boolean {
	return isTuningGroupActive(
		CATALOG.tuning.find(group => group.id == id)!,
		request.selectedComponentIDs,
	);
}

// Rows of a list as its template takes them: the values of a row by the names of its fields, with its number from zero
function listView(
	option: Extract<TuningOption, { type: 'list' }>,
	value: TuningValue,
): { index: number; [field: string]: string | number }[] {
	return listRows(value as string[][]).map((row, index) => ({
		index,
		...Object.fromEntries(
			option.fields.map((field, at) => [field.id, row[at].trim()]),
		),
	}));
}

// Network locations of DBI, the ones it keeps in a file of their own
function dbiLocations({ tuning: { dbi_locations } }: Request) {
	const [option] = CATALOG.tuning.find(
		group => group.id == 'dbi_locations',
	)!.options;
	return option.type == 'list'
		? listView(option, dbi_locations[option.id])
		: [];
}

// The file Ultrahand keeps its list of overlays in
const OVERLAYS_INI = 'config/ultrahand/overlays.ini';

// Overlays in the list of Ultrahand, the selected ones: a section of its file each, named after the file of the overlay.
// The modes of an overlay are kept as three lists side by side: their arguments, combos and names
function ultrahandOverlays(request: Request) {
	const groups = CATALOG.tuning.filter(
		group =>
			group.file == OVERLAYS_INI &&
			isTuningGroupActive(group, request.selectedComponentIDs),
	);
	return groups.map(group => {
		const values = request.tuning[group.id];
		const modes = group.options.flatMap(option =>
			option.type == 'list' ? listView(option, values[option.id]) : [],
		);
		const scalars = group.options.filter(
			option => option.type != 'list' && option.type != 'multiselect',
		);
		return {
			section: group.section,
			...Object.fromEntries(
				scalars.map(option => [option.id, String(values[option.id])]),
			),
			key_combo: (values.key_combo as string[]).join('+'),
			hasModes: modes.length > 0,
			mode_args: modes.map(mode => mode.args).join(', '),
			mode_combos: modes.map(mode => mode.combo).join(', '),
			mode_labels: modes.map(mode => mode.label).join(', '),
		};
	});
}

// The combo of the overlay menu as its configs spell it, empty without buttons
const menuCombo = ({ tuning: { tesla } }: Request) =>
	(tesla.key_combo as string[]).join('+');

// Icons are named after their entry, white layouts get the `_hue` suffix Nyx tints with the theme color
function iconPath(request: Request, entry: string): string | undefined {
	const image = request.appearance.icons[entry];
	if (!image) return undefined;
	const hue = GALLERY.find(
		item => item.target == 'icon' && item.id == image,
	)?.hue;
	return `bootloader/res/console_kitchen_${entry}${hue ? '_hue' : ''}.bmp`;
}

// Boot logo of its own for the entry, the common one otherwise
function logoPath(request: Request, entry: string): string | undefined {
	return request.appearance.logos[entry]
		? `bootloader/res/console_kitchen_${entry}_logo.bmp`
		: undefined;
}

// An entry as a section of an ini of hekate: its keys, then its logo and its icon. The ones picked for the entry
// take the place of the ones it comes with
const entrySection = (request: Request, entry: LaunchEntry) => ({
	name: entry.name,
	keys: Object.entries(entry.keys).map(([key, value]) => ({ key, value })),
	logo: logoPath(request, entry.id) ?? entry.logo,
	icon: iconPath(request, entry.id) ?? entry.icon,
});

// Reading the configs of a card back into a build: what the views above turn the options into, turned back
// into the params of a link. A switch is on as 1, true or the u8 1 of Atmosphere, buttons are joined with a plus
const isOn = (value: string) => /^(1|true|on|0x0*1)$/i.test(value.trim());
const buttons = (value: string) =>
	value
		.split('+')
		.map(button => button.trim())
		.filter(Boolean)
		.join(',');

// A section of hekate_ipl.ini the Console Kitchen writes: its config, an entry booting the system or another emuMMC,
// one a component brings. The other ones move into More configs when the file is written again
const isOwnSection = (name: string) =>
	name == 'config' ||
	/^CFW \(emuMMC .+\)$/.test(name) ||
	[...BOOT_ENTRIES, ...COMPONENT_ENTRIES].some(entry => entry.name == name);

// The Launch menu of hekate_ipl.ini: the boot modes and the emuMMCs its entries are, the keys of Exosphere the entries set
// for themselves and the entry autoboot starts, counted from 1. Entries of other builds tell nothing and leave the menu as it is
function readLaunch(card: CardConfig): Params {
	const entries = card.sections.filter(
		section => section.name != '' && section.name != 'config',
	);
	const ids = entries.map(section => {
		const folder = section.keys.emupath?.match(/^emuMMC\/(.+)$/)?.[1];
		if (folder && section.name == `CFW (emuMMC ${folder})`)
			return `emummc-${folder}`;
		return [...BOOT_ENTRIES, ...COMPONENT_ENTRIES].find(
			entry => entry.name == section.name,
		)?.id;
	});
	if (!ids.some(Boolean)) return [];

	const params: Params = [
		[
			'boot',
			BOOT_ENTRIES.map(entry => entry.id)
				.filter(id => ids.includes(id))
				.join(','),
		],
		[
			'emummc',
			ids
				.flatMap(id =>
					id?.startsWith('emummc-')
						? [id.slice('emummc-'.length)]
						: [],
				)
				.join(','),
		],
	];
	entries.forEach((section, index) => {
		for (const key of ENTRY_OVERRIDES) {
			if (ids[index] && section.keys[key] !== undefined)
				params.push([`launch.${ids[index]}.${key}`, section.keys[key]]);
		}
	});
	const autoboot = Number(card.values.autoboot);
	if (autoboot == 0) params.push(['autoboot', 'menu']);
	else if (ids[autoboot - 1]) params.push(['autoboot', ids[autoboot - 1]!]);
	return params;
}

// DNS of Atmosphere: off, its own hosts, or the hosts of the systems Nintendo is blocked on. Applets get their heap in bytes
function readSystemSettings(card: CardConfig, texts: CardTexts): Params {
	const { values } = card;
	const params: Params = [];
	if (values.enable_dns_mitm !== undefined) {
		const targets = ['emummc', 'sysmmc'].filter(
			target =>
				textOf(texts, `atmosphere/hosts/${target}.txt`) !== undefined,
		);
		params.push([
			'dns.mode',
			isOn(values.enable_dns_mitm)
				? targets.length > 0
					? 'block'
					: 'default'
				: 'off',
		]);
		if (targets.length > 0) params.push(['dns.targets', targets.join(',')]);
	}
	if (values.add_defaults_to_dns_hosts !== undefined)
		params.push([
			'dns.add_defaults',
			isOn(values.add_defaults_to_dns_hosts) ? '1' : '0',
		]);
	if (values.enable_dns_mitm_debug_log !== undefined)
		params.push([
			'dns.debug_log',
			isOn(values.enable_dns_mitm_debug_log) ? '1' : '0',
		]);
	for (const key of ['applet_heap_size', 'applet_heap_reservation_size']) {
		if (values[key] !== undefined)
			params.push([
				`atmosphere.${key}`,
				String(Math.round(Number(values[key]) / MIB)),
			]);
	}
	return params;
}

// Ultrahand keeps as hidden what its menus show as shown, and its combo is the one of the overlay menu
function readUltrahand(card: CardConfig): Params {
	const { options } = CATALOG.tuning.find(group => group.id == 'ultrahand')!;
	const params: Params = Object.entries(card.values).flatMap(
		([name, value]): Params => {
			const shown = name.startsWith('hide_')
				? options.find(
						option => option.id == name.replace('hide_', 'show_'),
					)
				: undefined;
			return shown
				? [[`ultrahand.${shown.id}`, isOn(value) ? '0' : '1']]
				: [];
		},
	);
	if (card.values.key_combo !== undefined)
		params.push(['tesla.key_combo', buttons(card.values.key_combo)]);
	return params;
}

// Overlays in the list of Ultrahand by the sections of their files, the modes from the three lists side by side
function readOverlays(card: CardConfig): Params {
	return CATALOG.tuning
		.filter(group => group.file == OVERLAYS_INI)
		.flatMap(group => {
			const section = card.sections.find(
				item => item.name == group.section,
			);
			if (!section) return [];
			return group.options.flatMap((option): Params => {
				const key = `${group.id}.${option.id}`;
				if (option.type != 'list') {
					const raw =
						section.keys[option.id] === undefined
							? undefined
							: optionRaw(option, section.keys[option.id]);
					return raw === undefined ? [] : [[key, raw]];
				}
				const [args, combos, labels] = [
					'mode_args',
					'mode_combos',
					'mode_labels',
				].map(name =>
					(section.keys[name] ?? '')
						.replace(/^\((.*)\)$/, '$1')
						.split(', '),
				);
				const fields: { [field: string]: string[] } = {
					args,
					combo: combos.map(buttons),
					label: labels,
				};
				const rows = labels
					.map((label, index) =>
						option.fields
							.map(field => fields[field.id]?.[index] ?? '')
							.join('='),
					)
					.filter((row, index) => labels[index].trim() != '');
				return rows.length > 0
					? rows.map(row => [key, row] as [string, string])
					: [[key, '']];
			});
		});
}

// Network locations of DBI by the sections of their file
function readLocations(card: CardConfig): Params {
	const [option] = CATALOG.tuning.find(
		group => group.id == 'dbi_locations',
	)!.options;
	if (option.type != 'list') return [];
	const key = `dbi_locations.${option.id}`;
	const rows = card.sections
		.filter(section => /^Location_\d+$/.test(section.name))
		.map(section =>
			option.fields.map(field => section.keys[field.id] ?? '').join('='),
		);
	return rows.length > 0
		? rows.map(row => [key, row] as [string, string])
		: [[key, '']];
}

// Profiles of the overclock by the sections of the titles they are for: a template where the clocks are the ones
// of a template, custom clocks otherwise. A config without them has none
function readProfiles(card: CardConfig): Params {
	const profiles = card.sections
		.filter(section => /^[0-9A-F]{16}$/i.test(section.name))
		.map(section => {
			const clocks = Object.entries(section.keys).map(
				([key, mhz]) => [key, Number(mhz)] as const,
			);
			const template = Object.keys(OVERCLOCK.templates).find(id => {
				const own = Object.entries(templateClocks(id));
				return (
					own.length == clocks.length &&
					own.every(([key, mhz]) =>
						clocks.some(
							clock => clock[0] == key && clock[1] == mhz,
						),
					)
				);
			});
			return [
				section.name.toUpperCase(),
				template ?? 'custom',
				...(template
					? []
					: clocks.map(([key, mhz]) => `${key}-${mhz}`)),
			].join('.');
		});
	return [['oc', profiles.join(',')]];
}

const CONFIGS: ConfigSpec<Request>[] = [
	{
		path: 'BOOT.INI',
		template: TEMPLATES.bootIni,
		view: () => ({}),
	},
	{
		path: 'bootloader/hekate_ipl.ini',
		template: TEMPLATES.hekateIplIni,
		read: readLaunch,
		covers: ['boot', 'emummc', 'autoboot', 'launch.'],
		moves: { into: KEPT_INI, owns: isOwnSection },
		view: request => {
			const { hekate, logo } = request.tuning;
			const entries = launchEntries(
				request.launch,
				request.selectedComponentIDs,
			);
			return {
				// Entries are numbered from 1 in the order of the file, 0 stays in the menu
				autoboot:
					entries.findIndex(
						entry => entry.id == request.launch.autoboot,
					) + 1,
				bootwait: logo.bootwait,
				noticker: flag(logo.noticker),
				backlight: hekate.backlight,
				autohosoff: hekate.autohosoff,
				autonogc: flag(hekate.autonogc),
				updater2p: flag(hekate.updater2p),
				bootprotect: flag(hekate.bootprotect),
				// A caption opens every group of entries
				entries: entries.map((entry, index) =>
					Object.assign(entrySection(request, entry), {
						caption:
							index == 0 ||
							entries[index - 1].caption != entry.caption
								? entry.caption
								: undefined,
					}),
				),
			};
		},
	},
	{
		path: SPARE_INI,
		template: TEMPLATES.spareIni,
		view: request => ({
			entries: spareEntries(
				request.launch,
				request.selectedComponentIDs,
			).map(entry => entrySection(request, entry)),
		}),
		when: request =>
			spareEntries(request.launch, request.selectedComponentIDs).length >
			0,
	},
	{
		path: 'bootloader/nyx.ini',
		template: TEMPLATES.nyxIni,
		view: ({ tuning: { nyx } }) => ({
			themebg: nyxBackground(nyx.themebg),
			themecolor: nyx.themecolor,
			entries5col: flag(nyx.entries5col),
			timedst: flag(nyx.timedst),
			homescreen: nyx.homescreen,
			verification: nyx.verification,
			umsemmcrw: flag(nyx.umsemmcrw),
			jcdisable: flag(nyx.jcdisable),
			jcforceright: flag(nyx.jcforceright),
			bpmpclock: nyx.bpmpclock,
		}),
	},
	{
		path: 'exosphere.ini',
		template: TEMPLATES.exosphereIni,
		view: ({ tuning: { exosphere } }) => ({
			debugmode: flag(exosphere.debugmode),
			debugmode_user: flag(exosphere.debugmode_user),
			disable_user_exception_handlers: flag(
				exosphere.disable_user_exception_handlers,
			),
			enable_user_pmu_access: flag(exosphere.enable_user_pmu_access),
			enable_mem_mode: flag(exosphere.enable_mem_mode),
			blank_prodinfo_sysmmc: flag(exosphere.blank_prodinfo_sysmmc),
			blank_prodinfo_emummc: flag(exosphere.blank_prodinfo_emummc),
			allow_writing_to_cal_sysmmc: flag(
				exosphere.allow_writing_to_cal_sysmmc,
			),
			log_port: exosphere.log_port,
			log_baud_rate: exosphere.log_baud_rate,
			log_inverted: flag(exosphere.log_inverted),
		}),
	},
	{
		path: 'atmosphere/config/system_settings.ini',
		template: TEMPLATES.systemSettingsIni,
		read: readSystemSettings,
		covers: ['dns.'],
		view: ({ tuning: { atmosphere, dns } }) => ({
			upload_enabled: u8(atmosphere.upload_enabled),
			usb30_force_enabled: u8(atmosphere.usb30_force_enabled),
			ease_nro_restriction: u8(atmosphere.ease_nro_restriction),
			enable_sd_card_logging: u8(atmosphere.enable_sd_card_logging),
			sd_card_log_output_directory:
				atmosphere.sd_card_log_output_directory ?? 'atmosphere/binlogs',
			disable_automatic_report_cleanup: u8(
				atmosphere.disable_automatic_report_cleanup,
			),
			fatal_auto_reboot_interval: u64(
				atmosphere.fatal_auto_reboot_interval as number,
			),
			power_menu_reboot_function: atmosphere.power_menu_reboot_function,
			dmnt_cheats_enabled_by_default: u8(
				atmosphere.dmnt_cheats_enabled_by_default,
			),
			dmnt_always_save_cheat_toggles: u8(
				atmosphere.dmnt_always_save_cheat_toggles,
			),
			enable_hbl_bis_write: u8(atmosphere.enable_hbl_bis_write),
			enable_hbl_cal_read: u8(atmosphere.enable_hbl_cal_read),
			fsmitm_redirect_saves_to_sd: u8(
				atmosphere.fsmitm_redirect_saves_to_sd,
			),
			enable_am_debug_mode: u8(atmosphere.enable_am_debug_mode),
			enable_dns_mitm: u8(dns.mode != 'off'),
			add_defaults_to_dns_hosts: u8(dns.add_defaults),
			enable_dns_mitm_debug_log: u8(dns.debug_log),
			enable_htc: u8(atmosphere.enable_htc),
			enable_log_manager: u8(atmosphere.enable_log_manager),
			enable_external_bluetooth_db: u8(
				atmosphere.enable_external_bluetooth_db,
			),
			applet_heap_size: u64(
				(atmosphere.applet_heap_size as number) * MIB,
			),
			applet_heap_reservation_size: u64(
				(atmosphere.applet_heap_reservation_size as number) * MIB,
			),
		}),
	},
	{
		path: 'atmosphere/config/stratosphere.ini',
		template: TEMPLATES.stratosphereIni,
		view: ({ tuning: { stratosphere } }) => ({
			nogc: flag(stratosphere.nogc == 'on'),
		}),
		when: ({ tuning: { stratosphere } }) => stratosphere.nogc != 'auto',
		read: ({ values }) =>
			values.nogc === undefined
				? []
				: [['stratosphere.nogc', isOn(values.nogc) ? 'on' : 'off']],
	},
	{
		path: 'atmosphere/config/override_config.ini',
		template: TEMPLATES.overrideConfigIni,
		// `!` inverts a key: the Album opens hbmenu unless the key is held, mods and cheats apply unless their keys are held
		view: ({ tuning: { hbl } }) => ({
			album_key: (hbl.album ? '!' : '') + hbl.key,
			any_app: String(hbl.any_app),
			any_app_key: hbl.key,
			address_space: hbl.address_space,
			path: hbl.path ?? 'atmosphere/hbl.nsp',
			mods_key: hbl.mods_key,
			cheat_key: hbl.cheat_key,
		}),
		read: ({ values: { album_key } }) =>
			album_key === undefined
				? []
				: [
						['hbl.album', album_key.startsWith('!') ? '1' : '0'],
						['hbl.key', album_key.replace(/^!/, '')],
					],
	},
	{
		path: 'atmosphere/hosts/emummc.txt',
		template: TEMPLATES.emummcHostsTxt,
		view: () => ({}),
		when: request => isDNSBlocked(request, 'emummc'),
	},
	{
		path: 'atmosphere/hosts/sysmmc.txt',
		template: TEMPLATES.emummcHostsTxt,
		view: () => ({}),
		when: request => isDNSBlocked(request, 'sysmmc'),
	},
	{
		path: 'atmosphere/hosts/default.txt',
		template: TEMPLATES.defaultHostsTxt,
		view: () => ({}),
	},
	{
		path: 'config/tesla/config.ini',
		template: TEMPLATES.teslaConfigIni,
		view: request => ({
			key_combo: menuCombo(request),
		}),
		when: request =>
			isGroupSelected(request, 'tesla') && menuCombo(request) != '',
	},
	{
		path: 'config/ultrahand/config.ini',
		template: TEMPLATES.ultrahandConfigIni,
		// Ultrahand keeps as hidden what its menus show as shown. It reads the combo of its own config before the one of Tesla
		// and copies it over that one, so the combo goes here too
		view: request => ({
			...Object.fromEntries(
				Object.entries(request.tuning.ultrahand).map(([key, value]) =>
					key.startsWith('show_')
						? [key.replace('show_', 'hide_'), String(!value)]
						: [key, String(value)],
				),
			),
			key_combo: menuCombo(request),
		}),
		when: request => isGroupSelected(request, 'ultrahand'),
		read: readUltrahand,
		// State of its menus and labels of the theme, the sounds and the wallpaper picked there, which it copies by itself
		transient: [
			'in_overlay',
			'to_packages',
			'current_theme',
			'current_sounds',
			'current_wallpaper',
		],
	},
	{
		path: OVERLAYS_INI,
		template: TEMPLATES.ultrahandOverlaysIni,
		view: request => ({ overlays: ultrahandOverlays(request) }),
		when: request => ultrahandOverlays(request).length > 0,
		read: readOverlays,
	},
	{
		path: 'config/sys-patch/config.ini',
		template: TEMPLATES.sysPatchConfigIni,
		view: ({ tuning: { sys_patch } }) => ({
			patch_sysmmc: flag(sys_patch.patch_sysmmc),
			patch_emummc: flag(sys_patch.patch_emummc),
			enable_logging: flag(sys_patch.enable_logging),
			version_skip: flag(sys_patch.version_skip),
		}),
		when: request => isGroupSelected(request, 'sys_patch'),
	},
	{
		path: 'config/MissionControl/missioncontrol.ini',
		template: TEMPLATES.missionControlIni,
		view: ({ tuning: { missioncontrol } }) => ({
			...Object.fromEntries(
				Object.entries(missioncontrol).map(([key, value]) => [
					key,
					String(value),
				]),
			),
			bluetooth:
				missioncontrol.host_name != '' ||
				missioncontrol.host_address != '',
		}),
		when: request => isGroupSelected(request, 'missioncontrol'),
	},
	{
		path: 'config/sys-con/config.ini',
		template: TEMPLATES.sysConConfigIni,
		view: ({ tuning: { sys_con } }) => ({
			...sys_con,
			discovery_vidpid: String(sys_con.discovery_vidpid).replaceAll(
				/\s/g,
				'',
			),
			auto_add_controller: flag(sys_con.auto_add_controller),
			network_controller: flag(sys_con.network_controller),
		}),
		when: request => isGroupSelected(request, 'sys_con'),
	},
	{
		path: 'config/status-monitor/config.ini',
		template: TEMPLATES.statusMonitorConfigIni,
		// Every section of the file is a group of settings, lists of buttons and of things to show are joined with a plus
		view: ({ tuning }) =>
			Object.fromEntries(
				Object.entries(STATUS_MONITOR).map(([section, group]) => [
					section,
					Object.fromEntries(
						Object.entries(tuning[group]).map(([key, value]) => [
							key,
							Array.isArray(value)
								? value.join('+')
								: String(value),
						]),
					),
				]),
			),
		when: request => isGroupSelected(request, 'status_monitor'),
		prefixes: STATUS_MONITOR,
	},
	{
		path: 'config/sys-tune/config.ini',
		template: TEMPLATES.sysTuneConfigIni,
		view: ({ tuning: { sys_tune } }) => ({
			shuffle: flag(sys_tune.shuffle),
			repeat: sys_tune.repeat,
			// Volumes are picked in percent and kept as parts of one
			volume: (sys_tune.volume as number) / 100,
			global_volume: (sys_tune.global_volume as number) / 100,
			load_path: sys_tune.load_path && cardPath(sys_tune.load_path),
			title_default: flag(sys_tune.title_default),
		}),
		when: request => isGroupSelected(request, 'sys_tune'),
		read: ({ values }) =>
			['volume', 'global_volume'].flatMap((key): Params =>
				values[key] === undefined
					? []
					: [
							[
								`sys_tune.${key}`,
								String(Math.round(Number(values[key]) * 100)),
							],
						],
			),
	},
	{
		path: 'config/sys-ftpd/config.ini',
		template: TEMPLATES.sysFtpdConfigIni,
		view: ({ tuning: { sys_ftpd_light } }) => ({
			user: sys_ftpd_light.user,
			password: sys_ftpd_light.password,
			port: sys_ftpd_light.port,
			anonymous: flag(sys_ftpd_light.anonymous),
			pause_disabled: flag(!sys_ftpd_light.pause),
			keycombo: (sys_ftpd_light.keycombo as string[]).join('+'),
			led: flag(sys_ftpd_light.led),
		}),
		when: request => isGroupSelected(request, 'sys_ftpd_light'),
		read: ({ values: { pause_disabled } }) =>
			pause_disabled === undefined
				? []
				: [['sys_ftpd_light.pause', isOn(pause_disabled) ? '0' : '1']],
	},
	{
		path: 'switch/DBI/dbi.config',
		template: TEMPLATES.dbiConfig,
		// Every section is a group of settings, picked values are joined with a comma. A folder or an address left empty
		// stays the one DBI ships with, and titles go by their IDs in upper case
		view: ({ tuning }) =>
			Object.fromEntries(
				Object.entries(DBI).map(([section, id]) => [
					section,
					Object.fromEntries(
						CATALOG.tuning
							.find(group => group.id == id)!
							.options.map(option => {
								const value = tuning[id][option.id];
								if (option.type == 'list') {
									return [
										option.id,
										listView(option, value).map(row =>
											'TitleID' in row
												? Object.assign(row, {
														TitleID: String(
															row.TitleID,
														).toUpperCase(),
													})
												: row,
										),
									];
								}
								return [
									option.id,
									Array.isArray(value)
										? value.join(',')
										: String(
												value === ''
													? option.default
													: value,
											),
								];
							}),
					),
				]),
			),
		when: request => isGroupSelected(request, 'dbi_general'),
		prefixes: DBI,
	},
	{
		path: 'switch/DBI/dbi.locations',
		template: TEMPLATES.dbiLocations,
		view: request => ({ locations: dbiLocations(request) }),
		when: request =>
			isGroupSelected(request, 'dbi_locations') &&
			dbiLocations(request).length > 0,
		read: readLocations,
	},
	{
		path: 'config/JKSV/JKSV.json',
		template: TEMPLATES.jksvJson,
		// JKSV keeps its switches as numbers and fills in what the file leaves out
		view: ({ tuning: { jksv } }) => ({
			...Object.fromEntries(
				Object.entries(jksv).map(([key, value]) => [
					key,
					typeof value === 'boolean' ? flag(value) : value,
				]),
			),
			WorkingDirectory: JSON.stringify(
				jksv.WorkingDirectory ?? 'sdmc:/JKSV',
			),
		}),
		when: request => isGroupSelected(request, 'jksv'),
	},
	{
		path: 'config/JKSV/webdav.json',
		template: TEMPLATES.jksvWebdavJson,
		// JKSV puts the folder between slashes itself, a server open to everyone goes without the login
		view: ({
			tuning: {
				jksv_webdav: { origin, basepath, username, password },
			},
		}) => ({
			origin: JSON.stringify(origin),
			basepath:
				basepath &&
				JSON.stringify(String(basepath).replaceAll(/^\/+|\/+$/g, '')),
			username: username && JSON.stringify(username),
			password: JSON.stringify(password),
		}),
		when: request =>
			isGroupSelected(request, 'jksv_webdav') &&
			request.tuning.jksv_webdav.origin != '',
	},
	{
		path: 'config/amiigo/settings.json',
		template: TEMPLATES.amiigoSettingsJson,
		view: ({ tuning: { amiigo } }) => ({ ...amiigo }),
		when: request => isGroupSelected(request, 'amiigo'),
	},
	{
		path: 'config/sys-clk/config.ini',
		template: TEMPLATES.sysClkConfigIni,
		view: ({ tuning: { sys_clk }, overclock }) => ({
			...sys_clk,
			profiles: overclock
				.filter(profile => Object.keys(profile.clocks).length)
				.map(profile =>
					Object.assign(profile, {
						clocks: Object.entries(profile.clocks).map(
							([key, value]) => ({
								key,
								value,
							}),
						),
					}),
				),
		}),
		when: request => isGroupSelected(request, 'sys_clk'),
		read: readProfiles,
		covers: ['oc'],
	},
];

export const CONFIG_PATHS = CONFIGS.map(config => config.path);

// What the configs of a card stand for, as the params of a link, with the groups of options they hold
export const readCard = (texts: CardTexts) =>
	readConfigs(CONFIGS, CATALOG.tuning, texts);

// Lines of the configs of a card the build would lose writing them again
export const uncoveredCard = (request: Request, texts: CardTexts) =>
	uncoveredConfigs(CONFIGS, texts, renderConfigs(CONFIGS, request));

// What moves out of the configs of a card an update writes again, as the entries of other builds into More configs
export const moveCard = (texts: CardTexts, written: string[]) =>
	movedConfigs(CONFIGS, texts, written);

// Images the appearance asks for, logos and icons only of the entries in the menu
function assets(request: Request): Asset[] {
	const { bootlogo, background, logos, icons } = request.appearance;
	const entries = launchEntries(
		request.launch,
		request.selectedComponentIDs,
	).map(entry => entry.id);
	const asset = (
		path: string,
		target: ImageTarget,
		key: string,
		image: string,
	) => ({
		path,
		target,
		key,
		image,
		file: GALLERY.find(item => item.target == target && item.id == image)
			?.file,
	});
	return [
		...(bootlogo
			? [
					asset(
						'bootloader/bootlogo.bmp',
						'bootlogo',
						'bootlogo',
						bootlogo,
					),
				]
			: []),
		...(background
			? [
					asset(
						'bootloader/res/background.bmp',
						'background',
						'background',
						background,
					),
				]
			: []),
		...entries
			.filter(entry => logos[entry])
			.map(entry =>
				asset(
					logoPath(request, entry)!,
					'bootlogo',
					`logo.${entry}`,
					logos[entry],
				),
			),
		...entries
			.filter(entry => icons[entry])
			.map(entry =>
				asset(
					iconPath(request, entry)!,
					'icon',
					`icon.${entry}`,
					icons[entry],
				),
			),
	];
}

// The installers, their readme and every config they write, for the chosen build
export function build(request: Request): BuildResult {
	const { t } = request;
	const hardware = HARDWARE.find(hw => hw.id == request.hardware)!;
	const selected = COMPONENTS.filter(comp =>
		request.selectedComponentIDs.includes(comp.id),
	);
	const manual = selected.filter(comp => comp.source == 'manual');

	const configs = renderConfigs(CONFIGS, request);
	const images = assets(request);
	const title = `Nintendo Switch ${hardware.name}, Horizon OS ${request.firmware}`;
	const exported = buildToml(CATALOG, title, encode(request));
	const trace = { dir: TRACE_DIR, build: exported };
	const view = {
		...installerView(request, hardware, selected, configs, images, trace),
		title,
		card: 'SD card',
		console: 'Nintendo Switch',
		hos: request.firmware,
	};
	// The scripts of an update write the configs and the images the plan has changed
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
						update.images ? images : [],
						trace,
						update,
					),
				},
				'update',
			)
		: [];

	const { dns } = request.tuning;
	const entries = launchEntries(request.launch, request.selectedComponentIDs);
	const spares = spareEntries(request.launch, request.selectedComponentIDs);
	const systems = SYSTEM_ENTRIES.filter(entry =>
		request.selectedComponentIDs.includes(entry.component),
	);
	const autoboot = entries.find(entry => entry.id == request.launch.autoboot);
	const readmeView = {
		...view,
		// What the update of the card of a dump does
		cardUpdate: update && updateSummary(update, COMPONENTS),
		date: new Date().toISOString().slice(0, 10),
		components: selected.map(comp => ({
			name: comp.name,
			version: comp.version,
			description: t.software.switch[comp.id]?.description ?? '',
		})),
		manual: manual.map(comp => comp.name),
		modchip: hardware.is_modchip_required,
		autoboot: autoboot?.name ?? '',
		// More emuMMCs have to be created in their folders before their entries boot
		emummcs: request.launch.emummcs.map(folder => ({
			folder,
			name: entries.find(entry => entry.id == `emummc-${folder}`)!.name,
		})),
		hasEmummcs: request.launch.emummcs.length > 0,
		// Other systems in the menu, with what the catalog notes about the components that bring them
		systems: systems.map(entry => ({
			name: entry.name,
			note: t.software.switch[entry.component]?.note ?? '',
		})),
		hasSystems: systems.length > 0,
		// Entries of More configs that boot CFW without what hekate loads for a component
		spares: spares.map(entry => entry.name),
		hasSpares: spares.length > 0,
		dnsBlock: dns.mode == 'block' && (dns.targets as string[]).length > 0,
		dnsTargets: (dns.targets as string[])
			.map(target => t.tuning.switch.dns.options.targets.values?.[target])
			.join(', '),
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
		assets: images,
		manual,
	};
}
