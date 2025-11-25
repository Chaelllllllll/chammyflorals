# Build Admin App Script
param(
    [string]$Platform = "all"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Building Chammy Florals Admin App" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# Backup customer files
Write-Host "`n1. Backing up customer files..." -ForegroundColor Yellow
Copy-Item App.tsx App.customer.backup.tsx -Force
Copy-Item app.json app.customer.backup.json -Force
Write-Host "   ✓ Customer files backed up" -ForegroundColor Green

# Swap to admin files
Write-Host "`n2. Switching to admin configuration..." -ForegroundColor Yellow
Copy-Item AppAdmin.tsx App.tsx -Force
Copy-Item app.admin.json app.json -Force
Write-Host "   ✓ Admin configuration active" -ForegroundColor Green

# Build
Write-Host "`n3. Starting EAS build for platform: $Platform..." -ForegroundColor Yellow
Write-Host "   This may take several minutes...`n" -ForegroundColor Gray

if ($Platform -eq "all") {
    eas build --platform all
} else {
    eas build --platform $Platform
}

$buildSuccess = $LASTEXITCODE -eq 0

# Restore customer files
Write-Host "`n4. Restoring customer configuration..." -ForegroundColor Yellow
Copy-Item App.customer.backup.tsx App.tsx -Force
Copy-Item app.customer.backup.json app.json -Force
Write-Host "   ✓ Customer files restored" -ForegroundColor Green

# Summary
Write-Host "`n========================================" -ForegroundColor Cyan
if ($buildSuccess) {
    Write-Host "Build Complete!" -ForegroundColor Green
    Write-Host "Check EAS dashboard for build status" -ForegroundColor Cyan
} else {
    Write-Host "Build Failed!" -ForegroundColor Red
    Write-Host "Check the error messages above" -ForegroundColor Yellow
}
Write-Host "========================================" -ForegroundColor Cyan
