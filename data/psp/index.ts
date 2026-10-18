import { type Conditions, type Row, components, files, firmware, link, presets, tuning } from '@/parse';

import LINK_ROWS from './link.tsv';
import FIRMWARE_ROWS from './firmware.tsv';
import SOFTWARE_ROWS from './software/index.tsv';
import SOFTWARE_SOURCES from './software/sources.yaml';
import FILE_ROWS from './software/files.tsv';
import PRESET_ROWS from './presets.tsv';
import TUNING_ROWS from './tuning/index.tsv';
import TUNING_CONDITIONS from './tuning/when.yaml';

// Options of the groups lie in tables named after them
const TUNING_TABLES = import.meta.glob<Row[]>('./tuning/*.tsv', { eager: true, import: 'default' });

export const FIRMWARE = firmware(FIRMWARE_ROWS);
export const SOFTWARE = components(SOFTWARE_ROWS, SOFTWARE_SOURCES);
export const FILES = files(FILE_ROWS);
export const PRESETS = presets(PRESET_ROWS);
export const TUNING = tuning(TUNING_ROWS, path => TUNING_TABLES[`./tuning/${path}`], TUNING_CONDITIONS as Conditions);
export const LINK = link(LINK_ROWS);
