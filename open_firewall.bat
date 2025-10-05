@echo off
echo Opening Windows Firewall for MMCOS Server...
echo.

REM Check if running as administrator
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Error: This script must be run as Administrator!
    echo Right-click and select "Run as administrator"
    pause
    exit /b 1
)

echo Creating firewall rules for MMCOS Server...

REM Create inbound rule for HTTP (Port 80)
netsh advfirewall firewall add rule name="MMCOS Server HTTP" dir=in action=allow protocol=TCP localport=80

REM Create inbound rule for HTTPS (Port 443) 
netsh advfirewall firewall add rule name="MMCOS Server HTTPS" dir=in action=allow protocol=TCP localport=443

echo.
echo ===============================================
echo Firewall rules created successfully!
echo ===============================================
echo.
echo Rules added:
echo   - MMCOS Server HTTP (Port 80)
echo   - MMCOS Server HTTPS (Port 443)
echo.
echo Your MMCOS server is now accessible from other computers
echo on your network.
echo.
echo To remove these rules later, run:
echo   netsh advfirewall firewall delete rule name="MMCOS Server HTTP"
echo   netsh advfirewall firewall delete rule name="MMCOS Server HTTPS"
echo.
pause
