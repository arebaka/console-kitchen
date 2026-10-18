# Console Kitchen dump of a card: what is installed on an SD card of a Switch or a Memory Stick of a PSP, and every config
#
# Usage: put the script into the root of the card and run it there:
#   powershell -ExecutionPolicy Bypass -File dump.ps1
#
# Writes console-kitchen-dump.toml next to itself, open it in the Console Kitchen with File → Open to update the build.
# The dump holds the configs as they are on the card, passwords included: keep it to yourself.

$ErrorActionPreference = 'Stop'

$Root = $PSScriptRoot
# The root of a drive ends with a backslash, other folders do not
$Base = (Get-Item -LiteralPath $Root).FullName.TrimEnd('\', '/')
$Dump = 'console-kitchen-dump.toml'

function Test-Folder([string]$Path) {
	return Test-Path -LiteralPath (Join-Path $Root $Path) -PathType Container
}

# The card of a Switch has the folders of its CFW, the Memory Stick of a PSP the folder of the system
if ((Test-Folder 'atmosphere') -or (Test-Folder 'bootloader')) {
	$Platform = 'switch'
	$Trace = '{{switch.trace}}'
	$Configs = @(
{{#switch.configs}}
		'{{.}}'
{{/switch.configs}}
	)
} elseif ((Test-Folder 'PSP') -or (Test-Folder 'SEPLUGINS')) {
	$Platform = 'psp'
	$Trace = '{{psp.trace}}'
	$Configs = @(
{{#psp.configs}}
		'{{.}}'
{{/psp.configs}}
	)
} else {
	Write-Host "error: $Root is not the root of a card of a Switch or a PSP" -ForegroundColor Red
	exit 1
}

# A path from the root of the card, with the slashes of the console
function Get-Relative($Item) {
	return $Item.FullName.Substring($Base.Length + 1) -replace '\\', '/'
}

# Files of a folder down to a depth
function Get-Files([string]$Path, [int]$Depth, [string]$Filter = '*') {
	if (Test-Folder $Path) {
		Get-ChildItem -LiteralPath (Join-Path $Root $Path) -Depth ($Depth - 1) -Filter $Filter -File -Force | ForEach-Object { Get-Relative $_ }
	}
}

# Folders of a folder: sets of patches and packages, each one a thing of its own
function Get-Folders([string]$Path) {
	if (Test-Folder $Path) {
		Get-ChildItem -LiteralPath (Join-Path $Root $Path) -Directory -Force | ForEach-Object { "$(Get-Relative $_)/" }
	}
}

# Files of the folders of sysmodules: their executables, flags and names
function Get-Sysmodules([string[]]$Names) {
	if (Test-Folder 'atmosphere/contents') {
		Get-ChildItem -LiteralPath (Join-Path $Root 'atmosphere/contents') -Depth 2 -File -Force |
			Where-Object { $Names -contains $_.Name } |
			ForEach-Object { Get-Relative $_ } |
			Where-Object { $_.Split('/').Count -ge 4 }
	}
}

# What tells the installed components: their executables, sysmodules with their flags, payloads, entries of hekate and their pictures
function Get-SwitchFiles {
	Get-Files '.' 1
	Get-Files 'atmosphere' 1
	Get-Files 'atmosphere/kips' 1
	Get-Sysmodules 'exefs.nsp', 'boot2.flag', 'toolbox.json'
	Get-Folders 'atmosphere/exefs_patches'
	Get-Folders 'atmosphere/kip_patches'
	Get-Files 'bootloader' 1
	Get-Files 'bootloader/sys' 2
	Get-Files 'bootloader/payloads' 1
	Get-Files 'bootloader/res' 1
	Get-Files 'bootloader/ini' 1
	Get-Files 'switch' 2 '*.nro'
	Get-Files 'switch/.overlays' 1
	Get-Folders 'switch/.packages'
	Get-Files 'lakka' 1
	Get-Files 'retroarch/cores' 1
}

# Plugins with their lists, the homebrew of the XMB, ARK and the system update
function Get-PspFiles {
	Get-Files '.' 1
	Get-Files 'SEPLUGINS' 2
	Get-Files 'PSP/GAME' 2 'EBOOT.PBP' | Where-Object { $_.Split('/').Count -eq 4 }
	Get-Files 'PSP/SAVEDATA/ARK_01234' 1
}

# Texts read whole: the configs, the entries of hekate, the names of sysmodules, the registry of the App Store and the trace
function Get-SwitchTexts {
	Get-Files 'bootloader/ini' 1
	Get-Sysmodules 'toolbox.json' | Where-Object { $_.Split('/').Count -eq 4 }
	Get-Files 'switch/appstore/.get/packages' 2 | Where-Object { $_.Split('/').Count -eq 6 -and ($_ -like '*/info.json' -or $_ -like '*/manifest.install') }
}

function Get-PspTexts {
	Get-Files 'SEPLUGINS' 1 '*.txt'
	Get-Files 'PSP/SAVEDATA/ARK_01234' 1 '*.txt'
}

function Get-Texts {
	foreach ($config in $Configs + "$Trace/build.toml" + "$Trace/installed.tsv") {
		if (Test-Path -LiteralPath (Join-Path $Root $config) -PathType Leaf) {
			$config
		}
	}
	if ($Platform -eq 'switch') { Get-SwitchTexts } else { Get-PspTexts }
}

# Paths go into the dump without the scripts of the Console Kitchen and the dump. A name that is not printable ASCII or holds
# a quote or a backslash, which a card does not hold, would need escaping and is skipped.
# A card does not tell names in other cases apart, so a path comes once
$Scripts = 'install.sh', 'install.ps1', 'update.sh', 'update.ps1', 'dump.sh', 'dump.ps1', $Dump
function Select-Paths {
	$input |
		Where-Object { $_ -cmatch '^[\x20-\x7E]+$' -and $_ -notmatch '["\\]' -and $Scripts -notcontains $_ } |
		Sort-Object -Unique
}

# A text as it is when it is printable ASCII without three quotes in a row, in base64 otherwise
function Get-Text([string]$Path) {
	$bytes = [IO.File]::ReadAllBytes((Join-Path $Root $Path))
	$isPlain = -not [Array]::Exists($bytes, [Predicate[byte]] { param($byte) ($byte -lt 0x20 -and $byte -ne 9 -and $byte -ne 10) -or $byte -gt 0x7E })
	$text = [Text.Encoding]::ASCII.GetString($bytes)
	if ($isPlain -and -not $text.Contains("'''")) {
		return "`"$Path`" = '''`n$text'''"
	}
	return "`"$Path`" = { base64 = `"$([Convert]::ToBase64String($bytes))`" }"
}

Write-Host "Dumping the card of a ${Platform}: $Root"
$files = @(if ($Platform -eq 'switch') { Get-SwitchFiles } else { Get-PspFiles }) | Select-Paths
$texts = @(Get-Texts) | Select-Paths

$lines = [Collections.Generic.List[string]]::new()
$lines.Add('# Console Kitchen dump of a card: open it in the Console Kitchen with File → Open to update the build.')
$lines.Add('# It holds the configs of the card as they are, passwords included: keep it to yourself')
$lines.Add('')
$lines.Add('kind = "dump"')
$lines.Add('format = 1')
$lines.Add("platform = `"$Platform`"")
$lines.Add("made = `"$([DateTime]::UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'"))`"")
$lines.Add('tool = "dump.ps1"')
$lines.Add('')
# Sizes of the files, a folder has none
$lines.Add('[files]')
foreach ($path in $files) {
	$size = if ($path.EndsWith('/')) { 0 } else { (Get-Item -LiteralPath (Join-Path $Root $path) -Force).Length }
	$lines.Add("`"$path`" = $size")
}
$lines.Add('')
# The update checks a config it rewrites against its hash, so it keeps what changed on the card since the dump
$lines.Add('[hashes]')
foreach ($path in $texts) {
	$lines.Add("`"$path`" = `"$((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $Root $path)).Hash.ToLowerInvariant())`"")
}
$lines.Add('')
$lines.Add('[texts]')
foreach ($path in $texts) {
	$lines.Add((Get-Text $path))
}
[IO.File]::WriteAllText((Join-Path $Root $Dump), ($lines -join "`n") + "`n")

Write-Host ''
Write-Host 'Done! ' -ForegroundColor Green -NoNewline
Write-Host "Open $(Join-Path $Root $Dump) in the Console Kitchen with File → Open."
Write-Host ''

if (-not [Console]::IsInputRedirected) {
	Read-Host 'Press Enter to exit' | Out-Null
}
