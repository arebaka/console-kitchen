import { HARDWARE } from '@data';
import { Language, Translation, format } from '@i18n';
import React from 'react';

import { PLATFORM_IDS } from '@/state';
import { HardwareRevision } from '@/types';
import { activate, pixelsPerInch } from '@/utils';

interface HardwareProps {
	lang: Language;
	hardware: HardwareRevision;
	setHardware: (hw: HardwareRevision) => void;
	t: Translation;
}

const consoles = (platform: string) =>
	HARDWARE.filter(hw => hw.platform == platform);

// Consoles of every platform under its name, picking one switches to its platform
export function Hardware({ lang, hardware, setHardware, t }: HardwareProps) {
	const info = HARDWARE.find(hw => hardware == hw.id)!;

	return (
		<>
			{PLATFORM_IDS.map(platform => (
				<section key={platform} className='consoles'>
					<h3 className='title'>{t.platforms[platform].name}</h3>
					<ul
						className={`grid ${consoles(platform).length % 2 == 0 && consoles(platform).length % 3 != 0 ? 'grid2' : 'grid3'}`}
					>
						{consoles(platform).map(hw => (
							<li
								key={hw.id}
								className={`item ${hardware == hw.id ? 'active' : ''}`}
								tabIndex={0}
								onClick={() => {
									setHardware(hw.id);
								}}
								onKeyDown={activate}
							>
								<header className='header'>
									<h3 className='name'>{hw.name}</h3>
									<p
										className={`badge ${hw.is_modchip_required ? 'danger' : 'ok'}`}
									>
										{hw.is_modchip_required
											? t.pages.hardware.isModchipRequired
											: t.pages.hardware
													.isModchipNotRequired}
									</p>
								</header>
								<p className='description'>
									{t.hardware[hw.id].description}
								</p>
								<p className='note'>{t.hardware[hw.id].note}</p>
							</li>
						))}
					</ul>
				</section>
			))}

			{/* The console in its physical size, a console wider than the page shrinks to fit it */}
			<footer className='preview'>
				<img
					src={`assets/${info.image}`}
					alt={info.name}
					title={format(t.pages.hardware.size, {
						width: info.width.toLocaleString(lang),
						height: info.height.toLocaleString(lang),
					})}
					className='photo'
					style={{
						width: `${(info.width / 25.4) * pixelsPerInch()}px`,
					}}
				/>
			</footer>
		</>
	);
}
