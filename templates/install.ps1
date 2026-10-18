# Console Kitchen {{#update}}update{{/update}}{{^update}}installer{{/update}}: {{title}}
#
# Usage: put the script into the root of the {{card}} and run it there:
#   powershell -ExecutionPolicy Bypass -File {{script}}
#
# Downloads the selected components from {{#hasAppstore}}the Homebrew App Store, {{/hasAppstore}}GitHub releases and direct links,
# unpacks them onto the {{card}} next to the script and writes the configuration and images.
{{#update}}
# Updates the card its dump was made of: takes off what left the build, skips the components whose latest release is
# installed already and writes only the configs whose options changed. What it overwrites or deletes goes into {{backup}}/.
{{/update}}
# Set $env:GITHUB_TOKEN to lift the GitHub API limit of 60 requests per hour.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue' # the bars cmdlets draw by themselves slow them down dramatically on PowerShell 5
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

{{#hasAppstore}}
$AppStore = 'https://switch.cdn.fortheusers.org'
{{/hasAppstore}}
$SdRoot = $PSScriptRoot
$WorkDir = Join-Path $SdRoot '.console-kitchen'
$TraceDir = Join-Path $SdRoot '{{trace}}'
$Releases = @{}
$Failed = @()
# The component being installed and the release it comes from, for the trace left on the card:
# the files of the component and of all the installed ones
$Component = ''
$Tag = ''
$Recorded = [Collections.Generic.List[string]]::new()
$Installed = [Collections.Generic.List[string]]::new()
# What archives leave on the card besides their files, removed at the end and kept out of the trace
$Leftovers = 'LICENSE.txt', 'README.txt', 'README.md', 'CHANGELOG.md', 'screen1.png', 'screen2.png', 'switch/breeze/.Breeze.nro.star'
{{#update}}
$BackupDir = Join-Path $SdRoot "{{backup}}/$(Get-Date -Format 'yyyy-MM-dd_HH-mm-ss')"
# Components whose latest release is installed already, configs that changed on the card since its dump
$Fresh = @()
$Skipped = @()
# Configs the builds write: an archive does not overwrite the one on the card, its options decide
$Configs = @(
{{#protect}}
	'{{.}}'
{{/protect}}
)
{{/update}}

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

# A download is read part by part to show how far it is, a few times a second: Invoke-WebRequest draws its bar
# for every part, which is what slows it down
function Get-Download([string]$Url) {
	$name = [IO.Path]::GetFileName(([Uri]$Url).AbsolutePath)
	$file = Join-Path $WorkDir $name
	# The bar is for a console: with the input or the output going elsewhere it would land among them
	if (-not ([Console]::IsInputRedirected -or [Console]::IsOutputRedirected)) {
		$ProgressPreference = 'Continue'
	}
	$request = [Net.WebRequest]::Create($Url)
	$request.UserAgent = 'console-kitchen'
	$response = $request.GetResponse()
	try {
		$total = $response.ContentLength
		$source = $response.GetResponseStream()
		$target = [IO.File]::Create($file)
		try {
			$buffer = New-Object byte[] 1MB
			[long]$done = 0
			$drawn = [Diagnostics.Stopwatch]::StartNew()
			while (($read = $source.Read($buffer, 0, $buffer.Length)) -gt 0) {
				$target.Write($buffer, 0, $read)
				$done += $read
				if ($drawn.ElapsedMilliseconds -ge 200) {
					# A server may leave the size untold, the bar then only counts what has come
					if ($total -gt 0) {
						Write-Progress -Activity $name -Status ('{0:N1} / {1:N1} MB' -f ($done / 1MB), ($total / 1MB)) -PercentComplete ([Math]::Min(100, [int](100 * $done / $total)))
					} else {
						Write-Progress -Activity $name -Status ('{0:N1} MB' -f ($done / 1MB))
					}
					$drawn.Restart()
				}
			}
		} finally {
			$target.Dispose()
		}
	} finally {
		$response.Close()
		Write-Progress -Activity $name -Completed
	}
	return $file
}

# The latest release of a repository as the API tells it, asked once
function Get-Release([string]$Repo) {
	if (-not $Releases.ContainsKey($Repo)) {
		$headers = @{ Accept = 'application/vnd.github+json' }
		if ($env:GITHUB_TOKEN) {
			$headers.Authorization = "Bearer $env:GITHUB_TOKEN"
		}
		$Releases[$Repo] = Invoke-RestMethod -Uri "https://api.github.com/repos/$Repo/releases/latest" -Headers $headers -UseBasicParsing
	}
	return $Releases[$Repo]
}

function Get-AssetUrl([string]$Repo, [string]$Pattern) {
	$release = Get-Release $Repo
	$asset = $release.assets | Where-Object { $_.name -cmatch $Pattern } | Select-Object -First 1
	if (-not $asset) {
		throw "no asset matching $Pattern in $Repo"
	}
	$script:Tag = [string]$release.tag_name
	return $asset.browser_download_url
}

# Files the component puts onto the card go into the trace with its release, as paths from the root of the card
function Add-Record([string]$Path) {
	$script:Recorded.Add("$script:Component`t$script:Tag`t$($Path -replace '\\', '/')")
}

function Add-Records([string]$Folder, [string]$Into) {
	$base = (Get-Item -LiteralPath $Folder).FullName.TrimEnd('\', '/')
	foreach ($file in Get-ChildItem -LiteralPath $base -Recurse -File -Force) {
		$path = $file.FullName.Substring($base.Length + 1)
		Add-Record $(if ($Into) { "$Into/$path" } else { $path })
	}
}
{{#update}}

# A path of the update stays on the card and off what an update never touches: the system of the console, the emuMMCs,
# the configs, the trace and the backups
function Test-SafePath([string]$Path) {
	$parts = $Path -split '/'
	if (-not $Path -or $Path.StartsWith('/') -or $Path -match '[\\:]' -or $parts -contains '..' -or $parts -contains '.') {
		return $false
	}
	$lower = $Path.ToLowerInvariant()
	foreach ($kept in 'nintendo', 'emummc', '{{backup}}', '{{trace}}') {
		if ($lower -eq $kept -or $lower.StartsWith("$kept/")) {
			return $false
		}
	}
	return -not $lower.StartsWith('config/')
}

# What the update takes off the card goes into the backup with its path, a folder with all it holds, and the folders
# the move leaves empty go too. A path it cannot move is told and stays
function Backup-Move([string]$Path) {
	$Path = $Path.TrimEnd('/')
	$source = Join-Path $SdRoot $Path
	if (-not (Test-SafePath $Path) -or -not (Test-Path -LiteralPath $source)) {
		return
	}
	try {
		$target = Join-Path $BackupDir $Path
		New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
		Move-Item -LiteralPath $source -Destination $target -Force
		for ($folder = Split-Path $Path -Parent; $folder; $folder = Split-Path $folder -Parent) {
			$full = Join-Path $SdRoot $folder
			if (Get-ChildItem -LiteralPath $full -Force | Select-Object -First 1) {
				break
			}
			Remove-Item -LiteralPath $full -Force
		}
	} catch {
		Write-Notice "could not take $Path off the card"
	}
}

# A file the update overwrites keeps its copy in the backup
function Backup-Copy([string]$Path) {
	$source = Join-Path $SdRoot $Path
	if (Test-Path -LiteralPath $source -PathType Leaf) {
		$target = Join-Path $BackupDir $Path
		New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
		Copy-Item -LiteralPath $source -Destination $target -Force
	}
}

# A config still holds what the dump saw: the hash it had, or still nothing when it was not there
function Test-Unchanged([string]$Path, [string]$Hash) {
	$file = Join-Path $SdRoot $Path
	if (-not $Hash) {
		return -not (Test-Path -LiteralPath $file)
	}
	return (Test-Path -LiteralPath $file -PathType Leaf) -and (Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLowerInvariant() -eq $Hash
}

# A component the trace has a release for is fresh while that release is still the latest one
function Test-Fresh([string]$Kind, [string]$Source, [string]$Tag) {
	try {
		$latest = if ($Kind -eq 'github') {
			[string](Get-Release $Source).tag_name
		} else {
			[string](Invoke-RestMethod -Uri "$AppStore/packages/$Source/info.json" -UseBasicParsing).version
		}
		return [bool]$latest -and $latest -eq $Tag
	} catch {
		return $false
	}
}

# Configs an archive ships, such as the one of sys-con, leave the archive before it is copied when the card has them
function Remove-KeptConfigs([string]$Folder, [string]$Into) {
	$prefix = if ($Into) { "$Into/" } else { '' }
	foreach ($config in $Configs) {
		if ($config.StartsWith($prefix) -and (Test-Path -LiteralPath (Join-Path $SdRoot $config))) {
			Remove-Item -LiteralPath (Join-Path $Folder $config.Substring($prefix.Length)) -Force -ErrorAction SilentlyContinue
		}
	}
}

# Paths of a list the update got from the dump of the card, one per line
function Get-Paths([string]$Text) {
	return @($Text -split "`n" | ForEach-Object { $_.TrimEnd("`r") } | Where-Object { $_ })
}
{{/update}}

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
{{#update}}
	Remove-KeptConfigs $source $Into
{{/update}}
	Copy-Item -Path (Join-Path $source '*') -Destination $target -Recurse -Force
	Add-Records $source $Into
}

function Install-Download([string]$File, [string]$Path) {
	$target = Join-Path $SdRoot $Path
	New-Item -ItemType Directory -Path (Split-Path $target -Parent) -Force | Out-Null
	Copy-Item -LiteralPath $File -Destination $target -Force
	Add-Record $Path
}

{{#hasTar}}
# A tar goes straight onto the card, its paths without their leading folders: such an archive is too big to unpack it twice.
# Run by root, tar would give the files to the owners the archive names, which the card cannot keep
function Install-Tar([string]$File, [int]$Strip) {
	if (-not (Get-Command tar -CommandType Application -ErrorAction SilentlyContinue)) {
		throw 'tar is required, Windows has it since Windows 10 version 1803'
	}
	& tar -xf $File -C $SdRoot "--strip-components=$Strip" --no-same-owner
	if ($LASTEXITCODE) {
		throw "tar could not unpack $(Split-Path $File -Leaf)"
	}
	foreach ($line in & tar -tf $File) {
		$parts = $line -split '/'
		if ($parts.Count -gt $Strip -and -not $line.EndsWith('/')) {
			Add-Record (($parts | Select-Object -Skip $Strip) -join '/')
		}
	}
	Remove-Item -LiteralPath $File -Force
}

{{/hasTar}}
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
	# The version of a package names its release
	$script:Tag = ''
	try {
		$script:Tag = [string](Get-Content -LiteralPath (Join-Path $registry 'info.json') -Raw | ConvertFrom-Json).version
	} catch {
	}
{{#update}}
	Remove-KeptConfigs $unpacked ''
{{/update}}
	Copy-Item -Path (Join-Path $unpacked '*') -Destination $SdRoot -Recurse -Force
	Add-Records $unpacked ''
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
{{#update}}
	Write-Info 'Taking off what left the build'
	# The paths come from the dump of the card: sysmodules of other builds to turn off, foreign files and folders
	# to delete, files of the components that left the build
	Write-Step 'Turning off sysmodules of other builds'
	foreach ($path in Get-Paths @'
{{#disables}}
{{.}}
{{/disables}}
'@) {
		Backup-Move "$($path.TrimEnd('/'))/flags/boot2.flag"
	}
	Write-Ok 'Turning off sysmodules of other builds'

	Write-Step 'Deleting what other builds left'
	foreach ($path in Get-Paths @'
{{#deletions}}
{{.}}
{{/deletions}}
'@) {
		Backup-Move $path
	}
	Write-Ok 'Deleting what other builds left'

	Write-Step 'Removing the components that left the build'
	foreach ($path in Get-Paths @'
{{#removals}}
{{.}}
{{/removals}}
'@) {
		Backup-Move $path
	}
	Write-Ok 'Removing the components that left the build'

{{/update}}
	Write-Info 'Downloading & unpacking components'
{{#components}}

	Write-Step '{{name}}'
	$Component = '{{id}}'
	$Tag = ''
	$Recorded.Clear()
{{#fresh}}
	# Installed from the release {{tag}}, which may still be the latest one
	if (Test-Fresh '{{kind}}' '{{source}}' '{{tag}}') {
		$Fresh += '{{name}}'
		Write-Ok '{{name}} {{tag}} is up to date'
	} else {
{{/fresh}}
	try {
{{#steps}}
{{#appstore}}		Install-AppStore '{{package}}'{{/appstore}}{{#zip}}		Install-Archive (Get-Download (Get-AssetUrl '{{repo}}' '{{asset}}')) '{{root}}' '{{into}}'{{/zip}}{{#file}}		Install-Download (Get-Download (Get-AssetUrl '{{repo}}' '{{asset}}')) '{{path}}'{{/file}}{{#tar}}		Install-Tar (Get-Download (Get-AssetUrl '{{repo}}' '{{asset}}')) {{strip}}{{/tar}}{{#urlZip}}		Install-Archive (Get-Download '{{url}}') '{{root}}' '{{into}}'{{/urlZip}}{{#urlFile}}		Install-Download (Get-Download '{{url}}') '{{path}}'{{/urlFile}}
{{/steps}}
		$Installed.AddRange($Recorded)
		Write-Ok '{{name}}'
	} catch {
		Write-Fail '{{name}}'
		# What went wrong itself, without the words PowerShell wraps the errors of .NET into
		Write-Host "        $($_.Exception.GetBaseException().Message)" -ForegroundColor DarkGray
		$Failed += '{{name}}'
	}
{{#fresh}}
	}
{{/fresh}}
{{/components}}

	Write-Info 'Writing configuration'
{{#configs}}

	Write-Step '{{path}}'
{{#update}}
	# The config changed on the card since the dump stays as it is
	if (Test-Unchanged '{{path}}' '{{hash}}') {
		Backup-Copy '{{path}}'
{{/update}}
	Write-Config '{{path}}' @'
{{content}}
'@
	Write-Ok '{{path}}'
{{#update}}
	} else {
		$Skipped += '{{path}}'
		Write-Fail '{{path}} changed since the dump'
	}
{{/update}}
{{/configs}}
{{#hasImages}}

	Write-Info 'Deploying appearance & assets'
{{#images}}

	Write-Step '{{path}}'
{{#update}}
	Backup-Copy '{{path}}'
{{/update}}
	Write-Image '{{path}}' @'
{{data}}
'@
	Write-Ok '{{path}}'
{{/images}}
{{/hasImages}}

	Write-Info 'Recording the build for updates'

	Write-Step '{{trace}}'
	New-Item -ItemType Directory -Path $TraceDir -Force | Out-Null
	$trace = Join-Path $TraceDir 'installed.tsv'
	# Components installed now replace their lines, {{#update}}the ones that left the build lose theirs, {{/update}}the others keep the ones of their earlier installs
	$installedNow = @($Installed | ForEach-Object { ($_ -split "`t")[0] })
	$removed = @('{{removed}}' -split ' ' | Where-Object { $_ })
	$kept = @(if (Test-Path -LiteralPath $trace) {
		[IO.File]::ReadAllLines($trace) | Select-Object -Skip 1 | Where-Object {
			$_ -and $installedNow -notcontains ($_ -split "`t")[0] -and $removed -notcontains ($_ -split "`t")[0]
		}
	})
	$fresh = @($Installed | Where-Object { $Leftovers -notcontains ($_ -split "`t")[2] })
	[IO.File]::WriteAllText($trace, ((@("component`ttag`tpath") + $kept + $fresh) -join "`n") + "`n")
	Write-Config '{{trace}}/build.toml' @'
{{build}}
'@
	Write-Ok '{{trace}}'
{{#hasManual}}

	Write-Info 'Manual action required'
{{#manual}}
	Write-Notice '{{name}}: {{url}}'
{{/manual}}
{{/hasManual}}
{{#update}}
	if ($Fresh.Count -gt 0) {
		Write-Host ''
		Write-Host "    Up to date already: $($Fresh -join ' ')"
	}
	if ($Skipped.Count -gt 0) {
		Write-Host ''
		Write-Notice "Changed on the card since its dump, left as they are: $($Skipped -join ' ')"
		Write-Notice 'Dump the card again and build the update anew to change them'
	}
	if (Test-Path -LiteralPath $BackupDir) {
		Write-Host ''
		Write-Notice "What the update overwrote or took off the card is in $($BackupDir.Substring($SdRoot.TrimEnd('\', '/').Length + 1))"
	}
	# The dump holds the configs with their passwords, it has done its job
	if ($Failed.Count -eq 0) {
		foreach ($file in '{{dump}}', 'dump.sh', 'dump.ps1') {
			Remove-Item -LiteralPath (Join-Path $SdRoot $file) -Force -ErrorAction SilentlyContinue
		}
	}
{{/update}}

} finally {
	Remove-Item -LiteralPath $WorkDir -Recurse -Force -ErrorAction SilentlyContinue
	# The script and what archives leave in the root of the card go away, wherever the script was started from
	foreach ($leftover in @('{{script}}') + $Leftovers) {
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
