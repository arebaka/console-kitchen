import type { Language } from '@i18n';
import en from './readme/en.md?raw';
import ru from './readme/ru.md?raw';
import uk from './readme/uk.md?raw';
import bootIni from './sd/BOOT.INI?raw';
import hekateIplIni from './sd/bootloader/hekate_ipl.ini?raw';
import spareIni from './sd/bootloader/ini/console_kitchen.ini?raw';
import nyxIni from './sd/bootloader/nyx.ini?raw';
import exosphereIni from './sd/exosphere.ini?raw';
import systemSettingsIni from './sd/atmosphere/config/system_settings.ini?raw';
import stratosphereIni from './sd/atmosphere/config/stratosphere.ini?raw';
import overrideConfigIni from './sd/atmosphere/config/override_config.ini?raw';
import emummcHostsTxt from './sd/atmosphere/hosts/emummc.txt?raw';
import defaultHostsTxt from './sd/atmosphere/hosts/default.txt?raw';
import teslaConfigIni from './sd/config/tesla/config.ini?raw';
import ultrahandConfigIni from './sd/config/ultrahand/config.ini?raw';
import ultrahandOverlaysIni from './sd/config/ultrahand/overlays.ini?raw';
import sysPatchConfigIni from './sd/config/sys-patch/config.ini?raw';
import missionControlIni from './sd/config/MissionControl/missioncontrol.ini?raw';
import sysConConfigIni from './sd/config/sys-con/config.ini?raw';
import statusMonitorConfigIni from './sd/config/status-monitor/config.ini?raw';
import sysTuneConfigIni from './sd/config/sys-tune/config.ini?raw';
import sysFtpdConfigIni from './sd/config/sys-ftpd/config.ini?raw';
import dbiConfig from './sd/switch/DBI/dbi.config?raw';
import dbiLocations from './sd/switch/DBI/dbi.locations?raw';
import jksvJson from './sd/config/JKSV/JKSV.json?raw';
import jksvWebdavJson from './sd/config/JKSV/webdav.json?raw';
import amiigoSettingsJson from './sd/config/amiigo/settings.json?raw';
import sysClkConfigIni from './sd/config/sys-clk/config.ini?raw';

export const README: {[code in Language]: string} = { en, ru, uk };

export default {
	bootIni,
	hekateIplIni,
	spareIni,
	nyxIni,
	exosphereIni,
	systemSettingsIni,
	stratosphereIni,
	overrideConfigIni,
	emummcHostsTxt,
	defaultHostsTxt,
	teslaConfigIni,
	ultrahandConfigIni,
	ultrahandOverlaysIni,
	sysPatchConfigIni,
	missionControlIni,
	sysConConfigIni,
	statusMonitorConfigIni,
	sysTuneConfigIni,
	sysFtpdConfigIni,
	dbiConfig,
	dbiLocations,
	jksvJson,
	jksvWebdavJson,
	amiigoSettingsJson,
	sysClkConfigIni,
};
