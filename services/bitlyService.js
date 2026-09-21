const axios = require('axios');

/**
 * SEC-010: this was a live Bitly access token as a string literal in a
 * git-tracked file, so it is in the repository's history and must be rotated at
 * Bitly - removing it from HEAD does not revoke it.
 *
 * No fallback literal: a missing key fails the call rather than silently using a
 * compromised one.
 */
const BITLY_ACCESS_TOKEN = process.env.BITLY_ACCESS_TOKEN;

async function shortenUrl(longUrl) {
    if (!BITLY_ACCESS_TOKEN) {
        throw new Error('BITLY_ACCESS_TOKEN is not configured');
    }
    try {
        const response = await axios.post(
            'https://api-ssl.bitly.com/v4/shorten',
            {
                long_url: longUrl,
            },
            {
                headers: {
                    Authorization: `Bearer ${BITLY_ACCESS_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        return response.data.link;
    } catch (error) {
        console.error('Error shortening URL with Bitly:', error.message);
        throw error;
    }
}

module.exports = { shortenUrl };
