import React from 'react';

// Symbols of the PlayStation buttons, drawn so fonts cannot shift or squeeze them. The triangle stands on its centroid
const SHAPES: { [button: string]: React.ReactNode } = {
	cross: <path d='M8 8 16 16 M16 8 8 16' />,
	circle: <circle cx='12' cy='12' r='4.6' />,
	triangle: <path d='M12 6.7 17 15.3 H7 Z' />,
	square: <rect x='8' y='8' width='8' height='8' />,
};

interface GlyphProps {
	name: string; // a letter of a Nintendo button or a PlayStation symbol
	hint: 'next' | 'back' | 'rebuild';
}

// Button of the console a hint of the footer stands for
export function Glyph({ name, hint }: GlyphProps) {
	return (
		<span className={`glyph ${hint}`}>
			{SHAPES[name] ? (
				<svg viewBox='0 0 24 24' aria-hidden='true'>
					{SHAPES[name]}
				</svg>
			) : (
				name
			)}
		</span>
	);
}
