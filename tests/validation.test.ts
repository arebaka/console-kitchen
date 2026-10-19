import { I18N } from '@i18n';
import { describe, expect, it } from 'vitest';

import { resolveSelection } from '@/data';
import { CATALOG, SWITCH } from '@/platforms/switch';
import { SwitchState } from '@/types';

import { customBuild, issueCodes } from './fixtures';

const scenario = (patch: Partial<SwitchState>) =>
	issueCodes({ ...SWITCH.defaults(), ...patch });
const selecting = (ids: string[], dependencies = true) => ({
	selectedComponentIDs: resolveSelection(CATALOG, ids, dependencies),
});
const fixes = (patch: Partial<SwitchState>, code: string) =>
	SWITCH.validate({ ...SWITCH.defaults(), ...patch }, I18N.en).find(
		issue => issue.code == code,
	)?.fixes;

describe('validation', () => {
	it('asks for a missing dependency', () => {
		expect(
			scenario(selecting(['fps_locker', 'ovlmenu'], false)),
		).toContainEqual('warning:requires:FPSLocker|SaltyNX');
	});

	it('offers every alternative of a dependency', () => {
		expect(scenario(selecting(['status_monitor'], false))).toContainEqual(
			'warning:requires:Status Monitor|Tesla Menu или Ultrahand',
		);
	});

	it('reports conflicting components once', () => {
		expect(
			scenario(selecting(['ovlmenu', 'ultrahand'])).filter(code =>
				code.startsWith('warning:conflict:'),
			),
		).toHaveLength(1);
	});

	it('lets either side of a conflict go and any alternative of a dependency come', () => {
		expect(fixes(selecting(['ovlmenu', 'ultrahand']), 'conflict')).toEqual([
			{ remove: ['ovlmenu'] },
			{ remove: ['ultrahand'] },
		]);
		expect(fixes(selecting(['status_monitor'], false), 'requires')).toEqual(
			[{ add: ['ovlmenu'] }, { add: ['ultrahand'] }],
		);
	});

	it('reports components covering each other once', () => {
		const codes = scenario(selecting(['jksv', 'checkpoint', 'neumann']));
		expect(codes.filter(code => code.startsWith('info:replaces:'))).toEqual(
			[
				'info:replaces:JKSV|Checkpoint',
				'info:replaces:JKSV|Neumann',
				'info:replaces:Checkpoint|Neumann',
			],
		);
	});

	it('keeps what the covered component runs on', () => {
		expect(fixes(selecting(['flycast']), 'replaces')).toEqual([
			{ remove: ['flycast'] },
		]);
		expect(fixes(selecting(['retroarch', 'mgba']), 'replaces')).toEqual([
			{ remove: ['mgba'] },
			{ remove: ['retroarch'] },
		]);
	});

	it('needs an entry in the Launch menu', () => {
		const launch = { ...SWITCH.defaults().launch, modes: [] };
		expect(
			scenario({ launch, ...selecting(['atmosphere']) }),
		).toContainEqual('error:noEntries:');
		expect(
			scenario({
				launch: { ...launch, emummcs: ['SD01'] },
				...selecting(['atmosphere']),
			}),
		).not.toContainEqual('error:noEntries:');
		expect(
			scenario({ launch, ...selecting(['atmosphere', 'lockpick_rcm']) }),
		).not.toContainEqual('error:noEntries:');
	});

	it('knows the revisions a component is useful on', () => {
		expect(
			scenario({
				hardware: 'erista',
				...selecting(['hwfly_toolbox']),
			}).some(code => code.startsWith('warning:hardware:')),
		).toBe(true);
	});

	it('warns about patches older than the support of the HOS version', () => {
		expect(scenario({ firmware: '23.0.0' })).toContainEqual(
			'warning:hosTracks:sys-patch|23.0.0',
		);
		expect(
			scenario({ firmware: '22.1.0' }).some(code =>
				code.startsWith('warning:hosTracks:'),
			),
		).toBe(false);
	});

	it('asks for FTP credentials', () => {
		expect(
			scenario(
				selecting([
					...SWITCH.defaults().selectedComponentIDs,
					'sys_ftpd_light',
				]),
			),
		).toContainEqual('warning:ftpCredentials:');
	});

	it('explains the GPU cap of sys-clk', () => {
		expect(
			issueCodes(customBuild()).some(code =>
				code.startsWith('info:gpuCap:0123456789ABCDEF|460|'),
			),
		).toBe(true);
	});

	it('warns about risky components with their notes', () => {
		expect(
			scenario(
				selecting([
					...SWITCH.defaults().selectedComponentIDs,
					'dbi_patcher',
				]),
			).some(code =>
				code.startsWith('warning:risky:DBIPatcher|Автор DBI'),
			),
		).toBe(true);
	});

	it('points at components to download by hand', () => {
		expect(issueCodes(customBuild())).toContainEqual('info:manual:Tinfoil');
	});
});
