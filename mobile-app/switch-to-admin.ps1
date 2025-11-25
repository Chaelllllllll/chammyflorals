# Switch to Admin App Configuration
Write-Host "Switching to Admin App..." -ForegroundColor Green

# Backup customer files if not already backed up
if (-not (Test-Path "App.customer.tsx")) {
    Copy-Item App.tsx App.customer.tsx
    Write-Host "Backed up customer App.tsx" -ForegroundColor Yellow
}

if (-not (Test-Path "app.customer.json")) {
    Copy-Item app.json app.customer.json
    Write-Host "Backed up customer app.json" -ForegroundColor Yellow
}

# Switch to admin files
Copy-Item AppAdmin.tsx App.tsx -Force
Copy-Item app.admin.json app.json -Force

Write-Host "✓ Switched to Admin App" -ForegroundColor Green
Write-Host "You can now run: npx expo start" -ForegroundColor Cyan
Write-Host "To switch back, run: .\switch-to-customer.ps1" -ForegroundColor Cyan
