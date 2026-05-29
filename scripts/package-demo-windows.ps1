param(
  [string]$Configuration = "demo"
)

$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$packageJson = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
$version = $packageJson.version
$releaseDir = Join-Path $root "release"
$appDir = Join-Path $releaseDir "win-unpacked"
$exePath = Join-Path $appDir "BakiyeDefter POS.exe"
$portableDataDir = Join-Path $appDir "BakiyeDefter POS Data"
$zipPath = Join-Path $releaseDir "BakiyeDefter-POS-Demo-$version-x64-portable.zip"

if (!(Test-Path $exePath)) {
  throw "win-unpacked build bulunamadi: $exePath"
}

$runningApp = Get-Process -Name "BakiyeDefter POS" -ErrorAction SilentlyContinue |
  Where-Object { $_.Path -eq $exePath }

if ($runningApp) {
  throw "Paketleme icin BakiyeDefter POS uygulamasini kapatin."
}

New-Item -ItemType Directory -Force -Path $portableDataDir | Out-Null
Get-ChildItem -LiteralPath $portableDataDir -Force |
  Remove-Item -Recurse -Force

@"
Bu klasor portable demo veritabani icindir.
Uygulama ilk acilista bakiyedefter.db dosyasini burada olusturur.
Bu klasoru uygulamayla birlikte tasirsaniz yerel demo verisi de tasinir.
"@ | Set-Content -LiteralPath (Join-Path $portableDataDir "README.txt") -Encoding UTF8

$readmePath = Join-Path $appDir "OKU BENI - DEMO.txt"
@"
BakiyeDefter POS Demo v$version

Calistirma:
1. Bu klasoru ZIP'ten tamamen cikarin.
2. BakiyeDefter POS.exe dosyasini acin.

Veritabani:
- Portable demo veritabani bu klasordeki "BakiyeDefter POS Data" klasorunde olusur.
- Bu klasoru baska bilgisayara tasirsaniz demo verisi de tasinir.
- Kurulumlu surumde veritabani Windows kullanici verisi klasorunde tutulur.

Not:
- Bu demo imzasizdir. Windows SmartScreen uyari gosterebilir.
- Kati Windows App Control acik bilgisayarlarda calistirma icin kod imzalama sertifikasi gerekir.
"@ | Set-Content -LiteralPath $readmePath -Encoding UTF8

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Start-Sleep -Seconds 2
Compress-Archive -Path (Join-Path $appDir "*") -DestinationPath $zipPath -CompressionLevel Optimal
Write-Host "Demo paketi hazir: $zipPath"
