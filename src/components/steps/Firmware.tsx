import { Language, Translation } from '@i18n';
import React from 'react';

import { Platform } from '@/platforms';
import { Fix, Issue } from '@/types';
import { activate } from '@/utils';

import { Issues } from '../Issues';

interface VersionProps {
	lang: Language;
	platform: Platform;
	version: string;
	setVersion: (version: string) => void;
	issues: Issue[];
	applyFix: (fix: Fix) => void;
	t: Translation;
}

export function Firmware({
	lang,
	platform,
	version,
	setVersion,
	issues,
	applyFix,
	t,
}: VersionProps) {
	return (
		<>
			<Issues
				issues={issues}
				platform={platform}
				applyFix={applyFix}
				t={t}
			/>

			<ul className='grid grid3'>
				{platform.firmware.map(v => (
					<li
						key={v.version}
						className={`item ${v.status} ${version == v.version ? 'active' : ''}`}
						tabIndex={0}
						onClick={() => {
							setVersion(v.version);
						}}
						onKeyDown={activate}
					>
						<header className='header'>
							<h3 className='name'>{v.version}</h3>
							<p className='date'>
								{v.date.toLocaleDateString(lang)}
							</p>
							<p
								className={`badge ${v.status == 'stable' ? 'ok' : v.status == 'legacy' ? 'warning' : 'danger'}`}
							>
								{t.pages.firmware.status[v.status]}
							</p>
						</header>
						{!platform.isFirmwareSupported(v.version) && (
							<p className='note'>
								{t.platforms[platform.id].unsupported ??
									t.pages.firmware.unsupported}
							</p>
						)}
					</li>
				))}
			</ul>
		</>
	);
}
