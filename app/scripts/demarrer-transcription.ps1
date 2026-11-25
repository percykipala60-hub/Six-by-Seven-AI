$ErrorActionPreference = 'Stop'
$racine = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$pythonVocal = Join-Path $racine '.local-tools/voice/Scripts/python.exe'
if (-not (Test-Path $pythonVocal)) {
    throw 'Le moteur vocal local doit être installé dans .local-tools/voice.'
}
$env:HF_HOME = Join-Path $racine '.local-tools/models'
& $pythonVocal (Join-Path $PSScriptRoot 'transcription-locale.py')
