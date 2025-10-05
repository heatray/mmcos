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

4. **Configure Client Connection**
   
   Edit your Windows hosts file to redirect game servers:
   
   **Windows:** `C:\Windows\System32\drivers\etc\hosts`
   
   **For local server (same computer):**
   ```
   127.0.0.1 mmcos.codemasters.com
   127.0.0.1 prod.egonet.codemasters.com
   127.0.0.1 ecdn.codemasters.com
   ```
   
   **For remote server (different computer on LAN):**
   ```
   192.168.1.100 mmcos.codemasters.com
   192.168.1.100 prod.egonet.codemasters.com
   192.168.1.100 ecdn.codemasters.com
   ```
   *(Replace `192.168.1.100` with the actual server IP address)*
   
   **Note:** The server will display the correct IP addresses when it starts.

## Usage

1. **Start the server**
   
   ### Interactive Setup (Recommended)
   ```bash
   npm start
   # or
   node server.js
   ```
   
   Configure only the settings that actually matter:
   - **Max Players** - Maximum players per game (default: 8)
   - **AI Opponents** - Enable/disable AI (default: enabled)
   - **Spectators** - Allow spectators (default: enabled)
   
   ### Quick Start (Default Settings)
   ```bash
   npm run quick
   # or
   node server.js --quick
   ```
   
   **The server will display:**
   - Local access URL: `http://localhost`
   - Network access URL: `http://[YOUR_LAN_IP]`
   - Exact hosts file entries needed for clients

2. **Configure client computers**
   - Each client must edit their hosts file with the server's IP
   - Use the exact entries shown when the server starts
   
3. **Launch Micro Machines World Series**
   - Go to Multiplayer menu
   - Select Public match
   - Wait 85 seconds for AI matchmaking to activate
   - Race against AI opponents or other players

3. **Access Admin Dashboard**
   - Local: `http://localhost/admin`
   - Remote: `http://[SERVER_IP]/admin` (replace with actual server IP)
   - View active games, players, and stats in real-time

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

**Network Access:**
- Server displays both localhost and LAN IP addresses on startup
- Use `open_firewall.bat` on Windows to allow network connections
- Clients must edit their hosts file with the server's IP address

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
