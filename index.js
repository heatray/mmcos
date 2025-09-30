const express = require('express');
const xmlparser = require('express-xml-bodyparser');
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

// Convert raw buffer to string for XML processing
app.use((req, res, next) => {
    if (req.headers['content-type'] && 
        req.headers['content-type'].includes('egonet-stream')) {
        try {
            if (Buffer.isBuffer(req.body)) {
                req.body = req.body.toString('utf8');
                console.log('MMCOS Request:', req.headers['x-egonet-function']);
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
  // Debug endpoint - request received
})

app.get('/MMCOS/redirect_steam_submission[1-3]\.txt', (req, res) => {
  res.send('Live')
})

app.get('/MMCOS/MMCOS-ServerStatus/ServerStatus\.xml', (req, res) => {
  res.send(`
<OnlineServiceStatus>

  <Message display="false" localize="false">
    Server is up!
  </Message>

  <ServerStatus accessible="true"/>
  <Egonet enabled="true"/>

</OnlineServiceStatus>
`)
})

app.post('/MMCOS/MMCOS-Account/AccountService\\.svc/Login', (req, res) => {
  console.log('🔐 Login request from:', req.ip);
  
  // Extract data from request
  const platformId = req.body.login?.platformid?.[0] || "76561198081105540";
  const displayName = req.body.login?.displayname?.[0] || "Player";
  const userId = Math.floor(Math.random() * 1000000);
  
  console.log(`✅ User logged in: ${displayName} (${platformId.substring(0, 20)}...)`);
  
  // Register player in game session
  const player = gameSession.registerPlayer(platformId, displayName);
  
  // Generate authentic response
  const loginResponse = generateLoginResponse(platformId, displayName, userId);
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
  console.log('🎯 EnterMatchmaking2 request');
  
  // Extract all important fields from request
  const sessionToken = req.body.entermatchmaking2?.sessiontoken?.[0];
  const groupLobbyId = req.body.entermatchmaking2?.grouplobbyid?.[0];
  const gameLobbyId = req.body.entermatchmaking2?.gamelobbyid?.[0];
  const networkVersion = req.body.entermatchmaking2?.networkversion?.[0] || '1';
  const gameType = req.body.entermatchmaking2?.gametype?.[0] || 'RankedRace';
  const requestedGroupSize = req.body.entermatchmaking2?.groupsize?.[0] || '1';
  const skillLevel = req.body.entermatchmaking2?.skilllevel?.[0] || '1000000';
  const ruleSet = req.body.entermatchmaking2?.ruleset?.[0] || 'Race';
  const ranking = req.body.entermatchmaking2?.ranking?.[0] || 'NotRanked';
  const ignoreMinRequirements = req.body.entermatchmaking2?.ignoreminimummatchrequirements?.[0] || 'false';
  
  console.log(`🎮 Matchmaking request: ${gameType}/${ruleSet}/${ranking}, Group: ${requestedGroupSize}, Skill: ${skillLevel}`);
  
  // Try to identify player by session token, fallback to IP-based ID
  let platformId;
  if (sessionToken) {
    // Simple session token mapping (in production, decode properly)
    platformId = `steam_${sessionToken.substring(0, 16)}`;
  } else {
    // Use IP address to create consistent player ID for same client
    const clientIp = req.ip.replace(/[^a-zA-Z0-9]/g, '_');
    platformId = `player_${clientIp}`;
  }
  
  // Register player if not exists
  if (!gameSession.getPlayer(platformId)) {
    gameSession.registerPlayer(platformId, `Player_${platformId.substring(7, 15)}`, sessionToken);
    console.log(`🎮 Player registered: Player_${platformId.substring(7, 15)} (${platformId})`);
  }
  
  let game;
  let isHost = false;
  
  // Check if player is already in a game
  const existingPlayer = gameSession.getPlayer(platformId);
  if (existingPlayer && existingPlayer.currentGameId) {
    const existingGame = gameSession.games.get(existingPlayer.currentGameId);
    if (existingGame && existingGame.status === 'waiting') {
      // Return existing game info
      console.log(`🔄 Player reconnecting to existing game: Session ${existingGame.sessionId}`);
      game = existingGame;
    } else {
      // Clear stale game reference
      existingPlayer.currentGameId = null;
    }
  }
  
  // Only do matchmaking if player doesn't have an existing game
  if (!game) {
    try {
      // Try to find existing game to join
      const availableGames = gameSession.getAvailableGames(gameType, ranking);
      
      if (availableGames.length > 0) {
        // Join existing game (games can have up to 8 players)
        game = gameSession.joinGame(availableGames[0].sessionId, platformId);
        console.log(`🎮 Player joined existing game: Session ${game.sessionId} (${game.players.length}/${game.maxPlayers})`);
      } else {
        // Create new game (player becomes host/admin)
        game = gameSession.createGame(platformId, gameType, ruleSet, ranking, gameLobbyId, groupLobbyId);
        isHost = true;
        console.log(`👑 NEW GAME CREATED! Player is HOST: Session ${game.sessionId}`);
        console.log(`   🎮 Game Type: ${gameType}/${ruleSet}, Ranking: ${ranking}, Skill: ${skillLevel}`);
      }
    } catch (error) {
      console.error('❌ Matchmaking error:', error.message);
      // Fallback: create new game
      game = gameSession.createGame(platformId, gameType, ruleSet, ranking, gameLobbyId, groupLobbyId);
      isHost = true;
      console.log(`🆘 Fallback: Created new game after error - Session ${game.sessionId}`);
    }
  }
    
  // Find current player in game
  const currentPlayer = game.players.find(p => p.platformId === platformId);
  const groupSize = game.players.length;
  
  const stats = gameSession.getServerStats();
  
  try {
    const response = `<MatchmakingResult xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
      <AverageWaitTimeNonRanked>${stats.averageWaitTime.toFixed(1)}</AverageWaitTimeNonRanked>
      <AverageWaitTimeRanked>${(stats.averageWaitTime + 10).toFixed(1)}</AverageWaitTimeRanked>
      <Error i:nil="true"/>
      <Groups>
        <MatchmakingGroup>
          <GameLobbyId>${game.gameLobbyId}</GameLobbyId>
          <GroupLobbyId>${game.groupLobbyId}</GroupLobbyId>
          <GroupSize>${groupSize}</GroupSize>
          <IsHost>${currentPlayer.isHost}</IsHost>
          <Team>${currentPlayer.team}</Team>
        </MatchmakingGroup>
      </Groups>
      <InProgressGameToJoin i:nil="true"/>
      <RaceKey>${game.raceKey}</RaceKey>
      <SessionId>${game.sessionId}</SessionId>
    </MatchmakingResult>`;
    
    console.log(`🎲 Matchmaking result: SessionId ${game.sessionId}, RaceKey ${game.raceKey}`);
    console.log(`   👥 Players: ${groupSize}/${game.maxPlayers}, Host: ${currentPlayer.isHost ? '👑 YES' : 'NO'}`);
    
    res.set('Content-Type', 'application/xml');
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
          <Team>0</Team>
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

// Additional critical game endpoints
app.post('/MMCOS/MMCOS-Matchmaking/MatchmakingService\.svc/RegisterActiveGameWithPlayers', (req, res) => {
  console.log('🎮 RegisterActiveGameWithPlayers request');
  
  const sessionToken = req.body.registeractivegamewithplayers?.sessiontoken?.[0];
  const raceKey = req.body.registeractivegamewithplayers?.racekey?.[0];
  const hostPlatformID = req.body.registeractivegamewithplayers?.hostplatformid?.[0];
  const gameLobbyId = req.body.registeractivegamewithplayers?.gamelobbyid?.[0];
  const gameType = req.body.registeractivegamewithplayers?.gametype?.[0];
  const ruleSet = req.body.registeractivegamewithplayers?.ruleset?.[0];
  const ranking = req.body.registeractivegamewithplayers?.ranking?.[0];
  const platformIDs = req.body.registeractivegamewithplayers?.platformids?.[0];
  
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
      console.log(`🚀 Game started: Session ${game.sessionId}`);
    }
  } catch (error) {
    console.error('❌ Error starting game:', error.message);
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
  
  // Find player and update stats
  let playerData = null;
  try {
    // Try to find player by session token or fallback to IP-based ID
    let platformId;
    if (sessionToken) {
      platformId = `steam_${sessionToken.substring(0, 16)}`;
    } else {
      const clientIp = req.ip.replace(/[^a-zA-Z0-9]/g, '_');
      platformId = `player_${clientIp}`;
    }
    
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

// Start HTTP server (for testing)
http.createServer(app).listen(80, () => {
  console.log('🌐 MMCOS Server listening on HTTP port 80');
});

// Start HTTPS server (for production)
try {
  const options = {
    key: fs.readFileSync('./ssl/key.pem'),
    cert: fs.readFileSync('./ssl/cert.pem'),
  };
  
  https.createServer(options, app).listen(443, () => {
    console.log('========================================');
    console.log('🔒 MMCOS Community Server ONLINE (HTTPS)');
    console.log('   Micro Machines World Series Revival');
    console.log('   🎯 INTELLIGENT MATCHMAKING ENABLED');
    console.log('========================================');
    console.log('🌐 HTTP Server: http://localhost:80');
    console.log('🔐 HTTPS Server: https://localhost:443');
    console.log('🎮 Admin Dashboard: http://localhost/admin');
    console.log('');
    console.log('🎲 Features:');
    console.log('  • ✅ Automatic game creation');
    console.log('  • ✅ First player becomes host/admin');
    console.log('  • ✅ Smart matchmaking (join existing games first)');
    console.log('  • ✅ Player session management');
    console.log('  • ✅ Points and leaderboard system');
    console.log('  • ✅ Real-time admin dashboard');
    console.log('');
    console.log('🔧 Next steps:');
    console.log('  1. Add these lines to C:\\Windows\\System32\\drivers\\etc\\hosts:');
    console.log('     127.0.0.1    mmcos.codemasters.com');
    console.log('     127.0.0.1    ecdn.codemasters.com');
    console.log('     127.0.0.1    prod.egonet.codemasters.com');
    console.log('  2. Start Micro Machines World Series');
    console.log('  3. Watch the magic happen! 🎮');
    console.log('========================================');
  });
} catch (error) {
  console.warn('⚠️  Could not start HTTPS server:', error.message);
  console.log('HTTP server is running on port 80');
}
