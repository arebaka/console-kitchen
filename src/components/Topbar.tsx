import React, { useEffect, useRef, useState } from 'react';

import { LANGUAGES, Language, I18N, Translation } from '@i18n';
import { GeneratedFile } from '@/build';
import { downloadFile, withBOM } from '@/utils';

// What a file of the Console Kitchen turned out to be once opened
export type OpenedFile = 'build' | 'dump';

interface TopbarProps {
	lang: Language;
	setLang: (lang: Language) => void;
	subtitle: string; // what is built for the current platform
	scripts: GeneratedFile[]; // the scripts that dump a card
	openFile: (text: string) => OpenedFile | undefined;
	t: Translation;
}

export function Topbar({
	lang,
	setLang,
	subtitle,
	scripts,
	openFile,
	t
}: TopbarProps) {
	return (
		<header className="topbar">
			<span className="logo" aria-hidden="true">
				<span></span>
				<span></span>
			</span>
			<h1 className="title">
				{t.title}
			</h1>
			<p className="subtitle">
				{subtitle}
			</p>
			<Clock lang={lang} />
			<FileMenu scripts={scripts} openFile={openFile} t={t} />
			<nav className="lang-switch">
				{LANGUAGES.map(option => (
					<button
						key={option}
						className={`lang-option ${lang == option ? 'active' : ''}`}
						onClick={() =>{  setLang(option); }}>
						{I18N[option].language}
					</button>
				))}
			</nav>
		</header>
	);
}

// A dump of a card is a few hundred kilobytes, anything far bigger is not a file of the Console Kitchen
const MAX_FILE_SIZE = 16 * 1024 * 1024;

interface FileMenuProps {
	scripts: GeneratedFile[];
	openFile: (text: string) => OpenedFile | undefined;
	t: Translation;
}

// Builds and dumps of cards to open, the scripts that make the dumps to download
function FileMenu({ scripts, openFile, t }: FileMenuProps) {
	const [isOpen, setOpen] = useState(false);
	const [opened, setOpened] = useState<OpenedFile | 'invalid'>();
	const menuRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	// A press elsewhere closes the menu, and so does Escape, which then goes no further: it does not take the wizard a step back
	useEffect(() => {
		if (!isOpen) return;
		const handlePointerDown = (event: PointerEvent) => {
			if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key == 'Escape') {
				event.preventDefault();
				event.stopPropagation();
				setOpen(false);
			}
		};
		window.addEventListener('pointerdown', handlePointerDown);
		window.addEventListener('keydown', handleKeyDown, true);
		return () => {
			window.removeEventListener('pointerdown', handlePointerDown);
			window.removeEventListener('keydown', handleKeyDown, true);
		};
	}, [isOpen]);

	const open = async (file: File) => {
		setOpened(file.size <= MAX_FILE_SIZE ? openFile(await file.text()) ?? 'invalid' : 'invalid');
	};

	return (
		<div className="file-menu" ref={menuRef}>
			<button
				className="file-button"
				aria-haspopup="true"
				aria-expanded={isOpen}
				onClick={() => {
					setOpen(!isOpen);
					setOpened(undefined);
				}}>
				{t.file.title}
			</button>
			{isOpen && (
				<div className="menu">
					<button className="item" onClick={() => inputRef.current?.click()}>
						<span className="name">
							{t.file.open}
						</span>
					</button>
					{opened && (
						<p className={`status ${opened == 'invalid' ? 'error' : ''}`}>
							{opened == 'invalid' ? t.file.invalid : t.file.opened[opened]}
						</p>
					)}
					<p className="caption">
						{t.file.dump}
					</p>
					{scripts.map(file => (
						<button key={file.path} className="item" onClick={() =>{  downloadFile(file.path, withBOM(file.path, file.content)); }}>
							<span className="name">
								{file.path}
							</span>
							<span className="description">
								{t.file.scripts[file.path]}
							</span>
						</button>
					))}
				</div>
			)}
			<input
				ref={inputRef}
				type="file"
				accept=".toml"
				hidden
				onChange={event => {
					const file = event.target.files?.[0];
					// The same file can be opened again after it changed on the card
					event.target.value = '';
					if (file) void open(file);
				}} />
		</div>
	);
}

// Date and time in the corner, as the XMB shows them, for the themes that show the clock
function Clock({ lang }: { lang: Language }) {
	const [now, setNow] = useState(() => new Date());

	useEffect(() => {
		const timer = setInterval(() =>{  setNow(new Date()); }, 10_000);
		return () =>{  clearInterval(timer); };
	}, []);

	return (
		<time className="clock" dateTime={now.toISOString()}>
			{now.toLocaleString(lang, { month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
		</time>
	);
}
