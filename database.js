const fs = require('fs').promises;
const path = require('path');

let data = {
    messages: [],
    allowedUsers: [],
    config: {}
};

const dataFile = './bot_data.json';

// Initialize JSON database
async function initDatabase() {
    try {
        try {
            const fileData = await fs.readFile(dataFile, 'utf8');
            data = JSON.parse(fileData);
            console.log('Loaded existing data from JSON file');
        } catch (err) {
            console.log('Creating new JSON data file');
            await saveData();
        }
        console.log('JSON database initialized successfully');
    } catch (error) {
        console.error('Error initializing JSON database:', error);
        throw error;
    }
}

// Save data to JSON file
async function saveData() {
    try {
        await fs.writeFile(dataFile, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error saving data to JSON:', error);
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
        data.messages.forEach(message => {
            if (message.channelId === channelId) {
                message.channelDeleted = true;
            }
        });
        await saveData();
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

module.exports = {
    initDatabase,
    insertMessage,
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
    isUserAllowed
};
