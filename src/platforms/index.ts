import { Translation } from '@i18n';

import { BuildRequest, BuildResult, GeneratedFile } from '@/build';
import { CardReading, CardTexts, MovedSections } from '@/read';
import {
	BuildState,
	Catalog,
	FirmwareVersion,
	Issue,
	LinkCodes,
	PlatformId,
	StepId,
} from '@/types';
import { Params } from '@/url';

import { PSP } from './psp';
import { SWITCH } from './switch';

// A Console Kitchen builds for: its software, system versions and steps, its links and what a build turns into
export interface Platform<S extends BuildState = BuildState> {
	id: PlatformId;
	catalog: Catalog;
	firmware: FirmwareVersion[]; // newest first
	isFirmwareSupported(version: string): boolean;
	defaults(): S;
	glyphs: { next: string; back: string; rebuild: string }; // buttons of the console the footer hints at, letters or PlayStation symbols

	steps(build: S): StepId[]; // steps the build goes through, in their order
	values(build: S): Partial<Record<StepId, string | number>>; // what the sidebar shows next to the steps of its own
	link: LinkCodes; // numbers short links name things by
	encode(build: S): Params; // params of a link reproducing the build, spelled in full
	decode(params: URLSearchParams): S; // the build of a link spelled in full, anything invalid keeps its default
	validate(build: S, t: Translation): Issue[];
	build(request: BuildRequest<S>): BuildResult;
	trace: string; // folder of the card the installers leave the build and the files of its components in
	configPaths: string[]; // configs builds write, a dump of a card reads them whether their components are installed or not
	readCard(texts: CardTexts): CardReading; // what the configs of a card stand for
	uncoveredCard(
		request: BuildRequest<S>,
		texts: CardTexts,
	): { path: string; lines: string[] }[]; // what writing them again would lose
	moveCard(
		texts: CardTexts,
		written: string[],
	): { configs: GeneratedFile[]; moved: MovedSections[] }; // what moves elsewhere instead
}

export const PLATFORMS: { [platform in PlatformId]: Platform } = {
	switch: SWITCH,
	psp: PSP,
};
