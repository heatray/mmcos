const express = require('express');
const xmlparser = require('express-xml-bodyparser');
const xml2js = require('xml2js');
const os = require('os');

// Get the local LAN IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  
  for (const name of Object.keys(interfaces)) {
    for (const interface of interfaces[name]) {
      // Skip internal (i.e. 127.0.0.1) and non-IPv4 addresses
      if (interface.family === 'IPv4' && !interface.internal) {
        return interface.address;
      }
    }
  }
  
  return 'localhost'; // Fallback
}

// Check if we should run interactive configuration
async function startServer() {
  // Check command line arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    console.log('🎮 MMCOS Community Server');
    console.log('==========================');
    console.log();
    console.log('Usage:');
    console.log('  node server.js                 - Interactive configuration');
    console.log('  node server.js --standard      - Standard community server');
    console.log('  node server.js --competitive   - Competitive server (no AI)');
    console.log('  node server.js --casual        - Casual fun server');
    console.log('  node server.js --training      - AI training server');
    console.log('  node server.js --battle        - Battle modes server');
    console.log('  node server.js --elimination   - Elimination server');
    console.log();
    process.exit(0);
  }

  // Check for quick start
  if (args.includes('--quick')) {
    // Quick start with sensible defaults
    const config = {
      name: "MMCOS Community Server",
      description: "Quick start with default settings",
      settings: {
        maxPlayers: 8,
        aiEnabled: true,
        allowSpectators: true,
        rankedWithAI: true,
        debugMode: false,
        seasonSystem: true,
        forceGameType: null,
        competitiveMode: false
      }
    };
    
    console.log('🎮 MMCOS Community Server');
    console.log('==========================');
    console.log();
    console.log('🚀 Quick start with default settings');
    console.log();
    
    // Set environment and continue
    process.env.SERVER_CONFIG = JSON.stringify(config);
  } else {
    // Interactive configuration
    const { runInteractiveConfig } = require('./interactive-config');
    await runInteractiveConfig();
    return; // Interactive config will restart the server
  }
}

// Run startup logic if this is the main module
if (require.main === module) {
  startServer().then(() => {
    // Continue with server initialization
    initializeServer();
  }).catch(error => {
    console.error('❌ Startup error:', error.message);
    process.exit(1);
  });
} else {
  // Being required as module, skip interactive setup
  initializeServer();
}

function initializeServer() {

// Multi-Server Configuration Support
let SERVER_CONFIG;

// Check if server config was passed from interactive setup
if (process.env.SERVER_CONFIG) {
  SERVER_CONFIG = JSON.parse(process.env.SERVER_CONFIG);
  console.log(`🎯 Using interactive configuration: ${SERVER_CONFIG.name}`);
  } else {
    // Default configuration - Server responds to game requests
    SERVER_CONFIG = {
      name: "MMCOS Community Server",
      description: "Community server - responds to all game modes",
      settings: {
        aiEnabled: true,        // AI available if game requests it
        rankedWithAI: true,     // Allow ranked matches with AI
        debugMode: false,
        seasonSystem: true,
        maxPlayers: 8,          // Standard maximum
        forceGameType: null,    // Don't override game's choice
        allowSpectators: true,
        competitiveMode: false  // Not a competitive-only server
      }
    };
    console.log(`📁 Using default configuration - server responds to all game requests`);
  }// Season and ServerStatus functions (extracted from server-configs.js)
function getCurrentSeason() {
  const SEASON_CONFIG = {
    schedule: [
      { season: 46, start: '2025-01-01', end: '2025-02-15' },
      { season: 47, start: '2025-03-01', end: '2025-04-15' },
      { season: 48, start: '2025-05-01', end: '2025-06-15' },
      { season: 49, start: '2025-07-01', end: '2025-08-15' },
      { season: 50, start: '2025-09-01', end: '2025-10-16' },
      { season: 51, start: '2025-11-01', end: '2025-12-16' }
    ]
  };
  
  const now = new Date();
  for (const season of SEASON_CONFIG.schedule) {
    const start = new Date(season.start);
    const end = new Date(season.end);
    if (now >= start && now <= end) {
      return season.season;
    }
  }
  return 46; // Default
}

function generateServerStatus(config) {
  const currentSeason = config.settings.seasonSystem ? getCurrentSeason() : 45;
  
  return `
<OnlineServiceStatus>
  <Message display="false" localize="false">
    ${config.description}
  </Message>
  
  <ServerStatus accessible="true"/>
  <Egonet enabled="${config.settings.allowSpectators}"/>
  
  <ServerInfo>
    <Name>${config.name}</Name>
    <Season>${currentSeason}</Season>
    <MaxPlayers>${config.settings.maxPlayers}</MaxPlayers>
    <AIEnabled>${config.settings.aiEnabled}</AIEnabled>
    <CompetitiveMode>${config.settings.competitiveMode}</CompetitiveMode>
  </ServerInfo>
</OnlineServiceStatus>
`;
}

console.log(`🚀 Starting ${SERVER_CONFIG.name}`);
console.log(`📋 Configuration:`, SERVER_CONFIG.settings);

// Global request counter for testing
let enterMatchmakingCounter = 0;
const http = require('http');
const https = require('https');
const fs = require('fs');
const { generateLoginResponse } = require('./responses');
const { GameSession } = require('./game-session');

// Initialize game session manager
const gameSession = new GameSession();

// Cleanup old games every 30 minutes
setInterval(() => {
  gameSession.cleanupOldGames();
}, 30 * 60 * 1000);

const app = express();

app.use('/static', express.static('static'));

// Configure XML parser for MMCOS protocol
app.use(express.raw({ 
    type: ['application/egonet-stream', 'application/xml', 'text/xml'],
    limit: '10mb'
}));

// Convert raw buffer to string for XML processing (skip binary endpoints)
app.use((req, res, next) => {
    // Skip XML parsing for services that use binary Steam ticket data
    if (req.path.includes('/Login') || 
        req.path.includes('AccountService') || 
        req.path.includes('/MicroMachines/STEAM/') ||
        req.headers['x-egonet-function'] === 'LoginService.Login') {
        console.log('MMCOS Request:', req.headers['x-egonet-function'] || 'Binary Service');
        console.log('🔍 Binary endpoint detected - skipping XML parsing');
        console.log('🔍 Request path:', req.path);
        next();
        return;
    }
    
    if (req.headers['content-type'] && 
        (req.headers['content-type'].includes('egonet-stream') || 
         req.headers['content-type'].includes('application/xml') ||
         req.headers['content-type'].includes('text/xml'))) {
        try {
            if (Buffer.isBuffer(req.body)) {
                const xmlString = req.body.toString('utf8');
                console.log('MMCOS Request:', req.headers['x-egonet-function'] || 'XML');
                console.log('🔍 XML String:', xmlString);
                
                // Parse XML to JavaScript object
                const parser = new xml2js.Parser({ 
                    explicitArray: true, 
                    mergeAttrs: true,
                    ignoreAttrs: true,
                    explicitCharkey: false,
                    trim: true,
                    normalize: true
                });
                
                parser.parseString(xmlString, (err, result) => {
                    if (!err && result) {
                        // Convert to lowercase for easier access
                        req.body = {};
                        for (const key in result) {
                            req.body[key.toLowerCase()] = result[key];
                        }
                        console.log('✅ Parsed XML:', JSON.stringify(req.body, null, 2));
                    } else {
                        console.error('❌ XML Parse Error:', err);
                        req.body = xmlString; // Fallback to original string
                    }
                    next();
                });
                return; // Don't call next() here, wait for parser callback
            }
        } catch (error) {
            console.error('Error parsing XML body:', error);
        }
    }
    next();
});

app.use(function(error, req, res, next) {
  console.log('Error:', error);
  next();
});

app.use((req, res, next) => {
  console.log('%s %s - %s', req.method, req.url, req.ip);
  next();
});

app.get('/', (req, res) => {
  res.send('🎮 MMCOS Community Server - Micro Machines World Series Revival');
});

// 🔧 LOCALHOST COMPATIBILITY MIDDLEWARE
// Handle both localhost (without /MMCOS) and hosts-file (with /MMCOS) configurations
app.use((req, res, next) => {
  // Track client configuration type for debugging
  let clientType = 'unknown';
  
  // Check if request is for a known MMCOS endpoint but without the /MMCOS prefix
  const mmcosEndpoints = [
    '/MMCOS-ServerStatus/ServerStatus.xml',
    '/MMCOS-Account/AccountService.svc/Login',
    '/MMCOS-Account/AccountService.svc/UpdateAccountTitle', 
    '/MMCOS-Matchmaking/MatchmakingService.svc/EnterMatchmaking2',
    '/MMCOS-Matchmaking/MatchmakingService.svc/CancelMatchmaking',
    '/MMCOS-Matchmaking/MatchmakingService.svc/RegisterActiveGameWithPlayers',
    '/MMCOS-Matchmaking/MatchmakingService.svc/AddPoints'
  ];
  
  // Check for redirect files without prefix
  const redirectPattern = /^\/redirect_steam_submission[1-3]\.txt$/;
  
  // Detect client configuration type based on request pattern
  if (req.path.startsWith('/MMCOS/')) {
    clientType = 'hosts-file';
  } else if (mmcosEndpoints.includes(req.path) || redirectPattern.test(req.path)) {
    clientType = 'localhost-config';
    // Redirect internally to /MMCOS prefixed route
    console.log(`🔧 Localhost client detected: ${req.method} ${req.path} → /MMCOS${req.path}`);
    req.url = '/MMCOS' + req.url;
  }
  
  // Log client type for debugging
  if (clientType !== 'unknown' && !req.path.includes('admin')) {
    console.log(`� Client type: ${clientType} (${req.method} ${req.originalUrl || req.path})`);
  }
  
  next();
});

// Admin dashboard endpoint
app.get('/admin', (req, res) => {
  const stats = gameSession.getServerStats();
  const games = Array.from(gameSession.games.values());
  const players = Array.from(gameSession.players.values());
  
  res.set('Content-Type', 'text/html');
  res.send(`
    <html>
    <head><title>MMCOS Admin Dashboard</title>
    <style>
      body { font-family: Arial, sans-serif; margin: 20px; background: #1a1a1a; color: #fff; }
      .card { background: #2d2d2d; padding: 15px; margin: 10px 0; border-radius: 8px; }
      .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
      .stat { background: #333; padding: 10px; border-radius: 5px; text-align: center; }
      .stat-value { font-size: 24px; font-weight: bold; color: #4CAF50; }
      table { width: 100%; border-collapse: collapse; margin: 10px 0; }
      th, td { padding: 8px; text-align: left; border-bottom: 1px solid #444; }
      th { background: #333; }
      .host { color: #FFD700; font-weight: bold; }
      .online { color: #4CAF50; }
      .offline { color: #f44336; }
    </style>
    </head>
    <body>
      <h1>🎮 MMCOS Community Server Dashboard</h1>
      
      <div class="card">
        <h2>📊 Server Statistics</h2>
        <div class="stats">
          <div class="stat">
            <div class="stat-value">${stats.totalGames}</div>
            <div>Total Games</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.activeGames}</div>
            <div>Active Games</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.waitingGames}</div>
            <div>Waiting Games</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.onlinePlayers}</div>
            <div>Online Players</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.totalPlayers}</div>
            <div>Total Players</div>
          </div>
          <div class="stat">
            <div class="stat-value">${stats.averageWaitTime.toFixed(1)}s</div>
            <div>Avg Wait Time</div>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>🏁 Active Games</h2>
        <table>
          <tr><th>Session ID</th><th>Host</th><th>Players</th><th>Status</th><th>Game Type</th><th>Created</th></tr>
          ${games.map(game => `
            <tr>
              <td>${game.sessionId}</td>
              <td class="host">${game.hostDisplayName}</td>
              <td>${game.players.length}/${game.maxPlayers}</td>
              <td>${game.status}</td>
              <td>${game.gameType} (${game.ranking})</td>
              <td>${new Date(game.createdAt).toLocaleTimeString()}</td>
            </tr>
          `).join('')}
        </table>
      </div>

      <div class="card">
        <h2>👥 Players</h2>
        <table>
          <tr><th>Display Name</th><th>Platform ID</th><th>Status</th><th>Points</th><th>Games</th><th>Wins</th><th>Current Game</th></tr>
          ${players.map(player => `
            <tr>
              <td>${player.displayName}</td>
              <td>${player.platformId.substring(0, 20)}...</td>
              <td class="${player.isOnline ? 'online' : 'offline'}">${player.isOnline ? 'Online' : 'Offline'}</td>
              <td>${player.points}</td>
              <td>${player.totalGames}</td>
              <td>${player.wins}</td>
              <td>${player.currentGameId || 'None'}</td>
            </tr>
          `).join('')}
        </table>
      </div>

      <script>
        setTimeout(() => location.reload(), 10000); // Auto-refresh every 10 seconds
      </script>
    </body>
    </html>
  `);
});

app.post('/MicroMachines/STEAM/1\.0/', (req, res) => {
  console.log('🎮 MicroMachines STEAM 1.0 LoginService.Login request');
  console.log('🔍 Headers:', req.headers);
  
  // Parse binary Steam login data
  let displayName = "Player"; // Default name (will be extracted from Steam data)
  let extractedSteamId = null; // Track if we found a Steam ID in the request
  
  try {
    // Convert buffer to string and extract data
    const dataString = req.body.toString('utf8');
    console.log('🔍 Request body (first 500 chars):', dataString.substring(0, 500));
    
    // Try to extract Steam username from the structured format: "Namedstr♠USERNAME♂"
    const namePattern = /Namedstr[^\w]*(\w+)/;
    const nameMatch = dataString.match(namePattern);
    if (nameMatch && nameMatch[1]) {
      displayName = nameMatch[1];
      console.log('✅ Found Steam username in Namedstr field:', displayName);
    } else {
      // Fallback: Method 1 - Look for "personaname" field (case-insensitive)
      const personaMatch = dataString.match(/personaname[^\x20-\x7E]*([A-Za-z0-9_\-]{2,32})/i);
      if (personaMatch && personaMatch[1]) {
        displayName = personaMatch[1];
        console.log('✅ Found Steam persona name:', displayName);
      } else {
        // Fallback: Method 2 - Look for any readable username-like string
        const potentialNames = dataString.match(/[A-Za-z][A-Za-z0-9_\-]{2,31}/g);
        if (potentialNames && potentialNames.length > 0) {
          // Filter out common false positives
          const filtered = potentialNames.filter(name => 
            !['Name', 'Type', 'Data', 'Ticket', 'Steam', 'Login', 'User', 'vdic', 'dstr', 'blob', 'Namedstr', 'SteamTicketblob'].includes(name)
          );
          if (filtered.length > 0) {
            displayName = filtered[0];
            console.log('✅ Extracted display name (fallback method):', displayName);
          } else {
            console.warn('⚠️ Could not extract display name from request, using default');
          }
        } else {
          console.warn('⚠️ Could not extract display name from request, using default');
        }
      }
    }
    
    // Extract Steam ID from ticket
    const steamIdMatch = dataString.match(/steam_(\w+)/);
    if (steamIdMatch && steamIdMatch[1]) {
      extractedSteamId = "steam_" + steamIdMatch[1];
      console.log('🔍 Found Steam ID in request:', extractedSteamId);
    }
  } catch (error) {
    console.error('❌ Error parsing login data:', error);
  }
  
  // Generate or retrieve unique platformId based on display name
  // This ensures each player with a unique name gets a unique ID
  const platformId = gameSession.getOrCreatePlatformId(displayName);
  console.log(`✅ MicroMachines Login: ${displayName} -> Platform ID: ${platformId}`);
  
  const userId = Math.floor(Math.random() * 1000000);
  
  // Generate unique session token for this player
  const sessionToken = Buffer.from(`${platformId}_${Date.now()}_${Math.random()}`).toString('base64');
  
  // Register player in game session WITH sessionToken mapping
  const player = gameSession.registerPlayer(platformId, displayName, sessionToken);
  
  // Generate authentic response with the sessionToken
  const loginResponse = generateLoginResponse(platformId, displayName, userId, sessionToken);
  res.set('Content-Type', 'application/xml');
  res.send(loginResponse);
});

app.get('/MMCOS/redirect_steam_submission[1-3]\.txt', (req, res) => {
  res.send('Live')
})

app.get('/MMCOS/MMCOS-ServerStatus/ServerStatus\.xml', (req, res) => {
  const serverStatus = generateServerStatus(SERVER_CONFIG);
  res.send(serverStatus);
})

app.post('/MMCOS/MMCOS-Account/AccountService\\.svc/Login', (req, res) => {
  console.log('🔐 MMCOS Account Login request from:', req.ip);
  
  // Parse binary Steam login data
  let displayName = "Player"; // Default name (will be extracted from Steam data)
  let extractedSteamId = null; // Track if we found a Steam ID in the request
  
  try {
    // Convert buffer to string and extract data
    const dataString = req.body.toString('utf8');
    
    // Try to extract Steam username from the structured format: "Namedstr♠USERNAME♂"
    const namePattern = /Namedstr[^\w]*(\w+)/;
    const nameMatch = dataString.match(namePattern);
    if (nameMatch && nameMatch[1]) {
      displayName = nameMatch[1];
      console.log('✅ Found Steam username in Namedstr field:', displayName);
    } else {
      // Fallback: Method 1 - Look for readable text after "personaname" field (case-insensitive)
      const personaMatch = dataString.match(/personaname[^\x20-\x7E]*([A-Za-z0-9_\-]{2,32})/i);
      if (personaMatch && personaMatch[1]) {
        displayName = personaMatch[1];
        console.log('✅ Found Steam persona name:', displayName);
      } else {
        // Fallback: Method 2 - Look for any readable username-like string (3-32 chars)
        const potentialNames = dataString.match(/[A-Za-z][A-Za-z0-9_\-]{2,31}/g);
        if (potentialNames && potentialNames.length > 0) {
          // Filter out common false positives
          const filtered = potentialNames.filter(name => 
            !['Name', 'Type', 'Data', 'Ticket', 'Steam', 'Login', 'User', 'vdic', 'dstr', 'blob', 'Namedstr', 'SteamTicketblob'].includes(name)
          );
          if (filtered.length > 0) {
            displayName = filtered[0];
            console.log('✅ Extracted display name (fallback method):', displayName);
          } else {
            console.warn('⚠️ Could not extract display name from request, using default');
          }
        } else {
          console.warn('⚠️ Could not extract display name from request, using default');
        }
      }
    }
    
    // Extract Steam ID from ticket (optional)
    const steamIdMatch = dataString.match(/steam_(\w+)/);
    if (steamIdMatch && steamIdMatch[1]) {
      extractedSteamId = "steam_" + steamIdMatch[1];
      console.log('🔍 Found Steam ID in request:', extractedSteamId);
    }
  } catch (error) {
    console.error('❌ Error parsing login data:', error);
  }
  
  // Generate or retrieve unique platformId based on display name
  // This ensures each player with a unique name gets a unique ID
  const platformId = gameSession.getOrCreatePlatformId(displayName);
  console.log(`✅ MMCOS Account Login: ${displayName} -> Platform ID: ${platformId}`);
  
  const userId = Math.floor(Math.random() * 1000000);
  
  // Generate unique session token for this player
  const sessionToken = Buffer.from(`${platformId}_${Date.now()}_${Math.random()}`).toString('base64');
  
  // Register player in game session WITH sessionToken mapping
  const player = gameSession.registerPlayer(platformId, displayName, sessionToken);
  
  // Generate authentic response with the sessionToken
  const loginResponse = generateLoginResponse(platformId, displayName, userId, sessionToken);
  res.set('Content-Type', 'application/xml');
  res.send(loginResponse);
});

app.post('/MMCOS/MMCOS-Account/AccountService\\.svc/UpdateAccountTitle', (req, res) => {
  console.log('UpdateAccountTitle request:', req.body);
  res.set('Content-Type', 'application/xml');
  res.send('<UpdateAccountTitleResult xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><Error i:nil="true"/></UpdateAccountTitleResult>');
});

// Matchmaking Service Endpoints
app.post('/MMCOS/MMCOS-Matchmaking/MatchmakingService\\.svc/EnterMatchmaking2', (req, res) => {
  console.log(`🎯 EnterMatchmaking2 request on ${SERVER_CONFIG.name}`);
  console.log('🔍 Raw req.body:', JSON.stringify(req.body, null, 2));
  
  // Increment counter for testing
  enterMatchmakingCounter++;
  console.log(`🔢 EnterMatchmaking2 request #${enterMatchmakingCounter}`);
  
  // Extract all important fields from request FIRST
  const sessionToken = req.body.entermatchmaking2?.SessionToken?.[0];
  const groupLobbyId = req.body.entermatchmaking2?.GroupLobbyId?.[0];
  const gameLobbyId = req.body.entermatchmaking2?.GameLobbyId?.[0];
  const gameType = req.body.entermatchmaking2?.GameType?.[0];
  const ruleSet = req.body.entermatchmaking2?.RuleSet?.[0] || 'Race';
  
  // 🎛️ SERVER CONFIGURATION LOGIC
  const config = SERVER_CONFIG.settings;
  
  // Force game type if configured
  const actualGameType = config.forceGameType || gameType;
  const actualRuleSet = config.forceGameType ? config.forceGameType.replace('Quick', '') : ruleSet;
  
  // AI handling based on server config
  const clientIgnoreMinMatch = req.body.entermatchmaking2?.IgnoreMinimumMatchRequirements?.[0] === 'true';
  let ignoreMinMatch = true; // Default for community server
  
  // Competitive server logic
  if (!config.rankedWithAI && !clientIgnoreMinMatch) {
    console.log(`⚔️ Competitive server: Rejecting ranked match without sufficient players`);
    // Could implement player waiting queue here
  }
  
  console.log(`🎮 Server Config: AI=${config.aiEnabled}, RankedAI=${config.rankedWithAI}, MaxPlayers=${config.maxPlayers}`);
  console.log(`🎯 Game Type: ${actualGameType}/${actualRuleSet} (${config.forceGameType ? 'FORCED' : 'CLIENT'})`);
  
  if (actualGameType !== gameType) {
    console.log(`🔄 Game type overridden: ${gameType} → ${actualGameType}`);
  }

  // 🔥 CRITICAL PATTERN DETECTION: Battle Mode triggers RegisterActiveGameWithPlayers!
  const isBattleMode = gameType === 'RankedBattle' && ruleSet === 'Battle';
  
  // DEBUG: Check why Battle Mode Detection might not trigger
  console.log(`🔍 Mode Check: gameType="${gameType}", ruleSet="${ruleSet}", clientIgnoreMinMatch=${clientIgnoreMinMatch}, serverIgnoreMinMatch=${ignoreMinMatch}`);
  console.log(`🔍 isBattleMode=${isBattleMode}, ignoreMinMatch=${ignoreMinMatch}`);
  
  if (isBattleMode && ignoreMinMatch) {
    console.log('� BATTLE MODE DETECTED! RankedBattle/Battle + IgnoreMinimumMatchRequirements=true');
    console.log('🎯 This should trigger RegisterActiveGameWithPlayers!');
    
    // ✅ BATTLE MODE RESPONSE: Critical Team=1 (not Team=0!)
    const raceKey = Math.random().toString(16).substring(2, 18).toUpperCase();
    const sessionId = Math.floor(Math.random() * 10000000);
    
    const battleModeResponse = `<MatchmakingResult xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><AverageWaitTimeNonRanked>82.8</AverageWaitTimeNonRanked><AverageWaitTimeRanked>84.5</AverageWaitTimeRanked><Error i:nil="true"/><Groups><MatchmakingGroup><GameLobbyId>${gameLobbyId}</GameLobbyId><GroupLobbyId>${groupLobbyId}</GroupLobbyId><GroupSize>1</GroupSize><IsHost>true</IsHost><Team>1</Team><HostPlatformID>steam_AQAAAAIAAADKOgoA</HostPlatformID><GameType>${gameType}</GameType></MatchmakingGroup></Groups><InProgressGameToJoin i:nil="true"/><RaceKey>${raceKey}</RaceKey><SessionId>${sessionId}</SessionId></MatchmakingResult>`;
    
    res.set({
      'X-Powered-By': 'ASP.NET',
      'Content-Type': 'text/xml; charset=utf-8',
      'Content-Length': battleModeResponse.length.toString(),
      'Server': 'Microsoft-IIS/8.0',
      'Cache-Control': 'private'
    });
    
    console.log(`📤 BATTLE MODE Response: Team=1, RaceKey=${raceKey}, SessionId=${sessionId}`);
    res.send(battleModeResponse);
    return;
  }
  
  // NEW STRATEGY: Test different response types systematically
  if (enterMatchmakingCounter === 2) {
    console.log(`� NEW TEST: Sending "MATCH FOUND" response on request #${enterMatchmakingCounter}`);
    const raceKey = gameSession.generateRaceKey();
    const sessionId = Math.floor(Math.random() * 10000000);
    
    const matchFoundXML = `<MatchmakingResult xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <AverageWaitTimeNonRanked>47.7</AverageWaitTimeNonRanked>
  <AverageWaitTimeRanked>84.5</AverageWaitTimeRanked>
  <Error i:nil="true"/>
  <Groups>
    <MatchmakingGroup>
      <GameLobbyId>${gameLobbyId}</GameLobbyId>
      <GroupLobbyId>${groupLobbyId}</GroupLobbyId>
      <GroupSize>1</GroupSize>
      <IsHost>true</IsHost>
      <Team>1</Team>
      <HostPlatformID>76561198081105540</HostPlatformID>
      <GameType>${gameType}</GameType>
    </MatchmakingGroup>
  </Groups>
  <InProgressGameToJoin i:nil="true"/>
  <RaceKey>${raceKey}</RaceKey>
  <SessionId>${sessionId}</SessionId>
</MatchmakingResult>`;
    
    console.log(`🎮 CORRECTED MATCH FOUND XML - InProgressGameToJoin is now nil!`);
    res.set('Content-Type', 'text/xml; charset=utf-8');
    res.send(matchFoundXML);
    return;
  }

  
  const networkVersion = req.body.entermatchmaking2?.NetworkVersion?.[0] || '1';
  const requestedGroupSize = req.body.entermatchmaking2?.GroupSize?.[0] || '1';
  const skillLevel = req.body.entermatchmaking2?.SkillLevel?.[0] || '1000000';
  // ruleSet already defined above
  const ranking = req.body.entermatchmaking2?.Ranking?.[0] || 'NotRanked';
  const ignoreMinRequirements = req.body.entermatchmaking2?.IgnoreMinimumMatchRequirements?.[0] || 'false';
  
  console.log(`🔍 Field Access Test: GroupLobbyId=${groupLobbyId}, GameLobbyId=${gameLobbyId}`);
  console.log(`🔍 Available fields:`, Object.keys(req.body.entermatchmaking2 || {}));
  
  // Generate MITM dump compatible IDs if not provided
  if (!groupLobbyId) {
    groupLobbyId = '109775241626724054'; // Fixed GroupLobbyId from MITM dump
  }
  if (!gameLobbyId) {
    gameLobbyId = `10977524${Date.now().toString().substring(-8)}`; // Dynamic GameLobbyId in same format
  }
  
  console.log(`🎮 Matchmaking request: ${gameType}/${ruleSet}/${ranking}, Group: ${requestedGroupSize}, Skill: ${skillLevel}`);
  console.log(`📍 Client IDs: GroupLobbyId=${groupLobbyId}, GameLobbyId=${gameLobbyId}`);
  
  // 🔑 CRITICAL FIX: Look up platformId by sessionToken to prevent duplicate players
  let platformId;
  if (sessionToken) {
    // Try to find existing player by sessionToken
    platformId = gameSession.getPlatformIdByToken(sessionToken);
    
    if (!platformId) {
      // SessionToken not found - this shouldn't happen if player logged in
      console.warn(`⚠️ SessionToken not found in map: ${sessionToken.substring(0, 20)}...`);
      // Fallback: use IP-based ID
      const clientIp = req.ip.replace(/[^a-zA-Z0-9]/g, '_');
      platformId = `player_${clientIp}`;
      // Register with this sessionToken
      gameSession.registerPlayer(platformId, `Player_${platformId.substring(7, 15)}`, sessionToken);
    } else {
      // Check if player actually exists in our database
      const playerExists = gameSession.getPlayer(platformId);
      if (!playerExists) {
        console.warn(`⚠️ Session token valid but player ${platformId} not found - server was restarted`);
        console.warn(`⚠️ Clearing invalid session token - client must re-login`);
        // Clear the invalid session token
        gameSession.sessionTokenMap.delete(sessionToken);
        // Return error to force re-login
        return res.status(401).type('application/xml').send(`<?xml version="1.0" encoding="utf-8"?>
<MatchmakingResult xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Error>Session expired. Please restart game.</Error>
</MatchmakingResult>`);
      }
      console.log(`🔑 Found existing player via sessionToken: ${platformId}`);
    }
  } else {
    // No sessionToken - use IP address to create consistent player ID
    const clientIp = req.ip.replace(/[^a-zA-Z0-9]/g, '_');
    platformId = `player_${clientIp}`;
    
    // Register player if not exists
    if (!gameSession.getPlayer(platformId)) {
      gameSession.registerPlayer(platformId, `Player_${platformId.substring(7, 15)}`);
      console.log(`🎮 Player registered: Player_${platformId.substring(7, 15)} (${platformId})`);
    }
  }
  
  // IMPORTANT: Using consistent platformId prevents duplicate player registration
  console.log(`🔍 Using consistent platformId: ${platformId}`);
  
  let game;
  let isHost = false;
  
  // 🔑 CRITICAL FIX: Check if player is already in a game (prevents loop!)
  const currentPlayer = gameSession.getPlayer(platformId);
  if (currentPlayer && currentPlayer.currentGameId) {
    // Player already in a game - return that game instead of creating/joining another
    const existingGame = gameSession.games.get(currentPlayer.currentGameId);
    if (existingGame && existingGame.status === 'waiting') {
      // Game is waiting - return it
      game = existingGame;
      const playerInGame = game.players.find(p => p.platformId === platformId);
      isHost = playerInGame ? playerInGame.isHost : false;
      console.log(`♻️ Player already in WAITING game Session ${game.sessionId} - returning existing game`);
      console.log(`   👥 Players: ${game.players.length}/${game.maxPlayers}, IsHost: ${isHost}`);
    } else if (existingGame && existingGame.status === 'active') {
      // Game is active - check if it's old/stale (more than 5 minutes)
      const gameAge = Date.now() - (existingGame.startedAt?.getTime() || existingGame.createdAt.getTime());
      const fiveMinutes = 5 * 60 * 1000;
      
      if (gameAge > fiveMinutes) {
        // Game is old/stale - mark as finished and create new one
        existingGame.status = 'finished';
        currentPlayer.currentGameId = null;
        console.log(`🧹 Game Session ${existingGame.sessionId} is stale (${Math.floor(gameAge/1000)}s old) - creating new game`);
        game = null;
      } else {
        // Game is active and fresh - return it (client might be in-game)
        game = existingGame;
        const playerInGame = game.players.find(p => p.platformId === platformId);
        isHost = playerInGame ? playerInGame.isHost : false;
        console.log(`♻️ Player in ACTIVE game Session ${game.sessionId} - returning game`);
        console.log(`   👥 Players: ${game.players.length}/${game.maxPlayers}, IsHost: ${isHost}`);
      }
    } else {
      // Game is finished or doesn't exist - clear currentGameId and continue
      currentPlayer.currentGameId = null;
      console.log(`🧹 Cleared finished/missing game from player record`);
      game = null;
    }
  }
  
  // If player not in a game, do matchmaking
  if (!game) {
    // 🎯 SMART MATCHMAKING: Always try to join existing games first
    // Look for any available game that matches our criteria
    try {
      const availableGames = gameSession.getAvailableGames(gameType, ranking);
      
      if (availableGames.length > 0) {
        // Found an existing game - join it
        const existingGame = availableGames[0];
        game = gameSession.joinGame(existingGame.sessionId, platformId);
        isHost = false;
        console.log(`🎮 MATCH FOUND: Joined existing game: Session ${game.sessionId} (${game.players.length}/${game.maxPlayers})`);
        console.log(`   🎮 Game Type: ${game.gameType}/${game.ruleSet}, Ranking: ${game.ranking}`);
      } else {
        // No available games - create new one
        game = gameSession.createGame(platformId, gameType, ruleSet, ranking, gameLobbyId, groupLobbyId);
        isHost = true;
        console.log(`👑 NEW GAME CREATED for GameLobbyId ${gameLobbyId}! Player is HOST: Session ${game.sessionId}`);
        console.log(`   🎮 Game Type: ${gameType}/${ruleSet}, Ranking: ${ranking}, Skill: ${skillLevel}`);
        console.log(`   ⏳ Game stays in 'waiting' state - Client will start when ready`);
        
        // 🎯 COMMUNITY SERVER AUTO-START:
        // If IgnoreMinimumMatchRequirements=false (Ranked/Public mode),
        // we auto-start after 3 seconds since no real players will join
        if (ignoreMinMatch === false || ignoreMinMatch === 'false') {
          console.log(`⏰ Community Server Mode: Auto-starting game in 3 seconds (Ranked match with solo player)`);
          setTimeout(() => {
            try {
              const currentGame = gameSession.games.get(game.sessionId);
              if (currentGame && currentGame.status === 'waiting') {
                currentGame.status = 'active';
                currentGame.startedAt = new Date();
                console.log(`🚀 AUTO-STARTED Game Session ${game.sessionId} (Community Server - Solo Ranked Match)`);
                console.log(`   � Player ${platformId} can now play solo!`);
              }
            } catch (e) {
              console.error(`❌ Auto-start failed: ${e.message}`);
            }
          }, 3000);
        }
      }
    } catch (error) {
      console.error('❌ Matchmaking error:', error.message);
      // Fallback: create new game
      game = gameSession.createGame(platformId, gameType, ruleSet, ranking, gameLobbyId, groupLobbyId);
      isHost = true;
      console.log(`🆘 Fallback: Created new game after error - Session ${game.sessionId}`);
    }
  }
    
  // Find player info in game
  const playerInGame = game.players.find(p => p.platformId === platformId);
  const groupSize = game.players.length;
  
  const stats = gameSession.getServerStats();
  
  try {
    // 🎯 NEW THEORY: InProgressGameToJoin with SessionId might trigger RegisterActiveGameWithPlayers!
    // Tell client there's an active game ready to join
    const teamValue = 0;
    const inProgressGame = `<InProgressGameToJoin><SessionId>${game.sessionId}</SessionId></InProgressGameToJoin>`;
    const finalResponse = `<MatchmakingResult xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><AverageWaitTimeNonRanked>82.8</AverageWaitTimeNonRanked><AverageWaitTimeRanked>84.5</AverageWaitTimeRanked><Error i:nil="true"/><Groups><MatchmakingGroup><GameLobbyId>${gameLobbyId}</GameLobbyId><GroupLobbyId>${groupLobbyId}</GroupLobbyId><GroupSize>${groupSize}</GroupSize><IsHost>${playerInGame.isHost}</IsHost><Team>${teamValue}</Team></MatchmakingGroup></Groups>${inProgressGame}<RaceKey>${game.raceKey}</RaceKey><SessionId>${game.sessionId}</SessionId></MatchmakingResult>`;
    
    const response = finalResponse;
    
    console.log(`🎲 Matchmaking result: SessionId ${game.sessionId}, RaceKey ${game.raceKey}`);
    console.log(`   👥 Players: ${groupSize}/${game.maxPlayers}, Host: ${playerInGame.isHost ? '👑 YES' : 'NO'}`);
    console.log(`✅ Sending Team=${teamValue} ${ignoreMinMatch ? '(Quick Play Mode!)' : '(Ranked Mode)'} - Authentic MMCOS response format`);
    console.log(`📤 FULL Response XML:\n${response}`);
    console.log(`📤 Response length: ${response.length} bytes`);
    
    // Set exact MMCOS-style headers
    res.set('Content-Type', 'text/xml; charset=utf-8');
    res.set('Content-Length', response.length.toString());
    res.set('Server', 'Microsoft-IIS/8.0');
    res.set('X-Powered-By', 'ASP.NET');
    res.set('Cache-Control', 'private');
    console.log(`📤 Response Headers: ${JSON.stringify(res.getHeaders())}`);
    
    res.send(response);
    
  } catch (error) {
    console.error('❌ Response error:', error.message);
    
    // Fallback response (original behavior)
    const fallbackSessionId = Math.floor(Math.random() * 10000000);
    const fallbackRaceKey = Math.random().toString(16).substring(2, 18).toUpperCase();
    
    const response = `<MatchmakingResult xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
      <AverageWaitTimeNonRanked>45.0</AverageWaitTimeNonRanked>
      <AverageWaitTimeRanked>55.0</AverageWaitTimeRanked>
      <Error i:nil="true"/>
      <Groups>
        <MatchmakingGroup>
          <GameLobbyId>109775241628860699</GameLobbyId>
          <GroupLobbyId>109775241626724054</GroupLobbyId>
          <GroupSize>1</GroupSize>
          <IsHost>true</IsHost>
          <Team>1</Team>
        </MatchmakingGroup>
      </Groups>
      <InProgressGameToJoin i:nil="true"/>
      <RaceKey>${fallbackRaceKey}</RaceKey>
      <SessionId>${fallbackSessionId}</SessionId>
    </MatchmakingResult>`;
    
    res.set('Content-Type', 'application/xml');
    res.send(response);
  }
});

// Cancel Matchmaking Service Endpoint
app.post('/MMCOS/MMCOS-Matchmaking/MatchmakingService\\.svc/CancelMatchmaking', (req, res) => {
  console.log('❌ CancelMatchmaking request');
  
  const sessionToken = req.body.cancelmatchmaking?.sessiontoken?.[0];
  
  // 🔑 Use SessionToken-Mapping to find existing player
  let platformId;
  if (sessionToken) {
    platformId = gameSession.getPlatformIdByToken(sessionToken);
    if (!platformId) {
      console.warn(`⚠️ SessionToken not found in CancelMatchmaking: ${sessionToken.substring(0, 20)}...`);
      const clientIp = req.ip.replace(/[^a-zA-Z0-9]/g, '_');
      platformId = `player_${clientIp}`;
    }
  } else {
    const clientIp = req.ip.replace(/[^a-zA-Z0-9]/g, '_');
    platformId = `player_${clientIp}`;
  }
  
  console.log(`🔍 CancelMatchmaking for platformId: ${platformId}`);
  
  const player = gameSession.getPlayer(platformId);
  if (player && player.currentGameId) {
    const game = gameSession.games.get(player.currentGameId);
    if (game && game.status === 'waiting') {
      // Remove player from game
      game.players = game.players.filter(p => p.platformId !== platformId);
      player.currentGameId = null;
      
      console.log(`🚪 Player left matchmaking: ${player.displayName} from Session ${game.sessionId}`);
      console.log(`   Remaining players: ${game.players.length}/8`);
      
      // If game is empty, remove it
      if (game.players.length === 0) {
        gameSession.games.delete(player.currentGameId);
        console.log(`🗑️ Empty game removed: Session ${game.sessionId}`);
      }
    }
  }
  
  res.set('Content-Type', 'application/xml');
  res.send('<CancelMatchmakingResult xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><Error i:nil="true"/></CancelMatchmakingResult>');
});

// Additional critical game endpoints
app.post('/MMCOS/MMCOS-Matchmaking/MatchmakingService\.svc/RegisterActiveGameWithPlayers', (req, res) => {
  console.log('🎮 RegisterActiveGameWithPlayers request');
  console.log('🔍 Raw req.body:', JSON.stringify(req.body, null, 2));
  
  // Try both casing variants
  const data = req.body.registeractivegamewithplayers || req.body.RegisterActiveGameWithPlayers;
  console.log('🔍 Found data:', data ? 'YES' : 'NO');
  
  if (data) {
    const sessionToken = data.SessionToken?.[0] || data.sessiontoken?.[0];
    const raceKey = data.RaceKey?.[0] || data.racekey?.[0]; 
    const hostPlatformID = data.HostPlatformID?.[0] || data.hostplatformid?.[0];
    const gameLobbyId = data.GameLobbyId?.[0] || data.gamelobbyid?.[0];
    const gameType = data.GameType?.[0] || data.gametype?.[0];
    const ruleSet = data.RuleSet?.[0] || data.ruleset?.[0];
    const ranking = data.Ranking?.[0] || data.ranking?.[0];
    const platformIDs = data.PlatformIDs?.[0] || data.platformids?.[0];
    
    console.log(`🏁 Game registration: RaceKey ${raceKey}, Host: ${hostPlatformID}`);
    console.log(`   Players: ${platformIDs}, Type: ${gameType}, Rules: ${ruleSet}`);
    
    // Find and start the game
    try {
      // Find game by race key or create if needed
      let game = null;
      for (const [sessionId, gameData] of gameSession.games) {
        if (gameData.raceKey === raceKey) {
          game = gameData;
          break;
        }
      }
      
      if (game) {
        gameSession.startGame(game.sessionId);
        console.log(`🚀 Game started via RegisterActiveGameWithPlayers: Session ${game.sessionId}`);
      } else {
        console.log(`⚠️ No game found with RaceKey ${raceKey}`);
      }
    } catch (error) {
      console.error('❌ Error starting game:', error.message);
    }
  } else {
    console.log('❌ No valid data found in RegisterActiveGameWithPlayers request');
  }
  
  res.set('Content-Type', 'application/xml');
  res.send('<RegisterActiveGameWithPlayersResult xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><Error i:nil="true"/></RegisterActiveGameWithPlayersResult>');
});

app.post('/MMCOS/MMCOS-Matchmaking/MatchmakingService\.svc/AddPoints', (req, res) => {
  console.log('🏆 AddPoints request');
  
  const sessionToken = req.body.addpoints?.sessiontoken?.[0];
  const raceKey = req.body.addpoints?.racekey?.[0];
  const points = parseInt(req.body.addpoints?.points?.[0] || '0');
  const level = parseInt(req.body.addpoints?.level?.[0] || '1');
  const prestige = parseInt(req.body.addpoints?.prestige?.[0] || '0');
  
  console.log(`💎 Points awarded: ${points} points, Level ${level}, Prestige ${prestige}`);
  console.log(`   RaceKey: ${raceKey}`);
  
  // 🔑 Find player using SessionToken-Mapping
  let playerData = null;
  try {
    // Use SessionToken-Mapping to find correct player
    let platformId;
    if (sessionToken) {
      platformId = gameSession.getPlatformIdByToken(sessionToken);
      if (!platformId) {
        console.warn(`⚠️ SessionToken not found in AddPoints: ${sessionToken.substring(0, 20)}...`);
        const clientIp = req.ip.replace(/[^a-zA-Z0-9]/g, '_');
        platformId = `player_${clientIp}`;
      }
    } else {
      const clientIp = req.ip.replace(/[^a-zA-Z0-9]/g, '_');
      platformId = `player_${clientIp}`;
    }
    
    console.log(`🔍 AddPoints for platformId: ${platformId}`);
    
    playerData = gameSession.getPlayer(platformId);
    if (playerData) {
      playerData.points += points;
      playerData.level = level;
      playerData.prestige = prestige;
      console.log(`💎 Player ${playerData.displayName}: ${playerData.points} total points`);
    }
    
    // Find game by race key and end it
    for (const [sessionId, game] of gameSession.games) {
      if (game.raceKey === raceKey) {
        const results = game.players.map((player, index) => ({
          platformId: player.platformId,
          position: index + 1,
          points: Math.max(100 - (index * 20), 10)
        }));
        
        gameSession.endGame(sessionId, results);
        console.log(`🏁 Game ended: Session ${sessionId} with results`);
        break;
      }
    }
  } catch (error) {
    console.error('❌ Error processing points:', error.message);
  }
  
  // Generate realistic response based on dumps
  const totalPoints = playerData ? playerData.points : Math.floor(Math.random() * 5000) + 1000;
  const userID = Math.floor(Math.random() * 1000000) + 100000;
  const rank = Math.max(1, Math.floor(totalPoints / 100));
  const division = Math.min(6, Math.floor(rank / 10));
  
  const response = `<AddPointsResult xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
    <BonusPoints>0</BonusPoints>
    <Error i:nil="true"/>
    <GameConfigChanged>false</GameConfigChanged>
    <NewDivision>${division}</NewDivision>
    <NewSeason>45</NewSeason>
    <OldDivision>${division}</OldDivision>
    <OldSeason>45</OldSeason>
    <Points>${totalPoints}</Points>
    <Rank>${rank}</Rank>
    <UserID>${userID}</UserID>
  </AddPointsResult>`;
  
  res.set('Content-Type', 'application/xml');
  res.send(response);
});

app.post('/MMCOS/MMCOS-Account/AccountService\.svc/Login_OLD', (req, res) => {
  const xml = `<LoginDetails
  xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <Error i:nil="true"/>
  <GameConfigurationData>
    <CurrentEvent>
      <CurrentEvent>
        <BackgroundImageURL>https://localhost/static/background.png</BackgroundImageURL>
        <ButtonImageURL>https://localhost/static/button.png</ButtonImageURL>
        <DescriptionLocString>lng_event_chaos_desc</DescriptionLocString>
        <DevName>test2</DevName>
        <EventID>2</EventID>
        <PlaylistID>15</PlaylistID>
        <PrizeCode>Boxes:1:test2</PrizeCode>
        <TitleLocString>lng_event_chaos_title</TitleLocString>
      </CurrentEvent>
      <Error i:nil="true"/>
      <NextEvent>2023-12-16T00:00:00Z</NextEvent>
    </CurrentEvent>
    <DivisionBands>
      <Entries>
        <DivisionBandEntry>
          <BonusPoints>0</BonusPoints>
          <DivisionID>0</DivisionID>
          <MinPoints>0</MinPoints>
          <PromotionPrizeCode>Boxes:1:</PromotionPrizeCode>
          <RelegationMinPoints>0</RelegationMinPoints>
        </DivisionBandEntry>
        <DivisionBandEntry>
          <BonusPoints>0</BonusPoints>
          <DivisionID>1</DivisionID>
          <MinPoints>500</MinPoints>
          <PromotionPrizeCode>Boxes:1:</PromotionPrizeCode>
          <RelegationMinPoints>0</RelegationMinPoints>
        </DivisionBandEntry>
        <DivisionBandEntry>
          <BonusPoints>100</BonusPoints>
          <DivisionID>2</DivisionID>
          <MinPoints>1000</MinPoints>
          <PromotionPrizeCode>Boxes:1:</PromotionPrizeCode>
          <RelegationMinPoints>750</RelegationMinPoints>
        </DivisionBandEntry>
        <DivisionBandEntry>
          <BonusPoints>250</BonusPoints>
          <DivisionID>3</DivisionID>
          <MinPoints>1500</MinPoints>
          <PromotionPrizeCode>Boxes:1:</PromotionPrizeCode>
          <RelegationMinPoints>1250</RelegationMinPoints>
        </DivisionBandEntry>
        <DivisionBandEntry>
          <BonusPoints>500</BonusPoints>
          <DivisionID>4</DivisionID>
          <MinPoints>2000</MinPoints>
          <PromotionPrizeCode>Boxes:1:</PromotionPrizeCode>
          <RelegationMinPoints>1750</RelegationMinPoints>
        </DivisionBandEntry>
        <DivisionBandEntry>
          <BonusPoints>750</BonusPoints>
          <DivisionID>5</DivisionID>
          <MinPoints>2500</MinPoints>
          <PromotionPrizeCode>Boxes:1:</PromotionPrizeCode>
          <RelegationMinPoints>2250</RelegationMinPoints>
        </DivisionBandEntry>
        <DivisionBandEntry>
          <BonusPoints>750</BonusPoints>
          <DivisionID>6</DivisionID>
          <MinPoints>3000</MinPoints>
          <PromotionPrizeCode>Unlock:0:player_title_elite</PromotionPrizeCode>
          <RelegationMinPoints>0</RelegationMinPoints>
        </DivisionBandEntry>
      </Entries>
    </DivisionBands>
    <DivisionPrizes>
      <Entries>
        <DivisionPrizeEntry>
          <DivisionID>0</DivisionID>
          <PrizeCode>Boxes:1:</PrizeCode>
        </DivisionPrizeEntry>
        <DivisionPrizeEntry>
          <DivisionID>1</DivisionID>
          <PrizeCode>Boxes:1:</PrizeCode>
        </DivisionPrizeEntry>
        <DivisionPrizeEntry>
          <DivisionID>2</DivisionID>
          <PrizeCode>Boxes:2:</PrizeCode>
        </DivisionPrizeEntry>
        <DivisionPrizeEntry>
          <DivisionID>3</DivisionID>
          <PrizeCode>Boxes:1:</PrizeCode>
        </DivisionPrizeEntry>
        <DivisionPrizeEntry>
          <DivisionID>4</DivisionID>
          <PrizeCode>Boxes:3:</PrizeCode>
        </DivisionPrizeEntry>
        <DivisionPrizeEntry>
          <DivisionID>5</DivisionID>
          <PrizeCode>Boxes:5:</PrizeCode>
        </DivisionPrizeEntry>
        <DivisionPrizeEntry>
          <DivisionID>6</DivisionID>
          <PrizeCode>Boxes:1:</PrizeCode>
        </DivisionPrizeEntry>
        <DivisionPrizeEntry>
          <DivisionID>7</DivisionID>
          <PrizeCode>Boxes:1:</PrizeCode>
        </DivisionPrizeEntry>
        <DivisionPrizeEntry>
          <DivisionID>8</DivisionID>
          <PrizeCode>Boxes:1:</PrizeCode>
        </DivisionPrizeEntry>
        <DivisionPrizeEntry>
          <DivisionID>9</DivisionID>
          <PrizeCode>Boxes:1:</PrizeCode>
        </DivisionPrizeEntry>
        <DivisionPrizeEntry>
          <DivisionID>10</DivisionID>
          <PrizeCode>Boxes:1:</PrizeCode>
        </DivisionPrizeEntry>
      </Entries>
    </DivisionPrizes>
    <Error i:nil="true"/>
    <Hash>-1647532852</Hash>
    <NextActiveSeasonDate>2023-11-01T00:00:00Z</NextActiveSeasonDate>
    <NextInactiveSeasonDate>2023-10-15T00:00:00Z</NextInactiveSeasonDate>
    <Playlists>
      <Error i:nil="true"/>
      <Playlists>
        <Playlist>
          <GameModes
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>elimination</a:string>
          </GameModes>
          <Levels
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>track_grdn_a</a:string>
            <a:string>track_grom_a</a:string>
            <a:string>track_grom_b</a:string>
            <a:string>track_kchn_a</a:string>
            <a:string>track_kchn_b</a:string>
            <a:string>track_kchn_c</a:string>
            <a:string>track_schl_a</a:string>
            <a:string>track_tyrm_a</a:string>
            <a:string>track_wksp_a</a:string>
          </Levels>
          <Mutators>
            <PlaylistMutator>
              <Name>EliminationAirstrike</Name>
              <Parameter1>0</Parameter1>
              <Parameter2>0</Parameter2>
            </PlaylistMutator>
          </Mutators>
          <Name>Ranked Play Elimination</Name>
          <PlaylistID>12</PlaylistID>
          <SubType>elimination</SubType>
          <Type>ranked</Type>
          <Vehicles
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>Ambulance</a:string>
            <a:string>DumpTruck</a:string>
            <a:string>FireTruck</a:string>
            <a:string>FutureSportsCar</a:string>
            <a:string>GIJoeHiss</a:string>
            <a:string>GIJoeMobat</a:string>
            <a:string>HotRod</a:string>
            <a:string>HoverCraft</a:string>
            <a:string>MonsterTruck</a:string>
            <a:string>PoliceCar</a:string>
            <a:string>SnowTracker</a:string>
            <a:string>SpyCar</a:string>
          </Vehicles>
        </Playlist>
        <Playlist>
          <GameModes
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>ctf</a:string>
            <a:string>bomb</a:string>
            <a:string>territory</a:string>
            <a:string>race</a:string>
            <a:string>elimination</a:string>
          </GameModes>
          <Levels
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>arena_grdn_a</a:string>
            <a:string>arena_grdn_b</a:string>
            <a:string>arena_grdn_c</a:string>
            <a:string>arena_grdn_d</a:string>
            <a:string>arena_grom_a</a:string>
            <a:string>arena_grom_b</a:string>
            <a:string>arena_kchn_a</a:string>
            <a:string>arena_schl_a</a:string>
            <a:string>arena_schl_b</a:string>
            <a:string>arena_tyrm_a</a:string>
            <a:string>arena_tyrm_b</a:string>
            <a:string>arena_wksp_a</a:string>
            <a:string>arena_wksp_b</a:string>
            <a:string>arena_wksp_c</a:string>
            <a:string>arena_wksp_d</a:string>
            <a:string>track_grdn_a</a:string>
            <a:string>track_grom_a</a:string>
            <a:string>track_grom_b</a:string>
            <a:string>track_kchn_a</a:string>
            <a:string>track_kchn_b</a:string>
            <a:string>track_kchn_c</a:string>
            <a:string>track_schl_a</a:string>
            <a:string>track_tyrm_a</a:string>
            <a:string>track_wksp_a</a:string>
          </Levels>
          <Mutators>
            <PlaylistMutator>
              <Name>XpModifier</Name>
              <Parameter1>1.5</Parameter1>
              <Parameter2>0</Parameter2>
            </PlaylistMutator>
          </Mutators>
          <Name>Ranked Play Random</Name>
          <PlaylistID>13</PlaylistID>
          <SubType>random</SubType>
          <Type>ranked</Type>
          <Vehicles
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>Ambulance</a:string>
            <a:string>DumpTruck</a:string>
            <a:string>FireTruck</a:string>
            <a:string>FutureSportsCar</a:string>
            <a:string>GIJoeHiss</a:string>
            <a:string>GIJoeMobat</a:string>
            <a:string>HotRod</a:string>
            <a:string>HoverCraft</a:string>
            <a:string>MonsterTruck</a:string>
            <a:string>PoliceCar</a:string>
            <a:string>SnowTracker</a:string>
            <a:string>SpyCar</a:string>
          </Vehicles>
        </Playlist>
        <Playlist>
          <GameModes
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>ctf</a:string>
            <a:string>bomb</a:string>
            <a:string>territory</a:string>
            <a:string>race</a:string>
            <a:string>elimination</a:string>
          </GameModes>
          <Levels
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>arena_grdn_a</a:string>
            <a:string>arena_grdn_b</a:string>
            <a:string>arena_grdn_c</a:string>
            <a:string>arena_grdn_d</a:string>
            <a:string>arena_grom_a</a:string>
            <a:string>arena_grom_b</a:string>
            <a:string>arena_kchn_a</a:string>
            <a:string>arena_schl_a</a:string>
            <a:string>arena_schl_b</a:string>
            <a:string>arena_tyrm_a</a:string>
            <a:string>arena_tyrm_b</a:string>
            <a:string>arena_wksp_a</a:string>
            <a:string>arena_wksp_b</a:string>
            <a:string>arena_wksp_c</a:string>
            <a:string>arena_wksp_d</a:string>
            <a:string>track_grdn_a</a:string>
            <a:string>track_grom_a</a:string>
            <a:string>track_grom_b</a:string>
            <a:string>track_kchn_a</a:string>
            <a:string>track_kchn_b</a:string>
            <a:string>track_kchn_c</a:string>
            <a:string>track_schl_a</a:string>
            <a:string>track_tyrm_a</a:string>
            <a:string>track_wksp_a</a:string>
          </Levels>
          <Mutators>
            <PlaylistMutator>
              <Name>XpModifier</Name>
              <Parameter1>1.5</Parameter1>
              <Parameter2>0</Parameter2>
            </PlaylistMutator>
          </Mutators>
          <Name>Quick Play Random</Name>
          <PlaylistID>14</PlaylistID>
          <SubType>random</SubType>
          <Type>quick</Type>
          <Vehicles
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>Ambulance</a:string>
            <a:string>DumpTruck</a:string>
            <a:string>FireTruck</a:string>
            <a:string>FutureSportsCar</a:string>
            <a:string>GIJoeHiss</a:string>
            <a:string>GIJoeMobat</a:string>
            <a:string>HotRod</a:string>
            <a:string>HoverCraft</a:string>
            <a:string>MonsterTruck</a:string>
            <a:string>PoliceCar</a:string>
            <a:string>SnowTracker</a:string>
            <a:string>SpyCar</a:string>
          </Vehicles>
        </Playlist>
        <Playlist>
          <GameModes
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>race</a:string>
          </GameModes>
          <Levels
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>track_grdn_a</a:string>
            <a:string>track_grom_a</a:string>
            <a:string>track_grom_b</a:string>
            <a:string>track_kchn_a</a:string>
            <a:string>track_kchn_b</a:string>
            <a:string>track_kchn_c</a:string>
            <a:string>track_schl_a</a:string>
            <a:string>track_tyrm_a</a:string>
            <a:string>track_wksp_a</a:string>
          </Levels>
          <Mutators/>
          <Name>Quick Play Race</Name>
          <PlaylistID>7</PlaylistID>
          <SubType>race</SubType>
          <Type>quick</Type>
          <Vehicles
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>Ambulance</a:string>
            <a:string>DumpTruck</a:string>
            <a:string>FireTruck</a:string>
            <a:string>FutureSportsCar</a:string>
            <a:string>GIJoeHiss</a:string>
            <a:string>GIJoeMobat</a:string>
            <a:string>HotRod</a:string>
            <a:string>HoverCraft</a:string>
            <a:string>MonsterTruck</a:string>
            <a:string>PoliceCar</a:string>
            <a:string>SnowTracker</a:string>
            <a:string>SpyCar</a:string>
          </Vehicles>
        </Playlist>
        <Playlist>
          <GameModes
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>elimination</a:string>
          </GameModes>
          <Levels
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>track_grdn_a</a:string>
            <a:string>track_grom_a</a:string>
            <a:string>track_grom_b</a:string>
            <a:string>track_kchn_a</a:string>
            <a:string>track_kchn_b</a:string>
            <a:string>track_kchn_c</a:string>
            <a:string>track_schl_a</a:string>
            <a:string>track_tyrm_a</a:string>
            <a:string>track_wksp_a</a:string>
          </Levels>
          <Mutators>
            <PlaylistMutator>
              <Name>EliminationAirstrike</Name>
              <Parameter1>0</Parameter1>
              <Parameter2>0</Parameter2>
            </PlaylistMutator>
          </Mutators>
          <Name>Quick Play Elimination</Name>
          <PlaylistID>8</PlaylistID>
          <SubType>elimination</SubType>
          <Type>quick</Type>
          <Vehicles
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>Ambulance</a:string>
            <a:string>DumpTruck</a:string>
            <a:string>FireTruck</a:string>
            <a:string>FutureSportsCar</a:string>
            <a:string>GIJoeHiss</a:string>
            <a:string>GIJoeMobat</a:string>
            <a:string>HotRod</a:string>
            <a:string>HoverCraft</a:string>
            <a:string>MonsterTruck</a:string>
            <a:string>PoliceCar</a:string>
            <a:string>SnowTracker</a:string>
            <a:string>SpyCar</a:string>
          </Vehicles>
        </Playlist>
        <Playlist>
          <GameModes
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>ctf</a:string>
            <a:string>bomb</a:string>
            <a:string>territory</a:string>
          </GameModes>
          <Levels
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>arena_grdn_a</a:string>
            <a:string>arena_grdn_b</a:string>
            <a:string>arena_grdn_c</a:string>
            <a:string>arena_grdn_d</a:string>
            <a:string>arena_grom_a</a:string>
            <a:string>arena_grom_b</a:string>
            <a:string>arena_kchn_a</a:string>
            <a:string>arena_schl_a</a:string>
            <a:string>arena_schl_b</a:string>
            <a:string>arena_tyrm_a</a:string>
            <a:string>arena_tyrm_b</a:string>
            <a:string>arena_wksp_a</a:string>
            <a:string>arena_wksp_b</a:string>
            <a:string>arena_wksp_c</a:string>
            <a:string>arena_wksp_d</a:string>
          </Levels>
          <Mutators/>
          <Name>Quick Play Battle</Name>
          <PlaylistID>9</PlaylistID>
          <SubType>battle</SubType>
          <Type>quick</Type>
          <Vehicles
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>Ambulance</a:string>
            <a:string>DumpTruck</a:string>
            <a:string>FireTruck</a:string>
            <a:string>FutureSportsCar</a:string>
            <a:string>GIJoeHiss</a:string>
            <a:string>GIJoeMobat</a:string>
            <a:string>HotRod</a:string>
            <a:string>HoverCraft</a:string>
            <a:string>MonsterTruck</a:string>
            <a:string>PoliceCar</a:string>
            <a:string>SnowTracker</a:string>
            <a:string>SpyCar</a:string>
          </Vehicles>
        </Playlist>
        <Playlist>
          <GameModes
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>ctf</a:string>
            <a:string>bomb</a:string>
            <a:string>territory</a:string>
          </GameModes>
          <Levels
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>arena_grdn_a</a:string>
            <a:string>arena_grdn_b</a:string>
            <a:string>arena_grdn_c</a:string>
            <a:string>arena_grdn_d</a:string>
            <a:string>arena_grom_a</a:string>
            <a:string>arena_grom_b</a:string>
            <a:string>arena_kchn_a</a:string>
            <a:string>arena_schl_a</a:string>
            <a:string>arena_schl_b</a:string>
            <a:string>arena_tyrm_a</a:string>
            <a:string>arena_tyrm_b</a:string>
            <a:string>arena_wksp_a</a:string>
            <a:string>arena_wksp_b</a:string>
            <a:string>arena_wksp_c</a:string>
            <a:string>arena_wksp_d</a:string>
          </Levels>
          <Mutators/>
          <Name>Ranked Play Battle</Name>
          <PlaylistID>10</PlaylistID>
          <SubType>battle</SubType>
          <Type>ranked</Type>
          <Vehicles
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>Ambulance</a:string>
            <a:string>DumpTruck</a:string>
            <a:string>FireTruck</a:string>
            <a:string>FutureSportsCar</a:string>
            <a:string>GIJoeHiss</a:string>
            <a:string>GIJoeMobat</a:string>
            <a:string>HotRod</a:string>
            <a:string>HoverCraft</a:string>
            <a:string>MonsterTruck</a:string>
            <a:string>PoliceCar</a:string>
            <a:string>SnowTracker</a:string>
            <a:string>SpyCar</a:string>
          </Vehicles>
        </Playlist>
        <Playlist>
          <GameModes
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>race</a:string>
          </GameModes>
          <Levels
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>track_grdn_a</a:string>
            <a:string>track_grom_a</a:string>
            <a:string>track_grom_b</a:string>
            <a:string>track_kchn_a</a:string>
            <a:string>track_kchn_b</a:string>
            <a:string>track_kchn_c</a:string>
            <a:string>track_schl_a</a:string>
            <a:string>track_tyrm_a</a:string>
            <a:string>track_wksp_a</a:string>
          </Levels>
          <Mutators/>
          <Name>Ranked Play Race</Name>
          <PlaylistID>11</PlaylistID>
          <SubType>race</SubType>
          <Type>ranked</Type>
          <Vehicles
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>Ambulance</a:string>
            <a:string>DumpTruck</a:string>
            <a:string>FireTruck</a:string>
            <a:string>FutureSportsCar</a:string>
            <a:string>GIJoeHiss</a:string>
            <a:string>GIJoeMobat</a:string>
            <a:string>HotRod</a:string>
            <a:string>HoverCraft</a:string>
            <a:string>MonsterTruck</a:string>
            <a:string>PoliceCar</a:string>
            <a:string>SnowTracker</a:string>
            <a:string>SpyCar</a:string>
          </Vehicles>
        </Playlist>
        <Playlist>
          <GameModes
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>race</a:string>
          </GameModes>
          <Levels
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>track_grdn_a</a:string>
          </Levels>
          <Mutators>
            <PlaylistMutator>
              <Name>XpModifier</Name>
              <Parameter1>1.5</Parameter1>
              <Parameter2>0</Parameter2>
            </PlaylistMutator>
          </Mutators>
          <Name>Special Event</Name>
          <PlaylistID>15</PlaylistID>
          <SubType>race</SubType>
          <Type>special</Type>
          <Vehicles
            xmlns:a="http://schemas.microsoft.com/2003/10/Serialization/Arrays">
            <a:string>Ambulance</a:string>
          </Vehicles>
        </Playlist>
      </Playlists>
    </Playlists>
    <RankBonus>
      <Entries>
        <RankBonusEntry>
          <BonusPoints>50</BonusPoints>
          <MinRank>10</MinRank>
        </RankBonusEntry>
        <RankBonusEntry>
          <BonusPoints>100</BonusPoints>
          <MinRank>100</MinRank>
        </RankBonusEntry>
        <RankBonusEntry>
          <BonusPoints>150</BonusPoints>
          <MinRank>1000</MinRank>
        </RankBonusEntry>
        <RankBonusEntry>
          <BonusPoints>0</BonusPoints>
          <MinRank>10000</MinRank>
        </RankBonusEntry>
      </Entries>
    </RankBonus>
    <RankPrizes>
      <Entries>
        <RankPrizeEntry>
          <MinRank>10</MinRank>
          <PrizeCode>Boxes:4:</PrizeCode>
        </RankPrizeEntry>
        <RankPrizeEntry>
          <MinRank>100</MinRank>
          <PrizeCode>Boxes:1:</PrizeCode>
        </RankPrizeEntry>
        <RankPrizeEntry>
          <MinRank>1000</MinRank>
          <PrizeCode>Boxes:1:</PrizeCode>
        </RankPrizeEntry>
        <RankPrizeEntry>
          <MinRank>10000</MinRank>
          <PrizeCode>Boxes:1:</PrizeCode>
        </RankPrizeEntry>
      </Entries>
    </RankPrizes>
    <RequestedDivision>0</RequestedDivision>
    <RequestedDivisionBands i:nil="true"/>
    <RequestedDivisionPrizes i:nil="true"/>
    <RequestedRank>0</RequestedRank>
    <RequestedRankBonus i:nil="true"/>
    <RequestedRankPrizes i:nil="true"/>
    <ScoringConstants>
      <Entries>
        <ScoringConstantEntry>
          <Name>SOLO_Pos8_OutOf9</Name>
          <Value>-40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos9_OutOf9</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos1_OutOf10</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos2_OutOf10</Name>
          <Value>40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos3_OutOf10</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos4_OutOf10</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos5_OutOf10</Name>
          <Value>10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos6_OutOf10</Name>
          <Value>-10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos7_OutOf10</Name>
          <Value>-20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos8_OutOf10</Name>
          <Value>-30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos9_OutOf10</Name>
          <Value>-40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos10_OutOf10</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos1_OutOf11</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos2_OutOf11</Name>
          <Value>40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos3_OutOf11</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos4_OutOf11</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos5_OutOf11</Name>
          <Value>10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos6_OutOf11</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos7_OutOf11</Name>
          <Value>-10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos8_OutOf11</Name>
          <Value>-20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos9_OutOf11</Name>
          <Value>-30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos10_OutOf11</Name>
          <Value>-40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos11_OutOf11</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos1_OutOf12</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos2_OutOf12</Name>
          <Value>50</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos3_OutOf12</Name>
          <Value>40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos4_OutOf12</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos5_OutOf12</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos6_OutOf12</Name>
          <Value>10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos7_OutOf12</Name>
          <Value>-10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos8_OutOf12</Name>
          <Value>-20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos9_OutOf12</Name>
          <Value>-30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos10_OutOf12</Name>
          <Value>-40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos11_OutOf12</Name>
          <Value>-50</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos12_OutOf12</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Streak</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Underdog</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Overpowered</Name>
          <Value>-20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_StreakPosition</Name>
          <Value>3</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_UnderdogPercentage</Name>
          <Value>90</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_OverpoweredPercentage</Name>
          <Value>110</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos1_OutOf2</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos2_OutOf2</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos1_OutOf3</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos2_OutOf3</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos3_OutOf3</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos1_OutOf4</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos2_OutOf4</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos3_OutOf4</Name>
          <Value>-30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos4_OutOf4</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos1_OutOf5</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos2_OutOf5</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos3_OutOf5</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos4_OutOf5</Name>
          <Value>-30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos5_OutOf5</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos1_OutOf6</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos2_OutOf6</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos3_OutOf6</Name>
          <Value>10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos4_OutOf6</Name>
          <Value>-10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos5_OutOf6</Name>
          <Value>-30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos6_OutOf6</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos1_OutOf7</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos2_OutOf7</Name>
          <Value>40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos3_OutOf7</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos4_OutOf7</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos5_OutOf7</Name>
          <Value>-20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos6_OutOf7</Name>
          <Value>-40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos7_OutOf7</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos1_OutOf8</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos2_OutOf8</Name>
          <Value>40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos3_OutOf8</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos4_OutOf8</Name>
          <Value>10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos5_OutOf8</Name>
          <Value>-10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos6_OutOf8</Name>
          <Value>-20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos7_OutOf8</Name>
          <Value>-40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos8_OutOf8</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos1_OutOf9</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos2_OutOf9</Name>
          <Value>40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos3_OutOf9</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos4_OutOf9</Name>
          <Value>10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos5_OutOf9</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos6_OutOf9</Name>
          <Value>-10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos7_OutOf9</Name>
          <Value>-20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos8_OutOf9</Name>
          <Value>-40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos9_OutOf9</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos1_OutOf10</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos2_OutOf10</Name>
          <Value>40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos3_OutOf10</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos4_OutOf10</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos5_OutOf10</Name>
          <Value>10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos6_OutOf10</Name>
          <Value>-10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos7_OutOf10</Name>
          <Value>-20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos8_OutOf10</Name>
          <Value>-30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos9_OutOf10</Name>
          <Value>-40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos10_OutOf10</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos1_OutOf11</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos2_OutOf11</Name>
          <Value>40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos3_OutOf11</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos4_OutOf11</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos5_OutOf11</Name>
          <Value>10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos6_OutOf11</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos7_OutOf11</Name>
          <Value>-10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos8_OutOf11</Name>
          <Value>-20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos9_OutOf11</Name>
          <Value>-30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos10_OutOf11</Name>
          <Value>-40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos11_OutOf11</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos1_OutOf12</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos2_OutOf12</Name>
          <Value>50</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos3_OutOf12</Name>
          <Value>40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos4_OutOf12</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos5_OutOf12</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos6_OutOf12</Name>
          <Value>10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos7_OutOf12</Name>
          <Value>-10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos8_OutOf12</Name>
          <Value>-20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos9_OutOf12</Name>
          <Value>-30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos10_OutOf12</Name>
          <Value>-40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos11_OutOf12</Name>
          <Value>-50</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Pos12_OutOf12</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Streak</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Underdog</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_SKILLPOINTS_Overpowered</Name>
          <Value>-20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos1_OutOf2</Name>
          <Value>1000</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos2_OutOf2</Name>
          <Value>500</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos1_OutOf3</Name>
          <Value>1000</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos2_OutOf3</Name>
          <Value>750</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos3_OutOf3</Name>
          <Value>500</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos1_OutOf4</Name>
          <Value>1000</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos2_OutOf4</Name>
          <Value>800</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos3_OutOf4</Name>
          <Value>700</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos4_OutOf4</Name>
          <Value>500</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos1_OutOf5</Name>
          <Value>1000</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos2_OutOf5</Name>
          <Value>800</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos3_OutOf5</Name>
          <Value>700</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos4_OutOf5</Name>
          <Value>600</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos5_OutOf5</Name>
          <Value>500</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos1_OutOf6</Name>
          <Value>1000</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos2_OutOf6</Name>
          <Value>900</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos3_OutOf6</Name>
          <Value>800</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos4_OutOf6</Name>
          <Value>700</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos5_OutOf6</Name>
          <Value>600</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos6_OutOf6</Name>
          <Value>500</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos1_OutOf7</Name>
          <Value>1000</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos2_OutOf7</Name>
          <Value>900</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos3_OutOf7</Name>
          <Value>800</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos4_OutOf7</Name>
          <Value>750</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos5_OutOf7</Name>
          <Value>700</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos6_OutOf7</Name>
          <Value>600</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos7_OutOf7</Name>
          <Value>500</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos1_OutOf8</Name>
          <Value>1000</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos2_OutOf8</Name>
          <Value>900</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos3_OutOf8</Name>
          <Value>800</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos4_OutOf8</Name>
          <Value>750</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos5_OutOf8</Name>
          <Value>700</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos6_OutOf8</Name>
          <Value>650</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos7_OutOf8</Name>
          <Value>600</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos8_OutOf8</Name>
          <Value>500</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos1_OutOf9</Name>
          <Value>1000</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos2_OutOf9</Name>
          <Value>900</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos3_OutOf9</Name>
          <Value>850</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos4_OutOf9</Name>
          <Value>800</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos5_OutOf9</Name>
          <Value>750</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos6_OutOf9</Name>
          <Value>700</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos7_OutOf9</Name>
          <Value>650</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos8_OutOf9</Name>
          <Value>600</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos9_OutOf9</Name>
          <Value>500</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos1_OutOf10</Name>
          <Value>1000</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos2_OutOf10</Name>
          <Value>900</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos3_OutOf10</Name>
          <Value>850</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos4_OutOf10</Name>
          <Value>800</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos5_OutOf10</Name>
          <Value>750</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos6_OutOf10</Name>
          <Value>700</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos7_OutOf10</Name>
          <Value>650</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos8_OutOf10</Name>
          <Value>600</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos9_OutOf10</Name>
          <Value>550</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos10_OutOf10</Name>
          <Value>500</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos1_OutOf11</Name>
          <Value>1000</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos2_OutOf11</Name>
          <Value>950</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos3_OutOf11</Name>
          <Value>900</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos4_OutOf11</Name>
          <Value>850</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos5_OutOf11</Name>
          <Value>800</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos6_OutOf11</Name>
          <Value>753</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos7_OutOf11</Name>
          <Value>700</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos8_OutOf11</Name>
          <Value>650</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos9_OutOf11</Name>
          <Value>600</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos10_OutOf11</Name>
          <Value>550</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos11_OutOf11</Name>
          <Value>500</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos1_OutOf12</Name>
          <Value>1000</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos2_OutOf12</Name>
          <Value>950</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos3_OutOf12</Name>
          <Value>900</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos4_OutOf12</Name>
          <Value>850</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos5_OutOf12</Name>
          <Value>800</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos6_OutOf12</Name>
          <Value>750</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos7_OutOf12</Name>
          <Value>700</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos8_OutOf12</Name>
          <Value>650</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos9_OutOf12</Name>
          <Value>600</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos10_OutOf12</Name>
          <Value>550</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos11_OutOf12</Name>
          <Value>500</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_Pos12_OutOf12</Name>
          <Value>500</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_XP_PerSecond</Name>
          <Value>1</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_MatchmakingTimeout_Hard</Name>
          <Value>180</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowLosingPoints_Division_0</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowLosingPoints_Division_1</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowLosingPoints_Division_2</Name>
          <Value>1</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowLosingPoints_Division_3</Name>
          <Value>1</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowLosingPoints_Division_4</Name>
          <Value>1</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowLosingPoints_Division_5</Name>
          <Value>1</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowLosingPoints_Division_6</Name>
          <Value>1</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowLosingPoints_Division_7</Name>
          <Value>1</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowLosingPoints_Division_8</Name>
          <Value>1</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowLosingPoints_Division_9</Name>
          <Value>1</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowLosingPoints_Division_10</Name>
          <Value>1</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowStreaks_Division_0</Name>
          <Value>1</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowStreaks_Division_1</Name>
          <Value>1</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowStreaks_Division_2</Name>
          <Value>1</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowStreaks_Division_3</Name>
          <Value>1</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowStreaks_Division_4</Name>
          <Value>1</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowStreaks_Division_5</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowStreaks_Division_6</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowStreaks_Division_7</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowStreaks_Division_8</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowStreaks_Division_9</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_AllowStreaks_Division_10</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_WinStreakCount</Name>
          <Value>3</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_SKILLPOINTS_StreakCount</Name>
          <Value>3</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_XP_FirstPlay</Name>
          <Value>1000</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_Bucket_0_max</Name>
          <Value>100</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_Bucket_1_max</Name>
          <Value>300</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_Bucket_2_max</Name>
          <Value>800</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_Bucket_3_max</Name>
          <Value>1200</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_SKILLPOINTS_Bucket_0_max</Name>
          <Value>100</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_SKILLPOINTS_Bucket_1_max</Name>
          <Value>300</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_SKILLPOINTS_Bucket_2_max</Name>
          <Value>800</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>GENERIC_SKILLPOINTS_Bucket_3_max</Name>
          <Value>1200</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_CompletedMatch_Division_0</Name>
          <Value>40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_CompletedMatch_Division_1</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_CompletedMatch_Division_2</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_CompletedMatch_Division_3</Name>
          <Value>10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_CompletedMatch_Division_4</Name>
          <Value>10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_CompletedMatch_Division_5</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_CompletedMatch_Division_6</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_CompletedMatch_Division_7</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_CompletedMatch_Division_8</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_CompletedMatch_Division_9</Name>
          <Value>3</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_CompletedMatch_Division_10</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_Win</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_Loss</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_Streak</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_Underdog</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_Overpowered</Name>
          <Value>-20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_UnderdogPercentage</Name>
          <Value>90</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_SKILLPOINTS_Win</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_SKILLPOINTS_Loss</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_SKILLPOINTS_Streak</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_SKILLPOINTS_Underdog</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_SKILLPOINTS_Overpowered</Name>
          <Value>-20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_XP_Win</Name>
          <Value>1000</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_XP_Loss</Name>
          <Value>500</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>TEAM_XP_PerSecond</Name>
          <Value>1</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_CompletedMatch_Division_0</Name>
          <Value>40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_CompletedMatch_Division_1</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_CompletedMatch_Division_2</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_CompletedMatch_Division_3</Name>
          <Value>10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_CompletedMatch_Division_4</Name>
          <Value>10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_CompletedMatch_Division_5</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_CompletedMatch_Division_6</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_CompletedMatch_Division_7</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_CompletedMatch_Division_8</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_CompletedMatch_Division_9</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_CompletedMatch_Division_10</Name>
          <Value>15</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Pos1_OutOf2</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Pos2_OutOf2</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Pos1_OutOf3</Name>
          <Value>42</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Pos2_OutOf3</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Pos3_OutOf3</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Pos1_OutOf4</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Pos2_OutOf4</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Pos3_OutOf4</Name>
          <Value>-30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Pos4_OutOf4</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Pos1_OutOf5</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Pos2_OutOf5</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Pos3_OutOf5</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Pos4_OutOf5</Name>
          <Value>-30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Pos5_OutOf5</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Pos1_OutOf6</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Pos2_OutOf6</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Pos3_OutOf6</Name>
          <Value>10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Pos4_OutOf6</Name>
          <Value>-10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Pos5_OutOf6</Name>
          <Value>-30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Pos6_OutOf6</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Streak</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Underdog</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_Overpowered</Name>
          <Value>-20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_StreakPosition</Name>
          <Value>2</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_UnderdogPercentage</Name>
          <Value>90</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_OverpoweredPercentage</Name>
          <Value>110</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Pos1_OutOf2</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Pos2_OutOf2</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Pos1_OutOf3</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Pos2_OutOf3</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Pos3_OutOf3</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Pos1_OutOf4</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Pos2_OutOf4</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Pos3_OutOf4</Name>
          <Value>-30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Pos4_OutOf4</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Pos1_OutOf5</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Pos2_OutOf5</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Pos3_OutOf5</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Pos4_OutOf5</Name>
          <Value>-30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Pos5_OutOf5</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Pos1_OutOf6</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Pos2_OutOf6</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Pos3_OutOf6</Name>
          <Value>10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Pos4_OutOf6</Name>
          <Value>-10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Pos5_OutOf6</Name>
          <Value>-30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Pos6_OutOf6</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Streak</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Underdog</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_SKILLPOINTS_Overpowered</Name>
          <Value>-20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_Pos1_OutOf2</Name>
          <Value>1000</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_Pos2_OutOf2</Name>
          <Value>488</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_Pos1_OutOf3</Name>
          <Value>1000</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_Pos2_OutOf3</Name>
          <Value>750</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_Pos3_OutOf3</Name>
          <Value>500</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_Pos1_OutOf4</Name>
          <Value>1000</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_Pos2_OutOf4</Name>
          <Value>800</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_Pos3_OutOf4</Name>
          <Value>700</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_Pos4_OutOf4</Name>
          <Value>500</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_Pos1_OutOf5</Name>
          <Value>1000</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_Pos2_OutOf5</Name>
          <Value>800</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_Pos3_OutOf5</Name>
          <Value>700</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_Pos4_OutOf5</Name>
          <Value>600</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_Pos5_OutOf5</Name>
          <Value>500</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_Pos1_OutOf6</Name>
          <Value>1000</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_Pos2_OutOf6</Name>
          <Value>900</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_Pos3_OutOf6</Name>
          <Value>800</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_Pos4_OutOf6</Name>
          <Value>700</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_Pos5_OutOf6</Name>
          <Value>600</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_Pos6_OutOf6</Name>
          <Value>500</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>ELIM_XP_PerSecond</Name>
          <Value>1</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_CompletedMatch_Division_0</Name>
          <Value>40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_CompletedMatch_Division_1</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_CompletedMatch_Division_2</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_CompletedMatch_Division_3</Name>
          <Value>10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_CompletedMatch_Division_4</Name>
          <Value>10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_CompletedMatch_Division_5</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_CompletedMatch_Division_6</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_CompletedMatch_Division_7</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_CompletedMatch_Division_8</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_CompletedMatch_Division_9</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_CompletedMatch_Division_10</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos1_OutOf2</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos2_OutOf2</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos1_OutOf3</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos2_OutOf3</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos3_OutOf3</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos1_OutOf4</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos2_OutOf4</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos3_OutOf4</Name>
          <Value>-30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos4_OutOf4</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos1_OutOf5</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos2_OutOf5</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos3_OutOf5</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos4_OutOf5</Name>
          <Value>-30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos5_OutOf5</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos1_OutOf6</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos2_OutOf6</Name>
          <Value>30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos3_OutOf6</Name>
          <Value>10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos4_OutOf6</Name>
          <Value>-10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos5_OutOf6</Name>
          <Value>-30</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos6_OutOf6</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos1_OutOf7</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos2_OutOf7</Name>
          <Value>40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos3_OutOf7</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos4_OutOf7</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos5_OutOf7</Name>
          <Value>-20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos6_OutOf7</Name>
          <Value>-40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos7_OutOf7</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos1_OutOf8</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos2_OutOf8</Name>
          <Value>40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos3_OutOf8</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos4_OutOf8</Name>
          <Value>10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos5_OutOf8</Name>
          <Value>-10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos6_OutOf8</Name>
          <Value>-20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos7_OutOf8</Name>
          <Value>-40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos8_OutOf8</Name>
          <Value>-60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos1_OutOf9</Name>
          <Value>60</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos2_OutOf9</Name>
          <Value>40</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos3_OutOf9</Name>
          <Value>20</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos4_OutOf9</Name>
          <Value>10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos5_OutOf9</Name>
          <Value>0</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos6_OutOf9</Name>
          <Value>-10</Value>
        </ScoringConstantEntry>
        <ScoringConstantEntry>
          <Name>SOLO_Pos7_OutOf9</Name>
          <Value>-20</Value>
        </ScoringConstantEntry>
      </Entries>
    </ScoringConstants>
    <ServerValues>
      <Entries>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin1Available_Steam</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin2Available_Steam</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin3Available_Steam</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin4Available_Steam</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin5Available_Steam</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin6Available_Steam</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin1Available_PS4_SCEE</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin2Available_PS4_SCEE</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin3Available_PS4_SCEE</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin4Available_PS4_SCEE</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin5Available_PS4_SCEE</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin6Available_PS4_SCEE</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin1Available_PS4_SCEA</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin2Available_PS4_SCEA</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin3Available_PS4_SCEA</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin4Available_PS4_SCEA</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin5Available_PS4_SCEA</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin6Available_PS4_SCEA</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin1Available_XboxOne</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin2Available_XboxOne</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin3Available_XboxOne</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin4Available_XboxOne</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin5Available_XboxOne</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>false</Const>
          <Name>Config_DLCSkin6Available_XboxOne</Name>
          <Value>0</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>true</Const>
          <Name>Config_MatchmakingTimeout_Soft</Name>
          <Value>70</Value>
        </GameConfigEntry>
        <GameConfigEntry>
          <Const>true</Const>
          <Name>Config_MatchmakingTimeout_Hard</Name>
          <Value>70</Value>
        </GameConfigEntry>
      </Entries>
    </ServerValues>
  </GameConfigurationData>
  <GameInfo>
    <ScoreInfo>
      <CurrentSeasonID>45</CurrentSeasonID>
      <Division>6</Division>
      <Error i:nil="true"/>
      <PlayerSeasonID>45</PlayerSeasonID>
      <Points>3540</Points>
      <Rank>32</Rank>
      <UntrustedLevel>33</UntrustedLevel>
      <UntrustedPrestige>8</UntrustedPrestige>
    </ScoreInfo>
    <SeasonInfo>
      <BonusPoints>0</BonusPoints>
      <DisplayOffset>0</DisplayOffset>
      <IsSeasonActive>true</IsSeasonActive>
      <NewSeasonID>45</NewSeasonID>
      <OldSeasonID>45</OldSeasonID>
    </SeasonInfo>
  </GameInfo>
  <PlatformID>76561198081105540</PlatformID>
  <ServerTime i:nil="true"/>
  <SessionToken>AQAAAAIAAADKOgoAAAAAAOw1pngEt9tIATLqwyf7IzOwmSnBmY+d01mjfBYhXK522MAR9euYs4IIeCHpu4qjubwYGrHvAenTmsS5nGbzNN/EqeMjj4BExxBO8/2Gc+qXYqMeiIKhjd4/Sfc6Eh4QC5PWnPxyh7uDF/S7tOc8FKiY76QRDK9YowHPP35hrXOnAqLesExPLgyorLA/PoVQHVUDdsNaNMrd9/QGjAddvZjVH2XbR7mxwUFAeeVKByNriqqDbKBgA1X2EiRmSPUuHGR4OQhQFhRZgwa0IYgzHK+KzVU6UDxgRicfmWq1etOXCh0sgdujivHnBSkxBvmSacClH4/4iGhXIywUUgVlBY3j/byC3z6qETE=</SessionToken>
  <UserFacingID>J7W76GCH8FJKA</UserFacingID>
  <UserID>670410</UserID>
</LoginDetails>
`
  res.send(xml);
})

app.post('/MMCOS/MMCOS-Account/AccountService\.svc/UpdateAccountTitle', (req, res) => {
  // Debug endpoint - request received
})

// Start HTTP server (port 80)
http.createServer(app).listen(80, () => {
  const lanIP = getLocalIP();
  console.log(`🌐 MMCOS Server listening on HTTP port 80 (${lanIP})`);
});

// Start HTTPS server (for production)
try {
  const options = {
    key: fs.readFileSync('./ssl/key.pem'),
    cert: fs.readFileSync('./ssl/cert.pem'),
  };
  
  https.createServer(options, app).listen(443, () => {
    const lanIP = getLocalIP();
    
    console.log('========================================');
    console.log('🔒 MMCOS Community Server ONLINE (HTTPS)');
    console.log('   Micro Machines World Series Revival');
    console.log('========================================');
    console.log(`🌐 HTTP Server: http://${lanIP}:80`);
    console.log(`🔐 HTTPS Server: https://${lanIP}:443`);
    console.log(`🎮 Admin Dashboard: http://${lanIP}/admin`);
    console.log('');
    console.log(`📡 Network Access:`);
    console.log(`   Local: http://localhost/admin`);
    console.log(`   LAN: http://${lanIP}/admin`);
    console.log('');
    console.log('🎲 Features:');
    console.log('  • ✅ Automatic game creation');
    console.log('  • ✅ First player becomes host/admin');
    console.log('  • ✅ Smart matchmaking (join existing games first)');
    console.log('  • ✅ Player session management');
    console.log('  • ✅ Points and leaderboard system');
    console.log('  • ✅ Real-time admin dashboard');

    console.log('');
    console.log('🔧 Client Setup:');
    console.log('   Windows: C:\\Windows\\System32\\drivers\\etc\\hosts');
    console.log('   Add these lines:');
    console.log(`   ${lanIP} mmcos.codemasters.com`);
    console.log(`   ${lanIP} prod.egonet.codemasters.com`);
    console.log(`   ${lanIP} ecdn.codemasters.com`);
    console.log('');
    console.log('========================================');
  });
} catch (error) {
  const lanIP = getLocalIP();
  console.warn('⚠️  Could not start HTTPS server:', error.message);
  console.log(`HTTP server is running on port 80 (${lanIP})`);
}

} // End of initializeServer function
