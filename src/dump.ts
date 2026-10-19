import { DUMP_PS1, DUMP_SH } from '@templates';

import { GeneratedFile, render } from './build';
import { PLATFORMS } from './platforms';

export { DUMP_FILE } from './toml';

// The scripts that dump a card of any platform: what is installed, the configs and the trace. A script tells the platform
// by the folders of the card, so it knows the configs and the trace of every platform
export function dumpScripts(): GeneratedFile[] {
	const view = Object.fromEntries(
		Object.values(PLATFORMS).map(platform => [
			platform.id,
			{ trace: platform.trace, configs: platform.configPaths },
		]),
	);
	return [
		{ path: 'dump.sh', content: render(DUMP_SH, view) },
		{ path: 'dump.ps1', content: render(DUMP_PS1, view) },
	];
}

// The same for every build, offered in the menu of files and with the files of a build
export const DUMP_SCRIPTS = dumpScripts();
