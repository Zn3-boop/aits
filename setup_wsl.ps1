Set-Content -Path "$env:USERPROFILE\.wslconfig" -Value "[wsl2]","networkingMode=mirrored" -Encoding UTF8
Get-Content "$env:USERPROFILE\.wslconfig"
