# Enregistre une clé d'API dans .env.local sans l'afficher ni la garder dans l'historique PowerShell.
# Usage (depuis le dossier app/apps/web) :
#   powershell -ExecutionPolicy Bypass -File scripts/set-key.ps1 claude
#   powershell -ExecutionPolicy Bypass -File scripts/set-key.ps1 openai
# (-ExecutionPolicy Bypass vaut pour cette seule exécution, il ne change aucun réglage de ton PC.)
# Hors saisie interactive (rare) : la clé peut venir de la variable d'environnement SIX_CLE.
param([string]$Service = "claude")

$ErrorActionPreference = "Stop"
$racine = Split-Path -Parent $PSScriptRoot
$fichier = if ($env:SIX_ENV_FILE) { $env:SIX_ENV_FILE } else { Join-Path $racine ".env.local" }

$services = @{
  claude = @{ Variable = "ANTHROPIC_API_KEY"; Nom = "Claude (Anthropic)"; Debut = "sk-ant-" }
  openai = @{ Variable = "OPENAI_API_KEY"; Nom = "ChatGPT (OpenAI)"; Debut = "sk-" }
  openrouter = @{ Variable = "OPENROUTER_API_KEY"; Nom = "OpenRouter"; Debut = "sk-or-" }
  elevenlabs = @{ Variable = "ELEVENLABS_API_KEY"; Nom = "ElevenLabs"; Debut = "sk_" }
}
$cle_service = $Service.ToLower()
if (-not $services.ContainsKey($cle_service)) {
  Write-Error "Service inconnu : choisis claude, openai, openrouter ou elevenlabs."
  exit 1
}
$s = $services[$cle_service]
if ($cle_service -eq 'elevenlabs' -and -not $env:SIX_CLE) {
  $Host.UI.RawUI.WindowTitle = 'Six - Saisie ElevenLabs'
}

if ($env:SIX_CLE) {
  $cle = $env:SIX_CLE.Trim()
} else {
  $secure = Read-Host "Colle ta cle $($s.Nom) (rien ne s'affiche) puis Entree" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $cle = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr).Trim() }
  finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

if ([string]::IsNullOrEmpty($cle)) {
  Write-Host "Aucune cle saisie. Rien n'a ete modifie."
  exit 1
}
if ($cle -match "\s" -or $cle.Length -lt 20) {
  Write-Host "Cette cle semble incomplete ($($cle.Length) caracteres recus, espaces ou trop courte). Rien n'a ete modifie."
  exit 1
}
if (-not $cle.StartsWith($s.Debut)) {
  Write-Host "Attention : une cle $($s.Nom) commence en general par '$($s.Debut)'. Je l'enregistre quand meme."
}

if (-not (Test-Path $fichier)) {
  $modele = Join-Path $racine ".env.example"
  if (Test-Path $modele) { Copy-Item $modele $fichier } else { New-Item -ItemType File -Path $fichier | Out-Null }
}

# Ecriture en UTF-8 SANS BOM (un BOM casserait la premiere variable du fichier).
$lignes = [System.Collections.Generic.List[string]]::new()
foreach ($l in ([System.IO.File]::ReadAllText($fichier) -split "`r?`n")) { $lignes.Add($l) }
$motif = "^\s*" + [regex]::Escape($s.Variable) + "\s*="
$index = -1
for ($i = 0; $i -lt $lignes.Count; $i++) { if ($lignes[$i] -match $motif) { $index = $i; break } }
$nouvelle = $s.Variable + "=" + $cle
if ($index -ge 0) { $lignes[$index] = $nouvelle } else { $lignes.Add($nouvelle) }
$texte = (($lignes -join "`n") -replace "\n+$", "") + "`n"
[System.IO.File]::WriteAllText($fichier, $texte, (New-Object System.Text.UTF8Encoding($false)))

Write-Host "Cle $($s.Nom) enregistree dans $fichier ($($cle.Length) caracteres, non affichee)."
Write-Host "Etape suivante : node scripts/check-ai.mjs, puis redemarre le serveur (npm run dev)."
