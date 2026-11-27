# Contrôle de l'ordinateur par Six (Windows) : reçoit une commande JSON par ligne sur l'entrée standard et répond
# une ligne JSON. Lancé et surveillé par ordinateur.cjs (app de bureau), qui vérifie les autorisations AVANT
# d'envoyer une commande. Utilise seulement Windows (UI Automation, user32) : aucune dépendance.
#
# Commandes : fenetres | observer {fenetre?} | cliquer {element} | remplir {element, texte} | taper {texte}
#             | raccourci {touches} | focaliser {fenetre} | ouvrir {chemin} | premier_plan
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -AssemblyName UIAutomationClient, UIAutomationTypes, System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class SixUtilisateur32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h, int n);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint f, uint x, uint y, uint d, UIntPtr e);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h, uint msg, IntPtr w, IntPtr l);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  // Windows refuse qu'une application en arrière-plan passe une fenêtre devant : une touche Alt « fantôme » lève ce
  // verrou (technique courante), puis la fenêtre est restaurée et mise au premier plan.
  public static bool Devant(IntPtr h) {
    if (IsIconic(h)) ShowWindow(h, 9);
    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);
    BringWindowToTop(h);
    return SetForegroundWindow(h);
  }
}
'@

$A = [System.Windows.Automation.AutomationElement]
$ELEMENTS_MAX = 200
$PROFONDEUR_MAX = 14
$script:reperes = @{}   # identifiant court -> élément de la dernière observation
$script:fenetre = $null # fenêtre observée en dernier

function Infos-Processus([int]$processId) {
  $p = Get-Process -Id $processId -ErrorAction SilentlyContinue
  if ($p) { @{ nom = $p.ProcessName; chemin = $(try { $p.Path } catch { '' }) } } else { @{ nom = ''; chemin = '' } }
}

function Decrire-Fenetre($f) {
  $c = $f.Current
  $p = Infos-Processus $c.ProcessId
  @{ fenetre = [int64]$c.NativeWindowHandle; titre = $c.Name; app = $p.nom; chemin = $p.chemin }
}

function Fenetres {
  $liste = @()
  $toutes = $A::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
  foreach ($f in $toutes) {
    $c = $f.Current
    if ($c.Name -and -not $c.IsOffscreen -and $c.NativeWindowHandle -ne 0) { $liste += Decrire-Fenetre $f }
  }
  @{ fenetres = $liste }
}

function Fenetre-Cible($handle) {
  if ($handle) { return $A::FromHandle([IntPtr][int64]$handle) }
  return $A::FromHandle([SixUtilisateur32]::GetForegroundWindow())
}

function Observer($handle) {
  $f = Fenetre-Cible $handle
  $script:fenetre = $f
  $script:reperes = @{}
  $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
  $file = New-Object System.Collections.Queue
  $file.Enqueue(@($f, 0))
  $elements = @()
  $n = 0
  while ($file.Count -gt 0 -and $n -lt $ELEMENTS_MAX) {
    $paire = $file.Dequeue(); $e = $paire[0]; $prof = $paire[1]
    $enfant = $walker.GetFirstChild($e)
    while ($enfant -ne $null -and $n -lt $ELEMENTS_MAX) {
      try {
        $c = $enfant.Current
        if (-not $c.IsOffscreen) {
          $type = $c.ControlType.ProgrammaticName -replace '^ControlType\.', ''
          $utile = $c.Name -or $type -in @('Edit', 'Button', 'CheckBox', 'ComboBox', 'MenuItem', 'ListItem', 'TabItem', 'Hyperlink', 'Document', 'RadioButton', 'TreeItem')
          if ($utile) {
            $n++
            $id = "e$n"
            $script:reperes[$id] = $enfant
            $valeur = ''
            if (-not $c.IsPassword) {
              $vp = $null
              if ($enfant.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$vp)) {
                $valeur = [string]$vp.Current.Value
                if ($valeur.Length -gt 200) { $valeur = $valeur.Substring(0, 200) + '…' }
              }
            }
            $r = $c.BoundingRectangle
            $elements += @{
              id = $id; type = $type; nom = $c.Name; valeur = $valeur; actif = $c.IsEnabled
              motDePasse = $c.IsPassword; focus = $c.HasKeyboardFocus
              x = [int]($r.X + $r.Width / 2); y = [int]($r.Y + $r.Height / 2)
            }
          }
          if ($prof -lt $PROFONDEUR_MAX) { $file.Enqueue(@($enfant, ($prof + 1))) }
        }
      } catch { }
      $enfant = $walker.GetNextSibling($enfant)
    }
  }
  $d = Decrire-Fenetre $f
  $d.elements = $elements
  $d.tronque = ($n -ge $ELEMENTS_MAX)
  return $d
}

function Repere($id) {
  $e = $script:reperes[[string]$id]
  if (-not $e) { throw "Repère périmé ou inconnu : observe de nouveau la fenêtre." }
  return $e
}

function Clic-Souris($e) {
  $r = $e.Current.BoundingRectangle
  $x = [int]($r.X + $r.Width / 2); $y = [int]($r.Y + $r.Height / 2)
  [SixUtilisateur32]::SetCursorPos($x, $y) | Out-Null
  [SixUtilisateur32]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  [SixUtilisateur32]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
}

# ---------- Premier plan : jamais de frappe dans une autre fenêtre ----------
# Le clavier simulé de Windows va à la fenêtre active : avant chaque frappe, on vérifie que c'est EXACTEMENT la
# fenêtre de travail. Sinon, Six agit en arrière-plan par l'accessibilité (remplir, ajouter, cliquer), ou s'abstient.

function Fenetre-De-Travail($handle) {
  if ($handle) { return [int64]$handle }
  if ($script:fenetre) { return [int64]$script:fenetre.Current.NativeWindowHandle }
  return 0
}

function Est-Devant([int64]$h) { return $h -ne 0 -and ([int64][SixUtilisateur32]::GetForegroundWindow() -eq $h) }

# Six ne prend le premier plan que « poliment » : si la personne regarde Six lui-même, le bureau ou rien. Si elle
# travaille dans une autre application, on ne la dérange pas (travail en arrière-plan).
function Peut-Prendre-Devant {
  $h = [SixUtilisateur32]::GetForegroundWindow()
  if ($h -eq [IntPtr]::Zero) { return $true }
  $procId = 0
  [SixUtilisateur32]::GetWindowThreadProcessId($h, [ref]$procId) | Out-Null
  $p = Get-Process -Id $procId -ErrorAction SilentlyContinue
  if (-not $p) { return $true }
  $chemin = $(try { $p.Path } catch { '' })
  if ($env:SIX_CHEMIN -and $chemin -and ($chemin -ieq $env:SIX_CHEMIN)) { return $true }
  return $p.ProcessName -ieq 'explorer'
}

function Tenter-Devant([int64]$h) {
  if ($h -eq 0) { return $false }
  if (Est-Devant $h) { return $true }
  if (-not (Peut-Prendre-Devant)) { return $false }
  [SixUtilisateur32]::Devant([IntPtr]$h) | Out-Null
  Start-Sleep -Milliseconds 180
  return (Est-Devant $h)
}

# SendKeys donne un sens à + ^ % ~ ( ) { } [ ] : on les tape tels quels.
function Echapper-Touches([string]$t) { return ($t -replace '([+^%~(){}\[\]])', '{$1}') }

# Écrit devant la personne, par petits morceaux ; vérifie AVANT CHAQUE morceau que la fenêtre active est toujours
# la fenêtre de travail (sinon arrêt immédiat : rien n'est tapé ailleurs). Renvoie le nombre de caractères écrits.
# Texte long : collé d'un coup (presse-papiers rendu tel qu'il était ensuite). Instantané, accents intacts, et Word
# ne renumérote pas un texte collé (« 2. 2. »). Renvoie $false si le collage n'a pas pu se faire.
function Coller-Visible([string]$texte, [int64]$h) {
  if (-not (Est-Devant $h)) { return $false }
  $ancien = $null
  try { $ancien = Get-Clipboard -Raw -ErrorAction Stop } catch { $ancien = $null }
  try {
    Set-Clipboard -Value ($texte -replace "`r?`n", "`r`n") -ErrorAction Stop
    Start-Sleep -Milliseconds 80
    [System.Windows.Forms.SendKeys]::SendWait('^v')
    Start-Sleep -Milliseconds 400
    return $true
  } catch {
    return $false
  } finally {
    try { if ($null -ne $ancien) { Set-Clipboard -Value $ancien } } catch { }
  }
}

function Taper-Visible([string]$texte, [int64]$h) {
  if ($texte.Length -gt 40 -and (Coller-Visible $texte $h)) { return $texte.Length }
  $morceau = if ($texte.Length -gt 600) { 12 } elseif ($texte.Length -gt 200) { 6 } else { 3 }
  $texte = $texte -replace "`r`n", "`n"
  for ($i = 0; $i -lt $texte.Length; $i += $morceau) {
    if (-not (Est-Devant $h)) { return $i }
    $part = $texte.Substring($i, [Math]::Min($morceau, $texte.Length - $i))
    $echappe = (Echapper-Touches $part) -replace "`n", '{ENTER}'
    [System.Windows.Forms.SendKeys]::SendWait($echappe)
    Start-Sleep -Milliseconds 18
  }
  return $texte.Length
}

# Zone de texte principale de la fenêtre (pour écrire en arrière-plan) : élément focalisé, sinon premier Document
# ou Edit modifiable.
function Zone-De-Texte($h) {
  $f = $A::FromHandle([IntPtr]$h)
  $types = New-Object System.Windows.Automation.OrCondition(
    (New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Document)),
    (New-Object System.Windows.Automation.PropertyCondition($A::ControlTypeProperty, [System.Windows.Automation.ControlType]::Edit)))
  foreach ($e in $f.FindAll([System.Windows.Automation.TreeScope]::Descendants, $types)) {
    $p = $null
    if (-not $e.Current.IsPassword -and $e.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p) -and -not $p.Current.IsReadOnly) { return $e }
  }
  return $null
}

function Valeur-Arriere-Plan($e, [string]$texte, [bool]$ajouter) {
  $p = $null
  if (-not $e.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p) -or $p.Current.IsReadOnly) { return $false }
  $avant = if ($ajouter) { [string]$p.Current.Value } else { '' }
  $p.SetValue($avant + ($texte -replace "`r?`n", "`r`n"))
  return $true
}

function Cliquer($id, $handle) {
  $e = Repere $id
  $p = $null
  # Ces actions passent par l'application elle-même : elles marchent même si la fenêtre n'est pas devant.
  if ($e.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$p)) { $p.Invoke(); return @{ fait = 'activé' } }
  if ($e.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$p)) { $p.Toggle(); return @{ fait = 'basculé' } }
  if ($e.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$p)) { $p.Select(); return @{ fait = 'sélectionné' } }
  if ($e.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$p)) { $p.Expand(); return @{ fait = 'déplié' } }
  # Clic de souris : seulement si la fenêtre de travail est réellement devant (sinon on cliquerait ailleurs).
  $h = Fenetre-De-Travail $handle
  if (-not (Tenter-Devant $h)) { throw 'Cet élément demande un vrai clic, mais la fenêtre n’est pas au premier plan : attends que la personne la libère ou demande-lui.' }
  Clic-Souris $e
  return @{ fait = 'cliqué' }
}

function Remplir($id, [string]$texte, $handle) {
  $e = Repere $id
  if ($e.Current.IsPassword) { throw 'Champ de mot de passe : laisse la personne le remplir.' }
  $h = Fenetre-De-Travail $handle
  if (Tenter-Devant $h) {
    try { $e.SetFocus() } catch { }
    Start-Sleep -Milliseconds 150
    if (Est-Devant $h) {
      [System.Windows.Forms.SendKeys]::SendWait('^a')
      [System.Windows.Forms.SendKeys]::SendWait('{DEL}')
      $ecrits = Taper-Visible $texte $h
      if ($ecrits -ge $texte.Length) { return @{ fait = 'rempli (sous les yeux de la personne)' } }
      # La personne a changé de fenêtre en cours de route : la suite s'écrit en arrière-plan.
      if (Valeur-Arriere-Plan $e $texte $false) { return @{ fait = 'rempli (fini en arrière-plan : la personne a changé de fenêtre)' } }
      throw "Arrêté après $ecrits caractères : la fenêtre n’est plus au premier plan."
    }
  }
  if (Valeur-Arriere-Plan $e $texte $false) { return @{ fait = 'rempli en arrière-plan' } }
  throw 'Ce champ ne se remplit qu’au clavier et la fenêtre n’est pas au premier plan : rien n’a été tapé.'
}

function Taper([string]$texte, $handle) {
  $h = Fenetre-De-Travail $handle
  if ($h -eq 0) { throw 'Aucune fenêtre de travail : ouvre ou observe d’abord l’application.' }
  if (Tenter-Devant $h) {
    $ecrits = Taper-Visible $texte $h
    if ($ecrits -ge $texte.Length) { return @{ fait = 'tapé (sous les yeux de la personne)' } }
    $texte = $texte.Substring($ecrits)
  }
  $zone = Zone-De-Texte $h
  if ($zone -and (Valeur-Arriere-Plan $zone $texte $true)) { return @{ fait = 'écrit en arrière-plan' } }
  throw 'La fenêtre n’est pas au premier plan et n’a pas de zone de texte modifiable en arrière-plan : rien n’a été tapé.'
}

function Raccourci([string]$touches, $handle) {
  $map = @{ 'ctrl' = '^'; 'control' = '^'; 'maj' = '+'; 'shift' = '+'; 'alt' = '%' }
  $speciales = @{ 'entree' = '{ENTER}'; 'enter' = '{ENTER}'; 'tab' = '{TAB}'; 'echap' = '{ESC}'; 'esc' = '{ESC}'; 'suppr' = '{DEL}'; 'retour' = '{BACKSPACE}'; 'haut' = '{UP}'; 'bas' = '{DOWN}'; 'gauche' = '{LEFT}'; 'droite' = '{RIGHT}'; 'f5' = '{F5}'; 'debut' = '{HOME}'; 'fin' = '{END}' }
  $parties = ($touches.ToLower() -split '\+') | ForEach-Object { $_.Trim() }
  $prefixe = ''; $touche = ''
  foreach ($x in $parties) {
    if ($map.ContainsKey($x)) { $prefixe += $map[$x] }
    elseif ($speciales.ContainsKey($x)) { $touche = $speciales[$x] }
    elseif ($x.Length -eq 1) { $touche = (Echapper-Touches $x) }
    else { throw "Touche inconnue : $x" }
  }
  # Un raccourci ne marche qu'au clavier : seulement si la fenêtre de travail est exactement au premier plan.
  $h = Fenetre-De-Travail $handle
  if (-not (Tenter-Devant $h)) { throw 'Raccourci impossible : la fenêtre n’est pas au premier plan (la personne utilise une autre application). Rien n’a été tapé.' }
  [System.Windows.Forms.SendKeys]::SendWait("$prefixe$touche")
  return @{ fait = "raccourci $touches" }
}

function Focaliser($handle) {
  $ok = Tenter-Devant ([int64]$handle)
  return @{ fait = $(if ($ok) { 'fenêtre au premier plan' } else { 'laissée en arrière-plan (la personne utilise une autre application)' }); devant = $ok }
}

# Applications du menu Démarrer, classiques ET modernes (Bloc-notes, Calculatrice, Word…), avec leur identifiant.
function Applications {
  return @{ applications = @(Get-StartApps | ForEach-Object { @{ nom = $_.Name; id = $_.AppID } }) }
}

# Ferme normalement une fenêtre (comme la croix) : l'application demande d'enregistrer si besoin.
function Fermer($handle) {
  [SixUtilisateur32]::PostMessage([IntPtr][int64]$handle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero) | Out-Null
  return @{ fait = 'fermeture demandée' }
}

# Ouvre une application (par son identifiant du menu Démarrer) et attend sa nouvelle fenêtre (jusqu'à 10 s), puis la
# met devant la personne.
function Ouvrir([string]$id) {
  $avant = @{}
  foreach ($f in (Fenetres).fenetres) { $avant[[string]$f.fenetre] = $true }
  Start-Process -FilePath 'explorer.exe' -ArgumentList "shell:AppsFolder\$id"
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 250
    $nouvelle = (Fenetres).fenetres | Where-Object { -not $avant.ContainsKey([string]$_.fenetre) } | Select-Object -First 1
    if ($nouvelle) {
      Tenter-Devant ([int64]$nouvelle.fenetre) | Out-Null
      Start-Sleep -Milliseconds 300
      return @{ fait = 'ouvert'; fenetre = $nouvelle.fenetre; app = $nouvelle.app; titre = $nouvelle.titre; chemin = $nouvelle.chemin }
    }
  }
  return @{ fait = 'lancé (fenêtre pas encore visible)' }
}

function Premier-Plan {
  $f = $A::FromHandle([SixUtilisateur32]::GetForegroundWindow())
  return (Decrire-Fenetre $f)
}

function Cible-Repere($id) {
  $e = Repere $id
  $c = $e.Current
  return @{ nom = $c.Name; type = ($c.ControlType.ProgrammaticName -replace '^ControlType\.', ''); motDePasse = $c.IsPassword }
}

while ($true) {
  $ligne = [Console]::In.ReadLine()
  if ($ligne -eq $null) { break }
  $reponse = $null
  try {
    $c = $ligne | ConvertFrom-Json
    switch ($c.action) {
      'fenetres' { $r = Fenetres }
      'observer' { $r = Observer $c.fenetre }
      'cible' { $r = Cible-Repere $c.element }
      'cliquer' { $r = Cliquer $c.element $c.fenetre }
      'remplir' { $r = Remplir $c.element ([string]$c.texte) $c.fenetre }
      'taper' { $r = Taper ([string]$c.texte) $c.fenetre }
      'raccourci' { $r = Raccourci ([string]$c.touches) $c.fenetre }
      'focaliser' { $r = Focaliser $c.fenetre }
      'premier_plan' { $r = Premier-Plan }
      'ouvrir' { $r = Ouvrir ([string]$c.appid) }
      'applications' { $r = Applications }
      'fermer' { $r = Fermer $c.fenetre }
      default { throw "Action inconnue : $($c.action)" }
    }
    $reponse = @{ id = $c.id; ok = $true; resultat = $r }
  } catch {
    $reponse = @{ id = $(if ($c) { $c.id } else { $null }); ok = $false; erreur = $_.Exception.Message }
  }
  [Console]::Out.WriteLine(($reponse | ConvertTo-Json -Compress -Depth 6))
  [Console]::Out.Flush()
}
