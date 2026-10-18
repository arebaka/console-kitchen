import React, { useState, useEffect, useMemo, useRef } from 'react';

import { BuildState, Fix, GameProfile, HardwareRevision, Issue, IssueLevel, LaunchConfig, PspState, StepId, SwitchState, TuningGroup, TuningStep, TuningValue, Uploads } from './types';
import { format, I18N } from '@i18n';
import { HARDWARE } from '@data';
import { getTuningDefaults, isTuningOptionChanged, presetSelection, resolveSelection, tuningGroups } from './data';
import { PLATFORMS } from './platforms';
import { launchEntries } from './platforms/switch';
import { PSP } from './platforms/psp';
import { AppState, decodeState, encodeState, importBuild, withBuild } from './state';
import { issueKey } from './validation';
import { DUMP_SCRIPTS } from './dump';
import { CardSnapshot, ForeignAction, importDump, readDump } from './card';
import { readToml } from './toml';

import { Topbar, OpenedFile, Sidebar, SidebarItem, Toast, Toasts, Glyph, Hardware, Firmware, Software, Launch, Tuning, Plugins, Overclock, Appearance, Build } from './components';

// Options changed on a step, counting only groups whose components are selected
function countChanges(groups: TuningGroup[], build: BuildState, step: TuningStep): number {
	return tuningGroups(groups, step, build.selectedComponentIDs)
		.reduce((count, group) => count + group.options.filter(option => isTuningOptionChanged(group, option, build.tuning)).length, 0);
}

const LEVELS: IssueLevel[] = ['error', 'warning', 'info'];

// Steps that are lists of settings and nothing else
const SETTINGS_STEPS = ['system', 'security', 'sysmodules', 'overlays', 'status_monitor', 'dbi', 'jksv', 'amiibo'] as const;

export default function App() {
	const [state, setState] = useState<AppState>(() => decodeState(location.search));
	const [uploads, setUploads] = useState<Uploads>({});
	// Dumps of cards by platform, kept only in this tab like the uploads: links cannot carry them
	const [cards, setCards] = useState<{[platform: string]: CardSnapshot}>({});
	const update = (patch: Partial<AppState>) => setState(prev => ({ ...prev, ...patch }));
	// Changes the build of the current platform, a function gets the build as it is by then
	const updateBuild = (patch: Partial<SwitchState | PspState> | ((build: BuildState) => Partial<BuildState>)) => setState(prev => {
		const build = prev.builds[prev.platform];
		return { ...prev, builds: withBuild(prev.builds, prev.platform, { ...build, ...(typeof patch === 'function' ? patch(build) : patch) }) };
	});

	const { lang } = state;
	const t = I18N[lang];
	const platform = PLATFORMS[state.platform];
	const build = state.builds[state.platform];
	const { hardware, firmware, selectedComponentIDs, tuning } = build;
	const { components, presets, tuning: groups } = platform.catalog;
	const texts = t.platforms[platform.id];
	// Steps only a Switch or a PSP goes through
	const { hardware: revision, launch, overclock, appearance } = state.builds.switch;
	const psp = state.builds.psp;

	const steps = platform.steps(build);
	const step = steps.includes(state.step) ? state.step : steps[0];
	const index = steps.indexOf(step);
	const setStep = (step: StepId) => update({ step });

	const issues = useMemo(() => platform.validate(build, t), [platform, build, t]);
	const contentRef = useRef<HTMLElement>(null);

	const [toasts, setToasts] = useState<Toast[]>([]);
	const lastToast = useRef(0);
	// A toast lasts as long as its issue and offers the fixes the issue has by now
	const liveToasts = toasts.flatMap(toast => {
		const issue = issues.find(issue => issueKey(issue) == issueKey(toast.issue));
		return issue ? [{ ...toast, issue }] : [];
	});
	// The three newest at most, so a phone keeps some of the page in sight
	const notify = (fresh: Issue[]) => setToasts(prev => [
		...prev.filter(toast => !fresh.some(issue => issueKey(issue) == issueKey(toast.issue))),
		...fresh.map(issue => ({ id: ++lastToast.current, issue }))
	].slice(-3));
	const dismiss = (id: number) => setToasts(prev => prev.filter(toast => toast.id != id));

	// Toasts of solved issues go away, so they never come back with the issue
	useEffect(() => {
		setToasts(prev => prev.filter(toast => issues.some(issue => issueKey(issue) == issueKey(toast.issue))));
	}, [issues]);

	// Every option lands in the address, so a link reproduces the build
	useEffect(() => {
		const query = encodeState(state);
		history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}`);
	}, [state]);

	// Hyphenation, quotes and the choice of fonts follow the language of the page
	useEffect(() => {
		document.documentElement.lang = lang;
	}, [lang]);

	// The page takes the look of the console, the PSP also takes the color of the month as its XMB does
	useEffect(() => {
		document.documentElement.dataset.platform = platform.id;
		document.documentElement.dataset.month = String(new Date().getMonth() + 1);
	}, [platform.id]);

	// Every step starts from the top
	useEffect(() => {
		contentRef.current?.scrollTo(0, 0);
	}, [step]);

	// Escape and Enter act as B and A of the footer. A focused control keeps Enter for itself, fields keep both
	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.defaultPrevented) return;
			if (event.target instanceof Element && event.target.matches('input, select, textarea')) return;

			if (event.key == 'Escape' && index > 0) {
				setStep(steps[index - 1]);
			} else if (event.key == 'Enter' && event.target == document.body && index < steps.length - 1) {
				setStep(steps[index + 1]);
			}
		};

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [steps.join(), index]);

	// Size calculator
	const totalSize = components
		.filter(comp => selectedComponentIDs.includes(comp.id))
		.reduce((sum, current) => sum + current.size, 0);

	// A console of another platform switches to the build of that platform
	const setHardware = (id: HardwareRevision) => {
		const platform = HARDWARE.find(hw => hw.id == id)!.platform;
		setState(prev => ({ ...prev, platform, builds: withBuild(prev.builds, platform, { ...prev.builds[platform], hardware: id }) }));
	};

	// Adding a component brings its dependencies, removing it leaves them for the user to decide.
	// Issues the click brings pop up as toasts
	const toggleComponent = (id: string) => {
		const comp = components.find(c => c.id === id);
		if (!comp || comp.required || comp.sources.bundled) return; // Ignore mandatory and bundled entries

		const selection = selectedComponentIDs.includes(id)
			? resolveSelection(platform.catalog, selectedComponentIDs.filter(item => item !== id), false)
			: resolveSelection(platform.catalog, [...selectedComponentIDs, id]);
		const known = new Set(issues.map(issueKey));
		notify(platform.validate({ ...build, selectedComponentIDs: selection }, t).filter(issue => !known.has(issueKey(issue))));
		updateBuild({ selectedComponentIDs: selection });
	};

	const applyPreset = (id: string) => {
		updateBuild({ selectedComponentIDs: presetSelection(platform.catalog, presets.find(preset => preset.id == id)!) });
	};

	// A fix adds or removes components, only an added one brings its dependencies
	const applyFix = (fix: Fix) => {
		updateBuild({
			selectedComponentIDs: resolveSelection(
				platform.catalog,
				[...selectedComponentIDs.filter(id => !fix.remove?.includes(id)), ...(fix.add ?? [])],
				!!fix.add
			)
		});
	};

	const setTuningOption = (group: string, option: string, value: TuningValue) => {
		updateBuild(({ tuning }) => ({ tuning: { ...tuning, [group]: { ...tuning[group], [option]: value } } }));
	};

	// Every option of the step returns to its default
	const resetTuning = (step: TuningStep) => {
		const defaults = getTuningDefaults(groups);
		updateBuild({ tuning: { ...tuning, ...Object.fromEntries(groups.filter(group => group.step == step).map(group => [group.id, defaults[group.id]])) } });
	};

	const setLaunch = (launch: LaunchConfig) => updateBuild({ launch });
	const setOverclock = (overclock: GameProfile[]) => updateBuild({ overclock });

	// Runlevels of a plugin, the ones of the catalog leave the build
	const setPlugin = (id: string, scope: string[]) => {
		const { [id]: changed, ...plugins } = psp.plugins;
		const defaults = PSP.catalog.components.find(comp => comp.id == id)!.plugin!.scope;
		updateBuild({ plugins: scope.join() == defaults.join() ? plugins : { ...plugins, [id]: scope } });
	};

	// `key` is bootlogo, background, logo.<entry> or icon.<entry>, `image` is a gallery id, `upload` or nothing for the default
	const setImage = (key: string, image?: string, blob?: Blob) => {
		if (blob) {
			setUploads(prev => {
				if (prev[key]) URL.revokeObjectURL(prev[key].url);
				return { ...prev, [key]: { blob, url: URL.createObjectURL(blob) } };
			});
		}
		const [target, entry] = key.split('.') as ['bootlogo' | 'background' | 'logo' | 'icon', string?];
		if (target == 'logo' || target == 'icon') {
			const images = { ...appearance[`${target}s`] };
			if (image) images[entry!] = image;
			else delete images[entry!];
			updateBuild({ appearance: { ...appearance, [`${target}s`]: images } });
		} else {
			updateBuild({ appearance: { ...appearance, [target]: image } });
		}
	};

	// A build file replaces the build of its platform, as its link would
	// A dump of a card brings the build the card stands for and stays for the update the Build step makes of it
	const openFile = (text: string): OpenedFile | undefined => {
		const imported = importBuild(state, text);
		if (imported) {
			setState(imported);
			return 'build';
		}
		const dump = readDump(readToml(text));
		if (!dump) return undefined;
		const loaded = importDump(state, dump);
		setState(loaded.state);
		setCards(prev => ({ ...prev, [dump.platform]: loaded.snapshot }));
		return 'dump';
	};

	// What the update does with a foreign item on the card of the current platform
	const setCardAction = (path: string, action: ForeignAction) => setCards(prev => {
		const card = prev[platform.id];
		return card ? { ...prev, [platform.id]: { ...card, actions: { ...card.actions, [path]: action } } } : prev;
	});
	const forgetCard = () => setCards(({ [platform.id]: forgotten, ...rest }) => rest);

	const stepIssues = (step: StepId) => issues.filter(issue => issue.step == step);
	// The most serious issue of a step marks it in the sidebar
	const worst = (step: StepId) => LEVELS.find(level => stepIssues(step).some(issue => issue.level == level));

	const values: Partial<Record<StepId, string | number>> = {
		hardware: t.hardware[hardware].name,
		firmware,
		software: selectedComponentIDs.length,
		...Object.fromEntries(SETTINGS_STEPS.map(step => [step, countChanges(groups, build, step) || ''])),
		...platform.values(build)
	};
	const settingsStep = SETTINGS_STEPS.find(item => item == step);
	const sidebar: SidebarItem[] = steps.map(step => ({ step, value: values[step] ?? '', alert: worst(step) }));

	// Pages tell about the platform its own way where they have to
	const page = { ...t.pages[step], ...texts.pages?.[step] };

	return (<>
		<Topbar
			lang={lang}
			setLang={lang => update({ lang })}
			subtitle={texts.subtitle}
			scripts={DUMP_SCRIPTS}
			openFile={openFile}
			t={t} />

		<Sidebar
			items={sidebar}
			platform={platform.id}
			activeStep={step}
			setActiveStep={setStep}
			totalSize={totalSize}
			t={t} />

		<main ref={contentRef} className="content">
			<header className="header">
				<h2 className="title">
					{page.title}
				</h2>
				<p className="description">
					{page.description}
				</p>
			</header>

			{step == 'hardware' && (
				<Hardware
					lang={lang}
					hardware={hardware}
					setHardware={setHardware}
					t={t} />
			)}

			{step == 'firmware' && (
				<Firmware
					lang={lang}
					platform={platform}
					version={firmware}
					setVersion={firmware => updateBuild({ firmware })}
					issues={stepIssues('firmware')}
					applyFix={applyFix}
					t={t} />
			)}

			{step == 'software' && (
				<Software
					lang={lang}
					platform={platform}
					selectedComponentIDs={selectedComponentIDs}
					toggleComponent={toggleComponent}
					applyPreset={applyPreset}
					issues={stepIssues('software')}
					applyFix={applyFix}
					t={t} />
			)}

			{step == 'launch' && (
				<Launch
					lang={lang}
					launch={launch}
					setLaunch={setLaunch}
					selectedComponentIDs={selectedComponentIDs}
					toggleComponent={toggleComponent}
					tuning={tuning}
					setTuningOption={setTuningOption}
					issues={stepIssues('launch')}
					applyFix={applyFix}
					t={t} />
			)}

			{settingsStep && (
				<Tuning
					key={settingsStep}
					lang={lang}
					platform={platform}
					step={settingsStep}
					tuning={tuning}
					selectedComponentIDs={selectedComponentIDs}
					setTuningOption={setTuningOption}
					resetTuning={resetTuning}
					issues={stepIssues(settingsStep)}
					applyFix={applyFix}
					t={t} />
			)}

			{step == 'plugins' && (
				<Plugins
					lang={lang}
					build={psp}
					setPlugin={setPlugin}
					setTuningOption={setTuningOption}
					issues={stepIssues('plugins')}
					applyFix={applyFix}
					t={t} />
			)}

			{step == 'overclock' && (
				<Overclock
					lang={lang}
					hardware={revision}
					overclock={overclock}
					setOverclock={setOverclock}
					tuning={tuning}
					selectedComponentIDs={selectedComponentIDs}
					setTuningOption={setTuningOption}
					resetTuning={resetTuning}
					issues={stepIssues('overclock')}
					applyFix={applyFix}
					t={t} />
			)}

			{step == 'appearance' && (
				<Appearance
					lang={lang}
					hardware={hardware}
					appearance={appearance}
					entries={launchEntries(launch, selectedComponentIDs)}
					themebg={String(tuning.nyx.themebg)}
					uploads={uploads}
					setImage={setImage}
					t={t} />
			)}

			{step == 'build' && (
				<Build
					lang={lang}
					platform={platform}
					build={build}
					uploads={uploads}
					totalSize={totalSize}
					tuningChanges={(['launch', ...SETTINGS_STEPS, 'plugins'] as TuningStep[]).reduce((sum, step) => sum + countChanges(groups, build, step), 0)}
					issues={issues}
					applyFix={applyFix}
					setStep={setStep}
					card={cards[platform.id]}
					setCardAction={setCardAction}
					forgetCard={forgetCard}
					t={t} />
			)}
		</main>

		<footer className="controls">
			{index > 0 && (
				<button
					type="button"
					className="hint"
					onClick={() => setStep(steps[index - 1])}>
					<Glyph name={platform.glyphs.back} role="back" />
					{t.wizard.back}
				</button>
			)}
			{index < steps.length - 1 ? (
				<button
					type="button"
					className="hint"
					onClick={() => setStep(steps[index + 1])}>
					<Glyph name={platform.glyphs.next} role="next" />
					{t.wizard.next}
				</button>
			) : (
				<button
					type="button"
					className="hint"
					onClick={() => setStep(steps[0])}>
					<Glyph name={platform.glyphs.rebuild} role="rebuild" />
					{t.wizard.rebuild}
				</button>
			)}
		</footer>

		<Toasts
			toasts={liveToasts}
			platform={platform}
			applyFix={applyFix}
			dismiss={dismiss}
			t={t} />
	</>);
}
