const { Client } = require('discord.js-selfbot-v13');
const { initDatabase } = require('./database');
const { setupCommands } = require('./commands');
const { scanServer } = require('./scanner');
const { startScheduler } = require('./scheduler');
const config = require('./config');
const { sendWebhookEmbed } = require('./webhook');

const client = new Client({
    checkUpdate: false,
    partials: []
});

// Initialize commands collection
client.commands = new Map();

// Bot ready event
client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}`);
    
    try {
        // Initialize database
        await initDatabase();
        console.log('Database initialized successfully');
        
        // Setup command handlers
        setupCommands(client);
        console.log('Commands setup complete');
        
        // Start scheduler for daily reports
        startScheduler(client);
        console.log('Scheduler started');
        
        // Scan only the target server on startup
        console.log('Starting target server scan...');
        const targetGuild = client.guilds.cache.get(config.targetGuildId);
        if (targetGuild) {
            await scanServer(targetGuild);
            console.log(`Scan completed for target server: ${targetGuild.name}`);
        } else {
            console.log(`Target server with ID ${config.targetGuildId} not found or bot not in server`);
        }
        
        console.log('Bot is fully operational!');
    } catch (error) {
        console.error('Error during self-bot initialization:', error);
    }
     const targetGuild = client.guilds.cache.get(config.targetGuildId);
    // Embed message
            const title = '✅ BOT READY TO USE';
            const description = `The bot has scanned all existing messages in **${targetGuild.name}** and is now fully operational.`;

            // Send to Admin channel webhook
            await sendWebhookEmbed(title, description, [], 0x00ff00, true);

            // Send to Target server webhook
            await sendWebhookEmbed(title, description, [], 0x00ff00, false);
});

// Message create event - track new messages
client.on('messageCreate', async (message) => {
    // Only track messages from the target server
    if (message.guild?.id !== config.targetGuildId) return;
    
    try {
        const { insertMessage } = require('./database');
await insertMessage({
    messageId: message.id,
    authorId: message.author.id,
    authorUsername: message.author.username,
    authorDiscriminator: message.author.discriminator, // store this
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
    try {
        const { markMessageDeleted } = require('./database');
        await markMessageDeleted(message.id);
    } catch (error) {
        console.error('Error marking message as deleted:', error);
    }
});

// Channel delete event - mark all messages in channel as deleted
client.on('channelDelete', async (channel) => {
    try {
        const { markChannelMessagesDeleted } = require('./database');
        await markChannelMessagesDeleted(channel.id);
    } catch (error) {
        console.error('Error marking channel messages as deleted:', error);
    }
});

// Error handling
client.on('error', console.error);

// Login with bot token
client.login(process.env.DISCORD_TOKEN || config.token);
