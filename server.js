const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Basic route for uptime monitoring
app.get('/', (req, res) => {
  res.send('Discord bot is running!');
});

// Start the server
app.listen(port, '0.0.0.0', () => {
  console.log(`Server listening on port ${port}`);
});

// Import your Discord bot
try {
  require('./index');
  console.log('Discord bot started');
} catch (error) {
  console.error('Error starting Discord bot:', error);
}
