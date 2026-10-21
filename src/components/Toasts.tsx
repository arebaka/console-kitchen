import { Translation } from '@i18n';
import React, { useEffect, useEffectEvent, useState } from 'react';

import { Platform } from '@/platforms';
import { Fix, Issue } from '@/types';

import { Notice } from './Issues';

export interface Toast {
	id: number;
	issue: Issue;
}

interface ToastsProps {
	toasts: Toast[];
	platform: Platform;
	applyFix: (fix: Fix) => void;
	dismiss: (id: number) => void;
	t: Translation;
}

// How long a toast stays while nobody looks at it
const TIMEOUT = 8000;

// Issues a click has just brought, over the page: the list of the step may be scrolled away, on a phone it is out of sight at once
export function Toasts({
	toasts,
	platform,
	applyFix,
	dismiss,
	t,
}: ToastsProps) {
	// The pointer or the focus on the toasts holds them until it leaves
	const [isHeld, setHeld] = useState(false);
	const oldest = toasts[0]?.id;

	// The last toast may leave from under the pointer, which then never leaves it
	if (isHeld && toasts.length === 0) setHeld(false);

	// Toasts go away one by one, the oldest first. A new list of toasts does not start the time of the oldest again
	const expire = useEffectEvent(dismiss);
	useEffect(() => {
		if (oldest === undefined || isHeld) return undefined;
		const timer = setTimeout(() => {
			expire(oldest);
		}, TIMEOUT);
		return () => {
			clearTimeout(timer);
		};
	}, [oldest, isHeld]);

	return (
		<ul
			className='toasts'
			role='status'
			onMouseEnter={() => {
				setHeld(true);
			}}
			onMouseLeave={() => {
				setHeld(false);
			}}
			onFocus={() => {
				setHeld(true);
			}}
			onBlur={() => {
				setHeld(false);
			}}
		>
			{toasts.map(toast => (
				<li key={toast.id} className={`toast ${toast.issue.level}`}>
					<Notice
						issue={toast.issue}
						platform={platform}
						applyFix={fix => {
							applyFix(fix);
							dismiss(toast.id);
						}}
						t={t}
					/>
					<button
						className='dismiss'
						title={t.issues.dismiss}
						aria-label={t.issues.dismiss}
						onClick={() => {
							dismiss(toast.id);
						}}
					>
						✕
					</button>
				</li>
			))}
		</ul>
	);
}
