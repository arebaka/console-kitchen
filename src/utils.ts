import { KeyboardEvent } from 'react';

// Enter and Space activate clickable tiles and rows, as A does on the console
export function activate(event: KeyboardEvent<HTMLElement>): void {
	if (event.key == 'Enter' || event.key == ' ') {
		event.preventDefault();
		event.currentTarget.click();
	}
}

// Size in decimal units, as downloads are measured
export function formatSize(bytes: number, decimals: number = 2): string {
	const k = 1000;
	if (bytes < k) {
		return bytes + ' B';
	}

	const dm = decimals < 0 ? 0 : decimals;
	const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Width in inches of Apple panels by their default scaled width in points
const APPLE_PANELS: {[width: number]: number} = {
	1440: 11.28, // MacBook Air 13" M1, MacBook Pro 13"
	1470: 11.43, // MacBook Air 13.6"
	1512: 11.91, // MacBook Pro 14"
	1536: 13.59, // MacBook Pro 16" 2019
	1710: 12.86, // MacBook Air 15"
	1728: 13.61, // MacBook Pro 16"
	2240: 20.55, // iMac 24"
	2560: 23.49, // iMac 27", Studio Display and other 27" displays
	3008: 27.6 // Pro Display XDR
};

// Browsers draw a CSS inch as 96 pixels on any screen and keep its physical size to themselves.
// Systems scale their pixels to a density of their own, so it is estimated from the platform:
// phones and tablets keep about 160 and 132 per inch, Retina Macs follow the width of their panel, other systems stay near 96
export function pixelsPerInch(): number {
	const agent = navigator.userAgent;
	if (agent.includes('iPad') || (agent.includes('Macintosh') && navigator.maxTouchPoints > 1)) return 132;
	if (/Android|iPhone|Mobile/.test(agent)) return 160;
	if (agent.includes('Macintosh') && devicePixelRatio >= 2) {
		// Points of the screen do not change with the browser zoom, CSS pixels do
		const zoom = devicePixelRatio / 2;
		const points = Math.round(screen.width * zoom);
		return (APPLE_PANELS[points] ? points / APPLE_PANELS[points] : 110) / zoom;
	}
	return 96;
}

export function downloadFile(name: string, content: Blob | string): void {
	const blob = content instanceof Blob ? content : new Blob([content], { type: 'text/plain' });
	const uri = URL.createObjectURL(blob);

	const link = document.createElement('a');
	link.href = uri;
	link.download = name;
	link.click();

	// Firefox cancels the download if the URI is revoked synchronously
	setTimeout(() =>{  URL.revokeObjectURL(uri); });
}

// Windows PowerShell reads scripts without a byte order mark in the ANSI code page
export const withBOM = (path: string, content: string) => path.endsWith('.ps1') ? `﻿${content}` : content;
