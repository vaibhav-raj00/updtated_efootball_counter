const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// Enable JSON parsing for API endpoints
app.use(express.json());

// Initialize bot status
const botStatus = {
    isRunning: false,
    startTime: new Date(),
    lastActivity: null,
    username: null,
    scanInProgress: false,
    scanStartTime: null,
    lastScanCompleted: null,
    error: null,
    errorTime: null,
    channels: {},
    uptime: function() {
        return (new Date() - this.startTime) / 1000;
    }
};

// Make botStatus globally available
global.botStatus = botStatus;

// Basic route for uptime monitoring
app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Discord Bot Status</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }
                    h1 { color: #333; }
                    .status { padding: 20px; border-radius: 5px; margin: 20px 0; }
                    .online { background-color: #d4edda; color: #155724; }
                    .offline { background-color: #f8d7da; color: #721c24; }
                    .info { background-color: #d1ecf1; color: #0c5460; padding: 10px; border-radius: 5px; }
                </style>
            </head>
            <body>
                <h1>Discord Bot Status</h1>
                <div class="status ${botStatus.isRunning ? 'online' : 'offline'}">
                    <h2>Status: ${botStatus.isRunning ? 'Online' : 'Offline'}</h2>
                    <p>Started: ${botStatus.startTime.toLocaleString()}</p>
                    <p>Uptime: ${Math.floor(botStatus.uptime() / 3600)} hours, ${Math.floor((botStatus.uptime() % 3600) / 60)} minutes</p>
                    ${botStatus.username ? `<p>Logged in as: ${botStatus.username}</p>` : ''}
                    ${botStatus.lastActivity ? `<p>Last activity: ${botStatus.lastActivity.toLocaleString()}</p>` : ''}
                </div>
                
                ${botStatus.error ? `
                <div class="status offline">
                    <h2>Last Error</h2>
                    <p>${botStatus.error}</p>
                    <p>Time: ${botStatus.errorTime ? botStatus.errorTime.toLocaleString() : 'Unknown'}</p>
                </div>` : ''}
                
                <div class="info">
                    <p>This page is used for monitoring the Discord bot's status.</p>
                    <p>For more detailed information, use the /status API endpoint.</p>
                </div>
            </body>
        </html>
    `);
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Status API endpoint
app.get('/status', (req, res) => {
    const status = {
        ...botStatus,
        uptime: botStatus.uptime()
    };
    
    delete status.uptime;
    res.json(status);
});

// Start the server
app.listen(port, '0.0.0.0', () => {
    console.log(`Server listening on port ${port}`);
});

// Start Discord bot after the server is up
setTimeout(() => {
    try {
        console.log('Starting Discord bot...');
        require('./index');
    } catch (error) {
        console.error('Error starting Discord bot:', error);
        botStatus.error = error.message;
        botStatus.errorTime = new Date();
    }
}, 2000);