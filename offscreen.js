// Simplified EyeGuard Proximity Detection
// This version uses basic face detection without MediaPipe WebAssembly
// Updated to use message passing for storage operations

let video, canvas, ctx;
let initialized = false;
let isProcessing = false;
let calibrationData = null;
let lastSampleTime = 0;

// Configuration
const SAMPLE_INTERVAL = 2000; // 2 seconds between samples
const CALIBRATION_SAMPLES = 5; // Number of samples for calibration
const PROXIMITY_THRESHOLD = 0.7; // Default threshold

// Initialize the proximity detection system
async function initialize() {
    try {
        updateStatus('Initializing camera...');
        
        // Wait for DOM to be ready
        await waitForDOM();
        
        // Get DOM elements
        video = document.getElementById('video');
        canvas = document.getElementById('canvas');
        ctx = canvas.getContext('2d');
        
        console.log('EyeGuard: DOM elements found:', { video, canvas, ctx });
        
        if (!video || !canvas || !ctx) {
            throw new Error('Required DOM elements not found');
        }
        
        // Initialize camera
        await initializeCamera();
        
        // Load calibration data
        await loadCalibrationData();
        
        initialized = true;
        updateStatus('Ready');
        
        console.log('EyeGuard: Proximity detection initialized');
        
    } catch (error) {
        console.error('EyeGuard: Failed to initialize proximity detection:', error);
        updateStatus('Error: ' + error.message);
    }
}

// Wait for DOM elements to be available
async function waitForDOM() {
    return new Promise((resolve) => {
        const checkDOM = () => {
            const videoEl = document.getElementById('video');
            const canvasEl = document.getElementById('canvas');
            
            if (videoEl && canvasEl) {
                console.log('EyeGuard: DOM elements ready');
                resolve();
            } else {
                console.log('EyeGuard: Waiting for DOM elements...');
                setTimeout(checkDOM, 100);
            }
        };
        checkDOM();
    });
}

// Initialize camera stream
async function initializeCamera() {
    console.log('EyeGuard: Requesting camera access...');
    
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                facingMode: 'user'
            },
            audio: false
        });
        
        console.log('EyeGuard: Camera stream obtained:', stream);
        video.srcObject = stream;
        
        // Set canvas size to match video
        video.addEventListener('loadedmetadata', () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            console.log('EyeGuard: Camera initialized successfully - dimensions:', video.videoWidth, 'x', video.videoHeight);
            
            // CRITICAL: Make sure video is playing
            video.play().then(() => {
                console.log('EyeGuard: Video is now playing');
            }).catch(error => {
                console.error('EyeGuard: Failed to play video:', error);
            });
        });
        
        console.log('EyeGuard: Camera stream attached to video element');
        
    } catch (error) {
        console.error('EyeGuard: Camera access denied:', error);
        throw new Error('Camera access required for proximity detection');
    }
}

// Simple proximity detection based on face size estimation
async function performSample() {
    if (!initialized || isProcessing) return;
    
    const now = Date.now();
    if (now - lastSampleTime < SAMPLE_INTERVAL) return;
    
    lastSampleTime = now;
    isProcessing = true;
    
    try {
        updateStatus('Sampling...');
        
        // Check if video is ready
        if (video.readyState < 2) {
            console.log('EyeGuard: Video not ready, readyState:', video.readyState);
            updateStatus('Video not ready');
            return;
        }
        
        // Check if video has dimensions
        if (video.videoWidth === 0 || video.videoHeight === 0) {
            console.log('EyeGuard: Video has no dimensions');
            updateStatus('Video has no dimensions');
            return;
        }
        
        // Ensure canvas has correct dimensions
        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            console.log('EyeGuard: Canvas resized to match video:', canvas.width, 'x', canvas.height);
        }
        
        // Draw current video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Get image data for analysis
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Debug: Check if we actually got image data
        const samplePixel = imageData.data.slice(0, 4);
        console.log('EyeGuard: Sample pixel from canvas:', samplePixel);
        
        // Simple face detection based on skin tone detection
        const faceSize = estimateFaceSize(imageData);
        
        if (faceSize > 0) {
            updateStatus(`Face detected - Size: ${faceSize.toFixed(3)}`);
            
            // Check if we need calibration
            if (!calibrationData) {
                performCalibration(faceSize);
            } else {
                // Check proximity
                const isTooClose = await checkProximity(faceSize);
                if (isTooClose) {
                    sendProximityWarning();
                }
            }
        } else {
            updateStatus('No face detected');
        }
        
    } catch (error) {
        console.error('EyeGuard: Sample failed:', error);
        updateStatus('Sample error');
    } finally {
        isProcessing = false;
    }
}

// Simple face size estimation based on skin tone detection
function estimateFaceSize(imageData) {
    const data = imageData.data;
    const width = imageData.width;
    const height = imageData.height;
    
    let skinPixels = 0;
    let totalPixels = 0;
    
    // Sample every 4th pixel for performance
    for (let i = 0; i < data.length; i += 16) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        
        // Much more lenient skin tone detection
        if (r > 60 && g > 20 && b > 10 && 
            r > g && r > b && 
            Math.abs(r - g) > 5) {
            skinPixels++;
        }
        totalPixels++;
    }
    
    // Return face size as ratio of skin pixels
    return skinPixels / totalPixels;
}

// Perform calibration to establish baseline
function performCalibration(faceSize) {
    if (!window.calibrationSamples) {
        window.calibrationSamples = [];
    }
    
    window.calibrationSamples.push(faceSize);
    
    if (window.calibrationSamples.length < CALIBRATION_SAMPLES) {
        updateStatus(`Calibrating... ${window.calibrationSamples.length}/${CALIBRATION_SAMPLES}`);
        return;
    }
    
    // Calculate average face size for calibration
    const avgFaceSize = window.calibrationSamples.reduce((a, b) => a + b, 0) / window.calibrationSamples.length;
    
    calibrationData = {
        baselineFaceSize: avgFaceSize,
        timestamp: Date.now()
    };
    
    // Save calibration data via message passing
    saveCalibrationData(calibrationData);
    
    updateStatus('Calibrated - Ready');
    console.log('EyeGuard: Calibration complete - baseline:', avgFaceSize);
}

// Check if user is too close to screen
async function checkProximity(faceSize) {
    if (!calibrationData) return false;
    
    // Get current sensitivity setting via message passing
    const sensitivity = await getSensitivity();
    
    // Calculate proximity ratio (larger face = closer to screen)
    const proximityRatio = faceSize / calibrationData.baselineFaceSize;
    
    // Apply sensitivity adjustment
    const threshold = PROXIMITY_THRESHOLD * sensitivity;
    
    return proximityRatio > threshold;
}

// Get sensitivity setting via message passing
async function getSensitivity() {
    return new Promise((resolve) => {
        // Set a timeout to avoid hanging
        const timeout = setTimeout(() => {
            console.warn('EyeGuard: Sensitivity request timed out, using default');
            resolve(1.5);
        }, 1000);
        
        chrome.runtime.sendMessage({ type: 'eyeguard.storage.get.settings' }, (response) => {
            clearTimeout(timeout);
            if (response && response.settings && response.settings.sensitivity) {
                console.log('EyeGuard: Got sensitivity setting:', response.settings.sensitivity);
                resolve(response.settings.sensitivity);
            } else {
                console.warn('EyeGuard: Failed to get sensitivity setting, using default');
                resolve(1.5);
            }
        });
    });
}

// Send proximity warning to background script
function sendProximityWarning() {
    chrome.runtime.sendMessage({ type: 'eyeguard.proximity.warning' });
    updateStatus('TOO CLOSE!');
}

// Load calibration data via message passing
async function loadCalibrationData() {
    return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: 'eyeguard.storage.get.calibration' }, (response) => {
            try {
                if (response && response.calibrationData && response.calibrationData.timestamp) {
                    // Check if calibration is still valid (24 hours)
                    const age = Date.now() - response.calibrationData.timestamp;
                    if (age < 24 * 60 * 60 * 1000) {
                        calibrationData = response.calibrationData;
                        console.log('EyeGuard: Loaded existing calibration');
                    } else {
                        console.log('EyeGuard: Calibration expired, will recalibrate');
                    }
                } else {
                    console.log('EyeGuard: No calibration data found, will calibrate');
                }
            } catch (error) {
                console.warn('EyeGuard: Failed to process calibration data:', error);
            }
            resolve();
        });
    });
}

// Save calibration data via message passing
async function saveCalibrationData(data) {
    chrome.runtime.sendMessage({ 
        type: 'eyeguard.storage.set.calibration', 
        calibrationData: data 
    }, (response) => {
        if (response && response.success) {
            console.log('EyeGuard: Calibration data saved');
        } else {
            console.warn('EyeGuard: Failed to save calibration data');
        }
    });
}

// Update status display
function updateStatus(message) {
    const statusEl = document.getElementById('status');
    if (statusEl) {
        statusEl.textContent = message;
    }
}

// Handle messages from background script
chrome.runtime.onMessage.addListener((message) => {
    switch (message?.type) {
        case 'eyeguard.proximity.sample':
            performSample();
            break;
        case 'eyeguard.proximity.reset':
            // Reset calibration
            calibrationData = null;
            window.calibrationSamples = [];
            // Send reset message to background
            chrome.runtime.sendMessage({ type: 'eyeguard.storage.remove.calibration' });
            updateStatus('Calibration reset');
            break;
    }
});

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initialize);
