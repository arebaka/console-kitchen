// Clicks through every step of the Console Kitchen in headless Chrome and checks what the user sees.
// Usage: bun run test:ui, set CHROME when the browser is not on the PATH

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { createServer } from 'vite';

const BROWSERS = [
	'google-chrome-stable',
	'google-chrome',
	'chromium',
	'chromium-browser',
];

// Chrome DevTools Protocol over the WebSocket of a page
class Page {
	socket: WebSocket;
	id = 0;
	pending = new Map<number, (message: any) => void>();
	console: string[] = [];

	constructor(socket: WebSocket) {
		this.socket = socket;
		socket.onmessage = event => {
			const message = JSON.parse(String(event.data));
			if (this.pending.has(message.id)) {
				this.pending.get(message.id)!(message);
				this.pending.delete(message.id);
			} else if (
				message.method == 'Runtime.consoleAPICalled' &&
				['error', 'warning'].includes(message.params.type)
			) {
				this.console.push(
					`${message.params.type}: ${message.params.args.map((arg: any) => arg.value ?? arg.description).join(' ')}`,
				);
			} else if (message.method == 'Runtime.exceptionThrown') {
				this.console.push(
					`exception: ${message.params.exceptionDetails.exception?.description ?? message.params.exceptionDetails.text}`,
				);
			}
		};
	}

	async send(method: string, params: object = {}): Promise<any> {
		return new Promise((resolve, reject) => {
			this.pending.set(++this.id, message => {
				message.error
					? reject(new Error(message.error.message))
					: resolve(message.result);
			});
			this.socket.send(JSON.stringify({ id: this.id, method, params }));
		});
	}

	async evaluate(expression: string): Promise<unknown> {
		const result = await this.send('Runtime.evaluate', {
			expression,
			returnByValue: true,
			awaitPromise: true,
		});
		if (result.exceptionDetails) {
			throw new Error(
				result.exceptionDetails.exception?.description ??
					result.exceptionDetails.text,
			);
		}
		return result.result.value;
	}

	// Runs an action and lets React render
	async act(expression: string): Promise<void> {
		await this.evaluate(expression);
		await sleep(250);
	}
}

const sleep = async (ms: number) =>
	new Promise(resolve => setTimeout(resolve, ms));

// Shortcuts available to the checks inside the page
const HELPERS = `
	window.$$ = selector => [...document.querySelectorAll(selector)];
	window.byText = (selector, text) => $$(selector).find(node => node.textContent.trim() == text);
	window.step = name => byText('.sidebar .step .label', name).closest('button').click();
	window.setField = (node, value) => {
		const prototype = node instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
		Object.getOwnPropertyDescriptor(prototype, 'value').set.call(node, value);
		node.dispatchEvent(new Event(node instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
	};
	window.key = (node, key) => node.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
`;

function findBrowser(): string {
	const browser =
		process.env.CHROME ??
		BROWSERS.find(
			name => spawnSync('sh', ['-c', `command -v ${name}`]).status == 0,
		);
	if (!browser) {
		throw new Error(
			`No Chrome found: install one of ${BROWSERS.join(', ')} or set CHROME`,
		);
	}
	return browser;
}

// Chrome tells the port of its DevTools on the standard error once it listens
function launchBrowser(profile: string) {
	const browser = spawn(findBrowser(), [
		'--headless=new',
		'--disable-gpu',
		'--no-first-run',
		'--no-default-browser-check',
		'--hide-scrollbars',
		'--remote-debugging-port=0',
		`--user-data-dir=${profile}`,
		...(process.getuid?.() == 0 ? ['--no-sandbox'] : []),
		'about:blank',
	]);
	const port = new Promise<number>((resolve, reject) => {
		let output = '';
		browser.stderr.on('data', chunk => {
			output += chunk;
			const match = output.match(
				/DevTools listening on ws:\/\/[^:]+:(\d+)\//,
			);
			if (match) resolve(Number(match[1]));
		});
		browser.on('exit', code => {
			reject(new Error(`Chrome exited with ${code}: ${output}`));
		});
	});
	return { browser, port };
}

// Embedded images of an installer as bitmap headers
function embeddedImages(script: string) {
	return [
		...script.matchAll(
			/write_image '([^']+)' << 'CONSOLE_KITCHEN_EOF'\n([\s\S]*?)\nCONSOLE_KITCHEN_EOF/g,
		),
	].map(([, path, data]) => {
		const bitmap = gunzipSync(Buffer.from(data, 'base64'));
		const alpha = new Set(
			Array.from(
				{ length: (bitmap.length - 54) / 4 },
				(_, i) => bitmap[54 + i * 4 + 3],
			),
		);
		return {
			path,
			magic: bitmap.toString('ascii', 0, 2),
			width: bitmap.readInt32LE(18),
			height: bitmap.readInt32LE(22),
			bpp: bitmap.readUInt16LE(28),
			isOpaque: alpha.size == 1 && alpha.has(255),
		};
	});
}

async function run(
	page: Page,
	url: string,
	downloads: string,
	spellOut: (link: string) => string,
): Promise<number> {
	let failures = 0;
	// The address is a short link, so the checks get what it says spelled in full as `link`
	const check = async (name: string, expression: string) => {
		let value: unknown;
		try {
			const link = spellOut(
				String(await page.evaluate('location.search')),
			);
			value = await page.evaluate(
				`(link => (${expression}))(${JSON.stringify(link)})`,
			);
		} catch (error) {
			value = String(error);
		}
		console.log(
			`${value === true ? 'ok  ' : 'FAIL'} ${name}${value === true ? '' : ` → ${JSON.stringify(value)}`}`,
		);
		if (value !== true) failures++;
	};
	const expect = (name: string, isTrue: boolean, detail?: unknown) => {
		console.log(
			`${isTrue ? 'ok  ' : 'FAIL'} ${name}${isTrue ? '' : ` → ${JSON.stringify(detail)}`}`,
		);
		if (!isTrue) failures++;
	};

	await page.send('Runtime.enable');
	await page.send('Page.enable');
	// A headless page has no focus of its own, so focus events would never fire
	await page.send('Emulation.setFocusEmulationEnabled', { enabled: true });
	await page.send('Browser.setDownloadBehavior', {
		behavior: 'allow',
		downloadPath: downloads,
	});
	await page.send('Page.navigate', { url });
	await sleep(3000);
	await page.evaluate(HELPERS);

	// Hardware
	// The photo is titled with the size of the console, drawn at the 96 pixels per inch browsers assume on Linux
	await page.send('Emulation.setDeviceMetricsOverride', {
		width: 1600,
		height: 900,
		deviceScaleFactor: 1,
		mobile: false,
	});
	await sleep(250);
	await check(
		'the console is as wide as the real one',
		`(() => {
		const photo = document.querySelector('.preview .photo');
		return Math.abs(photo.getBoundingClientRect().width - parseFloat(photo.title) / 25.4 * 96) < 1;
	})()`,
	);
	// A phone is narrower than the console
	await page.send('Emulation.setDeviceMetricsOverride', {
		width: 390,
		height: 844,
		deviceScaleFactor: 1,
		mobile: false,
	});
	await sleep(250);
	await check(
		'on a phone the console shrinks to the page and keeps its proportions',
		`(() => {
		const photo = document.querySelector('.preview .photo');
		const { width, height } = photo.getBoundingClientRect();
		return width < parseFloat(photo.title) / 25.4 * 96
			&& Math.abs(width - photo.parentElement.clientWidth) < 1
			&& Math.abs(width / height - photo.naturalWidth / photo.naturalHeight) < .01;
	})()`,
	);
	await page.send('Emulation.clearDeviceMetricsOverride');
	await sleep(250);

	// Software
	await page.act(`step('Software')`);
	await page.act(`byText('.batch .choice', 'Minimal').click()`);
	await check(
		'a preset replaces the selection and stays marked',
		`byText('.batch .choice.active', 'Minimal') != null
		&& link.includes('sw=') && !link.includes('sys_patch')`,
	);
	await page.act(`byText('.batch .choice', 'Recommended').click()`);
	await page.act(
		`byText('.component .name', 'Moonlight').closest('.component').click()`,
	);
	await check(
		'a hand edit turns into a custom selection',
		`document.querySelector('.choice.custom') != null && link.includes('moonlight')`,
	);
	await check(
		'the address names the console and the software by their numbers',
		`/^\\?h=[\\w-]+&s=[\\w-]+$/.test(location.search)`,
	);
	await page.act(
		`byText('.component .name', 'Atmosphere').closest('.component').click()`,
	);
	await check(
		'required components stay',
		`byText('.component .name', 'Atmosphere').closest('.component').classList.contains('active')`,
	);
	await check(
		'Daybreak opens the utilities and is required with Atmosphere',
		`(() => {
		const daybreak = byText('.component .name', 'Daybreak').closest('.component');
		return daybreak.parentElement.firstElementChild == daybreak && daybreak.querySelector('.badge.required') != null;
	})()`,
	);
	await page.act(
		`byText('.component .name', 'FPSLocker').closest('.component').click()`,
	);
	await page.act(
		`byText('.component .name', 'SaltyNX').closest('.component').click()`,
	);
	await check(
		'a removed dependency leaves a fix',
		`$$('.notice .fix').some(button => button.textContent == 'Add SaltyNX')`,
	);
	await page.act(
		`$$('.notice .fix').find(button => button.textContent == 'Add SaltyNX').click()`,
	);
	await check(
		'the fix brings it back',
		`byText('.component .name', 'SaltyNX').closest('.component').classList.contains('active')`,
	);
	// What hekate loads for a component is named in the entries booting CFW, More configs keeps entries without it
	const entryKeys = (name: string) =>
		`byText('.row .name', '${name}').closest('.row').querySelector('.keys').textContent`;
	await page.act(
		`byText('.component .name', 'Horizon OC').closest('.component').click()`,
	);
	await check(
		'a component in the place of another one conflicts with it',
		`$$('.notice').some(notice => notice.textContent.startsWith('sys-clk conflicts with Horizon OC'))`,
	);
	await page.act(`step('Launch')`);
	await check(
		'what hekate loads for a component goes into the entries booting CFW, not into the stock one',
		`['kip1=atmosphere/kips/hoc.kip', 'secmon=atmosphere/exosphere.bin']
		.every(key => ${entryKeys('CFW (emuMMC)')}.includes(key) && ${entryKeys('CFW (sysMMC)')}.includes(key)) && !/kip1|secmon/.test(${entryKeys('Stock')})`,
	);
	await check(
		'More configs boots CFW without it',
		`${entryKeys('CFW (emuMMC) without Horizon OC')}.includes('pkg3=atmosphere/package3')
		&& !/kip1|secmon/.test(${entryKeys('CFW (emuMMC) without Horizon OC')})`,
	);
	await page.act(`step('Software')`);
	await page.act(
		`byText('.component .name', 'Horizon OC').closest('.component').click()`,
	);
	await page.act(`step('Launch')`);
	await check(
		'and both go away with the component',
		`!/kip1|secmon/.test(${entryKeys('CFW (emuMMC)')}) && byText('.row .name', 'CFW (emuMMC) without Horizon OC') == null`,
	);
	// Another system is in the menu with the component that installs it, and can boot by itself like any entry
	await page.act(`step('Software')`);
	await page.act(
		`byText('.component .name', 'Lakka').closest('.component').click()`,
	);
	await page.act(`step('Launch')`);
	await check(
		'a system a component brings gets an entry of its own',
		`${entryKeys('Lakka')} == 'l4t=1  boot_prefixes=lakka/boot/  id=SWR-LAK'
		&& byText('.choices .choice', 'Lakka') != null`,
	);
	await page.act(`step('Software')`);
	await page.act(
		`byText('.component .name', 'Lakka').closest('.component').click()`,
	);
	await page.act(`step('Launch')`);
	await check(
		'and the entry leaves the menu with the component',
		`byText('.row .name', 'Lakka') == null && byText('.choices .choice', 'Lakka') == null`,
	);
	// A mode of an overlay in the list of Ultrahand opens by a combo of its own, up to four buttons as the overlay itself
	await page.act(`step('Overlays')`);
	const modes = `byText('.tuning > .header .title', 'Ultrahand, Status Monitor').closest('.tuning')`;
	const modeControl = (name: string) =>
		`[...${modes}.querySelectorAll('.list .control')].find(node => node.textContent.trim() == '${name}')`;
	const modeButton = (name: string) =>
		`${modes}.querySelector('.list .entry .button[aria-label="${name}"]')`;
	await page.act(`${modeControl('Add')}.click()`);
	await page.act(
		`setField(${modes}.querySelector('.list .entry .field'), 'Micro')`,
	);
	for (const name of ['Down', 'L', 'R', 'ZL']) {
		await page.act(`${modeButton(name)}.click()`);
	}
	await check(
		'a field of a list holds several buttons, as many as it takes',
		`link.includes('ultrahand_status_monitor.modes=Micro%3DL,R,ZL,DDOWN%3D')
		&& ${modeButton('ZR')}.classList.contains('locked') && !${modeButton('ZL')}.classList.contains('locked')`,
	);
	await page.act(`${modeButton('ZR')}.click()`);
	await check(
		'and takes no more of them',
		`link.includes('ultrahand_status_monitor.modes=Micro%3DL,R,ZL,DDOWN%3D')`,
	);
	await page.act(`${modeControl('Remove')}.click()`);
	await check(
		'a list left as it was says nothing in the link',
		`!link.includes('ultrahand_status_monitor')`,
	);
	await page.act(`step('Software')`);
	await page.act(
		`byText('.component .name', 'Tesla Menu').closest('.component').click()`,
	);
	await check(
		'a conflict offers to remove either side',
		`['Remove Tesla Menu', 'Remove Ultrahand'].every(text => $$('.notice .fix').some(button => button.textContent == text))`,
	);
	// The list of the step may be scrolled away, so the issue a click brings pops up
	await check(
		'the conflict pops up with its fixes',
		`(() => {
		const toast = document.querySelector('.toasts .toast.warning');
		return toast?.querySelector('.text').textContent == 'Tesla Menu conflicts with Ultrahand'
			&& $$('.toast .fix').map(button => button.textContent).join() == 'Remove Tesla Menu,Remove Ultrahand';
	})()`,
	);
	await page.act(
		`$$('.toast .fix').find(button => button.textContent == 'Remove Ultrahand').click()`,
	);
	await check(
		'the chosen side goes away',
		`(() => {
		const active = name => byText('.component .name', name).closest('.component').classList.contains('active');
		return !active('Ultrahand') && active('Tesla Menu');
	})()`,
	);
	await check(
		'and the toast with it',
		`document.querySelector('.toast') == null`,
	);
	await page.act(
		`byText('.component .name', 'Checkpoint').closest('.component').click()`,
	);
	await check(
		'an overlap pops up too and goes away by its button',
		`document.querySelector('.toast.info .text')?.textContent == 'JKSV covers Checkpoint, one of them is enough'`,
	);
	await page.act(`document.querySelector('.toast .dismiss').click()`);
	await check(
		'the dismissed toast leaves the issue in the list',
		`document.querySelector('.toast') == null
		&& $$('.advices .notice').some(notice => notice.textContent.startsWith('JKSV covers Checkpoint'))`,
	);

	await page.act(
		`byText('.component .name', 'DBIPatcher').closest('.component').click()`,
	);
	await check(
		'a risky component is marked and warned about',
		`byText('.component .name', 'DBIPatcher').closest('.component').querySelector('.badge.warning') != null
		&& $$('.notice').some(notice => notice.textContent.includes('The author of DBI warns'))`,
	);
	await page.act(
		`byText('.component .name', 'sys-con').closest('.component').click()`,
	);

	// Launch
	await check(
		'payloads moved off the Software step',
		`byText('.component .name', 'Lockpick RCM') == null`,
	);
	await page.act(`step('Launch')`);
	await check(
		'payloads are picked on the Launch step',
		`byText('.component .name', 'Lockpick RCM') != null`,
	);
	await page.act(
		`byText('.row .name', 'CFW (sysMMC)').closest('.switch').click()`,
	);
	await check(
		'a boot mode leaves the menu',
		`link.includes('boot=emummc,stock') && byText('.choices .choice', 'CFW (sysMMC)') == null`,
	);
	const folder = `document.querySelector('.add input')`;
	await page.act(`setField(${folder}, 'sd01/..')`);
	await check(
		'an emuMMC folder keeps safe characters in upper case',
		`${folder}.value == 'SD01'`,
	);
	await page.act(`key(${folder}, 'Enter')`);
	await check(
		'another emuMMC gets an entry',
		`link.includes('emummc=SD01') && byText('.row .name', 'CFW (emuMMC SD01)') != null`,
	);
	await page.act(`setField(${folder}, 'RAW1')`);
	await page.act(`key(${folder}, 'Enter')`);
	// Choice of an Exosphere key under the entry
	const override = (
		entry: string,
		label: string,
		value: string,
	) => `[...byText('.row .name', '${entry}').closest('.row').querySelectorAll('.override')]
		.find(item => item.querySelector('.label').textContent == '${label}').querySelectorAll('.choice')[${['as configured', 'on', 'off'].indexOf(value)}]`;
	await page.act(`${override('CFW (emuMMC SD01)', 'USB 3.0', 'on')}.click()`);
	await check(
		'an entry overrides an Exosphere key',
		`link.includes('launch.emummc-SD01.usb3force=1')
		&& byText('.row .name', 'CFW (emuMMC SD01)').closest('.row').querySelector('.keys').textContent.includes('usb3force=1')`,
	);
	await page.act(
		`${override('CFW (emuMMC RAW1)', 'Boot config memory mode', 'off')}.click()`,
	);
	await page.act(
		`byText('.row .name', 'CFW (emuMMC RAW1)').closest('.row').querySelector('.control').click()`,
	);
	await check(
		'a removed emuMMC takes its keys along',
		`!link.includes('RAW1') && link.includes('emummc=SD01')`,
	);
	await check(
		'what the launch is set to goes into a param of its own',
		`/^\\?h=[\\w-]+&s=[\\w-]+&l=[\\w-]+$/.test(location.search)`,
	);
	await check(
		'the boot screen delay is set with the menu',
		`byText('.row .name', 'Boot screen delay') != null`,
	);
	await page.act(
		`byText('.component .name', 'CommonProblemResolver').closest('.component').click()`,
	);
	await page.act(
		`byText('.choices .choice', 'CommonProblemResolver').click()`,
	);
	await check(
		'a payload can boot on its own',
		`link.includes('autoboot=common_problem_resolver')`,
	);

	// CFW
	await page.act(`step('CFW')`);
	await check(
		'every option is shown at once',
		`$$('.row .name').length > 20 && !$$('.batch .control').some(button => /ADVANCED/.test(button.textContent))`,
	);
	await check(
		'the boot screen delay left the step',
		`byText('.row .name', 'Boot screen delay') == null`,
	);
	await check(
		'buttons are drawn in their shapes',
		`$$('.buttons .button.trigger').length > 0 && $$('.buttons .button.face').length > 0`,
	);
	await page.act(
		`byText('.row .name', 'Button').closest('.row').querySelector('.button.trigger.left').click()`,
	);
	await check('a button picks the key', `link.includes('hbl.key=ZL')`);
	await page.act(`byText('.batch .control', 'RESET').click()`);
	await check('reset clears the step', `!link.includes('hbl.')`);

	// Security
	await page.act(`step('Security')`);
	const baudRate = `byText('.row .name', 'Log baud rate').closest('.row').querySelector('input')`;
	await page.act(`setField(${baudRate}, '9600')`);
	await check(
		'a number field reaches the link',
		`link.includes('exosphere.log_baud_rate=9600')`,
	);
	await page.act(`setField(${baudRate}, '99999999')`);
	await check(
		'a number out of range is not taken',
		`link.includes('exosphere.log_baud_rate=9600')`,
	);
	await page.act(`byText('.batch .control', 'RESET').click()`);
	await check(
		'reset clears only its step',
		`!link.includes('exosphere.') && link.includes('launch.emummc-SD01.usb3force=1')`,
	);

	// Settings of the selected components: modules and overlays by what they are, applications with a lot to set by themselves
	await check(
		'modules, overlays and the selected applications have steps of their own',
		`['Modules', 'Overlays', 'Status Monitor', 'DBI', 'JKSV'].every(name => byText('.sidebar .step .label', name) != null)
		&& byText('.sidebar .step .label', 'Amiibo') == null`,
	);
	await page.act(`step('Modules')`);
	await page.act(
		`byText('.tuning .row .name', 'Add unknown controllers').closest('.row').click()`,
	);
	await check(
		'a setting of sys-con reaches the link',
		`link.includes('sys_con.auto_add_controller=0')`,
	);
	await page.act(`step('Overlays')`);
	// The overlays Ultrahand lists are its own to set, Tesla Menu keeps no such list
	await check(
		'the menu of overlays has its combo, and nothing of Ultrahand without it',
		`$$('.tuning > .header .title').map(title => title.textContent).join('|') == 'Tesla / Ultrahand'`,
	);
	await page.act(`step('Status Monitor')`);
	await check(
		'Status Monitor has a step of its own, a group for every mode',
		`$$('.tuning > .header .title').map(title => title.textContent).join('|')
		== ['General', 'Full', 'Mini', 'Micro', 'FPS Counter', 'FPS Graph', 'Game Resolutions'].join('|')`,
	);
	await page.act(
		`byText('.tuning .row .name', 'Touch screen').closest('.row').click()`,
	);
	await check(
		'a setting of Status Monitor reaches the link',
		`link.includes('status_monitor.touch_screen=0')`,
	);
	// A combo of Status Monitor holds from one to four buttons
	const button = (name: string) =>
		`byText('.tuning .row .name', 'Exit combo').closest('.row').querySelector('.button[aria-label="${name}"]')`;
	await page.act(`${button('ZL')}.click()`);
	await check(
		'a full combo locks the buttons it cannot take',
		`link.includes('status_monitor.key_combo=L,ZL,DDOWN,RSTICK')
		&& ${button('ZR')}.classList.contains('locked') && !${button('ZL')}.classList.contains('locked')`,
	);
	await page.act(`${button('ZR')}.click()`);
	await check(
		'and takes no more of them',
		`link.includes('status_monitor.key_combo=L,ZL,DDOWN,RSTICK')`,
	);
	for (const name of ['ZL', 'L', 'Down', 'Right stick press']) {
		await page.act(`${button(name)}.click()`);
	}
	await check(
		'the last button of a combo stays',
		`/status_monitor\\.key_combo=RSTICK(&|$)/.test(link)
		&& ${button('Right stick press')}.classList.contains('locked')`,
	);
	// The field picks a color, the slider next to it how solid the color is
	const color = `[...byText('.tuning > .header .title', 'Mini').closest('.tuning').querySelectorAll('.row')]
		.find(row => row.querySelector('.name').textContent == 'Background').querySelector('.rgba')`;
	await page.act(`setField(${color}.querySelector('.range'), '15')`);
	await check(
		'the slider of a color sets its opacity',
		`link.includes('status_monitor_mini.background_color=%23111F')`,
	);
	await page.act(`setField(${color}.querySelector('.color'), '#ff0000')`);
	await check(
		'a color is kept with a hex digit per channel',
		`link.includes('status_monitor_mini.background_color=%23F00F')`,
	);
	await page.act(`step('JKSV')`);
	await check(
		'the step of an application lists its settings alone',
		`$$('.tuning > .header .title').map(node => node.textContent.trim()).join() == 'General,WebDAV'`,
	);
	await page.act(
		`byText('.tuning .row .name', 'Trash bin').closest('.row').click()`,
	);
	await check(
		'a setting of JKSV reaches the link',
		`link.includes('jksv.EnableTrash=1')`,
	);
	await page.act(`step('DBI')`);
	await page.act(`byText('.row .choice', 'Українська').click()`);
	await check(
		'the translation of DBI takes a language',
		`link.includes('dbi_patcher.language=ua')`,
	);
	await check(
		'every section of the config of DBI is a group of settings',
		`['General', 'Main menu', 'Install', 'MTP storages', 'Update checks']
		.every(name => byText('.tuning > .header .title', name) != null)`,
	);
	await page.act(
		`byText('.tuning .row .name', 'Exit to the HOME Menu').closest('.row').click()`,
	);
	await check(
		'a setting of DBI reaches the link',
		`link.includes('dbi_general.ExitToHomeScreen=1')`,
	);
	// A list holds rows of its fields, a row counts once it has a name
	const list = (title: string) =>
		`byText('.tuning > .header .title', '${title}').closest('.tuning')`;
	const control = (title: string, name: string) =>
		`[...${list(title)}.querySelectorAll('.list .control')].find(node => node.textContent.trim() == '${name}')`;
	const field = (title: string, row: number, at: number) =>
		`${list(title)}.querySelectorAll('.entry')[${row}].querySelectorAll('.field')[${at}]`;
	await check(
		'a list shows the rows it ships with',
		`${list('Local sources')}.querySelectorAll('.entry').length == 1
		&& ${field('Local sources', 0, 0)}.value == 'DBILogs' && ${field('Local sources', 0, 1)}.placeholder == 'Folder'`,
	);
	await page.act(`${control('Local sources', 'Add')}.click()`);
	await check(
		'a new row is not in the link until it is named',
		`${list('Local sources')}.querySelectorAll('.entry').length == 2
		&& !link.includes('dbi_local_sources')`,
	);
	await page.act(`setField(${field('Local sources', 1, 0)}, 'Home=brew')`);
	await page.act(`setField(${field('Local sources', 1, 1)}, 'sdmc:/switch')`);
	await check(
		'a row of a list reaches the link, its name without the sign that parts the fields',
		`link.includes('dbi_local_sources.sources=DBILogs%3Dsdmc:%2Fswitch%2FDBI%2Flogs&dbi_local_sources.sources=Homebrew%3Dsdmc:%2Fswitch')`,
	);
	await page.act(`${control('Local sources', 'Remove')}.click()`);
	await check(
		'a row goes away',
		`${list('Local sources')}.querySelectorAll('.entry').length == 1
		&& /dbi_local_sources\\.sources=Homebrew%3Dsdmc:%2Fswitch(&|$)/.test(link) && !link.includes('DBILogs')`,
	);
	await page.act(`${control('Locations', 'Add')}.click()`);
	await page.act(`setField(${field('Locations', 0, 0)}, 'NAS')`);
	await page.act(`setField(${field('Locations', 0, 1)}, 'SFTP')`);
	await page.act(
		`setField(${field('Locations', 0, 2)}, 'sftp://lesha:hunter2@nas/')`,
	);
	await check(
		'a field of a list is a choice where it has its values, and an address stays out of the link',
		`${field('Locations', 0, 1)}.tagName == 'SELECT' && ${field('Locations', 0, 1)}.value == 'SFTP' && !link.includes('hunter2')`,
	);

	// Overclock
	await page.act(`step('Overclock')`);
	await check(
		'there are no games yet',
		`document.querySelector('.games .empty') != null`,
	);
	await page.act(
		`setField(document.querySelector('.add select'), '0100F2C0115B6000')`,
	);
	await check(
		'a game comes from the list',
		`$$('.game').length == 1 && document.querySelector('.add select').value == ''`,
	);
	const titleId = `document.querySelector('.add input')`;
	await page.act(`setField(${titleId}, 'abcdef01-23456789zz')`);
	await check(
		'the title ID keeps hex only',
		`${titleId}.value == 'ABCDEF0123456789'`,
	);
	await page.act(`key(${titleId}, 'Escape')`);
	await check(
		'Escape in a field stays on the step',
		`byText('.sidebar .step.active .label', 'Overclock') != null`,
	);
	await page.act(`key(${titleId}, 'Enter')`);
	await check(
		'Enter adds the title ID',
		`$$('.game').length == 2 && ${titleId}.value == ''`,
	);
	await page.act(`byText('.game .choice', 'Performance').click()`);
	await check(
		'a template fills the table',
		`$$('.game')[0].querySelector('select').value == '1785' && link.includes('0100F2C0115B6000.performance')`,
	);
	await page.act(
		`setField($$('.game')[0].querySelectorAll('select')[1], '')`,
	);
	await check(
		'editing a cell makes the profile custom',
		`$$('.game')[0].querySelector('.choice.active').textContent == 'Custom'`,
	);
	await page.act(`byText('.apply .choice', 'Battery saver').click()`);
	await check(
		'a template applies to every game',
		`$$('.game').every(game => game.querySelector('.choice.active').textContent == 'Battery saver')`,
	);
	await page.act(`byText('.game .control', 'Remove').click()`);
	await check('a game goes away', `$$('.game').length == 1`);

	// Appearance
	await page.act(`step('Appearance')`);
	// Tile of a gallery picture by its ID, whatever the order of the gallery
	const tile = (target: string, id: string) =>
		`document.querySelector('.gallery.${target} img[alt="${id}"]').closest('.picture')`;
	await page.act(`${tile('bootlogo', 'hekate-a')}.click()`);
	await check(
		'a gallery image reaches the link',
		`link.includes('img.bootlogo=hekate-a')`,
	);
	// Picture on the preview of the console screen
	const shown = (target: string) =>
		`document.querySelector('.screen.${target} img')?.src.split('/appearance/')[1]`;
	await check(
		'the boot screen is previewed on the screen of the console in its real size',
		`(() => {
		const screen = document.querySelector('.screen.bootlogo');
		const width = Math.min(6.2 * 16 / Math.hypot(16, 9) * 96, screen.parentElement.clientWidth - 16);
		return Math.abs(screen.getBoundingClientRect().width - width) < 1 && ${shown('bootlogo')} == 'bootlogo/hekate-a.png';
	})()`,
	);
	await page.act(`${tile('bootlogo', 'hekate-b')}.focus()`);
	await check(
		'the screen shows the picture in focus',
		`${shown('bootlogo')} == 'bootlogo/hekate-b.png'`,
	);
	await page.act(`${tile('bootlogo', 'hekate-b')}.blur()`);
	await check(
		'and returns to the chosen one',
		`${shown('bootlogo')} == 'bootlogo/hekate-a.png'`,
	);
	await check(
		'the background without a picture takes the theme color of Nyx',
		`${shown('background')} == null
		&& getComputedStyle(document.querySelector('.screen.background')).backgroundColor == 'rgb(45, 45, 45)'`,
	);
	await check(
		'more pictures are a link away',
		`$$('.appearance .thread').length == 3 && $$('.appearance .thread')[2].href.includes('nyx-custom-icon-thread')`,
	);
	// Chips of the entries in the section of the target
	const chip = (
		target: string,
		name: string,
	) => `[...document.querySelector('.gallery.${target}').closest('.appearance').querySelectorAll('.choice')]
		.find(chip => chip.textContent == '${name}')`;
	await page.act(`${chip('bootlogo', 'CFW (emuMMC SD01)')}.click()`);
	await check(
		'an entry starts from the common boot screen',
		`document.querySelector('.gallery.bootlogo .picture.active').textContent == 'Common'
		&& ${shown('bootlogo')} == 'bootlogo/hekate-a.png'`,
	);
	await page.act(`${tile('bootlogo', 'hekate-b')}.click()`);
	await check(
		'an entry takes a boot screen of its own',
		`link.includes('img.logo.emummc-SD01=hekate-b')
		&& ${chip('bootlogo', 'CFW (emuMMC SD01)')}.classList.contains('set') && link.includes('img.bootlogo=hekate-a')
		&& ${shown('bootlogo')} == 'bootlogo/hekate-b.png'`,
	);
	await page.act(`${tile('icon', 'hekate-switch')}.click()`);
	await check(
		'the first entry gets the icon',
		`link.includes('img.icon.emummc=hekate-switch')`,
	);
	await page.act(`${chip('icon', 'Lockpick RCM')}.click()`);
	await page.act(`${tile('icon', 'hekate-payload')}.click()`);
	await check(
		'a payload gets an icon too',
		`link.includes('img.icon.lockpick_rcm=hekate-payload')`,
	);

	// Keyboard
	await page.act(
		`document.activeElement.blur(); key(document.body, 'Escape')`,
	);
	await check(
		'Escape goes back',
		`byText('.sidebar .step.active .label', 'Overclock') != null`,
	);
	await page.act(`key(document.body, 'Enter')`);
	await check(
		'Enter goes forward',
		`byText('.sidebar .step.active .label', 'Appearance') != null`,
	);

	// Build
	await page.act(`step('Build')`);
	await sleep(1500);
	await check(
		'the readme is rendered',
		`document.querySelector('.readme h1')?.textContent.startsWith('Console Kitchen') && $$('.readme li').length > 5`,
	);
	await check(
		'generated files are highlighted',
		`document.querySelector('.generated .code .hljs-keyword') != null`,
	);
	await check(
		'the installers are ready',
		`$$('.files .row.interactive').length == 6`,
	);
	await check(
		'the build and the scripts of a dump are there to download',
		`['console-kitchen.toml', 'dump.sh', 'dump.ps1']
		.every(name => byText('.files .row.interactive .name', name) != null)`,
	);

	// The menu of files offers the scripts of a dump, Escape closes it without going a step back
	await page.act(`document.querySelector('.file-menu .file-button').click()`);
	await check(
		'the menu of files opens with the scripts of a dump',
		`$$('.file-menu .menu .item').length == 3`,
	);
	await page.act(`key(document.body, 'Escape')`);
	await check(
		'Escape closes the menu and stays on the step',
		`document.querySelector('.file-menu .menu') == null
		&& byText('.sidebar .step.active .label', 'Build') != null`,
	);
	await page.act(
		`byText('.generated .choice', 'bootloader/hekate_ipl.ini').click()`,
	);
	await check(
		'the Launch menu reaches hekate_ipl.ini',
		`(() => {
		const ini = document.querySelector('.generated .code').textContent;
		return ini.includes('[Lockpick RCM]') && !ini.includes('[CFW (sysMMC)]') && /autoboot=\\d/.test(ini)
			&& ini.includes('[CFW (emuMMC SD01)]') && ini.includes('emupath=emuMMC/SD01') && ini.includes('usb3force=1')
			&& ini.includes('logopath=bootloader/res/console_kitchen_emummc-SD01_logo.bmp') && ini.includes('icon=bootloader/res/console_kitchen_lockpick_rcm_hue.bmp')
			&& !ini.includes('RAW1');
	})()`,
	);
	await page.act(
		`byText('.generated .choice', 'config/sys-clk/config.ini').click()`,
	);
	await check(
		'the sys-clk profile is previewed',
		`document.querySelector('.generated .code').textContent.includes('[ABCDEF0123456789]')`,
	);
	await page.act(
		`byText('.generated .choice', 'config/JKSV/JKSV.json').click()`,
	);
	await check(
		'the settings of JKSV are previewed as highlighted JSON',
		`(() => {
		const code = document.querySelector('.generated .code');
		return JSON.parse(code.textContent).EnableTrash === 1 && code.querySelector('.hljs-attr') != null;
	})()`,
	);
	await page.act(
		`byText('.generated .choice', 'switch/DBI/dbi.config').click()`,
	);
	await check(
		'the config of DBI is previewed as a highlighted INI',
		`(() => {
		const code = document.querySelector('.generated .code');
		return code.textContent.includes('\\nExitToHomeScreen=true\\n') && code.textContent.includes('\\n[Network sources]\\n')
			&& code.textContent.includes('\\nHomebrew=sdmc:/switch\\n') && !code.textContent.includes('\\nDBILogs=sdmc:/switch/DBI/logs\\n\\n[MTP')
			&& code.querySelector('.hljs-section') != null;
	})()`,
	);
	await page.act(
		`byText('.generated .choice', 'switch/DBI/dbi.locations').click()`,
	);
	await check(
		'the locations of DBI are previewed in a file of their own',
		`document.querySelector('.generated .code').textContent.trim()
		== '[Location_0]\\nName=NAS\\nType=SFTP\\nURL=sftp://lesha:hunter2@nas/'`,
	);
	await page.act(
		`byText('.generated .choice', 'config/status-monitor/config.ini').click()`,
	);
	await check(
		'the config of Status Monitor has a section of every mode',
		`(() => {
		const code = document.querySelector('.generated .code').textContent;
		return code.includes('touch_screen=false') && code.includes('background_color=#F00F') && code.includes('[game_resolutions]');
	})()`,
	);
	await page.act(
		`byText('.generated .choice', 'config/sys-con/config.ini').click()`,
	);
	await check(
		'the config of sys-con has its settings ahead of the profiles of controllers',
		`(() => {
		const code = document.querySelector('.generated .code').textContent;
		return code.startsWith('[global]\\nmode=hiddbg') && code.includes('\\nauto_add_controller=0\\n') && code.includes('\\n[default]\\n');
	})()`,
	);
	await page.act(
		`byText('.files .row .name', 'install.sh').closest('.row').click()`,
	);
	await page.act(
		`byText('.files .row .name', 'install.ps1').closest('.row').click()`,
	);
	await sleep(1000);

	const installer = readFileSync(join(downloads, 'install.sh'), 'utf8');
	expect(
		'the installer fetches the translation in the chosen language',
		installer.includes("'^translation_ua\\.bin$'"),
	);
	expect(
		'the installer writes the config of sys-con whole, like every other one',
		installer.includes("write_config 'config/sys-con/config.ini'") &&
			installer.includes('\n[default]\n') &&
			!installer.includes('merge_config'),
	);
	const images = embeddedImages(installer);
	expect(
		'the installer embeds the boot screen rotated and opaque',
		images.some(
			image =>
				image.path == 'bootloader/bootlogo.bmp' &&
				image.magic == 'BM' &&
				image.bpp == 32 &&
				image.width == 50 &&
				image.height == 204 &&
				image.isOpaque,
		),
		images,
	);
	expect(
		'the installer embeds the icon with its transparency',
		images.some(
			image =>
				image.path == 'bootloader/res/console_kitchen_emummc_hue.bmp' &&
				image.width == 192 &&
				image.height == 192 &&
				!image.isOpaque,
		),
		images,
	);
	expect(
		'the installer embeds the boot screen of an entry',
		images.some(
			image =>
				image.path ==
					'bootloader/res/console_kitchen_emummc-SD01_logo.bmp' &&
				image.magic == 'BM' &&
				image.bpp == 32 &&
				image.isOpaque,
		),
		images,
	);
	expect(
		'the installer embeds the icon of a payload',
		images.some(
			image =>
				image.path ==
				'bootloader/res/console_kitchen_lockpick_rcm_hue.bmp',
		),
		images,
	);
	expect(
		'install.ps1 starts with a byte order mark',
		readFileSync(join(downloads, 'install.ps1'))
			.subarray(0, 3)
			.equals(Buffer.from([0xef, 0xbb, 0xbf])),
	);

	await page.act(`byText('.lang-switch button', 'ru').click()`);
	await check(
		'the language changes in place',
		`byText('.sidebar .step.active .label', 'Сборка') != null && document.documentElement.lang == 'ru'`,
	);
	await page.act(`byText('.lang-switch button', 'uk').click()`);
	await check(
		'Ukrainian is there too',
		`byText('.sidebar .step.active .label', 'Збірка') != null && document.documentElement.lang == 'uk'`,
	);

	// PSP
	await page.act(`byText('.lang-switch button', 'en').click()`);
	await page.act(`step('Hardware')`);
	await page.act(
		`byText('.consoles .item .name', 'PSP-3000').closest('.item').click()`,
	);
	await check(
		'a PSP turns the page into its own',
		`document.documentElement.dataset.platform == 'psp' && link.startsWith('hw=psp3000&fw=6.61&sw=')
		&& document.querySelector('.topbar .subtitle').textContent == 'PSP custom firmware builder'
		&& getComputedStyle(document.body).fontFamily.includes('M PLUS 1p')`,
	);
	await check(
		'a PSP goes through steps of its own',
		`$$('.sidebar .step .label').map(label => label.textContent).join() == 'Hardware,Firmware,Software,CFW,Plugins,Build'`,
	);
	await check(
		'the steps of a PSP are categories of its XMB',
		`$$('.sidebar .step .icon').every(icon => getComputedStyle(icon).display != 'none')
		&& new Set($$('.sidebar .step').map(step => Math.round(step.getBoundingClientRect().top))).size == 1`,
	);
	await check(
		'the buttons of a PSP show its symbols',
		`$$('.controls .glyph').length > 0 && $$('.controls .glyph').every(glyph => glyph.querySelector('svg'))`,
	);
	await page.act(`step('Firmware')`);
	// The strip slides for .3s
	await sleep(400);
	await check(
		'the active category keeps its place',
		`(() => {
		const strip = document.querySelector('.sidebar .steps');
		const left = strip.getBoundingClientRect().left + parseFloat(getComputedStyle(strip).paddingLeft);
		return Math.abs(document.querySelector('.sidebar .step.active').getBoundingClientRect().left - left) < 1;
	})()`,
	);
	await page.act(`byText('.item .name', '6.35').closest('.item').click()`);
	await check(
		'an old firmware takes the official update',
		`$$('.notice .fix').some(button => button.textContent == 'Add System Update 6.61')`,
	);
	await page.act(
		`$$('.notice .fix').find(button => button.textContent == 'Add System Update 6.61').click()`,
	);
	await check(
		'the update solves it',
		`$$('.notice').length == 0 && link.includes('update661')`,
	);
	await page.act(`step('Plugins')`);
	await page.act(
		`byText('.row .name', 'Game Categories Lite').closest('.row').querySelectorAll('.choice')[2].click()`,
	);
	await check(
		'a plugin takes another runlevel',
		`link.includes('plugin.gclite=vsh,game')
		&& byText('.row .name', 'Game Categories Lite').closest('.row').querySelector('.keys').textContent == 'vsh game, gclite/category_lite.prx, on'`,
	);
	await page.act(`step('Build')`);
	await sleep(1000);
	await page.act(
		`byText('.generated .choice', 'SEPLUGINS/PLUGINS.TXT').click()`,
	);
	await check(
		'the plugins reach PLUGINS.TXT',
		`document.querySelector('.generated .code').textContent.includes('vsh game, gclite/category_lite.prx, on')`,
	);
	await check(
		'the readme asks for the update first',
		`document.querySelector('.readme').textContent.includes('PSP Update ver 6.61')`,
	);
	await page.act(`step('Hardware')`);
	await page.act(
		`byText('.consoles .item .name', 'Erista (V1)').closest('.item').click()`,
	);
	await check(
		'the Switch keeps its build',
		`document.documentElement.dataset.platform == 'switch' && link.includes('emummc=SD01')`,
	);
	await check(
		'the Switch keeps its side bar and letters',
		`$$('.sidebar .step .icon').every(icon => getComputedStyle(icon).display == 'none')
		&& $$('.controls .glyph').every(glyph => !glyph.querySelector('svg') && /^[A-Z]$/.test(glyph.textContent))`,
	);

	expect('the console stays clean', page.console.length === 0, page.console);
	return failures;
}

async function main() {
	const temporary = mkdtempSync(join(tmpdir(), 'console-kitchen-ui-'));
	const downloads = join(temporary, 'downloads');
	const server = await createServer({
		logLevel: 'error',
		server: { host: '127.0.0.1', port: 0, open: false },
	});
	const { browser, port } = launchBrowser(join(temporary, 'profile'));

	try {
		await server.listen();
		const url = server.resolvedUrls!.local[0];
		const target = await (
			await fetch(`http://127.0.0.1:${await port}/json/new?about:blank`, {
				method: 'PUT',
			})
		).json();
		const socket = new WebSocket(target.webSocketDebuggerUrl);
		await new Promise(resolve => (socket.onopen = resolve));

		// The links are read the way the page reads them
		const { spellOut } = await server.ssrLoadModule('/src/state.tsx');
		const failures = await run(new Page(socket), url, downloads, spellOut);
		console.log(failures ? `${failures} failed` : 'all passed');
		process.exitCode = failures ? 1 : 0;
		socket.close();
	} finally {
		// Chrome writes its profile while closing, so the directory goes away after it
		if (browser.exitCode === null) {
			const exited = new Promise(resolve =>
				browser.once('exit', resolve),
			);
			browser.kill();
			await exited;
		}
		// Under Bun the server of Vite now and then never tells it has closed, so it gets a moment and no more
		await Promise.race([server.close(), sleep(1000)]);
		rmSync(temporary, { recursive: true, force: true });
	}
}

await main();
// A server that stayed open would keep the process running
process.exit();
