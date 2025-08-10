const { insertMessage } = require('./database');

async function scanServer(guild) {
    console.log(`Starting scan for guild: ${guild.name}`);
    
    const channels = guild.channels.cache.filter(channel => 
        channel.type === 'GUILD_TEXT' && channel.viewable
    );
    
    let totalMessages = 0;
    
    for (const [channelId, channel] of channels) {
        try {
            console.log(`Scanning channel: #${channel.name}`);
            const messageCount = await scanChannel(channel, guild.id);
            totalMessages += messageCount;
            console.log(`Scanned ${messageCount} messages from #${channel.name}`);
            
            // Add delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            console.error(`Error scanning channel ${channel.name}:`, error);
        }
    }
    
    console.log(`Scan complete for ${guild.name}. Total messages: ${totalMessages}`);
    return totalMessages;
}

async function scanChannel(channel, guildId) {
    let messageCount = 0;
    let lastMessageId = null;
    
    try {
        while (true) {
            const options = { limit: 100 };
            if (lastMessageId) {
                options.before = lastMessageId;
            }
            
            const messages = await channel.messages.fetch(options);
            
            if (messages.size === 0) break;
            
            for (const [messageId, message] of messages) {
                try {
                    await insertMessage({
                        messageId: message.id,
                        authorId: message.author.id,
                        authorUsername: message.author.username,
                        channelId: message.channel.id,
                        channelName: message.channel.name,
                        guildId: guildId,
                        content: message.content,
                        timestamp: message.createdAt,
                        deleted: false
                    });
                    messageCount++;
                } catch (error) {
                    // Ignore duplicate message errors
                    if (!error.message.includes('UNIQUE constraint')) {
                        console.error(`Error inserting message ${messageId}:`, error);
                    }
                }
            }
            
            lastMessageId = messages.last().id;
            
            // Rate limiting
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    } catch (error) {
        if (error.code === 50001) {
            console.log(`Missing access to channel: ${channel.name}`);
        } else {
            console.error(`Error fetching messages from ${channel.name}:`, error);
        }
    }
    
    return messageCount;
}

module.exports = { scanServer, scanChannel };
