import Mustache from 'mustache';

import { BuildState, ComponentInfo, HardwareInfo, ImageTarget, TuningValue } from '@/types';
import { Language, Translation } from '@i18n';
import { INSTALL_SH, INSTALL_PS1 } from '@templates';

// A build with what turns it into files: the language of the readme, its texts and the encoded images
export type BuildRequest<S extends BuildState = BuildState> = S & {
	lang: Language;
	t: Translation;
	images?: { [path: string]: string }; // encoded images by SD path, embedded into the installers
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
}

// Installers and configs are not HTML, so values go in without escaping
export function render(template: string, view: object): string {
	return Mustache.render(template, view, {}, { escape: String });
}

// The configs a request needs
export function renderConfigs<R>(specs: ConfigSpec<R>[], request: R): GeneratedFile[] {
	return specs
		.filter(config => !config.when || config.when(request))
		.map(config => ({ path: config.path, content: render(config.template, config.view(request)) }));
}

// Assets named after an option of the component, such as `translation_{{language}}.bin`, take its value
const assetPattern = (asset: string, options: Record<string, TuningValue>) =>
	asset.replace(/\{\{(\w+)\}\}/g, (match, option) => option in options ? String(options[option]) : match);

// Every flag is set explicitly, so a missing one never resolves from an outer context
function installSteps(comp: ComponentInfo, modchip: boolean, options: Record<string, TuningValue> = {}) {
	const step = { appstore: false, zip: false, file: false, tar: false, urlZip: false, urlFile: false };
	switch (comp.source) {
		case 'appstore':
			return comp.sources.appstore!.map(name => ({ ...step, appstore: true, package: name }));
		case 'github':
			return comp.sources.github!
				.filter(item => !item.modchip || modchip)
				.map(item => {
					const asset = { repo: item.repo, asset: assetPattern(item.asset, options) };
					if (item.path) return { ...step, ...asset, file: true, path: item.path };
					if (item.strip !== undefined) return { ...step, ...asset, tar: true, strip: item.strip };
					return { ...step, ...asset, zip: true, root: item.root ?? '', into: item.into ?? '' };
				});
		case 'url':
			return comp.sources.url!.map(item => item.path
				? { ...step, urlFile: true, url: item.url, path: item.path }
				: { ...step, urlZip: true, url: item.url, root: item.root ?? '', into: item.into ?? '' });
		default:
			return [];
	}
}

// A line that reads as the end of a config inside an installer would run what follows it as commands. The value of an option
// never starts a line, a row of a list does, so such a line is moved off the start of its line: neither shell takes it then
const sealed = (content: string) => content.replace(/^(?=CONSOLE_KITCHEN_EOF$|'@)/gm, ' ');

// What the installers do on the card: download the selected components, write the configs and the images.
// Platforms add the texts the installers greet with: `title`, `card` and `console`
export function installerView(request: BuildRequest, hardware: HardwareInfo, selected: ComponentInfo[], configs: GeneratedFile[], assets: Asset[]) {
	const manual = selected.filter(comp => comp.source == 'manual');
	const components = selected
		.map(comp => ({ name: comp.name, steps: installSteps(comp, hardware.is_modchip_required, request.tuning[comp.id]) }))
		.filter(comp => comp.steps.length);
	return {
		hardware: hardware.name,
		components,
		// The App Store helpers only go into installers that use them, and so do the ones that unpack a tar
		hasAppstore: components.some(comp => comp.steps.some(step => step.appstore)),
		hasTar: components.some(comp => comp.steps.some(step => step.tar)),
		// Heredocs and here-strings add the final line break themselves
		configs: configs.map(config => ({ path: config.path, content: sealed(config.content.trimEnd()) })),
		manual: manual.map(comp => ({ name: comp.name, url: comp.sources.manual })),
		hasManual: manual.length > 0,
		images: assets.map(asset => ({ path: asset.path, data: request.images?.[asset.path] ?? '' })),
		hasImages: assets.length > 0
	};
}

// The installer for Linux and macOS and the one for Windows
export const installers = (view: object): GeneratedFile[] => [
	{ path: 'install.sh', content: render(INSTALL_SH, view) },
	{ path: 'install.ps1', content: render(INSTALL_PS1, view) }
];
