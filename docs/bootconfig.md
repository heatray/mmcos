# Boot Config

Config location: `MicroMachines_Data/StreamingAssets/BootConfig_User.xml`

Default content:

```xml
<?xml version="1.0" encoding="utf-8"?>
<BootConfig>
  <property name="m_serverEnvironment" value="CDN" />
</BootConfig>
```

## Options

| Type                | Property                    | Default |
|---------------------|-----------------------------|---------|
| bool                | m_waitForDebugger           | false   |
| float               | m_timeScale                 | 1f      |
| bool                | m_sandboxMode               | false   |
| bool                | m_framerateMonitorEnabled   | true    |
| StringArray         | m_vehiclesToLoad            |         |
| MutatorArray        | m_mutatorArray              |         |
| bool                | m_uiDebugOverlayEnabled     | true    |
| bool                | m_showDebugModeInLists      | false   |
| ServerType          | m_serverEnvironment         | SIT     |
| bool                | m_UseLANMatchmaking         | false   |
| bool                | m_EnableRealMatchmakingInUI | false   |
| bool                | m_rankedMatchingAlllowsAi   | false   |
| string              | m_ForceMatchMakingGameType  |         |
| bool                | m_UseDebugMatchMaking       | false   |
| bool                | m_enableAI                  | true    |
| string              | m_frontendWorld             |         |
| bool                | m_disablePadRumble          | false   |
| bool                | m_allowInputWithoutFocus    | false   |
| string              | m_steamIDOverride           |         |
| ErrorHandlerOptions | m_errorHandlerOptions       |         |

## ServerType values

| Value     | URL prefix                               |
|-----------|------------------------------------------|
| Invalid   | (empty)                                  |
| CDN       | (value from CDN)                         |
| MikesPC   | `http://UK17196`                         |
| Localhost | `http://localhost`                       |
| SIT       | `https://mmsit.codemasters.com`          |
| BiC       | `http://UK08795.local`                   |
| BiC_IP    | `http://10.70.110.89`                    |
| DevQA     | `https://mmdvq.codemasters.com/MMCOS`    |
| QA        | `https://mmcosqa.codemasters.com/MMCOS`  |
| Staging   | `https://mmcossta.codemasters.com/MMCOS` |
| Live      | `https://mmcos.codemasters.com/MMCOS`    |
| Demo      | (empty)                                  |
