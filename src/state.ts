import { HARDWARE, HARDWARE_CODES, PLATFORM_IDS } from '@data';
import { Language } from '@i18n';

import { PLATFORMS } from '@/platforms';
import { PSP } from '@/platforms/psp';
import { SWITCH } from '@/platforms/switch';

import { expand, hardwareOf, shorten } from './link';
import { readToml, tomlParams } from './toml';
import { BuildState, PlatformId, PspState, StepId, SwitchState } from './types';
import { query } from './url';

// The platforms lie in the data, next to their consoles
export { PLATFORM_IDS };

// A build of every platform, so a console picked by mistake does not cost the build of another one
export interface Builds {
	switch: SwitchState;
	psp: PspState;
}

export interface AppState {
	lang: Language;
	step: StepId;
	platform: PlatformId; // the build shown and linked
	builds: Builds;
}

export function defaultState(): AppState {
	return {
		lang: 'en',
		step: 'hardware',
		platform: 'switch',
		builds: { switch: SWITCH.defaults(), psp: PSP.defaults() },
	};
}

// The builds with the one of the platform replaced
export const withBuild = (
	builds: Builds,
	platform: PlatformId,
	build: BuildState,
) => ({ ...builds, [platform]: build });

// A link carries the build of the current platform only, packed into a short one
export function encodeState(state: AppState): string {
	const platform = PLATFORMS[state.platform];
	return query(
		shorten(platform.encode(state.builds[state.platform]), platform.link),
	);
}

// Params of a link spelled in full, whichever way it spells them, and the platform they are of:
// the revision of a link tells its platform, a link without one is a Switch build
function spelled(link: string): {
	platform: PlatformId;
	params: URLSearchParams;
} {
	const params = new URLSearchParams(link);
	const hardware = hardwareOf(params, HARDWARE_CODES);
	const platform =
		HARDWARE.find(hw => hw.id == hardware)?.platform ?? 'switch';
	return { platform, params: expand(params, PLATFORMS[platform].link) };
}

export function decodeState(link: string): AppState {
	const { platform, params } = spelled(link);
	const state = defaultState();
	state.platform = platform;
	state.builds = withBuild(
		state.builds,
		platform,
		PLATFORMS[platform].decode(params),
	);
	return state;
}

// What a link says spelled in full, a param for everything
export const spellOut = (link: string): string =>
	query([...spelled(link).params]);

// The state with the build of a file of the Console Kitchen, read as its link would be, the build of the other platform
// as it is. Undefined unless the file holds a build. A file without a console is of the console of its platform
export function importBuild(
	state: AppState,
	text: string,
): AppState | undefined {
	const table = readToml(text);
	const id = PLATFORM_IDS.find(platform => platform == table?.platform);
	if (table?.kind != 'build' || !id) return undefined;
	const platform = PLATFORMS[id];
	const params = tomlParams(platform.catalog, table);
	if (!params.some(([key]) => key == 'hw'))
		params.push(['hw', platform.defaults().hardware]);
	const imported = decodeState(query(params));
	return {
		...state,
		platform: imported.platform,
		builds: withBuild(
			state.builds,
			imported.platform,
			imported.builds[imported.platform],
		),
	};
}
