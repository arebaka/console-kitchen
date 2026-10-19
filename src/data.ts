import {
	Catalog,
	ListField,
	Preset,
	Requirement,
	TuningConfig,
	TuningGroup,
	TuningOption,
	TuningStep,
} from '@/types';

// Compares dotted versions part by part: -1, 0 or 1
export function compareVersions(a: string, b: string): number {
	const [x, y] = [a, b].map(version => version.split('.').map(Number));
	for (let i = 0; i < Math.max(x.length, y.length); i++) {
		if ((x[i] ?? 0) != (y[i] ?? 0))
			return Math.sign((x[i] ?? 0) - (y[i] ?? 0));
	}
	return 0;
}

// Default values of every option, by group
export function getTuningDefaults(groups: TuningGroup[]): TuningConfig {
	return Object.fromEntries(
		groups.map(group => [
			group.id,
			Object.fromEntries(
				group.options.map(option => [option.id, option.default]),
			),
		]),
	);
}

// Options with `when` conditions only apply while their sibling options hold the value or one of the listed values
export function isTuningOptionActive(
	group: TuningGroup,
	option: TuningOption,
	tuning: TuningConfig,
): boolean {
	return Object.entries(option.when ?? {}).every(([id, values]) =>
		[values].flat().some(value => value === tuning[group.id][id]),
	);
}

// A list is changed by the rows worth writing, not by the ones being filled in
export function isTuningOptionChanged(
	group: TuningGroup,
	option: TuningOption,
	tuning: TuningConfig,
): boolean {
	const value = tuning[group.id][option.id];
	return (
		JSON.stringify(
			option.type == 'list' ? listRows(value as string[][]) : value,
		) != JSON.stringify(option.default)
	);
}

// Whether a multiselect takes that many values at once
export function isCountAllowed(
	option: Extract<TuningOption, { type: 'multiselect' }>,
	count: number,
): boolean {
	return count >= (option.min ?? 0) && count <= (option.max ?? Infinity);
}

// A row of a list as tables and links spell it, its fields separated by `=`. The last field takes what is left,
// so it may hold the sign itself, and a row with fewer fields leaves the rest of them empty
export function listRow(text: string, fields: number): string[] {
	const cells = text.split('=');
	return Array.from({ length: fields }, (_, index) =>
		index < fields - 1
			? (cells[index] ?? '')
			: cells.slice(index).join('='),
	);
}

// Rows of a list worth writing: the first field names a row, one without it is being filled in yet
export const listRows = (rows: string[][]): string[][] =>
	rows.filter(row => row[0].trim() != '');

// Values a field of a list holds at once, as its cell keeps them: joined with `+`, the way a combo of buttons is written
export const cellValues = (cell: string): string[] =>
	cell ? cell.split('+') : [];

// The cell of a field that holds several of its values at once: the picked ones in the order of the field.
// Undefined when some of them are not its values, come twice or are more than the field takes
export function pickedCell(
	field: ListField,
	picked: string[],
): string | undefined {
	const values = field.values ?? [];
	const isValid =
		picked.every(item => values.includes(item)) &&
		new Set(picked).size == picked.length &&
		picked.length <= (field.max ?? 1);
	return isValid
		? values.filter(value => picked.includes(value)).join('+')
		: undefined;
}

// A component is required by its id, alternatives by any of theirs
export function isRequirementMet(
	requirement: Requirement,
	selectedComponentIDs: string[],
): boolean {
	return typeof requirement === 'string'
		? selectedComponentIDs.includes(requirement)
		: requirement.some(id => selectedComponentIDs.includes(id));
}

// A group of settings takes effect once every component it needs is selected, a group that needs none always does
export function isTuningGroupActive(
	group: TuningGroup,
	selectedComponentIDs: string[],
): boolean {
	return (group.requires ?? []).every(requirement =>
		isRequirementMet(requirement, selectedComponentIDs),
	);
}

// Groups of the step whose components are selected
export function tuningGroups(
	groups: TuningGroup[],
	step: TuningStep,
	selectedComponentIDs: string[],
): TuningGroup[] {
	return groups.filter(
		group =>
			group.step == step &&
			isTuningGroupActive(group, selectedComponentIDs),
	);
}

// Adds required components and missing dependencies (the first of alternatives), bundled components follow their parent.
// Removing a component keeps dependencies as they are, so a dependency can be dropped and reported instead
export function resolveSelection(
	catalog: Catalog,
	ids: string[],
	dependencies: boolean = true,
): string[] {
	const { components } = catalog;
	const selected = new Set([
		...components.filter(comp => comp.required).map(comp => comp.id),
		...ids,
	]);
	for (let changed = dependencies; changed;) {
		changed = false;
		for (const comp of components.filter(comp => selected.has(comp.id))) {
			for (const requirement of comp.requires ?? []) {
				if (!isRequirementMet(requirement, [...selected])) {
					selected.add(
						typeof requirement === 'string'
							? requirement
							: requirement[0],
					);
					changed = true;
				}
			}
		}
	}
	for (const comp of components.filter(comp => comp.sources.bundled)) {
		if (selected.has(comp.sources.bundled!)) selected.add(comp.id);
		else selected.delete(comp.id);
	}
	return components
		.filter(comp => selected.has(comp.id))
		.map(comp => comp.id);
}

// Every component of the catalog, both sides of conflicts too: the user picks one
function allComponents(catalog: Catalog): string[] {
	return catalog.components.map(comp => comp.id);
}

// Components of a preset with their dependencies
export function presetSelection(catalog: Catalog, preset: Preset): string[] {
	return resolveSelection(
		catalog,
		preset.id == 'all' ? allComponents(catalog) : preset.components,
	);
}

// The preset the selection equals to, if any
export function matchingPreset(
	catalog: Catalog,
	selectedComponentIDs: string[],
): Preset | undefined {
	const current = [...selectedComponentIDs].toSorted().join();
	return catalog.presets.find(
		preset => presetSelection(catalog, preset).toSorted().join() == current,
	);
}
