import type {
	BootMode,
	ClockMode,
	EntryOverride,
	ClockModule,
	ComponentCategory,
	ComponentSource,
	FirmwareStatus,
	HardwareRevision,
	ImageTarget,
	PlatformId,
	StepId,
} from '@/types';

export type Language = 'en' | 'ru' | 'uk';

export type Hardware = {
	name: string;
	description: string;
	note: string;
};

export type Software = {
	description: string;
	details: string;
	note?: string;
};

export type TuningOption = {
	title: string;
	description: string;
	values?: { [value in string]: string }; // labels of select values, raw values are shown otherwise
	fields?: { [field in string]: string }; // labels of the fields of a list, their names are shown otherwise
};

export type TuningGroup = {
	title: string;
	description: string;
	options: { [option in string]: TuningOption };
};

export type Page = {
	title: string;
	description: string;
};

export type Platform = {
	name: string;
	subtitle: string;
	steps?: Partial<{ [step in StepId]: string }>;
	pages?: Partial<{ [step in StepId]: Page }>;
	unsupported?: string; // note of a firmware the custom firmware does not run on
	summary?: { hardware: string; firmware: string }; // names of the console and its system in the summary of the build
};

export interface Translation {
	language: Language; // short name in the language switch
	title: string;
	platforms: { [platform in PlatformId]: Platform };
	steps: { [step in StepId]: string };
	wizard: {
		back: string;
		next: string;
		rebuild: string;
		step: string;
	};
	hardware: { [revision in HardwareRevision]: Hardware };
	software: { [platform in PlatformId]: { [component in string]: Software } }; // catalogs of platforms may share IDs
	tuning: { [platform in PlatformId]: { [group in string]: TuningGroup } };
	buttons: { [button in string]: string }; // names of the controller buttons for tooltips
	pages: {
		hardware: Page & {
			isModchipRequired: string;
			isModchipNotRequired: string;
			size: string;
		};
		firmware: Page & {
			status: { [status in FirmwareStatus]: string };
			unsupported: string;
		};
		software: Page & {
			presets: { [preset in string]: string };
			custom: string;
			categories: { [category in ComponentCategory]: string };
			sources: { [source in ComponentSource]: string };
			requiredBadge: string;
			bundledBadge: string;
			deprecatedBadge: string;
			riskyBadge: string;
			select: string;
			deselect: string;
			defaultBadge: string;
			authorLabel: string;
			sizeLabel: string;
			conflictTitle: string;
			recommendsTitle: string;
			conflictBadge: string;
		};
		launch: Page & {
			modes: string;
			entries: { [mode in BootMode]: string }; // what every boot mode is for
			emummcEntry: string;
			emummcs: string;
			addEmuMMC: string;
			remove: string;
			overrides: { [key in EntryOverride]: string };
			asConfigured: string;
			overridesDescription: string;
			spares: string;
			sparesDescription: string;
			systems: string;
			systemsDescription: string;
			payloads: string;
			payloadsDescription: string;
			autoboot: string;
			autobootDescription: string;
			menu: string;
		};
		system: Page & {
			reset: string;
			on: string;
			off: string;
			add: string;
			remove: string;
		};
		security: Page;
		sysmodules: Page;
		overlays: Page;
		status_monitor: Page;
		dbi: Page;
		jksv: Page;
		amiibo: Page;
		plugins: Page & {
			list: string; // heading of the plugins file
			runlevels: { [runlevel in string]: string }; // where a plugin loads
			off: string; // a plugin that loads nowhere
		};
		overclock: Page & {
			templates: { [template in string]: string };
			applyAll: string;
			games: string;
			add: string;
			titleId: string;
			addCustom: string;
			remove: string;
			empty: string;
			modes: { [mode in ClockMode]: string };
			modules: { [module in ClockModule]: string };
			stock: string;
			mhz: string;
		};
		appearance: Page & {
			targets: { [target in ImageTarget]: Page };
			defaults: { bootlogo: string; background: string }; // what the screen shows without a picture
			thread: string; // link to more pictures on GBAtemp
			common: string;
			none: string;
			own: string; // the picture an entry comes with
			upload: string;
			uploaded: string;
			invalid: string;
			more: string;
			credit: string;
		};
		build: Page & {
			summary: {
				hardware: string;
				firmware: string;
				components: string;
				size: string;
				tuning: string;
			};
			issues: string;
			installer: string;
			files: { [file in string]: string };
			download: string;
			failed: string;
			manual: string;
			manualDescription: string;
			readme: string;
			preview: string;
			imageData: string;
			// What the update of a card does, by the dump of the card
			card: {
				title: string;
				made: string;
				install: string;
				refresh: string;
				remove: string;
				write: string;
				keep: string;
				none: string;
				moved: string;
				lost: string;
				foreign: string;
				kinds: { [kind in string]: string };
				actions: { [action in string]: string };
				backup: string;
				forget: string;
			};
		};
	};
	issues: {
		requires: string;
		conflict: string;
		replaces: string;
		hardware: string;
		deprecated: string;
		risky: string;
		manual: string;
		hosUnsupported: string;
		hosTracks: string;
		noEntries: string;
		atmosphereTracks: string;
		ftpCredentials: string;
		gpuCap: string;
		firmwareUpdate: string;
		firmwareCurrent: string;
		aemuCache: string;
		overclock: string;
		add: string;
		remove: string;
		or: string;
		go: string;
		dismiss: string; // closes a toast
	};
	// The menu of files in the top bar: builds and dumps of cards to open, the scripts that dump a card
	file: {
		title: string;
		open: string;
		dump: string; // how a card is dumped
		scripts: { [file in string]: string };
		opened: { [kind in 'build' | 'dump']: string };
		invalid: string;
	};
	metrics: {
		size: string;
	};
}
