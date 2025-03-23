import { config } from './config.js';

let player;
let imageURLs = [];
let currentLyricIndex = 0;
let playerReady = false;
let generatedImagesCount = 0;

// Initialize the YouTube API
window.onYouTubeIframeAPIReady = function() {
    player = new YT.Player('youtube-player', {
        height: '100%',
        width: '100%',
        videoId: config.videoId,
        playerVars: {
            'autoplay': 0,
            'controls': 0,
            'showinfo': 0,
            'rel': 0,
            'iv_load_policy': 3,
            'fs': 1,
            'playsinline': 1
        },
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
};

function onPlayerReady(event) {
    playerReady = true;
    // Don't start the player yet, we'll do that after generating images
    checkIfReady();
}

function onPlayerStateChange(event) {
    // When the video is playing, we'll add the listener for showing images
    if (event.data === YT.PlayerState.PLAYING) {
        // Check every 500ms for current time and show images if needed
        if (!window.timeCheckInterval) {
            window.timeCheckInterval = setInterval(checkTimeAndShowImages, 500);
        }
    } else if (event.data === YT.PlayerState.ENDED || event.data === YT.PlayerState.PAUSED) {
        // Clear the interval if the video ends or is paused
        if (window.timeCheckInterval) {
            clearInterval(window.timeCheckInterval);
            window.timeCheckInterval = null;
        }
    }
}

function checkTimeAndShowImages() {
    const currentTime = Math.floor(player.getCurrentTime());
    
    // Find all lyrics that should be showing at the current time
    config.lyrics.forEach((lyric, index) => {
        if (lyric.time === currentTime && imageURLs[index]) {
            showImage(imageURLs[index]);
        }
    });
}

function showImage(imageUrl) {
    const imageOverlay = document.getElementById('image-overlay');
    const img = document.createElement('img');
    img.src = imageUrl;
    img.classList.add('falling-image');
    
    // Set random horizontal position
    const randomLeft = Math.random() * 80; // 0-80% from left
    img.style.left = `${randomLeft}%`;
    
    // Add to overlay
    imageOverlay.appendChild(img);
    
    // Remove after animation completes
    setTimeout(() => {
        img.remove();
    }, 8000); // Match animation duration
}

async function generateImagesForLyrics() {
    const progressBar = document.getElementById('progress-bar');
    const statusText = document.getElementById('status');
    
    for (let i = 0; i < config.lyrics.length; i++) {
        const lyric = config.lyrics[i];
        statusText.textContent = `Generating image ${i + 1}/${config.lyrics.length}: "${lyric.text}"`;
        
        try {
            // Generate image for the lyric
            const result = await websim.imageGen({
                prompt: `${lyric.text} - artistic interpretation, music visual, stick figure style`,
                aspect_ratio: "16:9"
            });
            
            imageURLs[i] = result.url;
            generatedImagesCount++;
            
            // Update progress bar
            const progressPercentage = (generatedImagesCount / config.lyrics.length) * 100;
            progressBar.style.width = `${progressPercentage}%`;
            
            // Add a delay before generating the next image to avoid rate limiting
            if (i < config.lyrics.length - 1) {
                await new Promise(resolve => setTimeout(resolve, config.imageGenerationDelay));
            }
        } catch (error) {
            console.error("Error generating image:", error);
            // Use fallback for this lyric
            imageURLs[i] = getFallbackImage(lyric.text);
            generatedImagesCount++;
            
            // Update progress bar even on error
            const progressPercentage = (generatedImagesCount / config.lyrics.length) * 100;
            progressBar.style.width = `${progressPercentage}%`;
            
            if (i < config.lyrics.length - 1) {
                await new Promise(resolve => setTimeout(resolve, config.imageGenerationDelay));
            }
        }
    }
    
    statusText.textContent = "All images generated! Starting video...";
    checkIfReady();
}

function getFallbackImage(text) {
    // Create a fallback image with just text
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 450;
    const ctx = canvas.getContext('2d');
    
    // Fill background
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Add text
    ctx.fillStyle = 'white';
    ctx.textAlign = 'center';
    ctx.font = 'bold 32px Arial';
    
    // Split text into lines if too long
    const words = text.split(' ');
    let lines = [];
    let currentLine = '';
    
    words.forEach(word => {
        const testLine = currentLine + word + ' ';
        if (ctx.measureText(testLine).width > canvas.width - 40) {
            lines.push(currentLine);
            currentLine = word + ' ';
        } else {
            currentLine = testLine;
        }
    });
    lines.push(currentLine);
    
    // Draw each line
    lines.forEach((line, i) => {
        ctx.fillText(line, canvas.width / 2, canvas.height / 2 - ((lines.length - 1) * 20) + (i * 40));
    });
    
    return canvas.toDataURL('image/png');
}

function checkIfReady() {
    // Check if both player is ready and all images have been generated
    if (playerReady && generatedImagesCount === config.lyrics.length) {
        startExperience();
    }
}

function startExperience() {
    // Hide loading screen, show video container
    document.getElementById('loading').style.display = 'none';
    document.getElementById('video-container').style.display = 'block';
    
    // Put player in fullscreen and start playing
    if (player) {
        const iframe = player.getIframe();
        if (iframe.requestFullscreen) {
            iframe.requestFullscreen();
        } else if (iframe.webkitRequestFullscreen) {
            iframe.webkitRequestFullscreen();
        } else if (iframe.mozRequestFullScreen) {
            iframe.mozRequestFullScreen();
        } else if (iframe.msRequestFullscreen) {
            iframe.msRequestFullscreen();
        }
        
        player.playVideo();
    }
}

// Start the image generation process when the page loads
document.addEventListener('DOMContentLoaded', generateImagesForLyrics);

// Fallback handlers for CORS issues
async function fetchWithCorsProxy(url) {
    // Try different CORS proxies if needed
    const proxies = [
        {url: `https://cors-anywhere.herokuapp.com/${url}`, type: 'direct'},
        {url: `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`, type: 'json'},
        {url: `https://thingproxy.freeboard.io/fetch/${url}`, type: 'direct'}
    ];
    
    for (const proxy of proxies) {
        try {
            const response = await fetch(proxy.url);
            if (response.ok) {
                if (proxy.type === 'json') {
                    const data = await response.json();
                    return data.contents;
                } else {
                    return await response.text();
                }
            }
        } catch (error) {
            console.error(`Error with proxy ${proxy.url}:`, error);
        }
    }
    
    throw new Error("All CORS proxies failed");
}

