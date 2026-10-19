import React, { useState } from 'react';

import { AppearanceConfig, HardwareRevision, ImageTarget, LaunchEntry, Uploads } from '@/types';
import { Language, Translation, format } from '@i18n';
import { HARDWARE } from '@data';
import { GALLERY } from '@/platforms/switch';
import { activate, pixelsPerInch } from '@/utils';

interface AppearanceProps {
	lang: Language;
	hardware: HardwareRevision;
	appearance: AppearanceConfig;
	entries: LaunchEntry[]; // entries of the Launch menu, each can have a boot screen and an icon
	themebg: string; // color of the Nyx theme, the background without a picture
	uploads: Uploads;
	setImage: (key: string, image?: string, blob?: Blob) => void;
	t: Translation;
}

// Threads where people share their pictures without licenses, so they are linked instead of bundled
const THREADS: {[target in ImageTarget]: string} = {
	bootlogo: 'https://gbatemp.net/threads/share-your-custom-hekate-bootlogo-thread.513033/',
	background: 'https://gbatemp.net/threads/share-your-custom-hekate-bootlogo-thread.513033/',
	icon: 'https://gbatemp.net/threads/nyx-custom-icon-thread.542758/'
};

// hekate clears the screen to this gray for its own logo
const HEKATE_GRAY = '#1b1b1b';

// Hekate centers the boot screen without scaling it up and fills the rest of the screen with its top-left pixel
function previewBootlogo(event: React.SyntheticEvent<HTMLImageElement>) {
	const image = event.currentTarget;
	const scale = Math.min(1, 1280 / image.naturalWidth, 720 / image.naturalHeight);
	image.style.width = `${image.naturalWidth * scale / 1280 * 100}%`;

	const context = document.createElement('canvas').getContext('2d')!;
	context.fillStyle = '#000';
	context.fillRect(0, 0, 1, 1);
	context.drawImage(image, 0, 0, 1, 1, 0, 0, 1, 1);
	const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
	image.parentElement!.style.background = `rgb(${red} ${green} ${blue})`;
}

export function Appearance({
	lang,
	hardware,
	appearance,
	entries,
	themebg,
	uploads,
	setImage,
	t
}: AppearanceProps) {
	// Key of the last upload the browser could not decode
	const [failed, setFailed] = useState<string>();
	// Entries the boot screen and the icon are picked for, an entry that left the menu gives the choice back
	const [logoEntry, setLogoEntry] = useState<string>();
	const [iconEntry, setIconEntry] = useState<string>();
	const logoFor = entries.find(entry => entry.id == logoEntry)?.id;
	const iconFor = entries.find(entry => entry.id == iconEntry)?.id ?? entries[0]?.id;
	// The boot screen and the icon the entries come with, they stay until others are picked for them
	const ownLogo = entries.find(entry => entry.id == logoFor)?.logo;
	const ownIcon = entries.find(entry => entry.id == iconFor)?.icon;
	// Picture under the pointer or the focus, the screen shows it until it is left
	const [hovered, setHovered] = useState<{ key: string; image?: string }>();

	// Width of the 16:9 screen of the console in CSS pixels
	const screenWidth = HARDWARE.find(hw => hw.id == hardware)!.screen * 16 / Math.hypot(16, 9) * pixelsPerInch();

	// File of a gallery picture or of the upload under the key
	const source = (target: ImageTarget, key: string, image?: string) =>
		image == 'upload' ? uploads[key]?.url : GALLERY.find(item => item.target == target && item.id == image)?.file;

	// What the screen shows for the key: the hovered picture, the chosen one, for an entry without its own the common one.
	// The screen an entry comes with is not here to show, so the screen names its file
	const shown = (key: string, value?: string) => hovered?.key == key ? hovered.image : value;
	const logoKey = logoFor ? `logo.${logoFor}` : 'bootlogo';
	const logo = shown(logoKey, logoFor ? appearance.logos[logoFor] : appearance.bootlogo);
	const logoSource = logo ? source('bootlogo', logoKey, logo) : ownLogo ? undefined : source('bootlogo', 'bootlogo', appearance.bootlogo);
	const background = source('background', 'background', shown('background', appearance.background));

	const upload = async (key: string, file: File) => {
		try {
			(await createImageBitmap(file)).close();
			setFailed(undefined);
			setImage(key, 'upload', file);
		} catch {
			setFailed(key);
		}
	};

	const gallery = (target: ImageTarget, key: string, value?: string, none = t.pages.appearance.none) => (
		<Gallery
			key={key}
			target={target}
			value={value}
			none={none}
			uploaded={uploads[key]?.url}
			isFailed={failed == key}
			select={image =>{  setImage(key, image); }}
			upload={file => upload(key, file)}
			preview={image =>{  setHovered({ key, image }); }}
			leave={() =>{  setHovered(undefined); }}
			t={t} />
	);

	const header = (target: ImageTarget) => (
		<header className="header">
			<h3 className="title">
				{t.pages.appearance.targets[target].title}
			</h3>
			<a
				className="thread"
				href={THREADS[target]}
				target="_blank"
				rel="noreferrer">
				{t.pages.appearance.thread}
			</a>
		</header>
	);

	// Entries to pick from, the ones with a picture of their own are marked
	const chips = (items: { id?: string; name: string }[], active: string | undefined, images: Record<string, string>, select: (id?: string) => void) => (
		<ul className="choices">
			{items.map(item => (
				<li
					key={item.id ?? 'common'}
					className={`choice ${item.id == active ? 'active' : ''} ${item.id && images[item.id] ? 'set' : ''}`}
					tabIndex={0}
					onClick={() =>{  select(item.id); }}
					onKeyDown={activate}>
					{item.name}
				</li>
			))}
		</ul>
	);

	return (<>
		<section className="appearance">
			{header('bootlogo')}
			<p className="description">
				{t.pages.appearance.targets.bootlogo.description}
			</p>
			{entries.length > 0 && chips([{ name: t.pages.appearance.common }, ...entries], logoFor, appearance.logos, setLogoEntry)}
			<Screen
				key={logoSource ?? 'none'}
				target="bootlogo"
				src={logoSource}
				fill={HEKATE_GRAY}
				width={screenWidth}
				caption={ownLogo ?? t.pages.appearance.defaults.bootlogo} />
			{logoFor
				? gallery('bootlogo', `logo.${logoFor}`, appearance.logos[logoFor], ownLogo ? t.pages.appearance.own : t.pages.appearance.common)
				: gallery('bootlogo', 'bootlogo', appearance.bootlogo)}
		</section>

		<section className="appearance">
			{header('background')}
			<p className="description">
				{t.pages.appearance.targets.background.description}
			</p>
			<Screen
				key={background ?? 'none'}
				target="background"
				src={background}
				fill={themebg}
				width={screenWidth}
				caption={t.pages.appearance.defaults.background} />
			{gallery('background', 'background', appearance.background)}
		</section>

		{iconFor && <section className="appearance">
			{header('icon')}
			<p className="description">
				{t.pages.appearance.targets.icon.description}
			</p>
			{chips(entries, iconFor, appearance.icons, setIconEntry)}
			{gallery('icon', `icon.${iconFor}`, appearance.icons[iconFor], ownIcon ? t.pages.appearance.own : undefined)}
		</section>}

		<p className="note">
			{t.pages.appearance.more}
		</p>
	</>);
}

interface ScreenProps {
	target: 'bootlogo' | 'background';
	src?: string; // picture on the screen
	fill: string; // color of the screen without a picture
	width: number; // width of the screen of the console in CSS pixels
	caption: string; // what hekate or Nyx shows without a picture
}

// The screen of the console in its physical size with the picture as hekate or Nyx draws it
function Screen({
	target,
	src,
	fill,
	width,
	caption
}: ScreenProps) {
	return (
		<div
			className={`screen ${target}`}
			style={{ width: `${width}px`, background: fill }}>
			{src ? (
				<img
					src={src}
					alt=""
					onLoad={target == 'bootlogo' ? previewBootlogo : undefined} />
			) : (
				<span className="caption">
					{caption}
				</span>
			)}
		</div>
	);
}

interface GalleryProps {
	target: ImageTarget;
	value?: string;
	none: string; // caption of the tile without a picture
	uploaded?: string; // object URL of the upload
	isFailed: boolean;
	select: (image?: string) => void;
	upload: (file: File) => void;
	preview: (image?: string) => void; // the pointer or the focus is on a tile
	leave: () => void;
	t: Translation;
}

// Pictures for one target: the default, the gallery, the upload and a tile to upload one
function Gallery({
	target,
	value,
	none,
	uploaded,
	isFailed,
	select,
	upload,
	preview,
	leave,
	t
}: GalleryProps) {
	const picture = (id: string | undefined, content: React.ReactNode, title?: string) => (
		<li
			key={id ?? 'none'}
			className={`picture ${value == id ? 'active' : ''}`}
			title={title}
			tabIndex={0}
			onClick={() =>{  select(id); }}
			onKeyDown={activate}
			onMouseEnter={() =>{  preview(id); }}
			onMouseLeave={leave}
			onFocus={() =>{  preview(id); }}
			onBlur={leave}>
			<span className="frame">
				{content}
			</span>
		</li>
	);

	const image = (src: string, alt: string) => (
		<img
			src={src}
			alt={alt}
			loading="lazy"
			onLoad={target == 'bootlogo' ? previewBootlogo : undefined} />
	);

	return (
		<ul className={`gallery ${target}`}>
			{picture(undefined, none)}
			{GALLERY
				.filter(item => item.target == target)
				.map(item => picture(
					item.id,
					image(item.file, item.id),
					format(t.pages.appearance.credit, { author: item.author, license: item.license })
				))}
			{uploaded && picture('upload', image(uploaded, t.pages.appearance.uploaded), t.pages.appearance.uploaded)}
			<li>
				<label
					className={`picture upload ${isFailed ? 'failed' : ''}`}
					tabIndex={0}
					onKeyDown={activate}>
					<input
						type="file"
						accept="image/*"
						hidden
						onChange={event => {
							const file = event.target.files?.[0];
							event.target.value = '';
							if (file) upload(file);
						}} />
					<span className="frame">
						{isFailed ? t.pages.appearance.invalid : t.pages.appearance.upload}
					</span>
				</label>
			</li>
		</ul>
	);
}
