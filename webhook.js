const https = require('https');
const { URL } = require('url');
const config = require('./config');

function getCurrentDateTime() {
    return new Date().toLocaleString('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    }) + ' UTC';
}

async function sendWebhookMessage(content, embeds = null, isAdminChannel = false) {
    const webhookUrl = isAdminChannel ? config.adminWebhookUrl : config.webhookUrl;
    
    if (!webhookUrl || webhookUrl === 'YOUR_WEBHOOK_URL_HERE') {
        console.log(`${isAdminChannel ? 'Admin webhook' : 'Webhook'} URL not configured, skipping message`);
        return;
    }

    try {
        const url = new URL(webhookUrl);
        
        const payload = {
            content: content || null,
            embeds: embeds || null,
            username: 'Self-Bot Analytics',
            avatar_url: 'https://cdn.discordapp.com/embed/avatars/0.png'
        };

        const data = JSON.stringify(payload);

        const options = {
            hostname: url.hostname,
            port: url.port || 443,
            path: url.pathname + url.search,
            method: 'POST',
            timeout: 10000, // 10 second timeout
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(data)
            }
        };

        return new Promise((resolve, reject) => {
            const req = https.request(options, (res) => {
                let response = '';
                
                res.on('data', (chunk) => {
                    response += chunk;
                });
                
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(response);
                    } else {
                        reject(new Error(`Webhook request failed with status ${res.statusCode}: ${response}`));
                    }
                });
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Webhook request timed out after 10 seconds'));
            });

            req.on('error', (error) => {
                if (error.code === 'ECONNRESET' || error.message.includes('socket hang up')) {
                    reject(new Error('Webhook connection was reset - please verify the webhook URL is valid and active'));
                } else {
                    reject(error);
                }
            });

            req.write(data);
            req.end();
        });
    } catch (error) {
        console.error('Error sending webhook message:', error);
        throw error;
    }
}

async function sendWebhookEmbed(title, description, fields = [], color = 0x0099ff, isAdminChannel = false) {
    const embed = {
        title,
        description,
        color,
        fields,
        footer: {
            text: `DEVELOPED BY VAIBHAV || Today at ${new Date().toLocaleString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            })}`
        }
    };

    return await sendWebhookMessage(null, [embed], isAdminChannel);
}

module.exports = {
    sendWebhookMessage,
    sendWebhookEmbed
};