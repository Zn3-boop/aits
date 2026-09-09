$files = Get-ChildItem -Path 'd:\aits.1\apps\server\src' -Recurse -Include '*.ts' | Group-Object Name | Where-Object { $_.Count -gt 1 }
foreach ($f in $files) {
    Write-Host $f.Name "-> $($f.Count) files"
    $f.Group | ForEach-Object { Write-Host "  -" $_.DirectoryName }
}
