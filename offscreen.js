// Simplified EyeGuard Proximity Detection
// This version uses basic face detection without MediaPipe WebAssembly

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
        
        // Get DOM elements
        video = document.getElementById('video');
        canvas = document.getElementById('canvas');
        ctx = canvas.getContext('2d');
        
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
        
        video.srcObject = stream;
        
        // Set canvas size to match video
        video.addEventListener('loadedmetadata', () => {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            console.log('EyeGuard: Camera initialized successfully');
        });
        
        console.log('EyeGuard: Camera stream obtained');
        
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
        
        // Draw current video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        // Get image data for analysis
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        // Simple face detection based on skin tone detection
        const faceSize = estimateFaceSize(imageData);
        
        if (faceSize > 0) {
            updateStatus(`Face detected - Size: ${faceSize.toFixed(3)}`);
            
            // Check if we need calibration
            if (!calibrationData) {
                performCalibration(faceSize);
            } else {
                // Check proximity
                const isTooClose = checkProximity(faceSize);
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
        
        // Simple skin tone detection
        if (r > 95 && g > 40 && b > 20 && 
            r > g && r > b && 
            Math.abs(r - g) > 15) {
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
    
    // Save calibration data
    saveCalibrationData(calibrationData);
    
    updateStatus('Calibrated - Ready');
    console.log('EyeGuard: Calibration complete - baseline:', avgFaceSize);
}

// Check if user is too close to screen
function checkProximity(faceSize) {
    if (!calibrationData) return false;
    
    // Get current sensitivity setting
    const sensitivity = getSensitivity();
    
    // Calculate proximity ratio (larger face = closer to screen)
    const proximityRatio = faceSize / calibrationData.baselineFaceSize;
    
    // Apply sensitivity adjustment
    const threshold = PROXIMITY_THRESHOLD * sensitivity;
    
    return proximityRatio > threshold;
}

// Get sensitivity setting from storage
async function getSensitivity() {
    try {
        const { settings } = await chrome.storage.local.get('settings');
        return settings?.sensitivity || 1.5;
    } catch (error) {
        console.warn('EyeGuard: Failed to get sensitivity setting:', error);
        return 1.5;
    }
}

// Send proximity warning to background script
function sendProximityWarning() {
    chrome.runtime.sendMessage({ type: 'eyeguard.proximity.warning' });
    updateStatus('TOO CLOSE!');
}

// Load calibration data from storage
async function loadCalibrationData() {
    try {
        const { calibrationData: saved } = await chrome.storage.local.get('calibrationData');
        if (saved && saved.timestamp) {
            // Check if calibration is still valid (24 hours)
            const age = Date.now() - saved.timestamp;
            if (age < 24 * 60 * 60 * 1000) {
                calibrationData = saved;
                console.log('EyeGuard: Loaded existing calibration');
            } else {
                console.log('EyeGuard: Calibration expired, will recalibrate');
            }
        }
    } catch (error) {
        console.warn('EyeGuard: Failed to load calibration data:', error);
    }
}

// Save calibration data to storage
async function saveCalibrationData(data) {
    try {
        await chrome.storage.local.set({ calibrationData: data });
        console.log('EyeGuard: Calibration data saved');
    } catch (error) {
        console.warn('EyeGuard: Failed to save calibration data:', error);
    }
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
            chrome.storage.local.remove('calibrationData');
            updateStatus('Calibration reset');
            break;
    }
});

// Initialize when page loads
document.addEventListener('DOMContentLoaded', initialize);
