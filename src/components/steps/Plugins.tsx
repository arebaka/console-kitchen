import React from 'react';

import { ComponentInfo, Fix, Issue, PspState, TuningValue } from '@/types';
import { Language, Translation } from '@i18n';
import { tuningGroups } from '@/data';
import { CATALOG, PSP, RUNLEVELS, pluginScope, selectedPlugins } from '@/platforms/psp';
import { activate } from '@/utils';
import { Issues } from '../Issues';
import { TuningSection } from './Tuning';

interface PluginsProps {
	lang: Language;
	build: PspState;
	setPlugin: (id: string, scope: string[]) => void;
	setTuningOption: (group: string, option: string, value: TuningValue) => void;
	issues: Issue[];
	applyFix: (fix: Fix) => void;
	t: Translation;
}

// Runlevels of every selected plugin of ARK, the lines of SEPLUGINS/PLUGINS.TXT
export function Plugins({
	lang,
	build,
	setPlugin,
	setTuningOption,
	issues,
	applyFix,
	t
}: PluginsProps) {
	const { runlevels, off } = t.pages.plugins;

	// Always stands alone, the other runlevels combine, the last one off turns the plugin off
	const toggle = (comp: ComponentInfo, level: string) => {
		const scope = pluginScope(build, comp);
		setPlugin(comp.id, level == 'always'
			? (scope.includes(level) ? [] : [level])
			: RUNLEVELS.filter(item => item != 'always' && (item == level ? !scope.includes(item) : scope.includes(item))));
	};

	return (<>
		<Issues
			issues={issues}
			platform={PSP}
			applyFix={applyFix}
			t={t} />

		<section className="tuning">
			<header className="header">
				<h3 className="title">
					{t.pages.plugins.list}
				</h3>
				<p className="file">
					SEPLUGINS/PLUGINS.TXT
				</p>
			</header>
			<ul className="rows">
				{selectedPlugins(build.selectedComponentIDs).map(comp => {
					const scope = pluginScope(build, comp);

					return (
						<li key={comp.id} className="row">
							<header className="line">
								<h4 className="name">
									{comp.name}
								</h4>
								<p className={`value ${scope.length > 0 ? 'on' : ''}`}>
									{scope.length > 0 ? scope.map(level => runlevels[level]).join(', ') : off}
								</p>
							</header>
							<p className="keys">
								{scope.join(' ') || 'always'}, {comp.plugin!.path}, {scope.length > 0 ? 'on' : 'off'}
							</p>
							<ul className="choices">
								{RUNLEVELS.map(level => (
									<li
										key={level}
										className={`choice ${scope.includes(level) ? 'active' : ''}`}
										tabIndex={0}
										onClick={() => toggle(comp, level)}
										onKeyDown={activate}>
										{runlevels[level]}
									</li>
								))}
							</ul>
						</li>
					);
				})}
			</ul>
		</section>

		{tuningGroups(CATALOG.tuning, 'plugins', build.selectedComponentIDs).map(group => (
			<TuningSection
				key={group.id}
				platform={PSP}
				group={group}
				tuning={build.tuning}
				setTuningOption={setTuningOption}
				t={t} />
		))}
	</>);
}
