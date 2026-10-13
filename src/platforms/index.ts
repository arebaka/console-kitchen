import { BuildState, Catalog, FirmwareVersion, Issue, LinkCodes, PlatformId, StepId } from '@/types';
import { Translation } from '@i18n';
import { BuildRequest, BuildResult } from '@/build';
import { Params } from '@/url';
import { SWITCH } from './switch';
import { PSP } from './psp';

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
}

export const PLATFORMS: {[platform in PlatformId]: Platform} = {
	switch: SWITCH,
	psp: PSP
};
