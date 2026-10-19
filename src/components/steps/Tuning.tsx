import React, { useEffect, useState } from 'react';

import { Fix, Issue, ListField, TuningConfig, TuningGroup, TuningOption, TuningStep, TuningValue } from '@/types';
import { Language, Translation } from '@i18n';
import { cellValues, isCountAllowed, isTuningOptionActive, pickedCell, tuningGroups } from '@/data';
import { Platform } from '@/platforms';
import { activate } from '@/utils';
import { Issues } from '../Issues';
import { Buttons, isButtons } from '../Buttons';

type SetTuningOption = (group: string, option: string, value: TuningValue) => void;

interface TuningProps {
	lang: Language;
	platform: Platform;
	step: TuningStep;
	tuning: TuningConfig;
	selectedComponentIDs: string[];
	setTuningOption: SetTuningOption;
	resetTuning: (step: TuningStep) => void;
	issues: Issue[];
	applyFix: (fix: Fix) => void;
	t: Translation;
}

export function Tuning({
	lang,
	platform,
	step,
	tuning,
	selectedComponentIDs,
	setTuningOption,
	resetTuning,
	issues,
	applyFix,
	t
}: TuningProps) {
	const groups = tuningGroups(platform.catalog.tuning, step, selectedComponentIDs);

	return (<>
		<section className="batch">
			<button
				className="control"
				onClick={() =>{  resetTuning(step); }}>
				{t.pages.system.reset}
			</button>
		</section>

		<Issues
			issues={issues}
			platform={platform}
			applyFix={applyFix}
			t={t} />

		{groups.map(group => (
			<TuningSection
				key={group.id}
				platform={platform}
				group={group}
				tuning={tuning}
				setTuningOption={setTuningOption}
				t={t} />
		))}
	</>);
}

interface TuningSectionProps {
	platform: Platform;
	group: TuningGroup;
	tuning: TuningConfig;
	setTuningOption: SetTuningOption;
	t: Translation;
}

// One configuration file with its options
export function TuningSection({
	platform,
	group,
	tuning,
	setTuningOption,
	t
}: TuningSectionProps) {
	const text = t.tuning[platform.id][group.id];

	return (
		<section className="tuning">
			<header className="header">
				<h3 className="title">
					{text?.title ?? group.id}
				</h3>
				<p className="file">
					{group.file}
				</p>
			</header>
			<p className="description">
				{text?.description}
			</p>
			<ul className="rows">
				{group.options.map(option => (
					<Option
						key={option.id}
						platform={platform}
						group={group}
						option={option}
						tuning={tuning}
						isEnabled={isTuningOptionActive(group, option, tuning)}
						setValue={value =>{  setTuningOption(group.id, option.id, value); }}
						t={t} />
				))}
			</ul>
		</section>
	);
}

interface OptionProps {
	platform: Platform;
	group: TuningGroup;
	option: TuningOption;
	tuning: TuningConfig;
	isEnabled: boolean;
	setValue: (value: TuningValue) => void;
	t: Translation;
}

// An option as a row of the settings list: a toggle switches by a click, other types carry their control
function Option({
	platform,
	group,
	option,
	tuning,
	isEnabled,
	setValue,
	t
}: OptionProps) {
	// An option added to the data before its texts shows its key instead of breaking the page
	const text = t.tuning[platform.id][group.id]?.options[option.id] ?? { title: option.id, description: '' };
	const value = tuning[group.id][option.id];
	const label = (value: string | number) => text.values?.[value] ?? String(value);
	const set = (value: TuningValue) => isEnabled && setValue(value);
	// Values of a multiselect with one of them switched, in the order of the option
	const switched = (item: string) => option.type == 'multiselect'
		? option.values.filter(v => v == item ? !(value as string[]).includes(item) : (value as string[]).includes(v))
		: [];
	// A value the multiselect cannot take or lose, as it would then hold too many or too few of them
	const isLocked = (item: string) => option.type == 'multiselect' && !isCountAllowed(option, switched(item).length);

	if (option.type == 'toggle') {
		return (
			<li
				className={`row ${isEnabled ? 'interactive' : 'disabled'}`}
				tabIndex={isEnabled ? 0 : undefined}
				onClick={() => set(!value)}
				onKeyDown={activate}>
				<header className="line">
					<h4 className="name">
						{text.title}
					</h4>
					<p className={`value ${value ? 'on' : ''}`}>
						{value ? t.pages.system.on : t.pages.system.off}
					</p>
				</header>
				<p className="description">
					{text.description}
				</p>
			</li>
		);
	}

	return (
		<li className={`row ${isEnabled ? '' : 'disabled'}`}>
			<header className="line">
				<h4 className="name">
					{text.title}
				</h4>
				{option.type == 'hue' && (
					<p className="value">
						<span className="swatch" style={{ background: `hsl(${value}, 100%, 50%)` }}></span>
						{String(value)}
					</p>
				)}
				{(option.type == 'range' || option.type == 'color') && (
					<p className="value">
						{String(value)}
					</p>
				)}
				{option.type == 'rgba4444' && (
					<p className="value">
						<span className="swatch" style={{ background: value as string }}></span>
						{String(value)}
					</p>
				)}
				{option.type == 'number' && (
					<NumberField
						value={value as number}
						min={option.min}
						max={option.max}
						disabled={!isEnabled}
						setValue={set} />
				)}
				{option.type == 'text' && (
					<input
						type={option.secret ? 'password' : 'text'}
						className="field"
						maxLength={option.maxLength}
						value={value as string}
						disabled={!isEnabled}
						autoComplete="off"
						spellCheck={false}
						onChange={event => set(event.target.value)} />
				)}
			</header>
			<p className="description">
				{text.description}
			</p>

			{option.type == 'select' && isButtons(option.values) && (
				<Buttons
					values={option.values.map(String)}
					selected={[String(value)]}
					isEnabled={isEnabled}
					toggle={set}
					t={t} />
			)}

			{option.type == 'multiselect' && isButtons(option.values) && (
				<Buttons
					values={option.values}
					selected={value as string[]}
					isEnabled={isEnabled}
					isLocked={isLocked}
					toggle={button => set(switched(button))}
					t={t} />
			)}

			{option.type == 'select' && !isButtons(option.values) && (
				<ul className="choices">
					{option.values.map(v => (
						<li
							key={v}
							className={`choice ${value == v ? 'active' : ''}`}
							tabIndex={isEnabled ? 0 : undefined}
							onClick={() => set(v)}
							onKeyDown={activate}>
							{label(v)}
						</li>
					))}
				</ul>
			)}

			{option.type == 'multiselect' && !isButtons(option.values) && (
				<ul className="choices">
					{option.values.map(v => {
						const locked = isLocked(v);

						return (
							<li
								key={v}
								className={`choice ${(value as string[]).includes(v) ? 'active' : ''} ${locked ? 'locked' : ''}`}
								aria-disabled={locked || undefined}
								tabIndex={isEnabled && !locked ? 0 : undefined}
								onClick={() => !locked && set(switched(v))}
								onKeyDown={activate}>
								{label(v)}
							</li>
						);
					})}
				</ul>
			)}

			{option.type == 'range' && (
				<input
					type="range"
					className="range"
					style={{ '--fill': `${((value as number) - option.min) / (option.max - option.min) * 100}%` } as React.CSSProperties}
					min={option.min}
					max={option.max}
					step={option.step}
					value={value as number}
					disabled={!isEnabled}
					onChange={event => set(Number(event.target.value))} />
			)}

			{option.type == 'hue' && (
				<input
					type="range"
					className="range hue"
					min={0}
					max={359}
					value={value as number}
					disabled={!isEnabled}
					onChange={event => set(Number(event.target.value))} />
			)}

			{option.type == 'color' && (
				<input
					type="color"
					className="color"
					value={value as string}
					disabled={!isEnabled}
					onChange={event => set(event.target.value)} />
			)}

			{/* The field picks the color, the slider next to it how solid the color is */}
			{option.type == 'rgba4444' && (
				<div className="rgba">
					<input
						type="color"
						className="color"
						value={wideColor(value as string)}
						disabled={!isEnabled}
						onChange={event => set(narrowColor(event.target.value) + (value as string)[4])} />
					<input
						type="range"
						className="range"
						style={{ '--fill': `${Number.parseInt((value as string)[4], 16) / 15 * 100}%` } as React.CSSProperties}
						min={0}
						max={15}
						value={Number.parseInt((value as string)[4], 16)}
						disabled={!isEnabled}
						onChange={event => set((value as string).slice(0, 4) + Number(event.target.value).toString(16).toUpperCase())} />
				</div>
			)}

			{option.type == 'list' && (
				<ListRows
					option={option}
					rows={value as string[][]}
					labels={text.fields}
					isEnabled={isEnabled}
					setRows={set}
					t={t} />
			)}
		</li>
	);
}

interface ListRowsProps {
	option: Extract<TuningOption, { type: 'list' }>;
	rows: string[][];
	labels?: {[field: string]: string};
	isEnabled: boolean;
	setRows: (rows: string[][]) => void;
	t: Translation;
}

interface PicksProps {
	field: ListField;
	cell: string;
	label: string;
	isEnabled: boolean;
	setCell: (cell: string) => void;
	t: Translation;
}

// A field of a row that holds several of its values at once: buttons where the values are buttons, choices otherwise.
// A value the field cannot take, as it would then hold too many of them, is locked
function Picks({
	field,
	cell,
	label,
	isEnabled,
	setCell,
	t
}: PicksProps) {
	const values = field.values ?? [];
	const picked = cellValues(cell);
	const switched = (item: string) => pickedCell(field, picked.includes(item) ? picked.filter(value => value != item) : [...picked, item]);
	const isLocked = (item: string) => switched(item) === undefined;
	const toggle = (item: string) =>{  setCell(switched(item) ?? cell); };

	if (isButtons(values)) {
		return (
			<Buttons
				values={values}
				selected={picked}
				isEnabled={isEnabled}
				isLocked={isLocked}
				toggle={toggle}
				t={t} />
		);
	}

	return (
		<ul className="choices" aria-label={label}>
			{values.map(item => (
				<li
					key={item}
					className={`choice ${picked.includes(item) ? 'active' : ''} ${isLocked(item) ? 'locked' : ''}`}
					aria-disabled={isLocked(item) || undefined}
					tabIndex={isEnabled && !isLocked(item) ? 0 : undefined}
					onClick={() => !isLocked(item) && toggle(item)}
					onKeyDown={activate}>
					{item}
				</li>
			))}
		</ul>
	);
}

// Rows of a list: a field per value, a choice where the field has its values, of several of them where it takes them.
// A new row starts empty
function ListRows({
	option,
	rows,
	labels,
	isEnabled,
	setRows,
	t
}: ListRowsProps) {
	const label = (field: string) => labels?.[field] ?? field;
	const setCell = (at: number, field: number, value: string) =>{  setRows(rows.map((row, index) => index == at
		? row.map((cell, i) => i == field ? value : cell)
		: row)); };
	// Links separate the fields of a row with `=`, so only the last of them may hold it
	const clean = (field: number, value: string) => field < option.fields.length - 1 ? value.replaceAll('=', '') : value;

	return (
		<div className="list">
			{rows.map((row, at) => (
				<div key={at} className="entry">
					{option.fields.map((field, index) => field.max === undefined ? field.values ? (
						<select
							key={field.id}
							className="field"
							aria-label={label(field.id)}
							value={row[index]}
							disabled={!isEnabled}
							onChange={event =>{  setCell(at, index, event.target.value); }}>
							{field.values.map(item => (
								<option key={item} value={item}>
									{item}
								</option>
							))}
						</select>
					) : (
						<input
							key={field.id}
							className="field"
							placeholder={label(field.id)}
							aria-label={label(field.id)}
							maxLength={option.maxLength}
							value={row[index]}
							disabled={!isEnabled}
							autoComplete="off"
							spellCheck={false}
							onChange={event =>{  setCell(at, index, clean(index, event.target.value)); }} />
					) : (
						<Picks
							key={field.id}
							field={field}
							cell={row[index]}
							label={label(field.id)}
							isEnabled={isEnabled}
							setCell={value =>{  setCell(at, index, value); }}
							t={t} />
					))}
					<button
						className="control"
						disabled={!isEnabled}
						onClick={() =>{  setRows(rows.filter((_, index) => index != at)); }}>
						{t.pages.system.remove}
					</button>
				</div>
			))}
			<button
				className="control"
				disabled={!isEnabled || rows.length >= (option.max ?? Infinity)}
				onClick={() =>{  setRows([...rows, option.fields.map(field => field.max === undefined ? field.values?.[0] ?? '' : '')]); }}>
				{t.pages.system.add}
			</button>
		</div>
	);
}

// A color with a hex digit per channel as the #rrggbb a color field takes, and back with every channel rounded to a digit
const wideColor = (color: string) => `#${[1, 2, 3].map(at => color[at].repeat(2)).join('')}`.toLowerCase();
const narrowColor = (color: string) => `#${[1, 3, 5].map(at => Math.round(Number.parseInt(color.slice(at, at + 2), 16) / 17).toString(16)).join('')}`.toUpperCase();

interface NumberFieldProps {
	value: number;
	min: number;
	max: number;
	disabled: boolean;
	setValue: (value: number) => void;
}

// The draft may leave the range while typing, only whole numbers within it reach the state
function NumberField({
	value,
	min,
	max,
	disabled,
	setValue
}: NumberFieldProps) {
	const [draft, setDraft] = useState(String(value));
	useEffect(() =>{  setDraft(String(value)); }, [value]);

	return (
		<input
			type="number"
			className="field number"
			min={min}
			max={max}
			step={1}
			value={draft}
			disabled={disabled}
			onChange={event => {
				const number = Number(event.target.value);
				setDraft(event.target.value);
				if (event.target.value != '' && Number.isInteger(number) && number >= min && number <= max) {
					setValue(number);
				}
			}}
			onBlur={() =>{  setDraft(String(value)); }} />
	);
}
