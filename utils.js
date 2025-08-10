const moment = require('moment');
const { isUserAllowed } = require('./database');
const config = require('./config');

function parseDate(dateString) {
    if (!dateString) return null;
    
    // Try DD/MM/YYYY format
    let date = moment(dateString, 'DD/MM/YYYY', true);
    if (date.isValid()) {
        return date.toDate();
    }
    
    // Try DDMMYYYY format
    date = moment(dateString, 'DDMMYYYY', true);
    if (date.isValid()) {
        return date.toDate();
    }
    
    // Try other common formats
    date = moment(dateString, ['YYYY-MM-DD', 'MM/DD/YYYY', 'DD-MM-YYYY'], true);
    if (date.isValid()) {
        return date.toDate();
    }
    
    return null;
}

function isOwner(userId) {
    return config.owners.includes(userId);
}

async function hasPermission(userId) {
    // Owner always has permission
    if (isOwner(userId)) return true;
    
    // Check if user is in allowed users list
    try {
        return await isUserAllowed(userId);
    } catch (error) {
        console.error('Error checking user permission:', error);
        return false;
    }
}

function formatDate(date) {
    return moment(date).format('DD/MM/YYYY');
}

function formatDateTime(date) {
    return moment(date).format('DD/MM/YYYY HH:mm:ss');
}

function sanitizeString(str) {
    if (!str) return '';
    return str.replace(/[<>@#&!]/g, '');
}

function extractUserId(mention) {
    return mention.replace(/[<@!>]/g, '');
}

function extractChannelId(mention) {
    return mention.replace(/[<#>]/g, '');
}

function isValidSnowflake(id) {
    return /^\d{17,19}$/.test(id);
}

function chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

function escapeMarkdown(text) {
    return text.replace(/[\\`*_{}[\]()~>#+\-=|.!]/g, '\\$&');
}

function truncateString(str, maxLength) {
    if (str.length <= maxLength) return str;
    return str.substring(0, maxLength - 3) + '...';
}

module.exports = {
    parseDate,
    isOwner,
    hasPermission,
    formatDate,
    formatDateTime,
    sanitizeString,
    extractUserId,
    extractChannelId,
    isValidSnowflake,
    chunkArray,
    escapeMarkdown,
    truncateString
};
