import { REVISIONS, cellOf, flag, number, numbered, oneOf } from '@/parse';
import type { HardwareInfo, PlatformId } from '@/types';

import HARDWARE_ROWS from './hardware.tsv';
import LINK_ROWS from './link.tsv';

export const PLATFORM_IDS: PlatformId[] = ['switch', 'psp'];

// Consoles of every platform, the revision of a build tells its platform
export const HARDWARE: HardwareInfo[] = HARDWARE_ROWS.map(row => ({
	id: oneOf(REVISIONS, row.id),
	platform: oneOf(PLATFORM_IDS, row.platform),
	name: cellOf(row, 'name'),
	codename: cellOf(row, 'codename'),
	is_modchip_required: flag(row.is_modchip_required),
	image: cellOf(row, 'image'),
	width: number(row.width),
	height: number(row.height),
	screen: number(row.screen),
}));

// Consoles by the numbers short links name them with, one numbering for every platform: the console tells the platform of a link
export const HARDWARE_CODES = numbered(LINK_ROWS, 'hardware');
