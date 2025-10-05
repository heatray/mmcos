// Simple Server Configuration
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper functions
function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, resolve);
  });
}

function askYesNo(question, defaultValue = true) {
  const defaultText = defaultValue ? 'Y/n' : 'y/N';
  return askQuestion(`${question} (${defaultText}): `).then(answer => {
    if (answer.trim() === '') return defaultValue;
    return answer.toLowerCase().startsWith('y');
  });
}

async function runInteractiveConfig() {
  try {
    console.log('\n🎮 MMCOS Server Configuration');
    console.log('==============================');
    console.log();
    console.log('Configure the server settings that actually matter:');
    console.log();

    // Ask for the settings that actually affect gameplay
    const maxPlayers = parseInt(await askQuestion('Maximum players per game [8]: ')) || 8;
    const aiEnabled = await askYesNo('Enable AI opponents', true);
    const allowSpectators = await askYesNo('Allow spectators', true);

    const config = {
      name: "MMCOS Community Server",
      description: "Community server with custom settings",
      settings: {
        maxPlayers: maxPlayers,
        aiEnabled: aiEnabled,
        allowSpectators: allowSpectators,
        // Fixed sensible defaults for everything else
        rankedWithAI: true,
        debugMode: false,
        seasonSystem: true,
        forceGameType: null,
        competitiveMode: false
      }
    };

    console.log('\n📋 Server Configuration:');
    console.log('========================');
    console.log(`Max Players: ${config.settings.maxPlayers}`);
    console.log(`AI Opponents: ${config.settings.aiEnabled ? 'Enabled' : 'Disabled'}`);
    console.log(`Spectators: ${config.settings.allowSpectators ? 'Allowed' : 'Disabled'}`);

    const confirm = await askYesNo('\nStart server with this configuration', true);
    if (!confirm) {
      console.log('❌ Configuration cancelled');
      rl.close();
      process.exit(0);
    }

    rl.close();

    // Set environment variables for main server
    process.env.SERVER_CONFIG = JSON.stringify(config);
    
    console.log('\n🚀 Starting server...\n');
    
    // Start the main server
    require('./server.js');

  } catch (error) {
    console.error('❌ Configuration error:', error.message);
    rl.close();
    process.exit(1);
  }
}

// Export for use in other modules
module.exports = {
  runInteractiveConfig
};
