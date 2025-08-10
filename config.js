module.exports = {
    // Discord USER token (get from environment variable)
    // WARNING: Using user tokens violates Discord's Terms of Service
    token: process.env.DISCORD_TOKEN,
    
    // Self-bot user ID - should be your own Discord user ID
    owners: [
        process.env.OWNER_ID
    ],
    
    // Specific server ID to scan (only this server will be monitored)
    targetGuildId: process.env.TARGET_GUILD_ID, // Replace with your server ID
    
    // Webhook URL for sending command responses
    webhookUrl: process.env.WEBHOOK_URL,
    
    // Admin channel ID and its webhook (can be from different server)
    adminChannelId: process.env.ADMIN_CHANNEL_ID,
    adminWebhookUrl: process.env.ADMIN_WEBHOOK_URL,
    
    // Moderator role ID for mod detection
    modRoleId: process.env.MOD_ROLE_ID || '1343908438060695664',
    
    // Database settings
    database: {
        filename: './bot_data.db',
        options: {
            verbose: console.log // Set to null to disable verbose logging
        }
    },
    
    // Bot settings
    bot: {
        prefix: '&',
        deleteErrorMessages: true,
        deleteErrorDelay: 10000, // 10 seconds
        maxMessageLength: 2000
    },
    
    // Scanning settings
    scanning: {
        messagesPerBatch: 100,
        delayBetweenBatches: 100, // milliseconds
        delayBetweenChannels: 1000, // milliseconds
        maxRetries: 3
    },
    
    // Report settings
    reports: {
        timezone: 'UTC',
        dailyReportTime: process.env.DAILY_REPORT_TIME || '23:59', // 24-hour format (HH:MM)
        maxReportLength: 2000,
        preferredChannelNames: ['logs', 'mod-logs', 'reports', 'admin', 'moderator']
    },
    
    // Rate limiting
    rateLimits: {
        commandCooldown: 2000, // milliseconds between commands per user
        scanCooldown: 300000, // 5 minutes between manual scans
    },
    
    // Feature flags
    features: {
        enableDailyReports: true,
        enableDeletedMessageTracking: true,
        enableChannelDeleteTracking: true,
        enableDetailedLogging: true
    }
};

