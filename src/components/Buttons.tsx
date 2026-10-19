import { Translation } from '@i18n';
import React from 'react';

import { activate } from '@/utils';

// Buttons in the order of the Joy-Con they are on
const LEFT = ['ZL', 'L', 'MINUS', 'LS', 'DLEFT', 'DUP', 'DDOWN', 'DRIGHT'];
const RIGHT = ['ZR', 'R', 'PLUS', 'RS', 'Y', 'X', 'B', 'A'];

// Some modules name the stick presses their own way
const ALIASES: { [name: string]: string } = {
	LSTICK: 'LS',
	RSTICK: 'RS',
};

// Shape and label of every button, as the system UI draws them
const GLYPHS: { [button: string]: { shape: string; label: string } } = {
	A: { shape: 'face', label: 'A' },
	B: { shape: 'face', label: 'B' },
	X: { shape: 'face', label: 'X' },
	Y: { shape: 'face', label: 'Y' },
	L: { shape: 'bumper', label: 'L' },
	R: { shape: 'bumper', label: 'R' },
	ZL: { shape: 'trigger left', label: 'ZL' },
	ZR: { shape: 'trigger right', label: 'ZR' },
	MINUS: { shape: 'system', label: '−' },
	PLUS: { shape: 'system', label: '+' },
	DLEFT: { shape: 'direction left', label: '' },
	DUP: { shape: 'direction up', label: '' },
	DDOWN: { shape: 'direction down', label: '' },
	DRIGHT: { shape: 'direction right', label: '' },
	LS: { shape: 'stick', label: 'L' },
	RS: { shape: 'stick', label: 'R' },
};

// The button a value of an option stands for
export const buttonName = (value: string) => ALIASES[value] ?? value;

// Options whose every value is a controller button get drawn as buttons
export function isButtons(values: (string | number)[]): boolean {
	return values.every(value => buttonName(String(value)) in GLYPHS);
}

interface ButtonsProps {
	values: string[];
	selected: string[];
	isEnabled: boolean;
	isLocked?: (value: string) => boolean; // buttons the selection cannot take or lose now
	toggle: (value: string) => void;
	t: Translation;
}

export function Buttons({
	values,
	selected,
	isEnabled,
	isLocked,
	toggle,
	t,
}: ButtonsProps) {
	const side = (order: string[]) =>
		order
			.map(name => values.find(value => buttonName(value) == name))
			.filter(value => value !== undefined);

	return (
		<div className='buttons'>
			{[side(LEFT), side(RIGHT)]
				.filter(group => group.length)
				.map((group, index) => (
					<ul key={index} className='side'>
						{group.map(value => {
							const name = buttonName(value);
							const locked = isLocked?.(value) ?? false;
							return (
								<li
									key={value}
									className={`button ${GLYPHS[name].shape} ${selected.includes(value) ? 'active' : ''} ${locked ? 'locked' : ''}`}
									title={t.buttons[name]}
									aria-label={t.buttons[name]}
									aria-disabled={locked || undefined}
									tabIndex={
										isEnabled && !locked ? 0 : undefined
									}
									onClick={() => !locked && toggle(value)}
									onKeyDown={activate}
								>
									{GLYPHS[name].label}
								</li>
							);
						})}
					</ul>
				))}
		</div>
	);
}
