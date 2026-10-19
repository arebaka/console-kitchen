import React, { useState } from 'react';

import { BootMode, EntryOverride, Fix, Issue, LaunchConfig, TuningConfig, TuningValue } from '@/types';
import { Language, Translation, format } from '@i18n';
import { tuningGroups } from '@/data';
import { BOOT_ENTRIES, CATALOG, COMPONENTS, ENTRY_OVERRIDES, SPARE_INI, SWITCH, SYSTEM_ENTRIES, isEmuMMCFolder, launchEntries, spareEntries } from '@/platforms/switch';
import { activate } from '@/utils';
import { Issues } from '../Issues';
import { ComponentTile } from '../ComponentTile';
import { TuningSection } from './Tuning';

interface LaunchProps {
	lang: Language;
	launch: LaunchConfig;
	setLaunch: (launch: LaunchConfig) => void;
	selectedComponentIDs: string[];
	toggleComponent: (id: string) => void;
	tuning: TuningConfig;
	setTuningOption: (group: string, option: string, value: TuningValue) => void;
	issues: Issue[];
	applyFix: (fix: Fix) => void;
	t: Translation;
}

const PAYLOADS = COMPONENTS.filter(comp => comp.payload);

// Nothing leaves the key to the configs
const OVERRIDE_VALUES = [undefined, 1, 0] as const;

export function Launch({
	lang,
	launch,
	setLaunch,
	selectedComponentIDs,
	toggleComponent,
	tuning,
	setTuningOption,
	issues,
	applyFix,
	t
}: LaunchProps) {
	const entries = launchEntries(launch, selectedComponentIDs);
	const spares = spareEntries(launch, selectedComponentIDs);
	const systems = SYSTEM_ENTRIES.filter(entry => selectedComponentIDs.includes(entry.component));
	// An entry that left the menu takes autoboot with it, until it comes back
	const autoboot = entries.some(entry => entry.id == launch.autoboot) ? launch.autoboot : 'menu';
	const [folder, setFolder] = useState('');

	const toggleMode = (mode: BootMode) =>{  setLaunch({
		...launch,
		modes: BOOT_ENTRIES.map(entry => entry.id).filter(id => id == mode ? !launch.modes.includes(id) : launch.modes.includes(id))
	}); };

	const setOverride = (entry: string, key: EntryOverride, value?: 0 | 1) => {
		const keys = { ...launch.overrides[entry] };
		if (value === undefined) delete keys[key];
		else keys[key] = value;
		setLaunch({ ...launch, overrides: { ...launch.overrides, [entry]: keys } });
	};

	const isFolderValid = isEmuMMCFolder(folder) && !launch.emummcs.includes(folder);
	const addEmuMMC = () => {
		if (isFolderValid) {
			setLaunch({ ...launch, emummcs: [...launch.emummcs, folder] });
			setFolder('');
		}
	};
	// The entry goes away with its keys, autoboot falls back to the menu as the build already does
	const removeEmuMMC = (folder: string) => {
		const { [`emummc-${folder}`]: removed, ...overrides } = launch.overrides;
		setLaunch({
			...launch,
			emummcs: launch.emummcs.filter(item => item != folder),
			overrides,
			autoboot: launch.autoboot == `emummc-${folder}` ? 'menu' : launch.autoboot
		});
	};

	// Boot modes switch on and off, more emuMMCs follow the first one and go away by a button
	const rows: { id: string; mode?: BootMode; folder?: string }[] = [
		{ id: 'emummc', mode: 'emummc' },
		...launch.emummcs.map(folder => ({ id: `emummc-${folder}`, folder })),
		{ id: 'sysmmc', mode: 'sysmmc' },
		{ id: 'stock', mode: 'stock' }
	];

	return (<>
		<Issues
			issues={issues}
			platform={SWITCH}
			applyFix={applyFix}
			t={t} />

		<section className="tuning">
			<header className="header">
				<h3 className="title">
					{t.pages.launch.modes}
				</h3>
				<p className="file">
					bootloader/hekate_ipl.ini
				</p>
			</header>
			<p className="description">
				{t.pages.launch.overridesDescription}
			</p>
			<ul className="rows">
				{rows.map(row => {
					const entry = entries.find(entry => entry.id == row.id);
					const name = entry?.name ?? BOOT_ENTRIES.find(entry => entry.id == row.id)!.name;

					return (
						<li key={row.id} className="row entry">
							{row.mode ? (
								<div
									className="switch"
									tabIndex={0}
									onClick={() =>{  toggleMode(row.mode!); }}
									onKeyDown={activate}>
									<header className="line">
										<h4 className="name">
											{name}
										</h4>
										<p className={`value ${entry ? 'on' : ''}`}>
											{entry ? t.pages.system.on : t.pages.system.off}
										</p>
									</header>
									<p className="description">
										{t.pages.launch.entries[row.mode]}
									</p>
								</div>
							) : (<>
								<header className="line">
									<h4 className="name">
										{name}
									</h4>
									<button
										className="control"
										onClick={() =>{  removeEmuMMC(row.folder!); }}>
										{t.pages.launch.remove}
									</button>
								</header>
								<p className="description">
									{format(t.pages.launch.emummcEntry, { folder: row.folder! })}
								</p>
							</>)}
							{entry && (<>
								<p className="keys">
									{Object.entries(entry.keys).map(([key, value]) => `${key}=${value}`).join('  ')}
								</p>
								<ul className="overrides">
									{ENTRY_OVERRIDES.map(key => (
										<li key={key} className="override">
											<span className="label">
												{t.pages.launch.overrides[key]}
											</span>
											<ul className="choices">
												{OVERRIDE_VALUES.map(value => (
													<li
														key={String(value)}
														className={`choice ${launch.overrides[entry.id]?.[key] === value ? 'active' : ''}`}
														tabIndex={0}
														onClick={() =>{  setOverride(entry.id, key, value); }}
														onKeyDown={activate}>
														{value === undefined ? t.pages.launch.asConfigured : value ? t.pages.system.on : t.pages.system.off}
													</li>
												))}
											</ul>
										</li>
									))}
								</ul>
							</>)}
						</li>
					);
				})}
			</ul>
			<div className="add">
				<span className="prefix">
					emuMMC/
				</span>
				<input
					className="field mono"
					placeholder="SD01"
					maxLength={32}
					value={folder}
					spellCheck={false}
					onChange={event =>{  setFolder(event.target.value.toUpperCase().replaceAll(/[^A-Z0-9_-]/g, '')); }}
					onKeyDown={event => event.key == 'Enter' && addEmuMMC()} />
				<button
					className="control"
					disabled={!isFolderValid}
					onClick={addEmuMMC}>
					{t.pages.launch.addEmuMMC}
				</button>
			</div>
			<p className="description">
				{t.pages.launch.emummcs}
			</p>
		</section>

		{spares.length > 0 && (
			<section className="tuning">
				<header className="header">
					<h3 className="title">
						{t.pages.launch.spares}
					</h3>
					<p className="file">
						{SPARE_INI}
					</p>
				</header>
				<p className="description">
					{t.pages.launch.sparesDescription}
				</p>
				<ul className="rows">
					{spares.map(entry => (
						<li key={entry.name} className="row entry">
							<header className="line">
								<h4 className="name">
									{entry.name}
								</h4>
							</header>
							<p className="keys">
								{Object.entries(entry.keys).map(([key, value]) => `${key}=${value}`).join('  ')}
							</p>
						</li>
					))}
				</ul>
			</section>
		)}

		{systems.length > 0 && (
			<section className="tuning">
				<header className="header">
					<h3 className="title">
						{t.pages.launch.systems}
					</h3>
					<p className="file">
						bootloader/hekate_ipl.ini
					</p>
				</header>
				<p className="description">
					{t.pages.launch.systemsDescription}
				</p>
				<ul className="rows">
					{systems.map(entry => (
						<li key={entry.id} className="row entry">
							<header className="line">
								<h4 className="name">
									{entry.name}
								</h4>
							</header>
							<p className="description">
								{t.software.switch[entry.component]?.description}
							</p>
							<p className="keys">
								{Object.entries(entry.keys).map(([key, value]) => `${key}=${value}`).join('  ')}
							</p>
						</li>
					))}
				</ul>
			</section>
		)}

		<section className="components">
			<h3 className="title">
				{t.pages.launch.payloads}
			</h3>
			<p className="description">
				{t.pages.launch.payloadsDescription}
			</p>
			<ul className={`grid ${PAYLOADS.length % 2 == 0 && PAYLOADS.length % 3 != 0 ? 'grid2' : 'grid3'}`}>
				{PAYLOADS.map(component => (
					<ComponentTile
						key={component.id}
						component={component}
						platform={SWITCH}
						isSelected={selectedComponentIDs.includes(component.id)}
						toggle={toggleComponent}
						t={t} />
				))}
			</ul>
		</section>

		<section className="tuning">
			<header className="header">
				<h3 className="title">
					{t.pages.launch.autoboot}
				</h3>
			</header>
			<p className="description">
				{t.pages.launch.autobootDescription}
			</p>
			<ul className="choices">
				{[{ id: 'menu', name: t.pages.launch.menu }, ...entries].map(entry => (
					<li
						key={entry.id}
						className={`choice ${autoboot == entry.id ? 'active' : ''}`}
						tabIndex={0}
						onClick={() =>{  setLaunch({ ...launch, autoboot: entry.id }); }}
						onKeyDown={activate}>
						{entry.name}
					</li>
				))}
			</ul>
		</section>

		{tuningGroups(CATALOG.tuning, 'launch', selectedComponentIDs).map(group => (
			<TuningSection
				key={group.id}
				platform={SWITCH}
				group={group}
				tuning={tuning}
				setTuningOption={setTuningOption}
				t={t} />
		))}
	</>);
}
