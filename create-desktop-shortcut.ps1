$projectDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$desktop = [Environment]::GetFolderPath("Desktop")
$shortcutPath = Join-Path $desktop "进度管控台.lnk"
$target = Join-Path $projectDir "start.bat"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $target
$shortcut.WorkingDirectory = $projectDir
$shortcut.IconLocation = "$env:SystemRoot\System32\SHELL32.dll,220"
$shortcut.Description = "启动监理进度管控台本地数据库服务"
$shortcut.Save()

Write-Host "已创建桌面快捷方式：$shortcutPath"
