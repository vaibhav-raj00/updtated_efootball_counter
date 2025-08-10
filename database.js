const fs = require('fs').promises;
const path = require('path');

let data = {
    messages: [],
    allowedUsers: [],
    config: {}
};

const dataFile = './bot_data.json';

// Throttle saving to disk to avoid excessive writes
let saveTimeout = null;
const SAVE_DELAY = 5000; // 5 seconds
let pendingSave = false;
let lastSaveTime = null;

// Initialize JSON database
async function initDatabase() {
    try {
        try {
            console.log('Attempting to load data from JSON file');
            const fileData = await fs.readFile(dataFile, 'utf8');
            data = JSON.parse(fileData);
            console.log(`Loaded existing data from JSON file with ${data.messages.length} messages`);
        } catch (err) {
            console.log('Creating new JSON data file');
            await saveData(true); // Force immediate save
        }
        console.log('JSON database initialized successfully');
    } catch (error) {
        console.error('Error initializing JSON database:', error);
        throw error;
    }
}

// Save data to JSON file with throttling
async function saveData(force = false) {
    pendingSave = true;
    
    // If forced, save immediately
    if (force) {
        if (saveTimeout) {
            clearTimeout(saveTimeout);
            saveTimeout = null;
        }
        
        try {
            await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
            console.log('Data saved to JSON file (forced)');
            pendingSave = false;
            lastSaveTime = new Date();
            return;
        } catch (error) {
            console.error('Error saving data to JSON:', error);
            throw error;
        }
    }
    
    // Otherwise use throttled saving
    if (saveTimeout) {
        return; // Already scheduled
    }
    
    return new Promise((resolve) => {
        saveTimeout = setTimeout(async () => {
            try {
                if (pendingSave) {
                    await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
                    console.log('Data saved to JSON file');
                    pendingSave = false;
                    lastSaveTime = new Date();
                }
                saveTimeout = null;
                resolve();
            } catch (error) {
                console.error('Error saving data to JSON:', error);
                saveTimeout = null;
                resolve();
            }
        }, SAVE_DELAY);
    });
}

// Create backup of data
async function createBackup() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = `./backup_${timestamp}.json`;
        await fs.writeFile(backupFile, JSON.stringify(data, null, 2));
        console.log(`Backup created: ${backupFile}`);
        return backupFile;
    } catch (error) {
        console.error('Error creating backup:', error);
        throw error;
    }
}

// Insert new message
async function insertMessage(messageData) {
    try {
        const existingIndex = data.messages.findIndex(m => m.messageId === messageData.messageId);
        if (existingIndex !== -1) {
            data.messages[existingIndex] = messageData;
        } else {
            data.messages.push(messageData);
        }
        await saveData();
    } catch (error) {
        console.error('Error inserting message:', error);
        throw error;
    }
}

// Batch insert messages
async function batchInsertMessages(messages) {
    try {
        let inserted = 0;
        let updated = 0;
        
        for (const messageData of messages) {
            const existingIndex = data.messages.findIndex(m => m.messageId === messageData.messageId);
            
            if (existingIndex !== -1) {
                data.messages[existingIndex] = messageData;
                updated++;
            } else {
                data.messages.push(messageData);
                inserted++;
            }
        }
        
        if (inserted > 0 || updated > 0) {
            await saveData();
        }
        
        return { inserted, updated };
    } catch (error) {
        console.error('Error batch inserting messages:', error);
        throw error;
    }
}

// Mark message as deleted
async function markMessageDeleted(messageId) {
    try {
        const message = data.messages.find(m => m.messageId === messageId);
        if (message) {
            message.deleted = true;
            await saveData();
        }
    } catch (error) {
        console.error('Error marking message as deleted:', error);
    }
}

// Mark all messages in a channel as deleted
async function markChannelMessagesDeleted(channelId) {
    try {
        let count = 0;
        data.messages.forEach(message => {
            if (message.channelId === channelId) {
                message.channelDeleted = true;
                count++;
            }
        });
        
        if (count > 0) {
            console.log(`Marked ${count} messages as deleted from channel ${channelId}`);
            await saveData();
        }
    } catch (error) {
        console.error('Error marking channel messages as deleted:', error);
    }
}

// Filter helper to only count real user messages
function isRealUserMessage(message) {
    // Exclude webhook messages (discriminator "0000") and bots
    return !message.isBot && message.authorDiscriminator !== "0000";
}

// Get message count
async function getMessageCount(guildId = null, date = null) {
    try {
        let filteredMessages = data.messages.filter(isRealUserMessage);

        if (guildId) {
            filteredMessages = filteredMessages.filter(message => message.guildId === guildId);
        }

        if (date) {
            const startDate = new Date(date);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);

            filteredMessages = filteredMessages.filter(message => {
                const messageDate = new Date(message.timestamp);
                return messageDate >= startDate && messageDate <= endDate;
            });
        }

        return filteredMessages.length;
    } catch (error) {
        console.error('Error getting message count:', error);
        return 0;
    }
}

// Get user message count
async function getUserMessageCount(guildId, userId, date = null, channelId = null) {
    try {
        let filteredMessages = data.messages.filter(message => {
            return isRealUserMessage(message) &&
                   message.guildId === guildId &&
                   message.authorId === userId &&
                   (channelId ? message.channelId === channelId : true);
        });

        if (date) {
            const startDate = new Date(date);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);

            filteredMessages = filteredMessages.filter(message => {
                const messageDate = new Date(message.timestamp);
                return messageDate >= startDate && messageDate <= endDate;
            });
        }

        return filteredMessages.length;
    } catch (error) {
        console.error('Error getting user message count:', error);
        return 0;
    }
}

// Get channel message count
async function getChannelMessageCount(channelId, date = null) {
    try {
        let filteredMessages = data.messages.filter(message =>
            isRealUserMessage(message) && message.channelId === channelId
        );

        if (date) {
            const startDate = new Date(date);
            startDate.setHours(0, 0, 0, 0);
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);

            filteredMessages = filteredMessages.filter(message => {
                const messageDate = new Date(message.timestamp);
                return messageDate >= startDate && messageDate <= endDate;
            });
        }

        return filteredMessages.length;
    } catch (error) {
        console.error('Error getting channel message count:', error);
        return 0;
    }
}

// Get message count by channel
function getMessageCountByChannel() {
    try {
        const channels = {};
        data.messages.forEach(message => {
            if (!channels[message.channelName]) {
                channels[message.channelName] = 0;
            }
            channels[message.channelName]++;
        });
        return channels;
    } catch (error) {
        console.error('Error getting message count by channel:', error);
        return {};
    }
}

// Get moderator messages
async function getModeratorMessages(guildId, modUserIds, date) {
    try {
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);

        const filteredMessages = data.messages.filter(message => {
            const messageDate = new Date(message.timestamp);
            return isRealUserMessage(message) &&
                   message.guildId === guildId &&
                   modUserIds.includes(message.authorId) &&
                   messageDate >= startDate &&
                   messageDate <= endDate;
        });

        const grouped = {};
        filteredMessages.forEach(message => {
            const key = `${message.authorId}-${message.channelId}`;
            if (!grouped[key]) {
                grouped[key] = {
                    authorId: message.authorId,
                    authorUsername: message.authorUsername,
                    channelId: message.channelId,
                    channelName: message.channelName,
                    count: 0,
                    deletedCount: 0
                };
            }
            grouped[key].count++;
            if (message.deleted || message.channelDeleted) {
                grouped[key].deletedCount++;
            }
        });

        return Object.values(grouped).sort((a, b) => b.count - a.count);
    } catch (error) {
        console.error('Error getting moderator messages:', error);
        return [];
    }
}

// Get mods and users count
async function getModsAndUsersCount(guildId, modUserIds, date, channelId = null) {
    try {
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);

        const filteredMessages = data.messages.filter(message => {
            const messageDate = new Date(message.timestamp);
            const matchesGuild = message.guildId === guildId;
            const matchesDate = messageDate >= startDate && messageDate <= endDate;
            const matchesChannel = channelId ? message.channelId === channelId : true;

            return matchesGuild && matchesDate && matchesChannel;
        });

        let modCount = 0;
        let userCount = 0;

        filteredMessages.forEach(message => {
            const isReal = !message.isBot && message.authorDiscriminator !== "0000";
            if (!isReal) return; // skip bots and webhooks entirely

            if (modUserIds.includes(message.authorId)) {
                modCount++;
            } else {
                // Only count members WITHOUT mod role
                userCount++;
            }
        });

        return { modCount, userCount };
    } catch (error) {
        console.error('Error getting mods and users count:', error);
        return { modCount: 0, userCount: 0 };
    }
}

// Add allowed user
async function addAllowedUser(userId, username) {
    try {
        const existingIndex = data.allowedUsers.findIndex(u => u.userId === userId);
        const userData = {
            userId,
            username,
            addedAt: new Date().toISOString()
        };

        if (existingIndex !== -1) {
            data.allowedUsers[existingIndex] = userData;
        } else {
            data.allowedUsers.push(userData);
        }

        await saveData();
    } catch (error) {
        console.error('Error adding allowed user:', error);
        throw error;
    }
}

// Remove allowed user
async function removeAllowedUser(userId) {
    try {
        data.allowedUsers = data.allowedUsers.filter(u => u.userId !== userId);
        await saveData();
    } catch (error) {
        console.error('Error removing allowed user:', error);
        throw error;
    }
}

// Get all allowed users
async function getAllowedUsers() {
    try {
        return data.allowedUsers.sort((a, b) => a.username.localeCompare(b.username));
    } catch (error) {
        console.error('Error getting allowed users:', error);
        return [];
    }
}

// Check if user is allowed
async function isUserAllowed(userId) {
    try {
        return data.allowedUsers.some(u => u.userId === userId);
    } catch (error) {
        console.error('Error checking if user is allowed:', error);
        return false;
    }
}

// Get database stats
function getDatabaseStats() {
    try {
        // Rough estimate based on JSON stringification
        const jsonSize = JSON.stringify(data).length;
        
        return {
            totalMessages: data.messages.length,
            allowedUsers: data.allowedUsers.length,
            lastSaveTime,
            messagesByChannel: getMessageCountByChannel(),
            diskUsage: {
                bytes: jsonSize,
                kilobytes: Math.round(jsonSize / 1024),
                megabytes: (jsonSize / (1024 * 1024)).toFixed(2)
            }
        };
    } catch (error) {
        console.error('Error getting database stats:', error);
        return { 
            totalMessages: 0,
            allowedUsers: 0,
            diskUsage: { bytes: 0, kilobytes: 0, megabytes: '0.00' }
        };
    }
}

// Export all functions
module.exports = {
    initDatabase,
    saveData,
    insertMessage,
    batchInsertMessages,
    markMessageDeleted,
    markChannelMessagesDeleted,
    getMessageCount,
    getUserMessageCount,
    getChannelMessageCount,
    getModeratorMessages,
    getModsAndUsersCount,
    addAllowedUser,
    removeAllowedUser,
    getAllowedUsers,
    isUserAllowed,
    createBackup,
    getDatabaseStats,
    getMessageCountByChannel
};
