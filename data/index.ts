import type { HardwareInfo, HardwareRevision, PlatformId } from '@/types';
import { flag, number, numbered } from '@/parse';

import HARDWARE_ROWS from './hardware.tsv';
import LINK_ROWS from './link.tsv';

// Consoles of every platform, the revision of a build tells its platform
export const HARDWARE: HardwareInfo[] = HARDWARE_ROWS.map(row => ({
	id: row.id as HardwareRevision,
	platform: row.platform as PlatformId,
	name: row.name,
	codename: row.codename,
	is_modchip_required: flag(row.is_modchip_required),
	image: row.image,
	width: number(row.width),
	height: number(row.height),
	screen: number(row.screen)
}));

// Consoles by the numbers short links name them with, one numbering for every platform: the console tells the platform of a link
export const HARDWARE_CODES = numbered(LINK_ROWS, 'hardware');
