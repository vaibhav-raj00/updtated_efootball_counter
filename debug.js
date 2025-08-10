// Debug script to check token format
console.log('=== Self-Bot Debug Information ===');
console.log('Environment Variables:');
console.log('DISCORD_TOKEN exists:', !!process.env.DISCORD_TOKEN);
console.log('OWNER_ID exists:', !!process.env.OWNER_ID);

if (process.env.DISCORD_TOKEN) {
    const token = process.env.DISCORD_TOKEN;
    console.log('Token length:', token.length);
    console.log('Token starts with:', token.substring(0, 10) + '...');
    
    // User tokens are typically longer than bot tokens
    if (token.length < 50) {
        console.log('❌ Token seems too short for a user token');
        console.log('   Bot tokens start with letters, user tokens are longer');
    } else if (token.startsWith('Bot ')) {
        console.log('❌ This looks like a bot token (starts with "Bot")');
        console.log('   For self-bots, you need a USER token, not a bot token');
    } else {
        console.log('✅ Token format looks correct for a user token');
    }
} else {
    console.log('❌ No DISCORD_TOKEN found');
}

if (process.env.OWNER_ID) {
    console.log('✅ Owner ID:', process.env.OWNER_ID);
} else {
    console.log('❌ No OWNER_ID found');
}

console.log('\n=== Token Instructions ===');
console.log('For a self-bot, you need your USER token, not a bot token:');
console.log('1. Open Discord in browser (discord.com)');
console.log('2. Press F12 (Developer Tools)');
console.log('3. Go to Network tab');
console.log('4. Send any message in Discord');
console.log('5. Look for any request in the network tab');
console.log('6. Click on it, go to Headers section');
console.log('7. Find "authorization" header - that\'s your user token');
console.log('8. Copy the entire value (it\'s usually very long)');
console.log('\n⚠️ WARNING: User tokens violate Discord TOS - educational use only!');