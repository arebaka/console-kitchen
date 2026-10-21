import { Language, Translation } from '@i18n';
import React, { useMemo } from 'react';

import { matchingPreset } from '@/data';
import { Platform } from '@/platforms';
import { Fix, Issue } from '@/types';
import { activate } from '@/utils';

import { ComponentTile } from '../ComponentTile';
import { Issues } from '../Issues';

interface SoftwareProps {
	lang: Language;
	platform: Platform;
	selectedComponentIDs: string[];
	toggleComponent: (id: string) => void;
	applyPreset: (id: string) => void;
	issues: Issue[];
	applyFix: (fix: Fix) => void;
	t: Translation;
}

export function Software({
	platform,
	selectedComponentIDs,
	toggleComponent,
	applyPreset,
	issues,
	applyFix,
	t,
}: SoftwareProps) {
	const { categories, components, presets } = platform.catalog;
	// A selection edited by hand matches no preset and shows up as a custom one
	const preset = useMemo(
		() => matchingPreset(platform.catalog, selectedComponentIDs),
		[platform, selectedComponentIDs],
	);

	return (
		<>
			<section className='batch'>
				<ul className='choices'>
					{presets.map(item => (
						<li
							key={item.id}
							className={`choice ${preset?.id == item.id ? 'active' : ''}`}
							tabIndex={0}
							onClick={() => {
								applyPreset(item.id);
							}}
							onKeyDown={activate}
						>
							{t.pages.software.presets[item.id]}
						</li>
					))}
					{!preset && (
						<li className='choice active custom'>
							{t.pages.software.custom}
						</li>
					)}
				</ul>
			</section>

			<Issues
				issues={issues}
				platform={platform}
				applyFix={applyFix}
				t={t}
			/>

			<ul className='list'>
				{categories.map(category => {
					const items = components.filter(
						comp => comp.category == category,
					);

					return (
						<section key={category} className='components'>
							<h3 className='title'>
								{t.pages.software.categories[category]}
							</h3>
							<ul
								className={`grid ${items.length % 2 == 0 && items.length % 3 != 0 ? 'grid2' : 'grid3'}`}
							>
								{items.map(component => (
									<ComponentTile
										key={component.id}
										component={component}
										platform={platform}
										isSelected={selectedComponentIDs.includes(
											component.id,
										)}
										toggle={toggleComponent}
										t={t}
									/>
								))}
							</ul>
						</section>
					);
				})}
			</ul>
		</>
	);
}
