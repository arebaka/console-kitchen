import React from 'react';

import { StepId } from '@/types';

// Line icons of the steps, as the XMB draws its categories: the console, the update, a gamepad, the toolbox and so on
const ICONS: {[step in StepId]: React.ReactNode} = {
	hardware: <>
		<rect x="2" y="7" width="20" height="10" rx="5" />
		<rect x="7.5" y="9" width="9" height="6" rx=".5" />
	</>,
	firmware: <>
		<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
		<path d="M19.5 4.5v3.5H16" />
		<path d="M12 9v3.5l2 1.5" />
	</>,
	software: <>
		<path d="M7 8h10a4.5 4.5 0 0 1 4.4 5.5l-.7 3a2.4 2.4 0 0 1-4.1 1.1L14.8 16H9.2l-1.8 1.6a2.4 2.4 0 0 1-4.1-1.1l-.7-3A4.5 4.5 0 0 1 7 8z" />
		<path d="M7.5 10.5v3M6 12h3" />
		<path d="M15.5 11.5h.01M17.5 12.8h.01" />
	</>,
	launch: <>
		<path d="M12 3v8" />
		<path d="M7.1 6.3a7.5 7.5 0 1 0 9.8 0" />
	</>,
	system: <>
		<rect x="3" y="8" width="18" height="11" rx="1.5" />
		<path d="M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8M3 13h18" />
		<path d="M11 12h2v2h-2z" />
	</>,
	security: <>
		<path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6z" />
		<path d="m9 12 2 2 4-4" />
	</>,
	sysmodules: <>
		<rect x="4" y="4" width="7" height="7" rx="1" />
		<rect x="13" y="4" width="7" height="7" rx="1" />
		<rect x="4" y="13" width="7" height="7" rx="1" />
		<rect x="13" y="13" width="7" height="7" rx="1" />
	</>,
	overlays: <>
		<rect x="3" y="8" width="13" height="12" rx="1.5" />
		<path d="M8 8V5.5A1.5 1.5 0 0 1 9.5 4h10A1.5 1.5 0 0 1 21 5.5v9a1.5 1.5 0 0 1-1.5 1.5H16" />
	</>,
	status_monitor: <>
		<rect x="3" y="5" width="18" height="12" rx="1.5" />
		<path d="M6 12h3l1.5-3 3 6 1.5-3h3" />
		<path d="M9 20h6" />
	</>,
	dbi: <>
		<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
		<path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
	</>,
	jksv: <>
		<path d="M5 4h11l3 3v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1z" />
		<path d="M8 4v5h7V4M8 20v-6h8v6" />
	</>,
	amiibo: <>
		<circle cx="12" cy="6.5" r="2.5" />
		<path d="M8.5 16v-2.5a3.5 3.5 0 0 1 7 0V16" />
		<rect x="5" y="16" width="14" height="4" rx="1.5" />
	</>,
	plugins: <path d="M9.5 3.5a2 2 0 0 1 4 0V6H18v4.5h-1.5a2 2 0 0 0 0 4H18V19h-4.5v-1.5a2 2 0 0 0-4 0V19H5v-4.5h1.5a2 2 0 0 0 0-4H5V6h4.5z" />,
	overclock: <>
		<path d="M4.5 17a8.5 8.5 0 1 1 15 0" />
		<path d="m12 13 4-4.5" />
		<path d="M12 13h.01" />
	</>,
	appearance: <>
		<path d="M12 3a9 9 0 0 0 0 18c1.2 0 2-.8 2-2 0-.6-.2-1-.5-1.4-.3-.4-.5-.8-.5-1.3 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.4 17 3 12 3z" />
		<path d="M7.5 11.5h.01M10 7.5h.01M15 7.5h.01" />
	</>,
	build: <>
		<path d="M12 4v10M8 10l4 4 4-4" />
		<path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
	</>
};

// Icon of a step, shown by the themes that draw steps as the categories of a menu
export function StepIcon({ step }: { step: StepId }) {
	return (
		<svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
			{ICONS[step]}
		</svg>
	);
}
