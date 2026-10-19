import { Language, Translation } from '@i18n';
import { INSTALL_SH, INSTALL_PS1 } from '@templates';
import Mustache from 'mustache';

import {
	BuildState,
	ComponentInfo,
	HardwareInfo,
	ImageTarget,
	TuningValue,
} from '@/types';

import type { UpdatePlan } from './card';
import type { CardConfig, CardTexts } from './read';
import { DUMP_FILE } from './toml';
import type { Params } from './url';

// A build with what turns it into files: the language of the readme, its texts and the encoded images.
// With a plan of an update the files also have the scripts that update the card the plan was made for
export type BuildRequest<S extends BuildState = BuildState> = S & {
	lang: Language;
	t: Translation;
	images?: { [path: string]: string }; // encoded images by SD path, embedded into the installers
	update?: UpdatePlan;
};

export interface GeneratedFile {
	path: string;
	content: string;
}

// Image the installers write onto the SD card: a gallery image or the upload under `key`
export interface Asset {
	path: string;
	target: ImageTarget;
	key: string;
	image: string;
	file?: string; // public path of a gallery image, uploads have none
}

export interface BuildResult {
	configs: GeneratedFile[]; // written onto the SD card by the installers
	files: GeneratedFile[]; // artifacts the user downloads
	assets: Asset[];
	manual: ComponentInfo[]; // selected components without automatic download
}

export interface ConfigSpec<R> {
	path: string;
	template: string;
	view: (request: R) => object;
	when?: (request: R) => boolean;
	// How the config of a card reads back into the options, through its template where a placeholder is named after
	// an option of a group of the file, `prefix.id` the option of the group the prefix stands for.
	// What the template does not tell by itself comes as params of a link from `read`, and goes before the rest
	prefixes?: { [prefix: string]: string };
	read?: (card: CardConfig, texts: CardTexts) => Params;
	covers?: string[]; // params of a link the config holds apart from the options of its file: keys, prefixes ending with a dot
	transient?: string[]; // keys the program writes for itself, rewriting the config without them loses nothing
	// Sections of the config on a card that are not of the Console Kitchen, such as the entries of other builds in the menu
	// of hekate: once the config is written again they move into the file `into` names
	moves?: { into: string; owns: (section: string) => boolean };
}

// Installers and configs are not HTML, so values go in without escaping
export function render(template: string, view: object): string {
	return Mustache.render(template, view, {}, { escape: String });
}

// The configs a request needs
export function renderConfigs<R>(
	specs: ConfigSpec<R>[],
	request: R,
): GeneratedFile[] {
	return specs
		.filter(config => !config.when || config.when(request))
		.map(config => ({
			path: config.path,
			content: render(config.template, config.view(request)),
		}));
}

// Assets named after an option of the component, such as `translation_{{language}}.bin`, take its value
const assetPattern = (asset: string, options: Record<string, TuningValue>) =>
	asset.replaceAll(/\{\{(\w+)\}\}/g, (match, option) =>
		option in options ? String(options[option]) : match,
	);

// Every flag is set explicitly, so a missing one never resolves from an outer context
function installSteps(
	comp: ComponentInfo,
	modchip: boolean,
	options: Record<string, TuningValue> = {},
) {
	const step = {
		appstore: false,
		zip: false,
		file: false,
		tar: false,
		urlZip: false,
		urlFile: false,
	};
	switch (comp.source) {
		case 'appstore':
			return comp.sources.appstore!.map(name =>
				Object.assign(step, {
					appstore: true,
					package: name,
				}),
			);
		case 'github':
			return comp.sources
				.github!.filter(item => !item.modchip || modchip)
				.map(item => {
					const asset = {
						repo: item.repo,
						asset: assetPattern(item.asset, options),
					};
					if (item.path)
						return Object.assign(step, asset, {
							file: true,
							path: item.path,
						});
					if (item.strip !== undefined)
						return Object.assign(step, asset, {
							tar: true,
							strip: item.strip,
						});
					return Object.assign(step, asset, {
						zip: true,
						root: item.root ?? '',
						into: item.into ?? '',
					});
				});
		case 'url':
			return comp.sources.url!.map(item =>
				item.path
					? Object.assign(step, {
							urlFile: true,
							url: item.url,
							path: item.path,
						})
					: Object.assign(step, {
							urlZip: true,
							url: item.url,
							root: item.root ?? '',
							into: item.into ?? '',
						}),
			);
		case 'bundled': {
			throw new Error('Not implemented yet: "bundled" case');
		}
		case 'manual': {
			throw new Error('Not implemented yet: "manual" case');
		}
		default:
			return [];
	}
}

// A line that reads as the end of a config inside an installer would run what follows it as commands. The value of an option
// never starts a line, a row of a list does, so such a line is moved off the start of its line: neither shell takes it then
const sealed = (content: string) =>
	content.replaceAll(/^(?=CONSOLE_KITCHEN_EOF$|'@)/gm, ' ');

// What the installers leave on the card for a later update: the build as its file, in a folder of their own
// where they also keep the files of every component with the release they came from
export interface Trace {
	dir: string;
	build: string;
}

// The release an update checks an installed component against: the latest one of its first App Store package
// or GitHub repository, against the one the trace has. A direct download tells no release and comes again
function freshness(
	steps: ReturnType<typeof installSteps>,
	tag: string | undefined,
) {
	const [step] = steps;
	if (!tag || !step) return;
	if ('package' in step)
		return { kind: 'appstore', source: step.package, tag };
	if ('repo' in step) return { kind: 'github', source: step.repo, tag };
	return;
}

// Paths of a dump an update acts on go into the scripts as lines of data: never one a shell would take for their end
const dataLines = (paths: string[]) =>
	paths.filter(path => !/[\r\n]/.test(path) && sealed(path) == path);

// What the installers do on the card: download the selected components, write the configs and the images, leave the trace.
// Platforms add the texts the installers greet with: `title`, `card` and `console`. With the plan of an update the scripts
// update the card: they take off what the plan has them take off, check the releases and the hashes it has
export function installerView(
	request: BuildRequest,
	hardware: HardwareInfo,
	selected: ComponentInfo[],
	configs: GeneratedFile[],
	assets: Asset[],
	trace: Trace,
	plan?: UpdatePlan,
) {
	const manual = selected.filter(comp => comp.source == 'manual');
	const components = selected
		.map(comp => {
			const steps = installSteps(
				comp,
				hardware.is_modchip_required,
				request.tuning[comp.id],
			);
			return {
				id: comp.id,
				name: comp.name,
				steps,
				fresh: plan && freshness(steps, plan.tags[comp.id]),
			};
		})
		.filter(comp => comp.steps.length);
	return {
		hardware: hardware.name,
		components,
		// The App Store helpers only go into installers that use them, and so do the ones that unpack a tar
		hasAppstore: components.some(comp =>
			comp.steps.some(step => step.appstore),
		),
		hasTar: components.some(comp => comp.steps.some(step => step.tar)),
		// Heredocs and here-strings add the final line break themselves
		configs: configs.map(config => ({
			path: config.path,
			content: sealed(config.content.trimEnd()),
			hash: plan?.hashes[config.path] ?? '',
		})),
		manual: manual.map(comp => ({
			name: comp.name,
			url: comp.sources.manual,
		})),
		hasManual: manual.length > 0,
		images: assets.map(asset => ({
			path: asset.path,
			data: request.images?.[asset.path] ?? '',
		})),
		hasImages: assets.length > 0,
		trace: trace.dir,
		build: sealed(trace.build.trimEnd()),
		...(plan && {
			update: true,
			backup: 'backup',
			dump: DUMP_FILE,
			protect: plan.protect,
			disables: dataLines(plan.disable),
			deletions: dataLines(plan.delete),
			removals: dataLines(plan.remove.flatMap(item => item.files)),
			removed: plan.removed.join(' '),
		}),
	};
}

// Text of a card in the readme as it is: a name of a file may hold what Markdown takes for a link or a mark of its own
const literal = (text: string) =>
	text.replaceAll(/[\\`*_{}[\]()#+\-.!|<>~]/g, '\\$&');

// What the update of a plan does, in words for the readme: the names of the components, the paths of the configs
// and of what other builds left
export function updateSummary(plan: UpdatePlan, components: ComponentInfo[]) {
	const names = (ids: string[]) =>
		ids
			.map(id => components.find(comp => comp.id == id)?.name ?? id)
			.join(', ');
	return {
		added: names(plan.added),
		refreshed: names(plan.refreshed),
		removed: names(plan.removed),
		written: plan.configs.map(config => `\`${config.path}\``).join(', '),
		moved: plan.moved
			.map(
				move =>
					`${move.sections.map(literal).join(', ')} (\`${move.into}\`)`,
			)
			.join(', '),
		disabled: plan.disable.map(literal).join(', '),
		deleted: plan.delete.map(literal).join(', '),
	};
}

// The scripts for Linux and macOS and for Windows: the installers, or the ones of an update
export const installers = (
	view: object,
	name: 'install' | 'update' = 'install',
): GeneratedFile[] => [
	{
		path: `${name}.sh`,
		content: render(INSTALL_SH, { ...view, script: `${name}.sh` }),
	},
	{
		path: `${name}.ps1`,
		content: render(INSTALL_PS1, { ...view, script: `${name}.ps1` }),
	},
];
