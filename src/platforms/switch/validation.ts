import { ClockKey, ClockMode, Issue, SwitchState } from '@/types';
import { Translation } from '@i18n';
import { componentIssues, sortIssues } from '@/validation';
import { CATALOG, COMPONENTS, HOS_VERSIONS, OVERCLOCK, isHOSSupported, launchEntries } from './data';

// Everything to check before building, errors first. Every issue points at the step to fix it on
export function validate(build: SwitchState, t: Translation): Issue[] {
	const issues: Issue[] = [];
	const selected = COMPONENTS.filter(comp => build.selectedComponentIDs.includes(comp.id));
	const hos = HOS_VERSIONS.find(v => v.version == build.firmware);
	const atmosphere = COMPONENTS.find(comp => comp.id == 'atmosphere')!;

	if (!isHOSSupported(build.firmware)) {
		issues.push({ level: 'error', code: 'hosUnsupported', step: 'firmware', params: { hos: build.firmware } });
	}

	if (launchEntries(build.launch, build.selectedComponentIDs).length === 0) {
		issues.push({ level: 'error', code: 'noEntries', step: 'launch', params: {} });
	}

	for (const comp of selected) {
		// Payloads are picked on the Launch step
		const step = comp.payload ? 'launch' : 'software';
		issues.push(...componentIssues(CATALOG, build, comp, step, t));

		// Components patching HOS or Atmosphere have to be released after the support of the chosen versions
		if (comp.tracks?.includes('hos') && comp.released && hos?.supported && new Date(comp.released) < hos.supported) {
			issues.push({ level: 'warning', code: 'hosTracks', step: 'firmware', params: { component: comp.name, hos: hos.version } });
		}
		if (comp.tracks?.includes('atmosphere') && comp.released && atmosphere.released && comp.released < atmosphere.released) {
			issues.push({ level: 'warning', code: 'atmosphereTracks', step: 'software', params: { component: comp.name, version: atmosphere.version } });
		}
	}

	const ftp = build.tuning.sys_ftpd_light;
	if (build.selectedComponentIDs.includes('sys_ftpd_light') && !ftp.anonymous && (!ftp.user || !ftp.password)) {
		issues.push({ level: 'warning', code: 'ftpCredentials', step: 'sysmodules', params: {} });
	}

	if (build.selectedComponentIDs.includes('sys_clk')) {
		for (const profile of build.overclock) {
			for (const [key, caps] of Object.entries(OVERCLOCK.caps)) {
				const cap = caps[build.hardware];
				if ((profile.clocks[key as ClockKey] ?? 0) > cap) {
					const mode = key.replace(/_(cpu|gpu|mem)$/, '') as ClockMode;
					issues.push({ level: 'info', code: 'gpuCap', step: 'overclock', params: { game: profile.name, cap: String(cap), mode: t.pages.overclock.modes[mode] } });
				}
			}
		}
	}

	return sortIssues(issues);
}
