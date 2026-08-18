@echo off
REM Backup script for crm-custom PostgreSQL database (Windows PowerShell version)
REM Schedule via Task Scheduler to run daily at 2 AM

param(
    [string]$BackupDir = "D:\IT\crm-custom\backups",
    [int]$RetentionDays = 7,
    [string]$DBContainer = "crm-postgres",
    [string]$DBName = "crm_v4",
    [string]$DBUser = "crm"
)

# Create backup directory if it doesn't exist
if (!(Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = Join-Path $BackupDir "postgres_${timestamp}.sql.gz"

Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting PostgreSQL backup..." -ForegroundColor Green

# Check if Docker container is running
$containerCheck = docker ps --filter "name=$DBContainer" --format "{{.Names}}"
if (-not $containerCheck) {
    Write-Host "[ERROR] Container $DBContainer is not running" -ForegroundColor Red
    exit 1
}

# Perform backup using PowerShell and pipe to gzip
try {
    Write-Host "  Dumping database: $DBName..." -ForegroundColor Cyan
    $output = docker exec $DBContainer pg_dump -U $DBUser --format=plain --no-password $DBName | 
              Out-File -FilePath "$backupFile.tmp" -Encoding UTF8 -NoNewline
    
    # Compress using PowerShell or 7-Zip if available
    if (Get-Command 7z -ErrorAction SilentlyContinue) {
        7z a -tgzip -mx=9 $backupFile "$backupFile.tmp" | Out-Null
        Remove-Item "$backupFile.tmp"
    } else {
        Write-Host "  Note: 7-Zip not found, using uncompressed backup" -ForegroundColor Yellow
        Rename-Item -Path "$backupFile.tmp" -NewName ($backupFile -replace '\.sql\.gz$', '.sql') -Force
        $backupFile = $backupFile -replace '\.sql\.gz$', '.sql'
    }
    
    $fileSize = (Get-Item $backupFile).Length / 1MB
    Write-Host "[SUCCESS] Backup saved to: $backupFile (Size: $([math]::Round($fileSize, 2)) MB)" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Backup failed: $_" -ForegroundColor Red
    exit 1
}

# Cleanup old backups (keep last 7 days)
Write-Host "[INFO] Cleaning up backups older than $RetentionDays days..." -ForegroundColor Cyan
$oldBackups = Get-ChildItem $BackupDir -Filter "postgres_*.sql*" | 
              Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) }
foreach ($backup in $oldBackups) {
    Remove-Item $backup.FullName -Force
    Write-Host "  Deleted: $($backup.Name)" -ForegroundColor Yellow
}

Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Backup complete!" -ForegroundColor Green
