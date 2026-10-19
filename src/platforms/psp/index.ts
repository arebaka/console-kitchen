import { PspState, StepId } from '@/types';

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
	FIRMWARE,
	defaultBuild,
	isFirmwareSupported,
	selectedPlugins,
} from './data';
import { LINK, decode, encode } from './url';
import { validate } from './validation';

export * from './data';

const STEPS: StepId[] = [
	'hardware',
	'firmware',
	'software',
	'system',
	'plugins',
	'build',
];

// ARK-5 with plugins and homebrew from GitHub releases
export const PSP: Platform<PspState> = {
	id: 'psp',
	catalog: CATALOG,
	firmware: FIRMWARE,
	isFirmwareSupported,
	defaults: defaultBuild,
	glyphs: { next: 'cross', back: 'circle', rebuild: 'triangle' },
	// Plugins only appear with a plugin selected
	steps: ({ selectedComponentIDs }) =>
		STEPS.filter(
			step =>
				step != 'plugins' ||
				selectedPlugins(selectedComponentIDs).length > 0,
		),
	values: ({ selectedComponentIDs }) => ({
		plugins: selectedPlugins(selectedComponentIDs).length,
	}),
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
