import { tuningGroups } from '@/data';
import { StepId, SwitchState, TuningStep } from '@/types';

import { Platform } from '..';
import {
	CONFIG_PATHS,
	TRACE_DIR,
	build,
	moveCard,
	readCard,
	uncoveredCard,
} from './build';
import {
	CATALOG,
	HOS_VERSIONS,
	defaultBuild,
	isHOSSupported,
	launchEntries,
} from './data';
import { LINK, decode, encode } from './url';
import { validate } from './validation';

export * from './data';

const STEPS: StepId[] = [
	'hardware',
	'firmware',
	'software',
	'launch',
	'system',
	'security',
	'sysmodules',
	'overlays',
	'status_monitor',
	'dbi',
	'jksv',
	'amiibo',
	'overclock',
	'appearance',
	'build',
];

// Steps with the settings of the selected components: sysmodules and overlays by what they are,
// applications with a lot to set on steps of their own
const COMPONENT_STEPS: TuningStep[] = [
	'sysmodules',
	'overlays',
	'status_monitor',
	'dbi',
	'jksv',
	'amiibo',
];

// Hekate and Atmosphere with homebrew from the Homebrew App Store and GitHub
export const SWITCH: Platform<SwitchState> = {
	id: 'switch',
	catalog: CATALOG,
	firmware: HOS_VERSIONS,
	isFirmwareSupported: isHOSSupported,
	defaults: defaultBuild,
	glyphs: { next: 'A', back: 'B', rebuild: 'X' },
	// Settings of components and overclock only appear when a selected component has something to set
	steps: ({ selectedComponentIDs }) =>
		STEPS.filter(step => {
			const settings = COMPONENT_STEPS.find(item => item == step);
			if (settings)
				return (
					tuningGroups(CATALOG.tuning, settings, selectedComponentIDs)
						.length > 0
				);
			if (step == 'overclock')
				return selectedComponentIDs.includes('sys_clk');
			return true;
		}),
	values: ({ selectedComponentIDs, launch, overclock, appearance }) => {
		const images = [
			appearance.bootlogo,
			appearance.background,
			...Object.values(appearance.logos),
			...Object.values(appearance.icons),
		].filter(Boolean).length;
		return {
			launch: launchEntries(launch, selectedComponentIDs).length,
			overclock: overclock.length || '',
			appearance: images || '',
		};
	},
	link: LINK,
	encode,
	decode,
	validate,
	build,
	trace: TRACE_DIR,
	configPaths: CONFIG_PATHS,
	readCard,
	uncoveredCard,
	moveCard,
};
