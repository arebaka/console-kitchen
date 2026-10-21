import { Language, Translation } from '@i18n';
import React, { useState } from 'react';

import { tuningGroups } from '@/data';
import {
	CATALOG,
	OVERCLOCK,
	SWITCH,
	gameName,
	templateClocks,
} from '@/platforms/switch';
import {
	ClockKey,
	ClockMode,
	ClockModule,
	GameProfile,
	SwitchRevision,
	Fix,
	Issue,
	TuningConfig,
	TuningStep,
	TuningValue,
} from '@/types';
import { activate } from '@/utils';

import { Issues } from '../Issues';
import { TuningSection } from './Tuning';

interface OverclockProps {
	lang: Language;
	hardware: SwitchRevision;
	overclock: GameProfile[];
	setOverclock: (overclock: GameProfile[]) => void;
	tuning: TuningConfig;
	selectedComponentIDs: string[];
	setTuningOption: (
		group: string,
		option: string,
		value: TuningValue,
	) => void;
	resetTuning: (step: TuningStep) => void;
	issues: Issue[];
	applyFix: (fix: Fix) => void;
	t: Translation;
}

const MODES: ClockMode[] = [
	'docked',
	'handheld',
	'handheld_charging',
	'handheld_charging_usb',
	'handheld_charging_official',
];
const MODULES: ClockModule[] = ['cpu', 'gpu', 'mem'];

// Stock leaves the clocks to the game, custom is whatever the table holds
const TEMPLATES = ['stock', ...Object.keys(OVERCLOCK.templates)];

export function Overclock({
	hardware,
	overclock,
	setOverclock,
	tuning,
	selectedComponentIDs,
	setTuningOption,
	resetTuning,
	issues,
	applyFix,
	t,
}: OverclockProps) {
	const groups = tuningGroups(
		CATALOG.tuning,
		'overclock',
		selectedComponentIDs,
	);
	const [titleId, setTitleId] = useState('');

	const setProfile = (id: string, patch: Partial<GameProfile>) => {
		setOverclock(
			overclock.map(profile =>
				profile.id == id ? { ...profile, ...patch } : profile,
			),
		);
	};

	const applyTemplate = (profile: GameProfile, template: string) => {
		setProfile(
			profile.id,
			template == 'custom'
				? { template }
				: { template, clocks: templateClocks(template) },
		);
	};

	const applyAll = (template: string) => {
		setOverclock(
			overclock.map(profile => ({
				...profile,
				template,
				clocks: templateClocks(template),
			})),
		);
	};

	// Any edit of the table turns the profile into a custom one, an empty value returns the stock clock
	const setClock = (profile: GameProfile, key: ClockKey, mhz: number) => {
		const clocks = { ...profile.clocks };
		if (mhz) clocks[key] = mhz;
		else delete clocks[key];
		setProfile(profile.id, { template: 'custom', clocks });
	};

	const addGame = (id: string) => {
		if (!overclock.some(profile => profile.id == id)) {
			setOverclock([
				...overclock,
				{ id, name: gameName(id), template: 'stock', clocks: {} },
			]);
		}
	};

	const isTitleIdValid =
		/^[0-9A-F]{16}$/.test(titleId) &&
		!overclock.some(profile => profile.id == titleId);
	const addTitleId = () => {
		if (isTitleIdValid) {
			addGame(titleId);
			setTitleId('');
		}
	};

	const reset = () => {
		setOverclock([]);
		resetTuning('overclock');
	};

	return (
		<>
			<section className='batch'>
				<button className='control' onClick={reset}>
					{t.pages.system.reset}
				</button>
			</section>

			<Issues
				issues={issues}
				platform={SWITCH}
				applyFix={applyFix}
				t={t}
			/>

			<section className='games'>
				<h3 className='title'>{t.pages.overclock.games}</h3>

				<div className='add'>
					<select
						className='field'
						value=''
						onChange={event => {
							addGame(event.target.value);
						}}
					>
						<option value='' disabled hidden>
							{t.pages.overclock.add}
						</option>
						{OVERCLOCK.games
							.filter(
								game =>
									!overclock.some(
										profile => profile.id == game.id,
									),
							)
							.map(game => (
								<option key={game.id} value={game.id}>
									{game.name}
								</option>
							))}
					</select>
					<input
						className='field mono'
						placeholder={t.pages.overclock.titleId}
						maxLength={16}
						value={titleId}
						spellCheck={false}
						onChange={event => {
							setTitleId(
								event.target.value
									.toUpperCase()
									.replaceAll(/[^0-9A-F]/g, ''),
							);
						}}
						onKeyDown={event =>
							event.key == 'Enter' && addTitleId()
						}
					/>
					<button
						className='control'
						disabled={!isTitleIdValid}
						onClick={addTitleId}
					>
						{t.pages.overclock.addCustom}
					</button>
				</div>

				{overclock.length > 1 && (
					<div className='apply'>
						<span className='caption'>
							{t.pages.overclock.applyAll}
						</span>
						<ul className='choices'>
							{TEMPLATES.map(template => (
								<li
									key={template}
									className={`choice ${overclock.every(profile => profile.template == template) ? 'active' : ''}`}
									tabIndex={0}
									onClick={() => {
										applyAll(template);
									}}
									onKeyDown={activate}
								>
									{t.pages.overclock.templates[template]}
								</li>
							))}
						</ul>
					</div>
				)}

				{overclock.length === 0 ? (
					<p className='empty'>{t.pages.overclock.empty}</p>
				) : (
					<ul className='profiles'>
						{overclock.map(profile => (
							<li key={profile.id} className='game'>
								<header className='header'>
									<h4 className='name'>{profile.name}</h4>
									<p className='id'>{profile.id}</p>
									<button
										className='control'
										onClick={() => {
											setOverclock(
												overclock.filter(
													item =>
														item.id != profile.id,
												),
											);
										}}
									>
										{t.pages.overclock.remove}
									</button>
								</header>

								<ul className='choices'>
									{[...TEMPLATES, 'custom'].map(template => (
										<li
											key={template}
											className={`choice ${profile.template == template ? 'active' : ''}`}
											tabIndex={0}
											onClick={() => {
												applyTemplate(
													profile,
													template,
												);
											}}
											onKeyDown={activate}
										>
											{
												t.pages.overclock.templates[
													template
												]
											}
										</li>
									))}
								</ul>

								{/* A table wider than a phone scrolls sideways instead of cutting the clocks */}
								<div className='clocks-frame'>
									<table className='clocks'>
										<thead>
											<tr>
												<th aria-hidden='true'></th>
												{MODULES.map(module => (
													<th key={module}>
														{
															t.pages.overclock
																.modules[module]
														}
													</th>
												))}
											</tr>
										</thead>
										<tbody>
											{MODES.map(mode => (
												<tr key={mode}>
													<th>
														{
															t.pages.overclock
																.modes[mode]
														}
													</th>
													{MODULES.map(module => {
														const key: ClockKey = `${mode}_${module}`;
														const mhz =
															profile.clocks[key];
														const cap =
															OVERCLOCK.caps[
																key
															]?.[hardware];

														return (
															<td key={module}>
																<select
																	className={`field ${cap && mhz && mhz > cap ? 'capped' : ''} ${mhz ? 'set' : ''}`}
																	value={
																		mhz ??
																		''
																	}
																	onChange={event => {
																		setClock(
																			profile,
																			key,
																			Number(
																				event
																					.target
																					.value,
																			),
																		);
																	}}
																>
																	<option value=''>
																		{
																			t
																				.pages
																				.overclock
																				.stock
																		}
																	</option>
																	{OVERCLOCK.frequencies[
																		module
																	].map(
																		frequency => (
																			<option
																				key={
																					frequency
																				}
																				value={
																					frequency
																				}
																			>
																				{
																					frequency
																				}{' '}
																				{
																					t
																						.pages
																						.overclock
																						.mhz
																				}
																			</option>
																		),
																	)}
																</select>
															</td>
														);
													})}
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</li>
						))}
					</ul>
				)}
			</section>

			{groups.map(group => (
				<TuningSection
					key={group.id}
					platform={SWITCH}
					group={group}
					tuning={tuning}
					setTuningOption={setTuningOption}
					t={t}
				/>
			))}
		</>
	);
}
