# Switch back to Customer App Configuration
Write-Host "Switching to Customer App..." -ForegroundColor Green

# Restore customer files
if (Test-Path "App.customer.tsx") {
    Copy-Item App.customer.tsx App.tsx -Force
    Write-Host "✓ Restored customer App.tsx" -ForegroundColor Yellow
} else {
    Write-Host "Warning: No backup found. App.tsx unchanged." -ForegroundColor Red
}

if (Test-Path "app.customer.json") {
    Copy-Item app.customer.json app.json -Force
    Write-Host "✓ Restored customer app.json" -ForegroundColor Yellow
} else {
    Write-Host "Warning: No backup found. app.json unchanged." -ForegroundColor Red
}

Write-Host "✓ Switched to Customer App" -ForegroundColor Green
Write-Host "You can now run: npx expo start" -ForegroundColor Cyan
