import { config } from './config.js';

let player;
let imageURLs = [];
let currentLyricIndex = 0;
let playerReady = false;
let generatedImagesCount = 0;
let room;

// Initialize WebsimSocket for database storage
document.addEventListener('DOMContentLoaded', async () => {
    room = new WebsimSocket();
    await initializeApp();
});

async function initializeApp() {
    // Check if images are already in the database
    const existingImages = await room.collection('lyric_images').getList();
    
    if (existingImages && existingImages.length === config.lyrics.length) {
        // If we already have all images, use them
        imageURLs = existingImages.map(img => img.imageUrl);
        generatedImagesCount = imageURLs.length;
        displayExistingImages(existingImages);
    } else {
        // Otherwise generate new images
        await generateImagesForLyrics();
    }
    
    // Load YouTube API
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    const firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
}

function displayExistingImages(images) {
    const progressBar = document.getElementById('progress-bar');
    const statusText = document.getElementById('status');
    const generatedImagesContainer = document.getElementById('generated-images');
    
    images.forEach((image, i) => {
        const img = document.createElement('img');
        img.src = image.imageUrl;
        img.classList.add('generated-image');
        img.alt = config.lyrics[i].text;
        img.title = config.lyrics[i].text;
        generatedImagesContainer.appendChild(img);
    });
    
    progressBar.style.width = '100%';
    statusText.textContent = "All images loaded from database! Click start to begin the video.";
    document.getElementById('start-button').style.display = 'inline-block';
    checkIfReady();
}

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
    // Don't start the player yet, we'll wait for user to click start button
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
    const generatedImagesContainer = document.getElementById('generated-images');
    
    for (let i = 0; i < config.lyrics.length; i++) {
        const lyric = config.lyrics[i];
        statusText.textContent = `Generating image ${i + 1}/${config.lyrics.length}: "${lyric.text}"`;
        
        try {
            // Check if this specific lyric image already exists in database
            const existingImage = (await room.collection('lyric_images')
                .filter({ lyricTime: lyric.time, lyricText: lyric.text })
                .getList())[0];
                
            let imageUrl;
            
            if (existingImage) {
                // Use existing image from database
                imageUrl = existingImage.imageUrl;
            } else {
                // Generate new image for the lyric
                const result = await websim.imageGen({
                    prompt: `${lyric.text} - artistic interpretation, music visual, stick figure style`,
                    aspect_ratio: "16:9"
                });
                
                imageUrl = result.url;
                
                // Store in database
                await room.collection('lyric_images').create({
                    lyricTime: lyric.time,
                    lyricText: lyric.text,
                    imageUrl: imageUrl
                });
            }
            
            imageURLs[i] = imageUrl;
            generatedImagesCount++;
            
            // Display the generated/loaded image in the loading screen
            const img = document.createElement('img');
            img.src = imageUrl;
            img.classList.add('generated-image');
            img.alt = lyric.text;
            img.title = lyric.text;
            generatedImagesContainer.appendChild(img);
            
            // Update progress bar
            const progressPercentage = (generatedImagesCount / config.lyrics.length) * 100;
            progressBar.style.width = `${progressPercentage}%`;
            
            // Add a delay before generating the next image to avoid rate limiting
            if (i < config.lyrics.length - 1 && !existingImage) {
                await new Promise(resolve => setTimeout(resolve, config.imageGenerationDelay));
            }
        } catch (error) {
            console.error("Error generating image:", error);
            // Use fallback for this lyric
            imageURLs[i] = getFallbackImage(lyric.text);
            generatedImagesCount++;
            
            // Try to store fallback in database too
            try {
                await room.collection('lyric_images').create({
                    lyricTime: lyric.time,
                    lyricText: lyric.text,
                    imageUrl: imageURLs[i]
                });
            } catch (dbError) {
                console.error("Failed to save fallback to database:", dbError);
            }
            
            // Display the fallback image in the loading screen
            const img = document.createElement('img');
            img.src = imageURLs[i];
            img.classList.add('generated-image');
            img.alt = lyric.text;
            img.title = lyric.text;
            generatedImagesContainer.appendChild(img);
            
            // Update progress bar even on error
            const progressPercentage = (generatedImagesCount / config.lyrics.length) * 100;
            progressBar.style.width = `${progressPercentage}%`;
            
            if (i < config.lyrics.length - 1) {
                await new Promise(resolve => setTimeout(resolve, config.imageGenerationDelay));
            }
        }
    }
    
    statusText.textContent = "All images generated! Click start to begin the video.";
    document.getElementById('start-button').style.display = 'inline-block';
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
        // Show the start button instead of automatically starting
        const startButton = document.getElementById('start-button');
        startButton.style.display = 'inline-block';
        startButton.addEventListener('click', startExperience);
    }
}

function startExperience() {
    // Hide loading screen, show video container
    document.getElementById('loading').style.display = 'none';
    document.getElementById('video-container').style.display = 'block';
    
    // Start playing the video
    if (player && player.playVideo) {
        player.playVideo();
        
        // Start the interval for checking time
        if (!window.timeCheckInterval) {
            window.timeCheckInterval = setInterval(checkTimeAndShowImages, 500);
        }
        
        // Try to go fullscreen
        const videoContainer = document.getElementById('video-container');
        if (videoContainer.requestFullscreen) {
            videoContainer.requestFullscreen().catch(err => {
                console.warn("Couldn't enter fullscreen:", err);
            });
        } else if (videoContainer.webkitRequestFullscreen) {
            videoContainer.webkitRequestFullscreen();
        } else if (videoContainer.mozRequestFullScreen) {
            videoContainer.mozRequestFullScreen();
        } else if (videoContainer.msRequestFullscreen) {
            videoContainer.msRequestFullscreen();
        }
    } else {
        console.error("Player not ready:", player);
        // Fallback if player isn't ready yet
        window.onYouTubeIframeAPIReady = function() {
            // Reinitialize player and start immediately
            player = new YT.Player('youtube-player', {
                height: '100%',
                width: '100%',
                videoId: config.videoId,
                playerVars: {
                    'autoplay': 1,
                    'controls': 0,
                    'showinfo': 0,
                    'rel': 0,
                    'iv_load_policy': 3,
                    'fs': 1,
                    'playsinline': 1
                },
                events: {
                    'onReady': (e) => e.target.playVideo(),
                    'onStateChange': onPlayerStateChange
                }
            });
        };
    }
}

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