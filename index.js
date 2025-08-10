const { Client } = require('discord.js-selfbot-v13');
const config = require('./config');
const { sendWebhookEmbed } = require('./webhook');
const database = require('./database');
const { setupCommands } = require('./commands');
const { scanServer } = require('./scanner');
const { startScheduler } = require('./scheduler');

const client = new Client({
    checkUpdate: false,
    partials: []
});

// Initialize commands collection
client.commands = new Map();

// Bot ready event
client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}`);
    
    // Update bot status if available
    if (global.botStatus) {
        global.botStatus.isRunning = true;
        global.botStatus.lastActivity = new Date();
        global.botStatus.username = client.user.tag;
    }
    
    try {
        // Initialize database
        await database.initDatabase();
        console.log('Database initialized successfully');
        
        // Setup command handlers
        setupCommands(client);
        console.log('Commands setup complete');
        
        // Start scheduler for daily reports
        startScheduler(client);
        console.log('Scheduler started');
        
        // Check if we should skip initial scan
        const skipInitialScan = process.env.SKIP_INITIAL_SCAN === 'true';
        
        if (skipInitialScan) {
            console.log('Skipping initial server scan as per configuration');
        } else {
            // Scan only the target server on startup
            console.log('Starting target server scan...');
            const targetGuild = client.guilds.cache.get(config.targetGuildId);
            if (targetGuild) {
                if (global.botStatus) {
                    global.botStatus.scanInProgress = true;
                    global.botStatus.scanStartTime = new Date();
                }
                
                await scanServer(targetGuild);
                console.log(`Scan completed for target server: ${targetGuild.name}`);
                
                if (global.botStatus) {
                    global.botStatus.scanInProgress = false;
                    global.botStatus.lastScanCompleted = new Date();
                }
            } else {
                console.log(`Target server with ID ${config.targetGuildId} not found or bot not in server`);
            }
        }
        
        console.log('Bot is fully operational!');
        
        const targetGuildObj = client.guilds.cache.get(config.targetGuildId);
        // Embed message
        const title = '✅ BOT READY TO USE';
        const description = `The bot has ${skipInitialScan ? 'started' : 'scanned all existing messages in'} **${targetGuildObj?.name || 'Unknown'}** and is now fully operational.`;

        // Send to Admin channel webhook
        await sendWebhookEmbed(title, description, [], 0x00ff00, true);

        // Send to Target server webhook
        await sendWebhookEmbed(title, description, [], 0x00ff00, false);
    } catch (error) {
        console.error('Error during self-bot initialization:', error);
        
        if (global.botStatus) {
            global.botStatus.error = error.message;
            global.botStatus.errorTime = new Date();
        }
    }
});

// Message create event - track new messages
client.on('messageCreate', async (message) => {
    // Update bot status if available
    if (global.botStatus) {
        global.botStatus.lastActivity = new Date();
        global.botStatus.lastMessage = {
            channelName: message.channel?.name || 'unknown',
            time: new Date()
        };
    }
    
    // Only track messages from the target server
    if (message.guild?.id !== config.targetGuildId) return;
    
    try {
        await database.insertMessage({
            messageId: message.id,
            authorId: message.author.id,
            authorUsername: message.author.username,
            authorDiscriminator: message.author.discriminator || "0000",
            channelId: message.channel.id,
            channelName: message.channel.name,
            guildId: message.guild?.id || null,
            content: message.content,
            timestamp: message.createdAt,
            deleted: false,
            isBot: message.author.bot || false
        });
    } catch (error) {
        console.error('Error tracking new message:', error);
    }
});

// Message delete event - mark as deleted
client.on('messageDelete', async (message) => {
    // Update bot status if available
    if (global.botStatus) {
        global.botStatus.lastActivity = new Date();
        global.botStatus.lastDeletedMessage = {
            channelName: message.channel?.name || 'unknown',
            time: new Date()
        };
    }
    
    try {
        await database.markMessageDeleted(message.id);
    } catch (error) {
        console.error('Error marking message as deleted:', error);
    }
});

// Channel delete event - mark all messages in channel as deleted
client.on('channelDelete', async (channel) => {
    // Update bot status if available
    if (global.botStatus) {
        global.botStatus.lastActivity = new Date();
        global.botStatus.lastChannelDeleted = {
            channelName: channel.name,
            time: new Date()
        };
    }
    
    try {
        await database.markChannelMessagesDeleted(channel.id);
    } catch (error) {
        console.error('Error marking channel messages as deleted:', error);
    }
});

// Error handling
client.on('error', (error) => {
    console.error('Discord client error:', error);
    
    if (global.botStatus) {
        global.botStatus.error = error.message;
        global.botStatus.errorTime = new Date();
    }
});

// Login with bot token
client.login(process.env.DISCORD_TOKEN || config.token);

// Export the client for use in server.js if needed
module.exports = { client };
