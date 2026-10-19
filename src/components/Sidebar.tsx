import React, { useEffect, useRef } from 'react';

import { IssueLevel, PlatformId, StepId } from '@/types';
import { Translation, stepName } from '@i18n';
import { formatSize } from '@/utils';
import { StepIcon } from './StepIcon';

export interface SidebarItem {
	step: StepId;
	value: string | number;
	alert?: IssueLevel;
}

interface SidebarProps {
	items: SidebarItem[];
	platform: PlatformId; // names some steps its own way
	activeStep: StepId;
	setActiveStep: (step: StepId) => void;
	totalSize: number;
	t: Translation;
}

export function Sidebar({
	items,
	platform,
	activeStep,
	setActiveStep,
	totalSize,
	t
}: SidebarProps) {
	const activeIndex = items.findIndex(item => item.step == activeStep);
	const activeRef = useRef<HTMLButtonElement>(null);

	// On phones the steps turn into a strip scrolled sideways, the active one stays in sight
	useEffect(() => {
		activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
	}, [activeStep]);

	return (
		<aside className="sidebar">
			{/* The XMB of the PSP slides the strip of steps by the index of the active one */}
			<ul className="steps" style={{ '--active': activeIndex } as React.CSSProperties}>
				{items.map((item, index) => (
					<li key={item.step}>
						<button
							ref={item.step == activeStep ? activeRef : undefined}
							className={`step ${item.step == activeStep ? 'active' : ''} ${index < activeIndex ? 'done' : ''}`}
							onClick={() =>{  setActiveStep(item.step); }}>
							<StepIcon step={item.step} />
							<span className="label">
								{stepName(t, platform, item.step)}
							</span>
							{item.alert && item.alert != 'info' && (
								<span className={`alert ${item.alert}`}></span>
							)}
							<span className="value">
								{item.value}
							</span>
						</button>
					</li>
				))}
			</ul>

			<footer className="metrics">
				<ul>
					<li className="metric">
						<span className="key">
							{t.metrics.size}
						</span>
						<span className="value">
							{formatSize(totalSize)}
						</span>
					</li>
				</ul>
			</footer>
		</aside>
	);
}
