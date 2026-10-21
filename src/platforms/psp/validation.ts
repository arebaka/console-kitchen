import { Translation } from '@i18n';

import { missingGroup } from '@/data';
import { Issue, PspState } from '@/types';
import { componentIssues, sortIssues } from '@/validation';

import { CATALOG, COMPONENTS, isFirmwareSupported } from './data';

// Everything to check before building, errors first. Every issue points at the step to fix it on
export function validate(build: PspState, t: Translation): Issue[] {
	const issues: Issue[] = [];
	const selected = COMPONENTS.filter(comp =>
		build.selectedComponentIDs.includes(comp.id),
	);
	const isUpdating = build.selectedComponentIDs.includes('update661');

	// ARK-5 runs on 6.60 and 6.61 only, the official update brings an older PSP there
	if (!isFirmwareSupported(build.firmware) && !isUpdating) {
		issues.push({
			level: 'error',
			code: 'firmwareUpdate',
			step: 'firmware',
			params: { firmware: build.firmware },
			fixes: [{ add: ['update661'] }],
		});
	}
	if (build.firmware == '6.61' && isUpdating) {
		issues.push({
			level: 'info',
			code: 'firmwareCurrent',
			step: 'software',
			params: {},
			fixes: [{ remove: ['update661'] }],
		});
	}

	for (const comp of selected) {
		issues.push(...componentIssues(CATALOG, build, comp, 'software', t));
	}

	// æmu loses its connection with the caches of ARK on
	const {
		memory: { mscache, infernocache } = missingGroup('memory'),
		clock = missingGroup('clock'),
	} = build.tuning;
	if (
		build.selectedComponentIDs.includes('aemu') &&
		(mscache != 'off' || infernocache != 'off')
	) {
		issues.push({
			level: 'warning',
			code: 'aemuCache',
			step: 'system',
			params: {},
		});
	}

	// ARK clocks the CPU above 333 MHz on any PSP, but not every chip holds it
	const mhz = Math.max(Number(clock.game), Number(clock.vsh));
	if (mhz > 333) {
		issues.push({
			level: 'info',
			code: 'overclock',
			step: 'system',
			params: { mhz: String(mhz) },
		});
	}

	return sortIssues(issues);
}
