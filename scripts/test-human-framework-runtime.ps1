param(
  [int]$Port = 9340,
  [string[]]$PetNames = @('框架朋友甲', '框架朋友乙'),
  [string[]]$PetIds = @('framework-friend-human', 'framework-athletic-human'),
  [string]$ReportPath = ''
)

$ErrorActionPreference = 'Stop'
if ($PetNames.Count -ne $PetIds.Count -or $PetNames.Count -lt 2) { throw 'PetNames and PetIds must contain at least two matching entries' }
Add-Type -AssemblyName UIAutomationClient
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class FrameworkMenuAutomation {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, uint data, UIntPtr extraInfo);
}
'@

$target = @(Invoke-RestMethod "http://127.0.0.1:$Port/json/list" | Where-Object { $_.type -eq 'page' })[0]
if (-not $target) { throw 'No Electron page target found' }
$socket = [Net.WebSockets.ClientWebSocket]::new()
$socket.ConnectAsync([Uri]$target.webSocketDebuggerUrl, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
$nextId = 0

function Invoke-Cdp([string]$Method, [hashtable]$Params = @{}) {
  $script:nextId += 1
  $id = $script:nextId
  $payload = @{ id = $id; method = $Method; params = $Params } | ConvertTo-Json -Depth 12 -Compress
  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $socket.SendAsync([ArraySegment[byte]]::new($bytes), [Net.WebSockets.WebSocketMessageType]::Text, $true, [Threading.CancellationToken]::None).GetAwaiter().GetResult()
  while ($true) {
    $stream = [IO.MemoryStream]::new()
    do {
      $buffer = [byte[]]::new(65536)
      $result = $socket.ReceiveAsync([ArraySegment[byte]]::new($buffer), [Threading.CancellationToken]::None).GetAwaiter().GetResult()
      $stream.Write($buffer, 0, $result.Count)
    } while (-not $result.EndOfMessage)
    $message = [Text.Encoding]::UTF8.GetString($stream.ToArray()) | ConvertFrom-Json
    if ($message.id -eq $id) { return $message.result }
  }
}

function Invoke-Eval([string]$Expression) {
  $result = Invoke-Cdp 'Runtime.evaluate' @{ expression = $Expression; returnByValue = $true; awaitPromise = $true }
  if ($result.exceptionDetails) { throw ($result.exceptionDetails | ConvertTo-Json -Depth 8 -Compress) }
  return $result.result.value
}

function Find-MenuItem([string]$Name) {
  $condition = [Windows.Automation.PropertyCondition]::new([Windows.Automation.AutomationElement]::NameProperty, $Name)
  return [Windows.Automation.AutomationElement]::RootElement.FindFirst([Windows.Automation.TreeScope]::Descendants, $condition)
}

function Move-ToItem($Item) {
  if (-not $Item) { throw 'Menu item was not found' }
  $rect = $Item.Current.BoundingRectangle
  if ($rect.IsEmpty) { throw "Menu item has no clickable rectangle: $($Item.Current.Name)" }
  [void][FrameworkMenuAutomation]::SetCursorPos([Math]::Floor($rect.Left + $rect.Width / 2), [Math]::Floor($rect.Top + $rect.Height / 2))
}

function Click-Item($Item) {
  Move-ToItem $Item
  [FrameworkMenuAutomation]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
  [FrameworkMenuAutomation]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
}

function Open-Menu {
  Invoke-Eval 'window.petApi.setMouseThrough(false); window.petApi.openMenu(); true' | Out-Null
  Start-Sleep -Milliseconds 500
}

function Switch-Pet([string]$Name, [string]$ExpectedId) {
  Open-Menu
  $switchItem = Find-MenuItem '切换宠物'
  if (-not $switchItem) { throw 'Switch-pet submenu was not found' }
  Move-ToItem $switchItem
  Start-Sleep -Milliseconds 800
  $petItem = Find-MenuItem $Name
  if (-not $petItem) { throw "Pet menu item was not found: $Name" }
  Click-Item $petItem
  Start-Sleep -Milliseconds 1000
  $state = Invoke-Eval '(async () => { const manifest = await window.petApi.getCurrentPet(); const image = document.getElementById("pet-image"); return { id: manifest.id, name: manifest.name, menu: manifest.contextMenuActions.map(x => x.label), imageComplete: image.complete, naturalWidth: image.naturalWidth, petClass: document.getElementById("pet").className }; })()'
  if ($state.id -ne $ExpectedId) { throw "Expected $ExpectedId after switch, found $($state.id)" }
  if (-not $state.imageComplete -or $state.naturalWidth -le 0) { throw "Frame failed to load after switching to $ExpectedId" }
  return $state
}

try {
  Invoke-Cdp 'Runtime.enable' | Out-Null
  $results = @()
  for ($index = 0; $index -lt $PetNames.Count; $index += 1) {
    $results += Switch-Pet $PetNames[$index] $PetIds[$index]
  }
  $report = [ordered]@{ imported = $true; switched = $true; pets = $results; passed = $true }
  if ($ReportPath) { $report | ConvertTo-Json -Depth 10 | Set-Content -Encoding utf8NoBOM -LiteralPath $ReportPath }
  $report | ConvertTo-Json -Depth 10
  Open-Menu
  $exitItem = Find-MenuItem '退出桌宠播放器'
  if ($exitItem) { Click-Item $exitItem }
}
finally {
  if ($socket.State -eq [Net.WebSockets.WebSocketState]::Open) {
    try { $socket.CloseAsync([Net.WebSockets.WebSocketCloseStatus]::NormalClosure, 'done', [Threading.CancellationToken]::None).GetAwaiter().GetResult() } catch {}
  }
  $socket.Dispose()
}
