# Console Kitchen installer: {{title}}
#
# Usage: put the script into the root of the {{card}} and run it there:
#   powershell -ExecutionPolicy Bypass -File install.ps1
#
# Downloads the selected components from {{#hasAppstore}}the Homebrew App Store, {{/hasAppstore}}GitHub releases and direct links,
# unpacks them onto the {{card}} next to the script and writes the configuration and images.
# Set $env:GITHUB_TOKEN to lift the GitHub API limit of 60 requests per hour.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # the progress bar slows Invoke-WebRequest down dramatically on PowerShell 5
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

{{#hasAppstore}}
$AppStore = 'https://switch.cdn.fortheusers.org'
{{/hasAppstore}}
$SdRoot = $PSScriptRoot
$WorkDir = Join-Path $SdRoot '.console-kitchen'
$Releases = @{}
$Failed = @()

function Write-Info([string]$Text) {
	Write-Host ''
	Write-Host '==> ' -ForegroundColor Cyan -NoNewline
	Write-Host $Text -ForegroundColor White
}

function Write-Step([string]$Text) {
	Write-Host '    [..] ' -ForegroundColor DarkGray -NoNewline
	Write-Host "$Text..." -NoNewline
}

# The result replaces the line of the step, trailing spaces cover its longer tail
function Write-Ok([string]$Text) {
	Write-Host "`r    [" -NoNewline
	Write-Host 'OK' -ForegroundColor Green -NoNewline
	Write-Host "] $Text   "
}

function Write-Fail([string]$Text) {
	Write-Host "`r    [" -NoNewline
	Write-Host 'ERR' -ForegroundColor Red -NoNewline
	Write-Host "] $Text  "
}

function Write-Notice([string]$Text) {
	Write-Host '    ' -NoNewline
	Write-Host '!' -ForegroundColor Yellow -NoNewline
	Write-Host " $Text"
}

function Get-Download([string]$Url) {
	$file = Join-Path $WorkDir ([IO.Path]::GetFileName(([Uri]$Url).AbsolutePath))
	Invoke-WebRequest -Uri $Url -OutFile $file -UseBasicParsing
	return $file
}

function Get-AssetUrl([string]$Repo, [string]$Pattern) {
	if (-not $Releases.ContainsKey($Repo)) {
		$headers = @{ Accept = 'application/vnd.github+json' }
		if ($env:GITHUB_TOKEN) {
			$headers.Authorization = "Bearer $env:GITHUB_TOKEN"
		}
		$Releases[$Repo] = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers $headers -UseBasicParsing
	}
	$asset = $Releases[$Repo].assets | Where-Object { $_.name -cmatch $Pattern } | Select-Object -First 1
	if (-not $asset) {
		throw "no asset matching $Pattern in $Repo"
	}
	return $asset.browser_download_url
}

function Expand-Download([string]$File) {
	$unpacked = Join-Path $WorkDir 'unpacked'
	if (Test-Path -LiteralPath $unpacked) {
		Remove-Item -LiteralPath $unpacked -Recurse -Force
	}
	Expand-Archive -LiteralPath $File -DestinationPath $unpacked -Force
	return $unpacked
}

function Install-Archive([string]$File, [string]$Root, [string]$Into) {
	$unpacked = Expand-Download $File
	$source = if ($Root) { Join-Path $unpacked $Root } else { $unpacked }
	$target = if ($Into) { Join-Path $SdRoot $Into } else { $SdRoot }
	New-Item -ItemType Directory -Path $target -Force | Out-Null
	Copy-Item -Path (Join-Path $source '*') -Destination $target -Recurse -Force
}

function Install-Download([string]$File, [string]$Path) {
	$target = Join-Path $SdRoot $Path
	New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
	Copy-Item -LiteralPath $File -Destination $target -Force
}

{{#hasAppstore}}
function Install-AppStore([string]$Package) {
	$unpacked = Expand-Download (Get-Download "$AppStore/zips/$Package.zip")
	$registry = Join-Path $SdRoot "switch/appstore/.get/packages/$Package"
	New-Item -ItemType Directory -Path $registry -Force | Out-Null
	foreach ($meta in 'manifest.install', 'info.json') {
		$file = Join-Path $unpacked $meta
		if (Test-Path -LiteralPath $file) {
			Move-Item -LiteralPath $file -Destination (Join-Path $registry $meta) -Force
		}
	}
	Copy-Item -Path (Join-Path $unpacked '*') -Destination $SdRoot -Recurse -Force
}

{{/hasAppstore}}
function Write-Config([string]$Path, [string]$Content) {
	$target = Join-Path $SdRoot $Path
	New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
	[IO.File]::WriteAllText($target, ($Content -replace "`r`n", "`n") + "`n")
}

function Write-Image([string]$Path, [string]$Data) {
	$target = Join-Path $SdRoot $Path
	New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
	$gzip = [IO.Compression.GZipStream]::new([IO.MemoryStream]::new([Convert]::FromBase64String($Data)), [IO.Compression.CompressionMode]::Decompress)
	$file = [IO.File]::Create($target)
	try {
		$gzip.CopyTo($file)
	} finally {
		$file.Dispose()
		$gzip.Dispose()
	}
}

try {
	New-Item -ItemType Directory -Path $WorkDir -Force | Out-Null
} catch {
	Write-Host "error: $SdRoot is not writable" -ForegroundColor Red
	exit 1
}

try {
	Write-Info 'Downloading & unpacking components'
{{#components}}

	Write-Step '{{name}}'
	try {
{{#steps}}
{{#appstore}}		Install-AppStore '{{package}}'{{/appstore}}{{#zip}}		Install-Archive (Get-Download (Get-AssetUrl '{{repo}}' '{{asset}}')) '{{root}}' '{{into}}'{{/zip}}{{#file}}		Install-Download (Get-Download (Get-AssetUrl '{{repo}}' '{{asset}}')) '{{path}}'{{/file}}{{#urlZip}}		Install-Archive (Get-Download '{{url}}') '{{root}}' '{{into}}'{{/urlZip}}{{#urlFile}}		Install-Download (Get-Download '{{url}}') '{{path}}'{{/urlFile}}
{{/steps}}
		Write-Ok '{{name}}'
	} catch {
		Write-Fail '{{name}}'
		Write-Host "        $($_.Exception.Message)" -ForegroundColor DarkGray
		$Failed += '{{name}}'
	}
{{/components}}

	Write-Info 'Writing configuration'
{{#configs}}

	Write-Step '{{path}}'
	Write-Config '{{path}}' @'
{{content}}
'@
	Write-Ok '{{path}}'
{{/configs}}
{{#hasImages}}

	Write-Info 'Deploying appearance & assets'
{{#images}}

	Write-Step '{{path}}'
	Write-Image '{{path}}' @'
{{data}}
'@
	Write-Ok '{{path}}'
{{/images}}
{{/hasImages}}
{{#hasManual}}

	Write-Info 'Manual action required'
{{#manual}}
	Write-Notice '{{name}}: {{url}}'
{{/manual}}
{{/hasManual}}

} finally {
	Remove-Item -LiteralPath $WorkDir -Recurse -Force -ErrorAction SilentlyContinue
	# The script and what archives leave in the root of the card go away, wherever the script was started from
	foreach ($leftover in 'install.ps1', 'LICENSE.txt', 'README.txt', 'README.md', 'screen1.png', 'screen2.png', 'switch/breeze/.Breeze.nro.star') {
		Remove-Item -LiteralPath (Join-Path $SdRoot $leftover) -Force -ErrorAction SilentlyContinue
	}
}

Write-Host ''
if ($Failed.Count -gt 0) {
	Write-Host 'Installation failed for: ' -ForegroundColor Red -NoNewline
	Write-Host ($Failed -join ' ')
} else {
	Write-Host 'Done! ' -ForegroundColor Green -NoNewline
	Write-Host 'Eject the {{card}} safely and boot your {{console}}.'
}
Write-Host ''

if (-not [Console]::IsInputRedirected) {
	Read-Host 'Press Enter to exit' | Out-Null
}
exit [int]($Failed.Count -gt 0)
