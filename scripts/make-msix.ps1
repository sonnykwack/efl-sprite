# Build MSIX packages from a finished `tauri build` (Windows only).
#
#   pwsh scripts/make-msix.ps1            # after `npx tauri build`
#
# Output (src-tauri/target/release/msix/):
#   EFL-Sprite_<ver>_x64.msix        unsigned  → upload to Partner Center (the Store signs it)
#   EFL-Sprite_<ver>_x64_test.msix   signed with a throw-away self-signed certificate
#   EFL-Sprite-test.cer              trust this once to install the test package locally
#
# Why MSIX and not the NSIS installer: Store submissions of EXE/MSI installers must be signed
# with a paid code-signing certificate; MSIX packages are signed by the Store itself.
$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$root    = Split-Path -Parent $PSScriptRoot
$tauri   = Join-Path $root "src-tauri"
$release = Join-Path $tauri "target\release"
$out     = Join-Path $release "msix"
$layout  = Join-Path $out "layout"

# --- version (Store: Major.Minor.Build.0 — the 4th part must be 0)
$conf = Get-Content (Join-Path $tauri "tauri.conf.json") -Raw | ConvertFrom-Json
$version = "$($conf.version).0"
$id = Get-Content (Join-Path $tauri "msix\identity.json") -Raw | ConvertFrom-Json

# --- Windows SDK tools (newest installed)
$kits = "${env:ProgramFiles(x86)}\Windows Kits\10\bin"
$sdk = Get-ChildItem $kits -Directory | Where-Object { $_.Name -match '^10\.' } | Sort-Object { [version]$_.Name } -Descending |
  Where-Object { Test-Path (Join-Path $_.FullName "x64\makeappx.exe") } | Select-Object -First 1
if (-not $sdk) { throw "Windows SDK (makeappx.exe) not found under $kits" }
$makeappx = Join-Path $sdk.FullName "x64\makeappx.exe"
$signtool = Join-Path $sdk.FullName "x64\signtool.exe"
Write-Host "Windows SDK $($sdk.Name)"

# --- layout: exe + engines (same place the NSIS installer puts them: resource_dir = exe dir)
if (Test-Path $out) { Remove-Item $out -Recurse -Force }
New-Item -ItemType Directory -Force -Path (Join-Path $layout "Assets") | Out-Null
$exe = Join-Path $release "efl-sprite.exe"
if (-not (Test-Path $exe)) { throw "$exe not found — run 'npx tauri build' first" }
Copy-Item $exe $layout
$engines = Join-Path $tauri "engines\windows"
if (-not (Test-Path $engines)) { throw "$engines not found — run 'npm run fetch-engines' first" }
Copy-Item $engines (Join-Path $layout "engines") -Recurse
# open-source license notices must ship with the binaries (MIT/Apache-2.0)
Copy-Item (Join-Path $tauri "..\THIRD_PARTY_NOTICES.md") $layout
foreach ($icon in "StoreLogo.png", "Square44x44Logo.png", "Square71x71Logo.png", "Square150x150Logo.png", "Square310x310Logo.png", "Wide310x150Logo.png") {
  Copy-Item (Join-Path $tauri "icons\$icon") (Join-Path $layout "Assets\$icon")
}

$manifest = (Get-Content (Join-Path $tauri "msix\AppxManifest.template.xml") -Raw).
  Replace("__NAME__", $id.name).
  Replace("__PUBLISHER__", $id.publisher).
  Replace("__PUBLISHER_DISPLAY_NAME__", $id.publisherDisplayName).
  Replace("__VERSION__", $version)
# UTF-8 without BOM
[System.IO.File]::WriteAllText((Join-Path $layout "AppxManifest.xml"), $manifest, (New-Object System.Text.UTF8Encoding $false))

# --- pack (unsigned → Store)
$base = "EFL-Sprite_$($conf.version)_x64"
$msix = Join-Path $out "$base.msix"
& $makeappx pack /o /h SHA256 /d $layout /p $msix
if ($LASTEXITCODE -ne 0) { throw "makeappx failed ($LASTEXITCODE)" }

# --- test-signed copy: certificate subject MUST equal the manifest Publisher
$pass = [guid]::NewGuid().ToString()
$cert = New-SelfSignedCertificate -Type Custom -Subject $id.publisher -KeyUsage DigitalSignature `
  -FriendlyName "EFL Sprite test signing" -CertStoreLocation "Cert:\CurrentUser\My" `
  -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")
$pfx = Join-Path $out "test.pfx"
Export-PfxCertificate -Cert $cert -FilePath $pfx -Password (ConvertTo-SecureString $pass -AsPlainText -Force) | Out-Null
Export-Certificate -Cert $cert -FilePath (Join-Path $out "EFL-Sprite-test.cer") | Out-Null
$test = Join-Path $out "${base}_test.msix"
Copy-Item $msix $test
& $signtool sign /fd SHA256 /f $pfx /p $pass $test
if ($LASTEXITCODE -ne 0) { throw "signtool failed ($LASTEXITCODE)" }
Remove-Item $pfx
Remove-Item $layout -Recurse -Force

Get-ChildItem $out | ForEach-Object { "{0,-40} {1,8:N1} MB" -f $_.Name, ($_.Length / 1MB) }
