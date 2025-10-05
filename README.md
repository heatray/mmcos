# MMCOS - Micro Machines World Series Community Server

A community-run replacement server for **Micro Machines World Series** multiplayer, enabling online play after the official servers shut down.

> ⚠️ **WORK IN PROGRESS** ⚠️
> 
> This project is in early development and largely **UNTESTED**, especially with multiple players. Many features may not work as expected or at all. The future direction of this project is still undecided - it could become:
> - A community project with an unofficial public server
> - A proof of concept for educational purposes only
> - A private server solution for LAN play
> 
> **Use at your own risk and expect bugs!**

## Current Status

**What works:**
- ✅ Basic server setup and SSL certificate generation
- ✅ Game client connection and authentication emulation
- ✅ Admin dashboard with basic monitoring
- ✅ Single player with AI opponents

**What's untested/uncertain:**
- ❓ Multiplayer with 2+ human players
- ❓ Game session synchronization between clients
- ❓ Network stability with multiple connections
- ❓ Cross-platform compatibility
- ❓ Performance under load

**Known limitations:**
- Most testing has been done with single player + AI
- Server responses are based on reverse-engineered protocol
- No guarantee of compatibility with all game versions
- May require specific Steam version of the game

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

## Future Direction

The ultimate goal and scope of this project are still being determined:

**Possible paths:**
- **Community Server:** Public server hosting for the community
- **Educational Tool:** Proof of concept for game server emulation
- **Private Solution:** LAN party and private group play
- **Preservation Project:** Documenting the protocol for historical purposes

**Your feedback matters!** If you're interested in this project, please share your thoughts on what direction you'd like to see it take.

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
