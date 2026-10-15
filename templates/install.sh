#!/usr/bin/env bash
# Console Kitchen installer: {{title}}
#
# Usage: put the script into the root of the {{card}} and run it there:
#   bash install.sh
#
# Downloads the selected components from {{#hasAppstore}}the Homebrew App Store, {{/hasAppstore}}GitHub releases and direct links,
# unpacks them onto the {{card}} next to the script and writes the configuration and images.
# Set GITHUB_TOKEN to lift the GitHub API limit of 60 requests per hour.

set -euo pipefail

{{#hasAppstore}}
APPSTORE='https://switch.cdn.fortheusers.org'
{{/hasAppstore}}
SD_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK_DIR="$SD_ROOT/.console-kitchen"
FAILED=()

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
if [ ! -w "$SD_ROOT" ]; then
	echo "error: $SD_ROOT is not writable" >&2
	exit 1
fi

cleanup() {
	rm -rf "$WORK_DIR"
	rm -f "$SD_ROOT/install.sh"
	rm -f \
		"$SD_ROOT/LICENSE.txt" \
		"$SD_ROOT/README.txt" \
		"$SD_ROOT/README.md" \
		"$SD_ROOT/CHANGELOG.md" \
		"$SD_ROOT/screen1.png" \
		"$SD_ROOT/screen2.png" \
		"$SD_ROOT/switch/breeze/.Breeze.nro.star"
}

mkdir -p "$WORK_DIR"
trap cleanup EXIT

asset_url() {
	local cache="$WORK_DIR/release-${1//\//_}.json" url name
	if [ ! -f "$cache" ]; then
		curl -fsSL -H 'Accept: application/vnd.github+json' ${GITHUB_TOKEN:+-H "Authorization: Bearer $GITHUB_TOKEN"} \
			"https://api.github.com/repos/$1/releases/latest" > "$cache" || { rm -f "$cache"; return 1; }
	fi
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
	cp -R "$unpacked/${2:-.}/." "$SD_ROOT/${3:-.}/"
}

save() {
	mkdir -p "$SD_ROOT/$(dirname "$2")" && cp "$1" "$SD_ROOT/$2"
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
	cp -R "$unpacked/." "$SD_ROOT/"
}

{{/hasAppstore}}
install_zip() {
	local url file
	url="$(asset_url "$1" "$2")" && file="$(download "$url")" && unpack "$file" "${3:-}" "${4:-}"
}

install_file() {
	local url file
	url="$(asset_url "$1" "$2")" && file="$(download "$url")" && save "$file" "$3"
}

{{#hasTar}}
# A tar goes straight onto the card, its paths without their leading folders: such an archive is too big to unpack it twice.
# Run by root, tar would give the files to the owners the archive names, which the card cannot keep
install_tar() {
	local url file
	url="$(asset_url "$1" "$2")" && file="$(download "$url")" &&
		tar -xf "$file" -C "$SD_ROOT" --strip-components="$3" --no-same-owner &&
		rm -f "$file"
}

{{/hasTar}}
write_config() {
	mkdir -p "$SD_ROOT/$(dirname "$1")" && cat > "$SD_ROOT/$1"
}

write_image() {
	mkdir -p "$SD_ROOT/$(dirname "$1")" && base64 --decode | gzip -dc > "$SD_ROOT/$1"
}

info "Downloading & unpacking components"
{{#components}}

step '{{name}}'
if {{#steps}}{{#appstore}}install_appstore '{{package}}' &&{{/appstore}}{{#zip}}install_zip '{{repo}}' '{{asset}}' '{{root}}' '{{into}}' &&{{/zip}}{{#file}}install_file '{{repo}}' '{{asset}}' '{{path}}' &&{{/file}}{{#tar}}install_tar '{{repo}}' '{{asset}}' '{{strip}}' &&{{/tar}}{{#urlZip}}{ archive="$(download '{{url}}')" && unpack "$archive" '{{root}}' '{{into}}'; } &&{{/urlZip}}{{#urlFile}}{ file="$(download '{{url}}')" && save "$file" '{{path}}'; } &&{{/urlFile}}{{/steps}} true; then
	ok '{{name}}'
else
	fail '{{name}}'
	FAILED+=('{{name}}')
fi
{{/components}}

info "Writing configuration"
{{#configs}}

step '{{path}}'
write_config '{{path}}' << 'CONSOLE_KITCHEN_EOF'
{{content}}
CONSOLE_KITCHEN_EOF
ok '{{path}}'
{{/configs}}
{{#hasImages}}

info "Deploying appearance & assets"
{{#images}}

step '{{path}}'
write_image '{{path}}' << 'CONSOLE_KITCHEN_EOF'
{{data}}
CONSOLE_KITCHEN_EOF
ok '{{path}}'
{{/images}}
{{/hasImages}}

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

printf "\n"
if [ ${#FAILED[@]} -gt 0 ]; then
	printf "${CLR_RED}${CLR_BOLD}Installation failed for:${CLR_RESET} %s\n\n" "${FAILED[*]}" >&2
	exit 1
fi

printf '%b%bDone!%b Eject the {{card}} safely and boot your {{console}}.\n\n' "$CLR_GREEN" "$CLR_BOLD" "$CLR_RESET"
