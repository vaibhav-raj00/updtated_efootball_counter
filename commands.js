const { parseDate, isOwner, hasPermission } = require('./utils');
const {
    getMessageCount,
    getUserMessageCount,
    getChannelMessageCount,
    getModeratorMessages,
    getModsAndUsersCount,
    addAllowedUser,
    removeAllowedUser,
    getAllowedUsers
} = require('./database');
const { scanServer } = require('./scanner');
const { sendWebhookEmbed } = require('./webhook');
const config = require('./config');

function setupCommands(client) {
    client.on('messageCreate', async (message) => {
        if (message.author.bot || !message.content.startsWith('&')) return;
        
        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        
        try {
            await handleCommand(message, command, args, client);
        } catch (error) {
            console.error('Command error:', error);
        }
    });
}

async function handleCommand(message, command, args, client) {
    const authorId = message.author.id;
    const guildId = message.guild?.id;
    const channelId = message.channel?.id;
    
    const hasAccess = isOwner(authorId) || await hasPermission(authorId);
    const isTargetServer = guildId === config.targetGuildId;
    const isAdminChannel = channelId === config.adminChannelId;
    
    if (!isTargetServer && !isAdminChannel) return;
    if (!hasAccess) return;

    try { await message.delete(); } catch {}

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
            if (!isOwner(authorId)) return;
            await handleAddUserCommand(message, args, isAdminChannel);
            break;
        case 'removeuser':
            if (!isOwner(authorId)) return;
            await handleRemoveUserCommand(message, args, isAdminChannel);
            break;
        case 'listuser':
            if (!isOwner(authorId)) return;
            await handleListUsersCommand(message, isAdminChannel);
            break;
        case 'scan':
            if (!isOwner(authorId)) return;
            await handleScanCommand(message, client, isAdminChannel);
            break;
        default:
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
                '`&scan` — Scan all server messages again'
            ].join('\n'),
            inline: false
        });
    }

    await sendWebhookEmbed(
        '📖 Bot Help Menu',
        'Here’s a list of all available commands:',
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
        const count = await getMessageCount(guildId, date);
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
        const count = await getUserMessageCount(guildId, userId, date);
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
        const count = await getChannelMessageCount(channelId, date);
        return await sendWebhookEmbed(
            `📊 Messages in <#${channelId}>`,
            `Messages on ${date.toDateString()}: **${count}**`,
            [],
            0x00ff00,
            isAdminChannel
        );
    }

    // Mods only
   if (firstArg === 'mods') {
    const guild = message.guild;
    let modUserIds = [];

    if (config.modRoleId && config.modRoleId !== '1343908438060695664') {
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
        const modRole = guild.roles.cache.find(role =>
            role.name.toLowerCase().includes('mod') ||
            role.name.toLowerCase().includes('moderator')
        );
        modUserIds = modRole ? modRole.members.map(member => member.id) : [];
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

    const results = await getModeratorMessages(guildId, modUserIds, date);

    if (!results || results.length === 0) {
        return await sendWebhookEmbed(
            '📊 Moderator Activity',
            `No moderator messages found on ${date.toDateString()}.`,
            [],
            0xffff00,
            isAdminChannel
        );
    }

    const modStats = {};
    for (const result of results) {
        if (!modStats[result.authorId]) {
            modStats[result.authorId] = {
                username: result.authorUsername,
                total: 0,
                channels: []
            };
        }
        modStats[result.authorId].total += result.count;
        modStats[result.authorId].channels.push({
            channel: result.channelId,
            channelName: result.channelName,
            count: result.count,
            deleted: result.deletedCount
        });
    }

    const sortedMods = Object.entries(modStats)
        .sort(([, a], [, b]) => b.total - a.total);

    let description = '';
    for (const [, stats] of sortedMods) {
        description += `**${stats.username}**: ${stats.total} messages\n`;
        for (const ch of stats.channels) {
            // Prefer channel mention if valid
            const channelDisplay = ch.channel ? `<#${ch.channel}>` : `#${ch.channelName}`;
            description += `  • ${channelDisplay}: ${ch.count} (${ch.deleted} deleted)\n`;
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

    const results = await getModeratorMessages(guildId, modUserIds, date);

    if (!results || results.length === 0) {
        return await sendWebhookEmbed(
            '📊 Moderator Activity',
            `No moderator messages found on ${date.toDateString()}.`,
            [],
            0xffff00,
            isAdminChannel
        );
    }

    const modStats = {};
    for (const result of results) {
        if (!modStats[result.authorId]) {
            modStats[result.authorId] = {
                username: result.authorUsername,
                total: 0,
                channels: []
            };
        }
        modStats[result.authorId].total += result.count;
        modStats[result.authorId].channels.push({
            channel: result.channelId,
            channelName: result.channelName,
            count: result.count,
            deleted: result.deletedCount
        });
    }

    const sortedMods = Object.entries(modStats)
        .sort(([, a], [, b]) => b.total - a.total);

    let description = '';
    for (const [, stats] of sortedMods) {
        description += `**${stats.username}**: ${stats.total} messages\n`;
        for (const ch of stats.channels) {
            // Prefer channel mention if valid
            const channelDisplay = ch.channel ? `<#${ch.channel}>` : `#${ch.channelName}`;
            description += `  • ${channelDisplay}: ${ch.count} (${ch.deleted} deleted)\n`;
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

async function handleInfoCommand(message, client, isAdminChannel) {
    const uptime = process.uptime();
    const uptimeStr = `${Math.floor(uptime / 86400)}d ${Math.floor((uptime % 86400) / 3600)}h ${Math.floor((uptime % 3600) / 60)}m ${Math.floor(uptime % 60)}s`;
    const ping = Date.now() - message.createdTimestamp;
    const memUsage = (process.memoryUsage().rss / 1024 / 1024).toFixed(2);
    const guild = client.guilds.cache.get(config.targetGuildId);

    await sendWebhookEmbed(
        '**Bot Information**',
        `**Status:** Online
**Ping:** ${ping}ms
**Uptime:** ${uptimeStr}
**Server:** ${guild?.name || 'Unknown'}
**Server ID:** ${config.targetGuildId}
**Memory Usage:** ${memUsage} MB
**Node.js Version:** ${process.version}
**Discord.js Version:** ${require('discord.js').version}
**Platform:** ${process.platform}
**Tracking Messages:** Yes (including deleted messages)
**Allowed Users:** ${(await getAllowedUsers()).length}
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
            await addAllowedUser(userId, user.username);
            addedUsers.push(user.username);
        } catch {}
    }
    await sendWebhookEmbed('✅ Users Added', addedUsers.join(', ') || 'No valid users were added.', [], 0x00ff00, isAdminChannel);
}

async function handleRemoveUserCommand(message, args, isAdminChannel) {
    if (args.length === 0) {
        return await sendWebhookEmbed('❌ Error', 'Please specify user(s) to remove.', [], 0xff0000, isAdminChannel);
    }
    
    const removedUsers = [];
    for (const arg of args) {
        const userId = arg.replace(/[<@!>]/g, '');
        try {
            await removeAllowedUser(userId);
            removedUsers.push(userId);
        } catch {}
    }
    await sendWebhookEmbed('✅ Users Removed', removedUsers.join(', ') || 'No valid users were removed.', [], 0x00ff00, isAdminChannel);
}

async function handleListUsersCommand(message, isAdminChannel) {
    const users = await getAllowedUsers();
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
            await scanServer(targetGuild);
            await sendWebhookEmbed('✅ Scan Complete', 'Server scan completed successfully!', [], 0x00ff00, isAdminChannel);
        } else {
            await sendWebhookEmbed('❌ Error', 'Target server not found.', [], 0xff0000, isAdminChannel);
        }
    } catch {
        await sendWebhookEmbed('❌ Error', 'Server scan failed. Check console for details.', [], 0xff0000, isAdminChannel);
    }
}


module.exports = { setupCommands };
