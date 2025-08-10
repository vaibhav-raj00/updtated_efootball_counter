const { insertMessage, batchInsertMessages, saveData } = require('./database');

async function scanServer(guild) {
    console.log(`Starting scan for guild: ${guild.name}`);
    
    const channels = guild.channels.cache.filter(channel => 
        channel.type === 'GUILD_TEXT' && channel.viewable
    );
    
    let totalMessages = 0;
    
    // Process channels with limited concurrency
    const concurrencyLimit = 2; // Lower for JSON storage to prevent conflicts
    const channelArray = Array.from(channels.values());
    
    // Sort channels by name for consistent scanning order
    channelArray.sort((a, b) => a.name.localeCompare(b.name));
    
    // Update global status if available
    if (global.botStatus) {
        global.botStatus.scanInProgress = true;
        global.botStatus.scanStartTime = new Date();
        global.botStatus.totalChannels = channelArray.length;
        global.botStatus.completedChannels = 0;
        global.botStatus.channels = {};
    }
    
    for (let i = 0; i < channelArray.length; i += concurrencyLimit) {
        const batch = channelArray.slice(i, i + concurrencyLimit);
        
        console.log(`Processing batch of ${batch.length} channels (${i+1} to ${Math.min(i+concurrencyLimit, channelArray.length)} of ${channelArray.length})`);
        
        const promises = batch.map(channel => scanChannelOptimized(channel, guild.id));
        const results = await Promise.allSettled(promises);
        
        for (let j = 0; j < results.length; j++) {
            const result = results[j];
            const channel = batch[j];
            
            if (result.status === 'fulfilled') {
                totalMessages += result.value;
                console.log(`✅ Scanned ${result.value} messages from #${channel.name}`);
                
                // Update global status if available
                if (global.botStatus && global.botStatus.channels) {
                    global.botStatus.channels[channel.name] = {
                        scanned: result.value,
                        completedAt: new Date()
                    };
                    global.botStatus.completedChannels++;
                    global.botStatus.progress = Math.round((global.botStatus.completedChannels / global.botStatus.totalChannels) * 100);
                }
            } else {
                console.error(`❌ Failed to scan #${channel.name}:`, result.reason);
                
                // Update global status if available
                if (global.botStatus && global.botStatus.channels) {
                    global.botStatus.channels[channel.name] = {
                        error: result.reason.message,
                        errorTime: new Date()
                    };
                    global.botStatus.completedChannels++;
                    global.botStatus.progress = Math.round((global.botStatus.completedChannels / global.botStatus.totalChannels) * 100);
                }
            }
        }
        
        // Force save data after each batch
        await saveData(true);
        
        // Add delay between batches
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // Update global status when complete
    if (global.botStatus) {
        global.botStatus.scanInProgress = false;
        global.botStatus.lastScanCompleted = new Date();
        global.botStatus.totalMessagesScanned = totalMessages;
    }
    
    console.log(`Scan complete for ${guild.name}. Total messages: ${totalMessages}`);
    return totalMessages;
}

async function scanChannelOptimized(channel, guildId) {
    let messageCount = 0;
    let lastMessageId = null;
    const batchSize = 100; // Maximum allowed by Discord API
    const maxMessages = 3000; // Limit the number of messages per channel
    const batchDelay = 300; // Milliseconds between batches
    
    try {
        console.log(`Starting scan of #${channel.name}`);
        
        // Update global status if available
        if (global.botStatus && global.botStatus.channels) {
            global.botStatus.channels[channel.name] = {
                scanning: true,
                startedAt: new Date(),
                messagesScanned: 0
            };
        }
        
        // Collect messages for batch processing
        const messagesToInsert = [];
        
        while (messageCount < maxMessages) {
            const options = { limit: batchSize };
            if (lastMessageId) {
                options.before = lastMessageId;
            }
            
            console.log(`Fetching batch from #${channel.name} (${messageCount} messages so far)`);
            
            const messages = await channel.messages.fetch(options).catch(err => {
                console.error(`Error fetching messages from ${channel.name}:`, err.message);
                return null;
            });
            
            if (!messages || messages.size === 0) break;
            
            console.log(`Got ${messages.size} messages from #${channel.name}`);
            
            for (const [messageId, message] of messages) {
                try {
                    messagesToInsert.push({
                        messageId: message.id,
                        authorId: message.author.id,
                        authorUsername: message.author.username,
                        authorDiscriminator: message.author.discriminator || "0000",
                        channelId: message.channel.id,
                        channelName: message.channel.name,
                        guildId: guildId,
                        content: message.content,
                        timestamp: message.createdAt,
                        deleted: false,
                        isBot: message.author.bot || false
                    });
                    messageCount++;
                    
                    // Update global status if available
                    if (global.botStatus && global.botStatus.channels && global.botStatus.channels[channel.name]) {
                        global.botStatus.channels[channel.name].messagesScanned = messageCount;
                    }
                } catch (err) {
                    console.error(`Error processing message ${messageId} in #${channel.name}:`, err.message);
                }
            }
            
            lastMessageId = messages.last().id;
            
            // Process in smaller batches to avoid memory issues
            if (messagesToInsert.length >= 500 || messages.size < batchSize) {
                await batchInsertMessages(messagesToInsert);
                messagesToInsert.length = 0; // Clear array after insert
            }
            
            // Stop if we've reached the limit or there are no more messages
            if (messageCount >= maxMessages || messages.size < batchSize) {
                break;
            }
            
            // Add delay between batches
            await new Promise(resolve => setTimeout(resolve, batchDelay));
        }
        
        // Insert any remaining messages
        if (messagesToInsert.length > 0) {
            await batchInsertMessages(messagesToInsert);
        }
        
        // Update global status if available
        if (global.botStatus && global.botStatus.channels && global.botStatus.channels[channel.name]) {
            global.botStatus.channels[channel.name].scanning = false;
            global.botStatus.channels[channel.name].completedAt = new Date();
            global.botStatus.channels[channel.name].scanned = messageCount;
        }
        
        return messageCount;
    } catch (error) {
        console.error(`Error scanning channel #${channel.name}:`, error);
        
        // Update global status if available
        if (global.botStatus && global.botStatus.channels && global.botStatus.channels[channel.name]) {
            global.botStatus.channels[channel.name].scanning = false;
            global.botStatus.channels[channel.name].error = error.message;
            global.botStatus.channels[channel.name].errorTime = new Date();
            global.botStatus.channels[channel.name].scanned = messageCount;
        }
        
        return messageCount; // Return what we got so far
    }
}

module.exports = { scanServer, scanChannelOptimized };