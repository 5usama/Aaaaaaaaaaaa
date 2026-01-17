const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cors = require('cors');
const ytSearch = require('yt-search');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 8000;

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

// CDN se video info get karo
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

// CDN se download URL get karo - YAHAN FIX KIYA HAI
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

        let downloadUrl = response.data?.data?.downloadUrl || null;
        
        // WHATSAPP VIDEO FORMAT FIX - YE NAYA CODE HAI
        if (downloadUrl && type === 'video') {
            // Video ko WhatsApp ke liye compatible banaye
            // 1. MP4 format ensure karo
            if (!downloadUrl.toLowerCase().includes('.mp4')) {
                // Agar URL mein .mp4 nahi hai toh add karo
                downloadUrl = downloadUrl + '#.mp4';
            }
            
            // 2. YouTube ke proper format mein convert karo
            downloadUrl = downloadUrl.replace(/\?.*$/, '') + '?format=mp4&type=video/mp4';
            
            // 3. WhatsApp video parameters add karo
            const urlObj = new URL(downloadUrl);
            urlObj.searchParams.append('vcodec', 'h264');
            urlObj.searchParams.append('acodec', 'aac');
            urlObj.searchParams.append('container', 'mp4');
            downloadUrl = urlObj.toString();
        }
        
        return downloadUrl;

    } catch (error) {
        return null;
    }
}

// ==================== VIDEO ID EXTRACTION ====================
function getVideoId(url) {
    // Pehle URL saaf karo
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
        // Step 1: YouTube pe search karo
        const search = await ytSearch(query);
        if (!search.videos || search.videos.length === 0) {
            throw new Error('Koi video nahi mila');
        }

        // Pehla video lo
        const video = search.videos[0];
        const videoId = video.videoId;
        const videoUrl = video.url;

        // Step 2: CDN se info lo
        const videoInfo = await getCDNVideoInfo(videoUrl);
        if (!videoInfo) {
            throw new Error('Video information nahi mil saka');
        }

        // Step 3: WhatsApp compatible video download lo
        const video360 = await getCDNDownloadUrl(videoInfo.id, videoInfo.key, 'video', '360');
        
        // Step 4: Audio download lo
        const audio256 = await getCDNDownloadUrl(videoInfo.id, videoInfo.key, 'audio', '256');
        
        // Agar 256 nahi mila toh 192 try karo
        let audioLink = audio256;
        if (!audio256) {
            audioLink = await getCDNDownloadUrl(videoInfo.id, videoInfo.key, 'audio', '192');
        }
        if (!audioLink) {
            audioLink = await getCDNDownloadUrl(videoInfo.id, videoInfo.key, 'audio', '128');
        }

        // Check karo ke koi link mila ya nahi
        if (!video360 && !audioLink) {
            throw new Error('Download links nahi mil sake');
        }

        // Response taiyar karo
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

        // Video download add karo agar available hai
        if (video360) {
            response.downloads.video_360p = video360;
            // WhatsApp ke liye special link
            response.downloads.whatsapp_video = video360.replace(/#\.mp4\?/, '?') + '&whatsapp=true';
        }

        // Audio download add karo agar available hai
        if (audioLink) {
            response.downloads.audio = audioLink;
            response.downloads.whatsapp_audio = audioLink + '&type=audio/mpeg';
        }

        // Developer name add karo
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
            error: 'Query parameter zaroori hai',
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
            error: 'q parameter use karo',
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
            error: 'Query parameter add karo',
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
            whatsapp_download: result.downloads.whatsapp_video,
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