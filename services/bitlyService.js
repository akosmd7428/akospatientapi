const axios = require('axios');

const BITLY_ACCESS_TOKEN = '4c857ab70e9cfc90f1889f44b7024da648c54b3c';

async function shortenUrl(longUrl) {
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
