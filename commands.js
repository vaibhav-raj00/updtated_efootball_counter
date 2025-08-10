const { parseDate, isOwner, hasPermission } = require('./utils');
const database = require('./database');
const { scanServer } = require('./scanner');
const { sendWebhookEmbed } = require('./webhook');
const config = require('./config');

function setupCommands(client) {
    client.on('messageCreate', async (message) => {
        // Ignore bot messages and messages that don't start with the command prefix
        if (message.author.bot || !message.content.startsWith('&')) return;
        
        // Parse command and arguments
        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        
        console.log(`Command received: ${command} with args: ${args.join(', ')}`);
        
        try {
            await handleCommand(message, command, args, client);
        } catch (error) {
            console.error('Command error:', error);
            // Send error message to channel
            try {
                await sendWebhookEmbed(
                    '❌ Command Error',
                    `Error executing command: ${error.message}`,
                    [],
                    0xFF0000,
                    message.channel.id === config.adminChannelId
                );
            } catch (webhookError) {
                console.error('Error sending webhook error message:', webhookError);
            }
        }
    });
}

async function handleCommand(message, command, args, client) {
    const authorId = message.author.id;
    const guildId = message.guild?.id;
    const channelId = message.channel?.id;
    
    // Check if user has permission to use commands
    const hasAccess = isOwner(authorId) || await hasPermission(authorId);
    const isTargetServer = guildId === config.targetGuildId;
    const isAdminChannel = channelId === config.adminChannelId;
    
    // Only allow commands in target server or admin channel
    if (!isTargetServer && !isAdminChannel) return;
    
    // Only allow commands from authorized users
    if (!hasAccess) {
        console.log(`Unauthorized command attempt by ${message.author.tag} (${authorId})`);
        return;
    }

    try {
        // Try to delete the command message for privacy
        await message.delete().catch(err => console.log(`Couldn't delete command message: ${err.message}`));
    } catch (error) {
        console.log(`Couldn't delete command message: ${error.message}`);
    }

    console.log(`Processing command: ${command} by ${message.author.tag}`);

    switch (command) {
        case 'count':
            await handleCountCommand(message, args, guildId, isAdminChannel);
            break;
        case 'info':
            await handleInfoCommand(message, client, isAdminChannel);
            break;
        case 'help':
            await handleHelpCommand(message, isAdminChannel);
            break;
        case 'adduser':
            if (!isOwner(authorId)) {
                await sendWebhookEmbed('❌ Permission Denied', 'Only the bot owner can use this command.', [], 0xFF0000, isAdminChannel);
                return;
            }
            await handleAddUserCommand(message, args, isAdminChannel);
            break;
        case 'removeuser':
            if (!isOwner(authorId)) {
                await sendWebhookEmbed('❌ Permission Denied', 'Only the bot owner can use this command.', [], 0xFF0000, isAdminChannel);
                return;
            }
            await handleRemoveUserCommand(message, args, isAdminChannel);
            break;
        case 'listuser':
            if (!isOwner(authorId)) {
                await sendWebhookEmbed('❌ Permission Denied', 'Only the bot owner can use this command.', [], 0xFF0000, isAdminChannel);
                return;
            }
            await handleListUsersCommand(message, isAdminChannel);
            break;
        case 'scan':
            if (!isOwner(authorId)) {
                await sendWebhookEmbed('❌ Permission Denied', 'Only the bot owner can use this command.', [], 0xFF0000, isAdminChannel);
                return;
            }
            await handleScanCommand(message, client, isAdminChannel);
            break;
        case 'dbstats':
            if (!isOwner(authorId)) {
                await sendWebhookEmbed('❌ Permission Denied', 'Only the bot owner can use this command.', [], 0xFF0000, isAdminChannel);
                return;
            }
            await handleDatabaseStatsCommand(message, isAdminChannel);
            break;
        default:
            await sendWebhookEmbed(
                '❓ Unknown Command',
                `Unknown command: \`${command}\`. Use \`&help\` to see available commands.`,
                [],
                0xFFFF00,
                isAdminChannel
            );
            return;
    }
}

async function handleHelpCommand(message, isAdminChannel) {
    const fields = [
        {
            name: '📊 Count Commands',
            value: [
                '`&count` — Show total messages today (or on a given date)',
                '`&count DD/MM/YYYY` — Show total messages on a date',
                '`&count @user` — Show messages by a specific user',
                '`&count @user DD/MM/YYYY` — Messages by a user on a date',
                '`&count #channel` — Show messages in a specific channel',
                '`&count #channel DD/MM/YYYY` — Messages in a channel on a date',
                '`&count mods` — Show total moderator messages',
                '`&count mods DD/MM/YYYY` — Mod messages on a date',
                '`&count muser` — Show total moderator & member messages',
                '`&count muser DD/MM/YYYY` — Mod & member messages on a date'
            ].join('\n'),
            inline: false
        },
        {
            name: '📋 Information Commands',
            value: [
                '`&info` — Show bot status and system info',
                '`&help` — Show this help menu'
            ].join('\n'),
            inline: false
        }
    ];

    // Admin/Owner only commands
    if (isAdminChannel || message.guild?.id === config.targetGuildId) {
        fields.push({
            name: '⚙️ Owner Commands',
            value: [
                '`&adduser @user` — Add an allowed user',
                '`&removeuser @user` — Remove an allowed user',
                '`&listuser` — List all allowed users',
                '`&scan` — Scan all server messages again',
                '`&dbstats` — Show database statistics'
            ].join('\n'),
            inline: false
        });
    }

    await sendWebhookEmbed(
        '📖 Bot Help Menu',
        'Here\'s a list of all available commands:',
        fields,
        0x3498db,
        isAdminChannel
    );
}

async function handleCountCommand(message, args, guildId, isAdminChannel) {
    const lastArg = args[args.length - 1];
    let date = parseDate(lastArg) || new Date();
    let targetArgs = parseDate(lastArg) ? args.slice(0, -1) : args;

    if (targetArgs.length === 0) {
        const count = await database.getMessageCount(guildId, date);
        return await sendWebhookEmbed(
            '📊 Total Messages',
            `Total messages on ${date.toDateString()}: **${count}**`,
            [],
            0x00ff00,
            isAdminChannel
        );
    }

    const firstArg = targetArgs[0];

    // User specific
    if (firstArg.startsWith('<@') || /^\d+$/.test(firstArg)) {
        const userId = firstArg.replace(/[<@!>]/g, '');
        const count = await database.getUserMessageCount(guildId, userId, date);
        return await sendWebhookEmbed(
            `📊 Messages by <@${userId}>`,
            `Messages on ${date.toDateString()}: **${count}**`,
            [],
            0x00ff00,
            isAdminChannel
        );
    }

    // Channel specific
    if (firstArg.startsWith('<#') || /^\d+$/.test(firstArg)) {
        const channelId = firstArg.replace(/[<#>]/g, '');
        const count = await database.getChannelMessageCount(channelId, date);
        return await sendWebhookEmbed(
            `📊 Messages in <#${channelId}>`,
            `Messages on ${date.toDateString()}: **${count}**`,
            [],
            0x00ff00,
            isAdminChannel
        );
    }

    // Special commands
    if (firstArg === 'mods') {
        const guild = message.client.guilds.cache.get(guildId);
        if (!guild) {
            return await sendWebhookEmbed(
                '❌ Error',
                'Target server not found.',
                [],
                0xff0000,
                isAdminChannel
            );
        }
        
        let modUserIds = [];
        
        if (config.modRoleId && config.modRoleId !== 'YOUR_MOD_ROLE_ID_HERE') {
            const modRole = guild.roles.cache.get(config.modRoleId);
            if (modRole) {
                modUserIds = modRole.members.map(member => member.id);
            } else {
                return await sendWebhookEmbed(
                    '❌ Error',
                    'Configured mod role not found in server. Please check MOD_ROLE_ID in config.',
                    [],
                    0xff0000,
                    isAdminChannel
                );
            }
        } else {
            // Try to find a moderator role
            const modRole = guild.roles.cache.find(role =>
                role.name.toLowerCase().includes('mod') ||
                role.name.toLowerCase().includes('moderator')
            );
            
            if (!modRole) {
                return await sendWebhookEmbed(
                    '❌ Error',
                    'No moderator role found. Please configure MOD_ROLE_ID in config.',
                    [],
                    0xff0000,
                    isAdminChannel
                );
            }
            
            modUserIds = modRole.members.map(member => member.id);
        }
        
        if (modUserIds.length === 0) {
            return await sendWebhookEmbed(
                '❌ Error',
                'No moderators found. Please configure MOD_ROLE_ID or ensure moderator role exists.',
                [],
                0xff0000,
                isAdminChannel
            );
        }
        
        const results = await database.getModeratorMessages(guildId, modUserIds, date);
        
        if (!results || results.length === 0) {
            return await sendWebhookEmbed(
                '📊 Moderator Activity',
                `No moderator messages found on ${date.toDateString()}.`,
                [],
                0xffff00,
                isAdminChannel
            );
        }
        
        // Group results by user
        const userStats = {};
        let totalMessages = 0;
        
        for (const result of results) {
            if (!userStats[result.authorId]) {
                userStats[result.authorId] = {
                    username: result.authorUsername,
                    total: 0,
                    deleted: 0,
                    channels: []
                };
            }
            
            userStats[result.authorId].total += result.count;
            userStats[result.authorId].deleted += result.deletedCount;
            userStats[result.authorId].channels.push({
                name: result.channelName,
                id: result.channelId,
                count: result.count,
                deleted: result.deletedCount
            });
            totalMessages += result.count;
        }
        
        let description = `**Total Moderator Messages:** ${totalMessages}\n\n`;
        
        // Sort users by message count
        const sortedUsers = Object.entries(userStats).sort(([,a], [,b]) => b.total - a.total);
        
        for (const [userId, stats] of sortedUsers) {
            description += `**${stats.username}**: ${stats.total} messages`;
            if (stats.deleted > 0) {
                description += ` (${stats.deleted} deleted)`;
            }
            description += '\n';
            
            // Show top channels for this user
            const topChannels = stats.channels.sort((a, b) => b.count - a.count).slice(0, 3);
            for (const channel of topChannels) {
                const channelDisplay = channel.id ? `<#${channel.id}>` : `#${channel.name}`;
                description += `  • ${channelDisplay}: ${channel.count}`;
                if (channel.deleted > 0) {
                    description += ` (${channel.deleted} deleted)`;
                }
                description += '\n';
            }
            description += '\n';
        }
        
        await sendWebhookEmbed(
            `📊 Moderator Activity on ${date.toDateString()}`,
            description.trim(),
            [],
            0x00ff00,
            isAdminChannel
        );
        return;
    }

    if (firstArg === 'muser') {
        const guild = message.client.guilds.cache.get(guildId);
        if (!guild) {
            return await sendWebhookEmbed(
                '❌ Error',
                'Target server not found.',
                [],
                0xff0000,
                isAdminChannel
            );
        }
        
        let modUserIds = [];
        
        if (config.modRoleId && config.modRoleId !== 'YOUR_MOD_ROLE_ID_HERE') {
            const modRole = guild.roles.cache.get(config.modRoleId);
            if (modRole) {
                modUserIds = modRole.members.map(member => member.id);
            }
        } else {
            const modRole = guild.roles.cache.find(role =>
                role.name.toLowerCase().includes('mod') ||
                role.name.toLowerCase().includes('moderator')
            );
            if (modRole) {
                modUserIds = modRole.members.map(member => member.id);
            }
        }
        
        const { modCount, userCount } = await database.getModsAndUsersCount(guildId, modUserIds, date);
        const totalCount = modCount + userCount;
        
        await sendWebhookEmbed(
            `📊 Moderator & Member Activity on ${date.toDateString()}`,
            `**Moderator Messages:** ${modCount}\n**Member Messages:** ${userCount}\n**Total Messages:** ${totalCount}`,
            [],
            0x00ff00,
            isAdminChannel
        );
        return;
    }

    // If we reach here, command wasn't recognized
    await sendWebhookEmbed(
        '❌ Invalid Command',
        'Invalid count command format. Use `&help` to see available commands.',
        [],
        0xff0000,
        isAdminChannel
    );
}

async function handleInfoCommand(message, client, isAdminChannel) {
    const uptime = process.uptime();
    const uptimeStr = `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;
    const ping = Date.now() - message.createdTimestamp;
    const memUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
    const guild = client.guilds.cache.get(config.targetGuildId);
    const dbStats = database.getDatabaseStats();

    await sendWebhookEmbed(
        '**Bot Information**',
        `**Status:** Online
**Ping:** ${ping}ms
**Uptime:** ${uptimeStr}
**Server:** ${guild?.name || 'Unknown'}
**Server ID:** ${config.targetGuildId}
**Memory Usage:** ${memUsage} MB
**Messages Tracked:** ${dbStats.totalMessages}
**Database Size:** ${dbStats.diskUsage.megabytes} MB
**Node.js Version:** ${process.version}
**Discord.js Version:** ${require('discord.js-selfbot-v13').version}
**Platform:** ${process.platform}
**Allowed Users:** ${(await database.getAllowedUsers()).length}
**Today's Date:** ${new Date().toLocaleDateString('en-GB')}`,
        [],
        0xffff00,
        isAdminChannel
    );
}

async function handleAddUserCommand(message, args, isAdminChannel) {
    if (args.length === 0) {
        return await sendWebhookEmbed('❌ Error', 'Please specify user(s) to add.', [], 0xff0000, isAdminChannel);
    }
    
    const addedUsers = [];
    for (const arg of args) {
        const userId = arg.replace(/[<@!>]/g, '');
        try {
            const user = await message.client.users.fetch(userId);
            await database.addAllowedUser(userId, user.username);
            addedUsers.push(user.username);
        } catch (error) {
            console.error(`Error adding user ${userId}:`, error);
        }
    }
    
    await sendWebhookEmbed(
        '✅ Users Added', 
        addedUsers.length > 0 ? `Added users: ${addedUsers.join(', ')}` : 'No valid users were added.', 
        [], 
        0x00ff00, 
        isAdminChannel
    );
}

async function handleRemoveUserCommand(message, args, isAdminChannel) {
    if (args.length === 0) {
        return await sendWebhookEmbed('❌ Error', 'Please specify user(s) to remove.', [], 0xff0000, isAdminChannel);
    }
    
    const removedUsers = [];
    for (const arg of args) {
        const userId = arg.replace(/[<@!>]/g, '');
        try {
            await database.removeAllowedUser(userId);
            removedUsers.push(userId);
        } catch (error) {
            console.error(`Error removing user ${userId}:`, error);
        }
    }
    
    await sendWebhookEmbed(
        '✅ Users Removed', 
        removedUsers.length > 0 ? `Removed users: ${removedUsers.join(', ')}` : 'No valid users were removed.', 
        [], 
        0x00ff00, 
        isAdminChannel
    );
}

async function handleListUsersCommand(message, isAdminChannel) {
    const users = await database.getAllowedUsers();
    if (users.length === 0) {
        return await sendWebhookEmbed('📝 Allowed Users', 'No allowed users found.', [], 0xffff00, isAdminChannel);
    }
    
    const list = users.map(user => `• <@${user.userId}> (${user.username}) - Added: ${new Date(user.addedAt).toDateString()}`).join('\n');
    await sendWebhookEmbed('📝 Allowed Users', list, [], 0xffff00, isAdminChannel);
}

async function handleScanCommand(message, client, isAdminChannel) {
    await sendWebhookEmbed('🔄 Scan Started', 'Starting manual server scan...', [], 0xffff00, isAdminChannel);
    
    try {
        const targetGuild = client.guilds.cache.get(config.targetGuildId);
        if (targetGuild) {
            // Update status if available
            if (global.botStatus) {
                global.botStatus.scanInProgress = true;
                global.botStatus.scanStartTime = new Date();
            }
            
            await scanServer(targetGuild);
            
            // Update status if available
            if (global.botStatus) {
                global.botStatus.scanInProgress = false;
                global.botStatus.lastScanCompleted = new Date();
            }
            
            await sendWebhookEmbed('✅ Scan Complete', 'Server scan completed successfully!', [], 0x00ff00, isAdminChannel);
        } else {
            await sendWebhookEmbed('❌ Error', 'Target server not found.', [], 0xff0000, isAdminChannel);
        }
    } catch (error) {
        console.error('Error during scan:', error);
        
        // Update status if available
        if (global.botStatus) {
            global.botStatus.scanInProgress = false;
            global.botStatus.error = error.message;
            global.botStatus.errorTime = new Date();
        }
        
        await sendWebhookEmbed('❌ Error', `Server scan failed: ${error.message}`, [], 0xff0000, isAdminChannel);
    }
}

async function handleDatabaseStatsCommand(message, isAdminChannel) {
    const stats = database.getDatabaseStats();
    const messagesByChannel = stats.messagesByChannel;
    
    // Create formatted channel stats
    let channelStatsText = '';
    
    // Sort channels by message count (descending)
    const sortedChannels = Object.entries(messagesByChannel)
        .sort(([, countA], [, countB]) => countB - countA);
    
    for (const [channelName, count] of sortedChannels) {
        channelStatsText += `• #${channelName}: ${count} messages\n`;
    }
    
    if (!channelStatsText) {
        channelStatsText = 'No channel data available';
    }
    
    await sendWebhookEmbed(
        '📊 Database Statistics',
        `**Total Messages:** ${stats.totalMessages}
**Allowed Users:** ${stats.allowedUsers}
**Database Size:** ${stats.diskUsage.megabytes} MB (${stats.diskUsage.kilobytes} KB)
**Last Save:** ${stats.lastSaveTime ? stats.lastSaveTime.toLocaleString() : 'Never'}

**Messages by Channel:**
${channelStatsText}`,
        [],
        0x3498db,
        isAdminChannel
    );
}

module.exports = { setupCommands };
