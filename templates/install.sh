#!/usr/bin/env bash
# Console Kitchen {{#update}}update{{/update}}{{^update}}installer{{/update}}: {{title}}
#
# Usage: put the script into the root of the {{card}} and run it there:
#   bash {{script}}
#
# Downloads the selected components from {{#hasAppstore}}the Homebrew App Store, {{/hasAppstore}}GitHub releases and direct links,
# unpacks them onto the {{card}} next to the script and writes the configuration and images.
{{#update}}
# Updates the card its dump was made of: takes off what left the build, skips the components whose latest release is
# installed already and writes only the configs whose options changed. What it overwrites or deletes goes into {{backup}}/.
{{/update}}
# Set GITHUB_TOKEN to lift the GitHub API limit of 60 requests per hour.

set -euo pipefail

{{#hasAppstore}}
APPSTORE='https://switch.cdn.fortheusers.org'
{{/hasAppstore}}
SD_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="$SD_ROOT/.console-kitchen"
TRACE_DIR="$SD_ROOT/{{trace}}"
FAILED=()
# The component being installed and the release it comes from, for the trace left on the card
COMPONENT=''
TAG=''
{{#update}}
BACKUP_DIR="$SD_ROOT/{{backup}}/$(date +%Y-%m-%d_%H-%M-%S)"
# Components whose latest release is installed already, configs that changed on the card since its dump
FRESH=()
SKIPPED=()
# Configs the builds write: an archive does not overwrite the one on the card, its options decide
CONFIGS=({{#protect}}'{{.}}' {{/protect}})
{{/update}}

if [ -t 1 ]; then
	CLR_RESET='\033[0m'
	CLR_BOLD='\033[1m'
	CLR_DIM='\033[2m'
	CLR_GREEN='\033[32m'
	CLR_RED='\033[31m'
	CLR_CYAN='\033[36m'
	CLR_YELLOW='\033[33m'
else
	CLR_RESET='' CLR_BOLD='' CLR_DIM='' CLR_GREEN='' CLR_RED='' CLR_CYAN='' CLR_YELLOW=''
fi
# Downloads draw the progress bar of curl where there is a terminal to draw it in
if [ -t 1 ] && [ -t 2 ]; then
	BAR=1
else
	BAR=''
fi

info()    { printf "\n${CLR_CYAN}>${CLR_RESET} ${CLR_BOLD}%s${CLR_RESET}\n" "$1"; }
step()    { printf "  ${CLR_DIM}[..]${CLR_RESET} %s..." "$1"; }
ok()      { printf "\r  [${CLR_GREEN}OK${CLR_RESET}] %s   \n" "$1"; }
fail()    { printf "\r  [${CLR_RED}ERR${CLR_RESET}] %s  \n" "$1"; }
warning() { printf "  ${CLR_YELLOW}!${CLR_RESET} %s\n" "$1"; }

if ! command -v curl > /dev/null; then
	echo "error: curl is required" >&2
	exit 1
fi
if command -v unzip > /dev/null; then
	extract() { unzip -qo "$1" -d "$2"; }
elif command -v bsdtar > /dev/null; then
	extract() { bsdtar -xf "$1" -C "$2"; }
elif command -v python3 > /dev/null; then
	extract() { python3 -m zipfile -e "$1" "$2"; }
else
	echo "error: unzip, bsdtar or python3 is required" >&2
	exit 1
fi
{{#hasTar}}
if ! command -v tar > /dev/null; then
	echo "error: tar is required" >&2
	exit 1
fi
{{/hasTar}}
{{#hasImages}}
if ! command -v base64 > /dev/null || ! command -v gzip > /dev/null; then
	echo "error: base64 and gzip are required" >&2
	exit 1
fi
{{/hasImages}}
{{#update}}
if command -v sha256sum > /dev/null; then
	sha256() { sha256sum "$1" | cut -d ' ' -f 1; }
elif command -v shasum > /dev/null; then
	sha256() { shasum -a 256 "$1" | cut -d ' ' -f 1; }
else
	echo "error: sha256sum or shasum is required" >&2
	exit 1
fi
{{/update}}
if [ ! -w "$SD_ROOT" ]; then
	echo "error: $SD_ROOT is not writable" >&2
	exit 1
fi

# What archives leave on the card besides their files, removed at the end and kept out of the trace
LEFTOVERS=(LICENSE.txt README.txt README.md CHANGELOG.md screen1.png screen2.png switch/breeze/.Breeze.nro.star)

cleanup() {
	rm -rf "$WORK_DIR"
	rm -f "$SD_ROOT/{{script}}"
	for leftover in "${LEFTOVERS[@]}"; do
		rm -f "$SD_ROOT/$leftover"
	done
}

mkdir -p "$WORK_DIR"
trap cleanup EXIT

# The latest release of a repository as the API tells it, asked once
release() {
	local cache="$WORK_DIR/release-${1//\//_}.json"
	if [ ! -f "$cache" ]; then
		curl -fsSL -H 'Accept: application/vnd.github+json' ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"} \
			"https://api.github.com/repos/$1/releases/latest" > "$cache" || { rm -f "$cache"; return 1; }
	fi
	echo "$cache"
}

asset_url() {
	local cache url name
	cache="$(release "$1")" || return 1
	while read -r url; do
		name="$(basename "$url")"
		if printf '%s\n' "${name//%2B/+}" | grep -Eq "$2"; then
			echo "$url"
			return 0
		fi
	done < <(grep -o '"browser_download_url": *"[^"]*"' "$cache" | sed 's/.*"\(http[^"]*\)"$/\1/')
	echo "  no asset matching $2 in $1" >&2
	return 1
}

# The tag of the release asset_url found in a repository, empty when the answer of the API has none
release_tag() {
	grep -o '"tag_name": *"[^"]*"' "$WORK_DIR/release-${1//\//_}.json" | head -n 1 | sed 's/.*"\([^"]*\)"$/\1/' || true
}

# Files the component puts onto the card, one path per line under the folder in $1, go into the trace with its release
record() {
	local path
	while IFS= read -r path; do
		path="${path#./}"
		[ -z "$path" ] || printf '%s\t%s\t%s%s\n' "$COMPONENT" "$TAG" "${1:-}" "$path" >> "$WORK_DIR/component.tsv"
	done
}
{{#update}}

# A path of the update stays on the card and off what an update never touches: the system of the console, the emuMMCs,
# the configs, the trace and the backups
safe_path() {
	local lower
	lower="$(printf '%s' "$1" | tr '[:upper:]' '[:lower:]')"
	case "/$1/" in
		*/../* | */./* | //*) return 1 ;;
	esac
	case "$lower" in
		'' | nintendo | nintendo/* | emummc | emummc/* | config/* | {{backup}} | {{backup}}/* | {{trace}} | {{trace}}/*) return 1 ;;
	esac
}

# Folders a move left empty go too, up to the root of the card
prune() {
	local dir="$1"
	while [ "$dir" != . ] && [ "$dir" != / ] && rmdir "$SD_ROOT/$dir" 2> /dev/null; do
		dir="$(dirname "$dir")"
	done
}

# What the update takes off the card goes into the backup with its path, a folder with all it holds.
# A path it cannot move is told and stays
backup_move() {
	local path="${1%/}"
	if safe_path "$path" && [ -e "$SD_ROOT/$path" ]; then
		{ mkdir -p "$BACKUP_DIR/$(dirname "$path")" && mv "$SD_ROOT/$path" "$BACKUP_DIR/$path" && prune "$(dirname "$path")"; } ||
			warning "could not take $path off the card"
	fi
}

# A file the update overwrites keeps its copy in the backup
backup_copy() {
	if [ -f "$SD_ROOT/$1" ]; then
		mkdir -p "$BACKUP_DIR/$(dirname "$1")" && cp "$SD_ROOT/$1" "$BACKUP_DIR/$1"
	fi
}

# A config still holds what the dump saw: the hash it had, or still nothing when it was not there
unchanged() {
	if [ -z "$2" ]; then
		[ ! -e "$SD_ROOT/$1" ]
	else
		[ -f "$SD_ROOT/$1" ] && [ "$(sha256 "$SD_ROOT/$1")" = "$2" ]
	fi
}

# A component the trace has a release for is fresh while that release is still the latest one
is_fresh() {
	local latest=''
	case "$1" in
		github) release "$2" > /dev/null 2>&1 && latest="$(release_tag "$2")" ;;
{{#hasAppstore}}
		appstore) latest="$(curl -fsSL "$APPSTORE/packages/$2/info.json" 2> /dev/null | sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' | head -n 1 || true)" ;;
{{/hasAppstore}}
	esac
	[ -n "$latest" ] && [ "$latest" = "$3" ]
}

# Configs an archive ships, such as the one of sys-con, leave the archive before it is copied when the card has them
keep_configs() {
	local config
	for config in "${CONFIGS[@]}"; do
		case "$config" in
			"${2:+$2/}"*) if [ -e "$SD_ROOT/$config" ]; then rm -f "$1/${config#"${2:+$2/}"}"; fi ;;
		esac
	done
}
{{/update}}

download() {
	local file
	file="$WORK_DIR/$(basename "${1%%\?*}")"
	if [ -n "$BAR" ]; then
		# The bar takes the line under the step and is wiped off once the file is here, the cursor goes back to the step
		printf '\n' >&2
		curl -fL --progress-bar -o "$file" "$1" || return 1
		printf '\033[A\033[2K\033[A' >&2
	else
		curl -fsSL -o "$file" "$1" || return 1
	fi
	echo "$file"
}

unpack() {
	local unpacked="$WORK_DIR/unpacked"
	rm -rf "$unpacked" && mkdir -p "$unpacked" "$SD_ROOT/${3:-.}"
	extract "$1" "$unpacked" || return 1
{{#update}}
	keep_configs "$unpacked/${2:-.}" "${3:-}"
{{/update}}
	cp -R "$unpacked/${2:-.}/." "$SD_ROOT/${3:-.}/" &&
		(cd "$unpacked/${2:-.}" && find . -type f) | record "${3:+$3/}"
}

save() {
	mkdir -p "$SD_ROOT/$(dirname "$2")" && cp "$1" "$SD_ROOT/$2" && echo "$2" | record
}

{{#hasAppstore}}
install_appstore() {
	local file unpacked="$WORK_DIR/unpacked" registry="$SD_ROOT/switch/appstore/.get/packages/$1"
	file="$(download "$APPSTORE/zips/$1.zip")" || return 1
	rm -rf "$unpacked" && mkdir -p "$unpacked" "$registry"
	extract "$file" "$unpacked" || return 1
	for meta in manifest.install info.json; do
		if [ -f "$unpacked/$meta" ]; then
			mv "$unpacked/$meta" "$registry/$meta"
		fi
	done
	# The version of a package names its release
	TAG="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$registry/info.json" 2> /dev/null | head -n 1 || true)"
{{#update}}
	keep_configs "$unpacked" ''
{{/update}}
	cp -R "$unpacked/." "$SD_ROOT/" && (cd "$unpacked" && find . -type f) | record
}

{{/hasAppstore}}
install_zip() {
	local url file
	url="$(asset_url "$1" "$2")" && TAG="$(release_tag "$1")" && file="$(download "$url")" && unpack "$file" "${3:-}" "${4:-}"
}

install_file() {
	local url file
	url="$(asset_url "$1" "$2")" && TAG="$(release_tag "$1")" && file="$(download "$url")" && save "$file" "$3"
}

{{#hasTar}}
# A tar goes straight onto the card, its paths without their leading folders: such an archive is too big to unpack it twice.
# Run by root, tar would give the files to the owners the archive names, which the card cannot keep
install_tar() {
	local url file
	url="$(asset_url "$1" "$2")" && TAG="$(release_tag "$1")" && file="$(download "$url")" &&
		tar -xf "$file" -C "$SD_ROOT" --strip-components="$3" --no-same-owner &&
		{ tar -tf "$file" | awk -v strip="$3" '{ for (i = 0; i < strip; i++) if (!sub("^[^/]*/", "")) next } $0 != "" && $0 !~ "/$"' | record; } &&
		rm -f "$file"
}

{{/hasTar}}
write_config() {
	mkdir -p "$SD_ROOT/$(dirname "$1")" && cat > "$SD_ROOT/$1"
}

write_image() {
	mkdir -p "$SD_ROOT/$(dirname "$1")" && base64 --decode | gzip -dc > "$SD_ROOT/$1"
}
{{#update}}

info "Taking off what left the build"
# The paths come from the dump of the card, one per line: sysmodules of other builds to turn off, foreign files and folders
# to delete, files of the components that left the build
step 'Turning off sysmodules of other builds'
while IFS= read -r path; do
	[ -z "$path" ] || backup_move "${path%/}/flags/boot2.flag"
done << 'CONSOLE_KITCHEN_EOF'
{{#disables}}
{{.}}
{{/disables}}
CONSOLE_KITCHEN_EOF
ok 'Turning off sysmodules of other builds'

step 'Deleting what other builds left'
while IFS= read -r path; do
	[ -z "$path" ] || backup_move "$path"
done << 'CONSOLE_KITCHEN_EOF'
{{#deletions}}
{{.}}
{{/deletions}}
CONSOLE_KITCHEN_EOF
ok 'Deleting what other builds left'

step 'Removing the components that left the build'
while IFS= read -r path; do
	[ -z "$path" ] || backup_move "$path"
done << 'CONSOLE_KITCHEN_EOF'
{{#removals}}
{{.}}
{{/removals}}
CONSOLE_KITCHEN_EOF
ok 'Removing the components that left the build'
{{/update}}

info "Downloading & unpacking components"
{{#components}}

step '{{name}}'
COMPONENT='{{id}}' TAG=''
: > "$WORK_DIR/component.tsv"
{{#fresh}}
# Installed from the release {{tag}}, which may still be the latest one
if is_fresh '{{kind}}' '{{source}}' '{{tag}}'; then
	FRESH+=('{{name}}')
	ok '{{name}} {{tag}} is up to date'
el{{/fresh}}if {{#steps}}{{#appstore}}install_appstore '{{package}}' &&{{/appstore}}{{#zip}}install_zip '{{repo}}' '{{asset}}' '{{root}}' '{{into}}' &&{{/zip}}{{#file}}install_file '{{repo}}' '{{asset}}' '{{path}}' &&{{/file}}{{#tar}}install_tar '{{repo}}' '{{asset}}' '{{strip}}' &&{{/tar}}{{#urlZip}}{ archive="$(download '{{url}}')" && unpack "$archive" '{{root}}' '{{into}}'; } &&{{/urlZip}}{{#urlFile}}{ file="$(download '{{url}}')" && save "$file" '{{path}}'; } &&{{/urlFile}}{{/steps}} true; then
	cat "$WORK_DIR/component.tsv" >> "$WORK_DIR/installed.tsv"
	ok '{{name}}'
else
	fail '{{name}}'
	FAILED+=('{{name}}')
fi
{{/components}}

info "Writing configuration"
{{#configs}}

step '{{path}}'
{{#update}}
# The config changed on the card since the dump stays as it is
if unchanged '{{path}}' '{{hash}}'; then
	backup_copy '{{path}}'
{{/update}}
write_config '{{path}}' << 'CONSOLE_KITCHEN_EOF'
{{content}}
CONSOLE_KITCHEN_EOF
ok '{{path}}'
{{#update}}
else
	SKIPPED+=('{{path}}')
	fail '{{path}} changed since the dump'
fi
{{/update}}
{{/configs}}
{{#hasImages}}

info "Deploying appearance & assets"
{{#images}}

step '{{path}}'
{{#update}}
backup_copy '{{path}}'
{{/update}}
write_image '{{path}}' << 'CONSOLE_KITCHEN_EOF'
{{data}}
CONSOLE_KITCHEN_EOF
ok '{{path}}'
{{/images}}
{{/hasImages}}

info "Recording the build for updates"

step '{{trace}}'
mkdir -p "$TRACE_DIR"
touch "$WORK_DIR/installed.tsv"
# Components installed now replace their lines, {{#update}}the ones that left the build lose theirs, {{/update}}the others keep the ones of their earlier installs
{
	printf 'component\ttag\tpath\n'
	if [ -f "$TRACE_DIR/installed.tsv" ]; then
		awk -F '\t' -v removed='{{removed}}' 'BEGIN { split(removed, list, " "); for (i in list) gone[list[i]] = 1 } FILENAME == ARGV[1] { fresh[$1] = 1; next } FNR > 1 && !($1 in fresh) && !($1 in gone)' "$WORK_DIR/installed.tsv" "$TRACE_DIR/installed.tsv"
	fi
	awk -F '\t' -v leftovers="${LEFTOVERS[*]}" 'BEGIN { split(leftovers, list, " "); for (i in list) junk[list[i]] = 1 } !($3 in junk)' "$WORK_DIR/installed.tsv"
} > "$WORK_DIR/trace.tsv"
mv "$WORK_DIR/trace.tsv" "$TRACE_DIR/installed.tsv"
write_config '{{trace}}/build.toml' << 'CONSOLE_KITCHEN_EOF'
{{build}}
CONSOLE_KITCHEN_EOF
ok '{{trace}}'

# macOS leaves AppleDouble ._ files on FAT32, the console takes them for files of its own
if [ "$(uname)" = Darwin ] && command -v dot_clean > /dev/null; then
	step "Cleaning macOS dotfiles"
	dot_clean -m "$SD_ROOT"
	ok "Cleaning macOS dotfiles"
fi
{{#hasManual}}

info "Manual action required"
{{#manual}}
warning '{{name}}: {{url}}'
{{/manual}}
{{/hasManual}}
{{#update}}
if [ ${#FRESH[@]} -gt 0 ]; then
	printf "\n  Up to date already: %s\n" "${FRESH[*]}"
fi
if [ ${#SKIPPED[@]} -gt 0 ]; then
	printf "\n"
	warning "Changed on the card since its dump, left as they are: ${SKIPPED[*]}"
	warning "Dump the card again and build the update anew to change them"
fi
if [ -d "$BACKUP_DIR" ]; then
	printf "\n"
	warning "What the update overwrote or took off the card is in ${BACKUP_DIR#"$SD_ROOT/"}"
fi
{{/update}}

printf "\n"
if [ ${#FAILED[@]} -gt 0 ]; then
	printf "${CLR_RED}${CLR_BOLD}Installation failed for:${CLR_RESET} %s\n\n" "${FAILED[*]}" >&2
	exit 1
fi
{{#update}}

# The dump holds the configs with their passwords, it has done its job
rm -f "$SD_ROOT/{{dump}}" "$SD_ROOT/dump.sh" "$SD_ROOT/dump.ps1"
{{/update}}

printf '%b%bDone!%b Eject the {{card}} safely and boot your {{console}}.\n\n' "$CLR_GREEN" "$CLR_BOLD" "$CLR_RESET"
