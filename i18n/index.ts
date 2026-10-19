import { type PlatformId, type StepId } from '@/types';
import { PLATFORM_IDS } from '@/state';
import type { Language, Translation } from './types';

import AUTONYMS from './autonyms.yaml';

export * from './types';

export const LANGUAGES: Language[] = ['en', 'ru', 'uk'];

// Texts of a language lie in its folder: the page in index.yaml, the catalogs of a platform in the folder of the platform
const FILES = import.meta.glob<Record<string, any>>('./*/**/*.yaml', { eager: true, import: 'default' });

function translation(lang: Language): Translation {
	const catalogs = (file: string) => Object.fromEntries(PLATFORM_IDS.map(platform => [platform, FILES[`./${lang}/${platform}/${file}.yaml`]]));
	const texts = { ...FILES[`./${lang}/index.yaml`], software: catalogs('software'), tuning: catalogs('tuning') } as Translation;
	// Languages name themselves, so the options that list languages take their names from one place
	for (const [path, names] of Object.entries(AUTONYMS)) {
		const [group, option] = path.split('.');
		texts.tuning.switch[group].options[option].values = names;
	}
	return texts;
}

export const I18N = Object.fromEntries(LANGUAGES.map(lang => [lang, translation(lang)])) as {[lang in Language]: Translation};

// Replaces {name} placeholders with the params
export const format = (template: string, params: Record<string, string | number>): string => template.replaceAll(/\{(\w+)\}/g, (match, key) => key in params ? String(params[key]) : match);

// Name of a step as the platform calls it
export const stepName = (t: Translation, platform: PlatformId, step: StepId): string => t.platforms[platform].steps?.[step] ?? t.steps[step];
