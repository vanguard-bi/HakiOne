param(
  [string]$Tag,
  [string]$ConfigPath = "utils/docker/gcp-image.env"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Load-Config {
  param([string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Config file not found: $Path"
  }

  $config = @{}
  Get-Content -LiteralPath $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) { return }
    $parts = $line -split "=", 2
    if ($parts.Count -eq 2) {
      $config[$parts[0].Trim()] = $parts[1].Trim()
    }
  }

  return $config
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Push-Location $repoRoot
try {
  $cfg = Load-Config -Path $ConfigPath

  $project = $cfg["GCP_PROJECT_ID"]
  $location = $cfg["AR_LOCATION"]
  $repository = $cfg["AR_REPOSITORY"]
  $imageName = $cfg["AR_IMAGE"]
  $prefix = if ($cfg.ContainsKey("VERSION_PREFIX")) { $cfg["VERSION_PREFIX"] } else { "v" }

  if (-not $project -or -not $location -or -not $repository -or -not $imageName) {
    throw "Config file must define GCP_PROJECT_ID, AR_LOCATION, AR_REPOSITORY, and AR_IMAGE."
  }

  $imageBase = "$location-docker.pkg.dev/$project/$repository/$imageName"

  if (-not $Tag) {
    $existingTags = gcloud artifacts docker tags list $imageBase --format="value(TAG)" 2>$null
    $maxVersion = 0
    foreach ($t in $existingTags) {
      if ($t -match "^$([regex]::Escape($prefix))([0-9]+)$") {
        $v = [int]$Matches[1]
        if ($v -gt $maxVersion) { $maxVersion = $v }
      }
    }
    $Tag = "$prefix$($maxVersion + 1)"
  }

  $versionedImage = "$imageBase`:$Tag"
  $latestImage = "$imageBase`:latest"

  Write-Host "Building and pushing $versionedImage ..."
  gcloud builds submit --tag $versionedImage .

  Write-Host "Updating latest tag -> $versionedImage ..."
  gcloud artifacts docker tags add $versionedImage $latestImage

  Write-Host "Done."
  Write-Host "Version tag: $versionedImage"
  Write-Host "Latest tag:  $latestImage"
}
finally {
  Pop-Location
}

