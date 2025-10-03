@echo off
setlocal enabledelayedexpansion

echo ===============================================
echo Micro Machines Client Patcher
echo ===============================================
echo.
echo This script modifies the client configuration
echo to connect to a custom server.
echo.

REM Ask for server address
set /p "SERVER_ADDRESS=Enter server address (e.g. localhost, 192.168.1.100): "

if "!SERVER_ADDRESS!"=="" (
    echo Error: No server address entered!
    pause
    exit /b 1
)

echo.
echo Searching for Micro Machines installation...

REM Check typical installation paths
set "GAME_FOUND=0"
set "GAME_PATH="

REM Steam default path
if exist "C:\Program Files (x86)\Steam\steamapps\common\Micro Machines World Series" (
    set "GAME_PATH=C:\Program Files (x86)\Steam\steamapps\common\Micro Machines World Series"
    set "GAME_FOUND=1"
    echo Found: Steam installation in !GAME_PATH!
)

REM Steam (other drives)
for %%d in (D E F G H) do (
    if exist "%%d:\Steam\steamapps\common\Micro Machines World Series" (
        set "GAME_PATH=%%d:\Steam\steamapps\common\Micro Machines World Series"
        set "GAME_FOUND=1"
        echo Found: Steam installation in !GAME_PATH!
        goto :found
    )
)

REM Epic Games Launcher
if exist "C:\Program Files\Epic Games\MicroMachinesWorldSeries" (
    set "GAME_PATH=C:\Program Files\Epic Games\MicroMachinesWorldSeries"
    set "GAME_FOUND=1"
    echo Found: Epic Games installation in !GAME_PATH!
)

REM Manual input if not found
:found
if "!GAME_FOUND!"=="0" (
    echo.
    echo Game not found automatically!
    echo Please enter the path to your Micro Machines installation:
    echo (e.g. C:\Program Files\Micro Machines World Series)
    set /p "GAME_PATH=Game path: "
    
    if "!GAME_PATH!"=="" (
        echo Error: No path entered!
        pause
        exit /b 1
    )
)

REM Check if path exists
if not exist "!GAME_PATH!" (
    echo Error: Path "!GAME_PATH!" does not exist!
    pause
    exit /b 1
)

REM Check if MicroMachines_Data folder exists
set "DATA_PATH=!GAME_PATH!\MicroMachines_Data"
if not exist "!DATA_PATH!" (
    echo Error: MicroMachines_Data folder not found in "!GAME_PATH!"
    echo Make sure this is the correct game folder.
    pause
    exit /b 1
)

REM Check/create StreamingAssets folder
set "STREAMING_PATH=!DATA_PATH!\StreamingAssets"
if not exist "!STREAMING_PATH!" (
    echo Creating StreamingAssets folder...
    mkdir "!STREAMING_PATH!"
)

REM Configuration file path
set "CONFIG_FILE=!STREAMING_PATH!\BootConfig_User.xml"

echo.
echo Creating backup of existing configuration...
if exist "!CONFIG_FILE!" (
    copy "!CONFIG_FILE!" "!CONFIG_FILE!.backup.%date:~-4,4%%date:~-7,2%%date:~-10,2%_%time:~0,2%%time:~3,2%%time:~6,2%" >nul
    echo Backup created: !CONFIG_FILE!.backup.*
)

echo.
echo Patching configuration file...

REM Determine server environment
set "SERVER_ENV=Localhost"
echo !SERVER_ADDRESS! | findstr /i "localhost" >nul
if errorlevel 1 (
    set "SERVER_ENV=Custom"
)

REM Temporary file for editing
set "TEMP_FILE=!CONFIG_FILE!.tmp"

REM Check if configuration file exists
if not exist "!CONFIG_FILE!" (
    echo Creating new configuration file...
    (
    echo ^<?xml version="1.0" encoding="utf-8"?^>
    echo ^<BootConfig^>
    echo   ^<property name="m_serverEnvironment" value="!SERVER_ENV!" /^>
    echo ^</BootConfig^>
    ) > "!CONFIG_FILE!"
    goto :patch_complete
)

echo Reading existing configuration...
set "IN_BOOTCONFIG=0"
set "HAS_SERVER_ENV=0"
set "PROCESSED=0"

REM Process XML file line by line
(
for /f "usebackq delims=" %%a in ("!CONFIG_FILE!") do (
    set "LINE=%%a"
    set "WRITE_LINE=1"
    
    REM Check if we are in BootConfig
    echo !LINE! | findstr /c:"<BootConfig" >nul
    if !errorlevel! equ 0 set "IN_BOOTCONFIG=1"
    
    REM Replace or add server environment property
    echo !LINE! | findstr /c:"m_serverEnvironment" >nul
    if !errorlevel! equ 0 (
        echo   ^<property name="m_serverEnvironment" value="!SERVER_ENV!" /^>
        set "HAS_SERVER_ENV=1"
        set "WRITE_LINE=0"
    )
    
    REM Remove old custom server URLs
    echo !LINE! | findstr /c:"m_customServerUrl" >nul
    if !errorlevel! equ 0 set "WRITE_LINE=0"
    
    REM Add custom server URL before closing BootConfig tag
    echo !LINE! | findstr /c:"</BootConfig>" >nul
    if !errorlevel! equ 0 (
        REM If no serverEnvironment set yet, add it now
        if !HAS_SERVER_ENV! equ 0 (
            echo   ^<property name="m_serverEnvironment" value="!SERVER_ENV!" /^>
        )
        REM Add custom URL if not localhost
        if not "!SERVER_ENV!"=="Localhost" (
            echo   ^<property name="m_customServerUrl" value="http://!SERVER_ADDRESS!" /^>
        )
        set "PROCESSED=1"
    )
    
    REM Output line if not skipped
    if !WRITE_LINE! equ 1 echo !LINE!
)
) > "!TEMP_FILE!"

REM Check if processing was successful
if !PROCESSED! equ 0 (
    echo Warning: BootConfig structure not found, creating new file...
    (
    echo ^<?xml version="1.0" encoding="utf-8"?^>
    echo ^<BootConfig^>
    echo   ^<property name="m_serverEnvironment" value="!SERVER_ENV!" /^>
    if not "!SERVER_ENV!"=="Localhost" (
        echo   ^<property name="m_customServerUrl" value="http://!SERVER_ADDRESS!" /^>
    )
    echo ^</BootConfig^>
    ) > "!TEMP_FILE!"
)

REM Copy temporary file over original
move "!TEMP_FILE!" "!CONFIG_FILE!" >nul

:patch_complete

echo.
echo ===============================================
echo Patch successfully applied!
echo ===============================================
echo.
echo Configuration file: !CONFIG_FILE!
echo Server address: !SERVER_ADDRESS!
echo Server environment: !SERVER_ENV!
echo.
echo The game will now attempt to connect to
echo your custom server.
echo.
echo Notes:
echo - Make sure your server is running
echo - If you encounter problems, you can restore the .backup file
echo.
pause
