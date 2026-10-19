import { HARDWARE } from '@data';
import type { Translation } from '@i18n';

import { isRequirementMet } from './data';
import type {
	BuildState,
	Catalog,
	ComponentInfo,
	Issue,
	StepId,
} from './types';

const LEVELS = { error: 0, warning: 1, info: 2 };

// Errors first, issues of a level keep the order of the checks
export const sortIssues = (issues: Issue[]) =>
	issues.toSorted((a, b) => LEVELS[a.level] - LEVELS[b.level]);

// The same issue found by another check run, whatever its fixes are
export const issueKey = (issue: Issue) =>
	`${issue.level}:${issue.code}:${Object.values(issue.params).join('|')}`;

// What a selected component lacks or breaks on any platform. Every issue points at the step the component is picked on
export function componentIssues(
	catalog: Catalog,
	build: BuildState,
	comp: ComponentInfo,
	step: StepId,
	t: Translation,
): Issue[] {
	const { components } = catalog;
	const issues: Issue[] = [];
	const name = (id: string) =>
		components.find(comp => comp.id == id)?.name ?? id;

	for (const requirement of comp.requires ?? []) {
		if (!isRequirementMet(requirement, build.selectedComponentIDs)) {
			const alternatives =
				typeof requirement === 'string' ? [requirement] : requirement;
			issues.push({
				level: 'warning',
				code: 'requires',
				step,
				params: {
					component: comp.name,
					dependency: alternatives.map(name).join(t.issues.or),
				},
				// Every alternative can be added
				fixes: alternatives.map(id => ({ add: [id] })),
			});
		}
	}

	// Conflicts are mutual, the pair is reported once
	for (const other of comp.conflicts_with ?? []) {
		if (
			build.selectedComponentIDs.includes(other) &&
			components.indexOf(comp) < components.findIndex(c => c.id == other)
		) {
			issues.push({
				level: 'warning',
				code: 'conflict',
				step,
				params: { component: comp.name, other: name(other) },
				fixes: [{ remove: [comp.id] }, { remove: [other] }],
			});
		}
	}

	// Components covering each other are reported once too. A component the other one runs on stays,
	// so RetroArch is never offered to go for the sake of its own core
	for (const other of comp.replaces ?? []) {
		const covered = components.find(c => c.id == other);
		const isMutual =
			covered?.replaces?.includes(comp.id) &&
			components.indexOf(covered) < components.indexOf(comp);
		if (build.selectedComponentIDs.includes(other) && !isMutual) {
			const isDependency = covered?.requires?.flat().includes(comp.id);
			issues.push({
				level: 'info',
				code: 'replaces',
				step,
				params: { component: comp.name, other: name(other) },
				fixes: [
					{ remove: [other] },
					...(isDependency ? [] : [{ remove: [comp.id] }]),
				],
			});
		}
	}

	if (comp.hardware && !comp.hardware.includes(build.hardware)) {
		const revisions = comp.hardware
			.map(id => HARDWARE.find(hw => hw.id == id)!.name)
			.join(', ');
		issues.push({
			level: 'warning',
			code: 'hardware',
			step,
			params: { component: comp.name, revisions },
			fixes: [{ remove: [comp.id] }],
		});
	}

	if (comp.deprecated) {
		issues.push({
			level: 'info',
			code: 'deprecated',
			step,
			params: { component: comp.name },
		});
	}

	if (comp.risky) {
		issues.push({
			level: 'warning',
			code: 'risky',
			step,
			params: {
				component: comp.name,
				note: t.software[catalog.platform][comp.id]?.note ?? '',
			},
		});
	}

	if (comp.source == 'manual') {
		issues.push({
			level: 'info',
			code: 'manual',
			step,
			params: { component: comp.name },
		});
	}

	return issues;
}
