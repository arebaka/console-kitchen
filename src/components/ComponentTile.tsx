import React from 'react';

import { ComponentInfo } from '@/types';
import { Translation, format } from '@i18n';
import { Platform } from '@/platforms';
import { activate, formatSize } from '@/utils';

interface ComponentTileProps {
	component: ComponentInfo;
	platform: Platform;
	isSelected: boolean;
	toggle: (id: string) => void;
	t: Translation;
}

// A component of the catalog with its logo, source and texts, selected by a click
export function ComponentTile({
	component,
	platform,
	isSelected,
	toggle,
	t
}: ComponentTileProps) {
	const text = t.software[platform.id][component.id];
	const parent = platform.catalog.components.find(comp => comp.id == component.sources.bundled);
	// What ships with a required component cannot be switched off either
	const isRequired = component.required || !!parent?.required;

	return (
		<li
			className={`component
				${isRequired ? 'required' : ''}
				${parent ? 'bundled' : ''}
				${isSelected ? 'active' : ''}`}
			tabIndex={0}
			onClick={() => toggle(component.id)}
			onKeyDown={activate}>
			{component.logo ? (
				<img src={`logos/${platform.id}/${component.logo}`} alt="" className="logo" loading="lazy" />
			) : (
				<span className="logo monogram" aria-hidden="true">
					{component.name[0]}
				</span>
			)}
			<div className="info">
				<header className="header">
					<h4 className="name">
						{component.name}
					</h4>
					{/* Badges stand before the version and move with it under a long name */}
					<div className="meta">
						{isRequired && (
							<p className="badge required">
								{t.pages.software.requiredBadge}
							</p>
						)}
						{component.deprecated && (
							<p className="badge warning">
								{t.pages.software.deprecatedBadge}
							</p>
						)}
						{component.risky && (
							<p className="badge warning">
								{t.pages.software.riskyBadge}
							</p>
						)}
						<p className="size">
							{component.size > 0 && formatSize(component.size)}
						</p>
					</div>
				</header>
				<p className="source">
					{component.author} · {parent
						? format(t.pages.software.bundledBadge, { component: parent.name })
						: t.pages.software.sources[component.source]
					} · {component.version}
				</p>
				<p className="description">
					{text?.description}
				</p>
				<p className="details">
					{text?.details}
				</p>
				{text?.note && (
					<p className="note">
						{text.note}
					</p>
				)}
			</div>
		</li>
	);
}
