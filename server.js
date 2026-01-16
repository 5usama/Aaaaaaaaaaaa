const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const ytSearch = require('yt-search');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8080;

// ==================== CDN401 CONFIG ====================
const CDN = 'cdn401.savetube.vip';
const ANU_KEY = Buffer.from('C5D58EF67A7584E4A29F6C35BBC4EB12', 'hex');

// Decryption function
function decryptData(encryptedText) {
    try {
        const cleaned = encryptedText.replace(/\s/g, '');
        const buffer = Buffer.from(cleaned, 'base64');
        const iv = buffer.slice(0, 16);
        const data = buffer.slice(16);
        const decipher = crypto.createDecipheriv('aes-128-cbc', ANU_KEY, iv);
        const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
        return JSON.parse(decrypted.toString());
    } catch (error) {
        return null;
    }
}

// Get video info from CDN
async function getCDNVideoInfo(videoUrl) {
    try {
        const headers = {
            'Content-Type': 'application/json',
            'origin': 'https://ytsave.savetube.me',
            'referer': 'https://ytsave.savetube.me/',
            'User-Agent': 'Mozilla/5.0'
        };

        const response = await axios.post(
            `https://${CDN}/v2/info`,
            { url: videoUrl },
            { headers, timeout: 15000 }
        );

        if (response.data?.status) {
            return decryptData(response.data.data);
        }
        return null;
    } catch (error) {
        return null;
    }
}

// Get download URL from CDN
async function getCDNDownloadUrl(videoId, key, type, quality) {
    try {
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0',
            'origin': 'https://ytsave.savetube.me',
            'referer': 'https://ytsave.savetube.me/'
        };

        const data = {
            id: videoId,
            key: key,
            downloadType: type,
            quality: String(quality)
        };

        const response = await axios.post(
            `https://${CDN}/download`,
            data,
            { headers, timeout: 15000 }
        );

        return response.data?.data?.downloadUrl || null;
    } catch (error) {
        return null;
    }
}

// ==================== VIDEO ID EXTRACTION ====================
function getVideoId(url) {
    // Clean URL first
    let cleanUrl = url.split('?')[0].split('&')[0];
    
    // Patterns
    const patterns = [
        /youtu\.be\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
        /^([a-zA-Z0-9_-]{11})$/
    ];
    
    for (const pattern of patterns) {
        const match = cleanUrl.match(pattern);
        if (match && match[1]) {
            return match[1];
        }
    }
    return null;
}

// ==================== MAIN FUNCTION ====================
async function getDirectDownload(query) {
    try {
        // Step 1: Search YouTube
        const search = await ytSearch(query);
        if (!search.videos || search.videos.length === 0) {
            throw new Error('No videos found');
        }

        // Get first video
        const video = search.videos[0];
        const videoId = video.videoId;
        const videoUrl = video.url;

        // Step 2: Get info from CDN
        const videoInfo = await getCDNVideoInfo(videoUrl);
        if (!videoInfo) {
            throw new Error('Could not get video information');
        }

        // Step 3: Get 360p video download
        const video360 = await getCDNDownloadUrl(videoInfo.id, videoInfo.key, 'video', '360');
        
        // Step 4: Get 256kbps audio download
        const audio256 = await getCDNDownloadUrl(videoInfo.id, videoInfo.key, 'audio', '256');
        
        // If 256 not available, try 192
        let audioLink = audio256;
        if (!audio256) {
            audioLink = await getCDNDownloadUrl(videoInfo.id, videoInfo.key, 'audio', '192');
        }
        if (!audioLink) {
            audioLink = await getCDNDownloadUrl(videoInfo.id, videoInfo.key, 'audio', '128');
        }

        // Check if we got at least one link
        if (!video360 && !audioLink) {
            throw new Error('Could not get download links');
        }

        // Prepare response
        const response = {
            success: true,
            query: query,
            video: {
                id: videoId,
                title: video.title,
                duration: video.duration || 'N/A',
                thumbnail: video.thumbnail,
                channel: video.author?.name || 'Unknown',
                views: video.views,
                url: videoUrl
            },
            downloads: {}
        };

        // Add video download if available
        if (video360) {
            response.downloads.video_360p = video360;
        }

        // Add audio download if available
        if (audioLink) {
            response.downloads.audio = audioLink;
        }

        // Add developer name
        response.developer = 'USAMA DHUDDI';

        return response;

    } catch (error) {
        return {
            success: false,
            error: error.message,
            query: query || '',
            developer: 'USAMA DHUDDI'
        };
    }
}

// ==================== API ROUTES ====================

// Home
app.get('/', (req, res) => {
    res.json({
        service: 'YouTube Direct Download',
        developer: 'USAMA DHUDDI',
        endpoint: '/api?query=SONG_NAME',
        example: '/api?query=barota',
        cdn: 'cdn401.savetube.vip',
        note: 'Direct query to download links'
    });
});

// Main API endpoint
app.get('/api', async (req, res) => {
    const { query } = req.query;
    
    if (!query || query.trim() === '') {
        return res.json({
            success: false,
            error: 'Query parameter is required',
            example: '/api?query=barota',
            developer: 'USAMA DHUDDI'
        });
    }

    const result = await getDirectDownload(query);
    res.json(result);
});

// Alternative endpoint
app.get('/search', async (req, res) => {
    const { q } = req.query;
    if (!q) {
        return res.json({
            success: false,
            error: 'Use q parameter',
            example: '/search?q=barota',
            developer: 'USAMA DHUDDI'
        });
    }
    
    const result = await getDirectDownload(q);
    res.json(result);
});

// Quick download
app.get('/dl', async (req, res) => {
    const { query } = req.query;
    if (!query) {
        return res.json({
            success: false,
            error: 'Add query parameter',
            developer: 'USAMA DHUDDI'
        });
    }
    
    const result = await getDirectDownload(query);
    
    // Simple response for bots
    if (result.success && result.downloads.video_360p) {
        res.json({
            success: true,
            title: result.video.title,
            download: result.downloads.video_360p,
            developer: 'USAMA DHUDDI'
        });
    } else {
        res.json(result);
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'active',
        cdn: CDN,
        developer: 'USAMA DHUDDI',
        time: new Date().toLocaleTimeString('en-PK')
    });
});

// Start server
app.listen(PORT, () => {
    console.log('================================');
    console.log('🎯 YOUTUBE DOWNLOAD API');
    console.log(`📍 PORT: ${PORT}`);
    console.log('👨‍💻 DEVELOPER: USAMA DHUDDI');
    console.log('🌐 CDN: cdn401.savetube.vip');
    console.log('================================');
    console.log(`🔗 URL: http://localhost:${PORT}`);
    console.log(`🎵 TEST: http://localhost:${PORT}/api?query=barota`);
    console.log('================================');
});
