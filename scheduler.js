const cron = require('node-cron');
const { getModeratorMessages } = require('./database');
const { sendWebhookMessage } = require('./webhook');
const config = require('./config');

function startScheduler(client) {
    // Parse the configured report time
    const reportTime = config.reports.dailyReportTime || '23:59';
    const [hours, minutes] = reportTime.split(':').map(num => parseInt(num));
    
    // Validate time format
    if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        console.log('Invalid daily report time format, using default 23:59');
        hours = 23;
        minutes = 59;
    }
    
    // Create cron pattern (minute hour * * *)
    const cronPattern = `${minutes} ${hours} * * *`;
    
    // Schedule daily report at configured time
    cron.schedule(cronPattern, async () => {
        console.log('Running daily moderator report...');
        
        // Only run for target server
        const targetGuild = client.guilds.cache.get(config.targetGuildId);
        if (targetGuild) {
            try {
                await generateDailyReport(targetGuild);
            } catch (error) {
                console.error(`Error generating daily report for ${targetGuild.name}:`, error);
            }
        }
    });
    
    console.log(`Daily scheduler configured for ${reportTime}`);
}

async function generateDailyReport(guild) {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    // Get moderators using configured mod role ID
    let modUserIds = [];
    
    if (config.modRoleId && config.modRoleId !== 'YOUR_MOD_ROLE_ID_HERE') {
        const modRole = guild.roles.cache.get(config.modRoleId);
        if (modRole) {
            modUserIds = modRole.members.map(member => member.id);
        } else {
            console.log(`Configured mod role not found in ${guild.name}`);
            return;
        }
    } else {
        // Fallback: find role by name
        const modRole = guild.roles.cache.find(role => 
            role.name.toLowerCase().includes('mod') || 
            role.name.toLowerCase().includes('moderator') ||
            role.name.toLowerCase().includes('admin')
        );
        
        if (!modRole) {
            console.log(`No moderator role found in ${guild.name}`);
            return;
        }
        
        modUserIds = modRole.members.map(member => member.id);
    }
    
    try {
        const results = await getModeratorMessages(guild.id, modUserIds, yesterday);
        
        if (results.length === 0) {
            console.log(`No moderator activity found for ${guild.name} on ${yesterday.toDateString()}`);
            return;
        }
        
        // Organize data by moderator
        const modStats = {};
        const channelStats = {};
        let totalMessages = 0;
        let totalDeleted = 0;
        
        for (const result of results) {
            if (modUserIds.includes(result.authorId)) {
                // Initialize moderator stats
                if (!modStats[result.authorId]) {
                    modStats[result.authorId] = {
                        username: result.authorUsername,
                        total: 0,
                        deleted: 0,
                        channels: {}
                    };
                }
                
                // Add to moderator stats
                modStats[result.authorId].total += result.count;
                modStats[result.authorId].deleted += result.deletedCount;
                modStats[result.authorId].channels[result.channelName] = result.count;
                
                // Add to channel stats
                if (!channelStats[result.channelName]) {
                    channelStats[result.channelName] = 0;
                }
                channelStats[result.channelName] += result.count;
                
                totalMessages += result.count;
                totalDeleted += result.deletedCount;
            }
        }
        
        // Generate report
        let report = `📊 **Daily Moderator Report - ${yesterday.toDateString()}**\n`;
        report += `**Server:** ${guild.name}\n\n`;
        
        // Sort moderators by message count (high to low)
        const sortedMods = Object.entries(modStats)
            .sort(([,a], [,b]) => b.total - a.total);
        
        report += `**👮 Moderator Activity:**\n`;
        for (const [userId, stats] of sortedMods) {
            report += `• **${stats.username}**: ${stats.total} messages`;
            if (stats.deleted > 0) {
                report += ` (${stats.deleted} deleted)`;
            }
            report += '\n';
            
            // Channel breakdown
            const sortedChannels = Object.entries(stats.channels)
                .sort(([,a], [,b]) => b - a);
            
            for (const [channelName, count] of sortedChannels) {
                report += `  └ #${channelName}: ${count}\n`;
            }
        }
        
        report += `\n**📋 Channel Summary:**\n`;
        const sortedChannels = Object.entries(channelStats)
            .sort(([,a], [,b]) => b - a);
        
        for (const [channelName, count] of sortedChannels) {
            report += `• #${channelName}: ${count} messages\n`;
        }
        
        if (totalDeleted > 0) {
            report += `\n**🗑️ Deleted Messages:** ${totalDeleted}\n`;
        }
        
        report += `\n**📊 Total Messages:** ${totalMessages}`;
        
        // Send report via webhook instead of Discord channel
        try {
            // Split report if too long
            if (report.length > 2000) {
                const chunks = splitMessage(report, 1900);
                for (const chunk of chunks) {
                    await sendWebhookMessage(chunk);
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }
            } else {
                await sendWebhookMessage(report);
            }
            
            console.log(`Daily report sent via webhook for ${guild.name}`);
        } catch (error) {
            console.error(`Failed to send report via webhook for ${guild.name}:`, error);
        }
        
    } catch (error) {
        console.error(`Error generating report for ${guild.name}:`, error);
    }
}

function splitMessage(text, maxLength) {
    const chunks = [];
    let currentChunk = '';
    
    const lines = text.split('\n');
    
    for (const line of lines) {
        if (currentChunk.length + line.length + 1 > maxLength) {
            if (currentChunk) {
                chunks.push(currentChunk);
                currentChunk = '';
            }
        }
        
        if (currentChunk) {
            currentChunk += '\n' + line;
        } else {
            currentChunk = line;
        }
    }
    
    if (currentChunk) {
        chunks.push(currentChunk);
    }
    
    return chunks;
}

module.exports = { startScheduler, generateDailyReport };
