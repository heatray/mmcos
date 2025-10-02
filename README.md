# MMCOS - Micro Machines World Series Community Server

A community-run replacement server for **Micro Machines World Series** multiplayer, enabling online play after the official servers shut down.

## Features

- ✅ **Player Session Management** - Persistent player tracking across sessions
- ✅ **Smart Matchmaking** - Join existing games first, create new ones when needed
- ✅ **Admin Dashboard** - Real-time monitoring of games and players
- ✅ **Points & Leaderboard System** - Track player stats and rankings
- ✅ **Steam Integration** - Extracts player names from Steam login data

## Requirements

- **Node.js** 22.x LTS or higher
- **Micro Machines World Series** (Steam version)

## Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Nigcra/mmcos.git
   cd mmcos
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Generate SSL certificates**
   ```bash
   node generate-cert.js
   ```

4. **Edit your hosts file**
   
   Add these lines to redirect game servers to localhost:
   
   **Windows:** `C:\Windows\System32\drivers\etc\hosts`
   ```
   127.0.0.1 mmcos.codemasters.com
   127.0.0.1 prod.egonet.codemasters.com
   127.0.0.1 ecdn.codemasters.com
   ```

## Usage

1. **Start the server**
   ```bash
   node server.js
   ```

2. **Launch Micro Machines World Series**
   - Go to Multiplayer menu
   - Select Public match
   - Wait 85 seconds for AI matchmaking to activate
   - Race against AI opponents

3. **Access Admin Dashboard**
   - Open browser: `http://localhost/admin`
   - View active games, players, and stats

## How It Works

The server emulates the original MMCOS (Micro Machines Codemasters Online Services) by:

- Intercepting HTTPS requests from the game
- Handling Steam authentication
- Managing game sessions and matchmaking
- Providing ServerStatus.xml for server discovery
- Auto-starting games when players are waiting

## Project Structure

```
mmcos/
├── server.js           # Main server application
├── game-session.js     # Game session management
├── responses.js        # XML response templates
├── generate-cert.js    # SSL certificate generator
├── cert.pem            # SSL certificate (auto-generated)
├── key.pem             # SSL private key (auto-generated)
├── dump/               # MITM dumps
└── docs/               # Documentation>
    ├── backend.md      # Backend architecture
    ├── events.md       # Game events reference
    └── versions.md     # Version history
```

## Configuration

The server runs on:
- **HTTP:** Port 80
- **HTTPS:** Port 443

## Contributing

Contributions welcome! Feel free to:
- Report bugs via GitHub Issues
- Submit pull requests
- Suggest new features
- Improve documentation

## Credits

- **Original Game:** Codemasters
- **Community Server:** Developed for preservation and community play

## License

This project is for educational and preservation purposes. Micro Machines World Series is property of Codemasters.


---

**Note:** This is an unofficial community project and is not affiliated with or endorsed by Codemasters.
