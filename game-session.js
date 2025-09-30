// Game and Session Management for MMCOS
class GameSession {
  constructor() {
    this.games = new Map(); // sessionId -> game data
    this.players = new Map(); // platformId -> player data
    this.lobbies = new Map(); // lobbyId -> lobby data
    this.raceKeys = new Set(); // track used race keys
  }

  // Generate unique session ID
  generateSessionId() {
    return Math.floor(Math.random() * 99999999) + 1000000;
  }

  // Generate unique race key
  generateRaceKey() {
    let raceKey;
    do {
      raceKey = Math.random().toString(16).substring(2, 18).toUpperCase();
    } while (this.raceKeys.has(raceKey));
    this.raceKeys.add(raceKey);
    return raceKey;
  }

  // Generate lobby IDs
  generateLobbyId() {
    return Date.now().toString() + Math.floor(Math.random() * 1000);
  }

  // Register or update player
  registerPlayer(platformId, displayName, sessionToken = null) {
    const existingPlayer = this.players.get(platformId);
    
    const player = {
      platformId: platformId,
      displayName: displayName || `Player_${platformId.substring(0, 8)}`,
      sessionToken: sessionToken,
      joinedAt: new Date(),
      isOnline: true,
      currentGameId: null,
      totalGames: existingPlayer ? existingPlayer.totalGames + 1 : 0,
      wins: existingPlayer ? existingPlayer.wins : 0,
      points: existingPlayer ? existingPlayer.points : Math.floor(Math.random() * 5000) + 1000
    };

    this.players.set(platformId, player);
    console.log(`🎮 Player registered: ${player.displayName} (${platformId})`);
    return player;
  }

  // Create new game session
  createGame(hostPlatformId, gameType = 'Race', ruleSet = 'Race', ranking = 'NotRanked', clientGameLobbyId = null, clientGroupLobbyId = null) {
    const sessionId = this.generateSessionId();
    const raceKey = this.generateRaceKey();
    const gameLobbyId = clientGameLobbyId || this.generateLobbyId();
    const groupLobbyId = clientGroupLobbyId || this.generateLobbyId();

    const host = this.players.get(hostPlatformId);
    if (!host) {
      throw new Error(`Host player ${hostPlatformId} not found`);
    }

    const game = {
      sessionId: sessionId,
      raceKey: raceKey,
      gameLobbyId: gameLobbyId,
      groupLobbyId: groupLobbyId,
      hostPlatformId: hostPlatformId,
      hostDisplayName: host.displayName,
      gameType: gameType,
      ruleSet: ruleSet,
      ranking: ranking,
      status: 'waiting', // waiting, active, finished
      players: [{
        platformId: hostPlatformId,
        displayName: host.displayName,
        team: 0,
        isHost: true,
        joinedAt: new Date()
      }],
      maxPlayers: 8,
      createdAt: new Date(),
      networkVersion: 1
    };

    this.games.set(sessionId, game);
    
    // Update player's current game
    host.currentGameId = sessionId;
    this.players.set(hostPlatformId, host);

    console.log(`🏁 New game created: Session ${sessionId}, RaceKey ${raceKey}`);
    console.log(`   Host: ${host.displayName} (${hostPlatformId})`);
    console.log(`   Type: ${gameType}, Rules: ${ruleSet}, Ranking: ${ranking}`);

    return game;
  }

  // Join existing game
  joinGame(sessionId, platformId) {
    const game = this.games.get(sessionId);
    const player = this.players.get(platformId);

    if (!game) {
      throw new Error(`Game ${sessionId} not found`);
    }

    if (!player) {
      throw new Error(`Player ${platformId} not found`);
    }

    if (game.players.length >= game.maxPlayers) {
      throw new Error(`Game ${sessionId} is full`);
    }

    if (game.status !== 'waiting') {
      throw new Error(`Game ${sessionId} is not accepting players (status: ${game.status})`);
    }

    // Check if player already in game
    if (game.players.find(p => p.platformId === platformId)) {
      return game; // Already in game
    }

    // Add player to game
    game.players.push({
      platformId: platformId,
      displayName: player.displayName,
      team: Math.floor(game.players.length / 4), // Auto-balance teams
      isHost: false,
      joinedAt: new Date()
    });

    // Update player's current game
    player.currentGameId = sessionId;
    this.players.set(platformId, player);

    console.log(`🎯 Player joined game: ${player.displayName} -> Session ${sessionId}`);
    console.log(`   Players: ${game.players.length}/${game.maxPlayers}`);

    return game;
  }

  // Get available games for matchmaking
  getAvailableGames(gameType = null, ranking = null) {
    const availableGames = [];

    for (const [sessionId, game] of this.games) {
      if (game.status === 'waiting' && game.players.length < game.maxPlayers) {
        if (!gameType || game.gameType === gameType) {
          if (!ranking || game.ranking === ranking) {
            availableGames.push(game);
          }
        }
      }
    }

    return availableGames.sort((a, b) => b.createdAt - a.createdAt); // Newest first
  }

  // Start game (mark as active)
  startGame(sessionId) {
    const game = this.games.get(sessionId);
    if (!game) {
      throw new Error(`Game ${sessionId} not found`);
    }

    game.status = 'active';
    game.startedAt = new Date();

    console.log(`🚀 Game started: Session ${sessionId} with ${game.players.length} players`);
    return game;
  }

  // End game and distribute points
  endGame(sessionId, results = []) {
    const game = this.games.get(sessionId);
    if (!game) {
      throw new Error(`Game ${sessionId} not found`);
    }

    game.status = 'finished';
    game.endedAt = new Date();
    game.results = results;

    // Update player statistics
    game.players.forEach((gamePlayer, index) => {
      const player = this.players.get(gamePlayer.platformId);
      if (player) {
        player.totalGames++;
        player.currentGameId = null;
        
        // Award points based on placement (if results provided)
        if (results.length > 0) {
          const playerResult = results.find(r => r.platformId === gamePlayer.platformId);
          if (playerResult) {
            const pointsEarned = Math.max(100 - (playerResult.position * 10), 10);
            player.points += pointsEarned;
            
            if (playerResult.position === 1) {
              player.wins++;
            }
          }
        }
        
        this.players.set(gamePlayer.platformId, player);
      }
    });

    console.log(`🏆 Game finished: Session ${sessionId}`);
    return game;
  }

  // Get game by session ID
  getGame(sessionId) {
    return this.games.get(sessionId);
  }

  // Get player by platform ID
  getPlayer(platformId) {
    return this.players.get(platformId);
  }

  // Get player's current game
  getPlayerCurrentGame(platformId) {
    const player = this.players.get(platformId);
    if (!player || !player.currentGameId) {
      return null;
    }
    return this.games.get(player.currentGameId);
  }

  // Clean up old finished games (older than 1 hour)
  cleanupOldGames() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    for (const [sessionId, game] of this.games) {
      if (game.status === 'finished' && game.endedAt < oneHourAgo) {
        this.games.delete(sessionId);
        this.raceKeys.delete(game.raceKey);
        console.log(`🧹 Cleaned up old game: Session ${sessionId}`);
      }
    }
  }

  // Get server statistics
  getServerStats() {
    const totalGames = this.games.size;
    const activeGames = Array.from(this.games.values()).filter(g => g.status === 'active').length;
    const waitingGames = Array.from(this.games.values()).filter(g => g.status === 'waiting').length;
    const finishedGames = Array.from(this.games.values()).filter(g => g.status === 'finished').length;
    const totalPlayers = this.players.size;
    const onlinePlayers = Array.from(this.players.values()).filter(p => p.isOnline).length;

    return {
      totalGames,
      activeGames,
      waitingGames,
      finishedGames,
      totalPlayers,
      onlinePlayers,
      averageWaitTime: 45.5 + Math.random() * 20 // Simulate realistic wait times
    };
  }
}

module.exports = { GameSession };