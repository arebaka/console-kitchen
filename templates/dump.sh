#!/usr/bin/env bash
# Console Kitchen dump of a card: what is installed on an SD card of a Switch or a Memory Stick of a PSP, and every config
#
# Usage: put the script into the root of the card and run it there:
#   bash dump.sh
#
# Writes console-kitchen-dump.toml next to itself, open it in the Console Kitchen with File → Open to update the build.
# The dump holds the configs as they are on the card, passwords included: keep it to yourself.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DUMP='console-kitchen-dump.toml'
cd "$ROOT"

# The card of a Switch has the folders of its CFW, the Memory Stick of a PSP the folder of the system
if [ -d atmosphere ] || [ -d bootloader ]; then
	PLATFORM=switch
	TRACE='{{switch.trace}}'
	CONFIGS=({{#switch.configs}}'{{.}}' {{/switch.configs}})
elif [ -d PSP ] || [ -d SEPLUGINS ]; then
	PLATFORM=psp
	TRACE='{{psp.trace}}'
	CONFIGS=({{#psp.configs}}'{{.}}' {{/psp.configs}})
else
	echo "error: $ROOT is not the root of a card of a Switch or a PSP" >&2
	exit 1
fi

if stat -c %s "$0" > /dev/null 2>&1; then
	size() { stat -c %s "$1"; }
else
	size() { stat -f %z "$1"; }
fi
if command -v sha256sum > /dev/null; then
	sha256() { sha256sum "$1" | cut -d ' ' -f 1; }
elif command -v shasum > /dev/null; then
	sha256() { shasum -a 256 "$1" | cut -d ' ' -f 1; }
else
	echo "error: sha256sum or shasum is required" >&2
	exit 1
fi

# The lists are made off the card, so they do not list themselves
WORK_DIR="$(mktemp -d)"
trap 'rm -rf "$WORK_DIR"' EXIT

# Files of a folder down to a depth, as paths from the root of the card
files() {
	if [ -d "$1" ]; then
		find "$1" -mindepth 1 -maxdepth "$2" -type f
	fi
}

# Folders of a folder: sets of patches and packages, each one a thing of its own
folders() {
	if [ -d "$1" ]; then
		find "$1" -mindepth 1 -maxdepth 1 -type d | sed 's|$|/|'
	fi
}

# What tells the installed components: their executables, sysmodules with their flags, payloads, entries of hekate and their pictures
switch_files() {
	files . 1
	files atmosphere 1
	files atmosphere/kips 1
	if [ -d atmosphere/contents ]; then
		find atmosphere/contents -mindepth 2 -maxdepth 3 \( -name exefs.nsp -o -name boot2.flag -o -name toolbox.json \) -type f
	fi
	folders atmosphere/exefs_patches
	folders atmosphere/kip_patches
	files bootloader 1
	files bootloader/sys 2
	files bootloader/payloads 1
	files bootloader/res 1
	files bootloader/ini 1
	if [ -d switch ]; then
		find switch -mindepth 1 -maxdepth 2 -name '*.nro' -type f
	fi
	files switch/.overlays 1
	folders switch/.packages
	files lakka 1
	files retroarch/cores 1
}

# Plugins with their lists, the homebrew of the XMB, ARK and the system update
psp_files() {
	files . 1
	files SEPLUGINS 2
	if [ -d PSP/GAME ]; then
		find PSP/GAME -mindepth 2 -maxdepth 2 -name EBOOT.PBP -type f
	fi
	files PSP/SAVEDATA/ARK_01234 1
}

# Texts read whole: the configs, the entries of hekate, the names of sysmodules, the registry of the App Store and the trace
switch_texts() {
	files bootloader/ini 1
	if [ -d atmosphere/contents ]; then
		find atmosphere/contents -mindepth 2 -maxdepth 2 -name toolbox.json -type f
	fi
	if [ -d switch/appstore/.get/packages ]; then
		find switch/appstore/.get/packages -mindepth 2 -maxdepth 2 \( -name info.json -o -name manifest.install \) -type f
	fi
}

psp_texts() {
	if [ -d SEPLUGINS ]; then
		find SEPLUGINS -mindepth 1 -maxdepth 1 -iname '*.txt' -type f
	fi
	if [ -d PSP/SAVEDATA/ARK_01234 ]; then
		find PSP/SAVEDATA/ARK_01234 -mindepth 1 -maxdepth 1 -iname '*.txt' -type f
	fi
}

texts() {
	for config in "${CONFIGS[@]}" "$TRACE/build.toml" "$TRACE/installed.tsv"; do
		if [ -f "$config" ]; then
			echo "$config"
		fi
	done
	"${PLATFORM}_texts"
}

# Paths go into the dump one per line, without the scripts of the Console Kitchen and the dump. A name that is not printable
# ASCII or holds a quote or a backslash, which a card does not hold, would need escaping and is skipped.
# A card does not tell names in other cases apart, so a path comes once
paths() {
	sed 's|^\./||' |
		LC_ALL=C grep -v -e '[^[:print:]]' -e '["\\]' |
		grep -v -x -F -e install.sh -e install.ps1 -e update.sh -e update.ps1 -e dump.sh -e dump.ps1 -e "$DUMP" |
		sort -f -u || true
}

# A text as it is when it is printable ASCII without three quotes in a row, in base64 otherwise
text() {
	if LC_ALL=C grep -q $'[^[:print:]\t]' "$1" || grep -qF "'''" "$1"; then
		printf '"%s" = { base64 = "%s" }\n' "$1" "$(base64 < "$1" | tr -d '\n')"
	else
		printf '"%s" = '"'''"'\n' "$1"
		cat "$1"
		printf "'''\n"
	fi
}

echo "Dumping the card of a $PLATFORM: $ROOT"
"${PLATFORM}_files" | paths > "$WORK_DIR/files"
texts | paths > "$WORK_DIR/texts"
{
	echo '# Console Kitchen dump of a card: open it in the Console Kitchen with File → Open to update the build.'
	echo '# It holds the configs of the card as they are, passwords included: keep it to yourself'
	echo
	echo 'kind = "dump"'
	echo 'format = 1'
	echo "platform = \"$PLATFORM\""
	echo "made = \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\""
	echo 'tool = "dump.sh"'
	echo
	# Sizes of the files, a folder has none
	echo '[files]'
	while IFS= read -r path; do
		case "$path" in
			*/) echo "\"$path\" = 0" ;;
			*) echo "\"$path\" = $(size "$path")" ;;
		esac
	done < "$WORK_DIR/files"
	echo
	# The update checks a config it rewrites against its hash, so it keeps what changed on the card since the dump
	echo '[hashes]'
	while IFS= read -r path; do
		echo "\"$path\" = \"$(sha256 "$path")\""
	done < "$WORK_DIR/texts"
	echo
	echo '[texts]'
	while IFS= read -r path; do
		text "$path"
	done < "$WORK_DIR/texts"
} > "$WORK_DIR/dump"
cp "$WORK_DIR/dump" "$DUMP"

echo "Done! Open $ROOT/$DUMP in the Console Kitchen with File → Open."
