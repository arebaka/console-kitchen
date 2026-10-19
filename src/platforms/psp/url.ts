import { HARDWARE, HARDWARE_CODES } from '@data';
import { LINK as CODES } from '@data/psp';

import { compareVersions } from '@/data';
import { LinkCodes, PspRevision, PspState, Vocabulary } from '@/types';
import {
	Params,
	byParam,
	decodeSelection,
	decodeTuning,
	encodeSelection,
	encodeTuning,
	tuningKeys,
	tuningParam,
	tuningWords,
} from '@/url';

import { CATALOG, COMPONENTS, FIRMWARE, RUNLEVELS, defaultBuild } from './data';

// The param of a short link a key goes into: the runlevels of a plugin with what else the plugin has to set,
// an option with the rest of what its group sets up
function paramOf(key: string): string | undefined {
	return key.startsWith('plugin.')
		? COMPONENTS.find(comp => key == `plugin.${comp.id}`)?.link
		: tuningParam(CATALOG.tuning, key);
}

// The numbers short links of the PSP name things by
export const LINK: LinkCodes = {
	...CODES,
	hardware: HARDWARE_CODES,
	firmwareKey: 'fw',
	paramOf,
};

// Everything links of the PSP name, to give it numbers: the firmwares from the oldest, the software from what a build
// starts with, the words the values are made of and the params in the order links spell them
export function vocabulary(): Vocabulary {
	return {
		firmware: FIRMWARE.map(v => v.version).toSorted(compareVersions),
		software: [
			...new Set([
				...defaultBuild().selectedComponentIDs,
				...COMPONENTS.map(comp => comp.id),
			]),
		],
		keys: byParam(
			[
				...tuningKeys(CATALOG.tuning),
				...COMPONENTS.filter(comp => comp.plugin).map(
					comp => `plugin.${comp.id}`,
				),
			],
			paramOf,
		),
		words: [...tuningWords(CATALOG.tuning), ...RUNLEVELS],
	};
}

// The model, the firmware and the whole software selection always, options and plugins where they differ from the defaults
export function encode(build: PspState): Params {
	const params: Params = [];
	const set = (key: string, value: string) => params.push([key, value]);

	set('hw', build.hardware);
	set('fw', build.firmware);
	set('sw', encodeSelection(CATALOG, build.selectedComponentIDs));

	params.push(...encodeTuning(CATALOG.tuning, build.tuning));

	// plugin.gclite=vsh, an empty list leaves the plugin off
	for (const [id, scope] of Object.entries(build.plugins))
		set(`plugin.${id}`, scope.join(','));

	return params;
}

// The build a link describes, anything invalid keeps its default
export function decode(params: URLSearchParams): PspState {
	const build = defaultBuild();
	const get = (key: string) => params.get(key);

	const hardware = get('hw');
	if (HARDWARE.some(hw => hw.platform == 'psp' && hw.id == hardware))
		build.hardware = hardware as PspRevision;

	const fw = get('fw');
	if (FIRMWARE.some(v => v.version == fw)) build.firmware = fw!;

	build.selectedComponentIDs =
		decodeSelection(CATALOG, get('sw')) ?? build.selectedComponentIDs;

	decodeTuning(CATALOG.tuning, params, build.tuning);

	// Known runlevels in their order, `always` alone
	for (const comp of COMPONENTS.filter(comp => comp.plugin)) {
		const scope = get(`plugin.${comp.id}`)?.split(',').filter(Boolean);
		if (
			scope &&
			scope.every(level => RUNLEVELS.includes(level)) &&
			(!scope.includes('always') || scope.length == 1)
		) {
			build.plugins[comp.id] = RUNLEVELS.filter(level =>
				scope.includes(level),
			);
		}
	}

	return build;
}
