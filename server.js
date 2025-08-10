// server.js - Create this file in your project root
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Import your Discord bot
const { client } = require('./index');

// Basic route for uptime monitoring
app.get('/', (req, res) => {
  res.send('Discord bot is running!');
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});