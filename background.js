// EyeGuard Background Script (Service Worker)
// Manages alarms, state, and message routing

const DEFAULT_SETTINGS = {
    enabled: true,
    autoStart: true,
    theme: "system",
    proximityEnabled: true,
    sensitivity: 1.5,
    proximityPeriodSeconds: 30,
    breaksEnabled: true,
    breakIntervalMinutes: 20,
    breakDurationSeconds: 20,
    snoozeMinutes: 5
};

let activeMinutes = 0;
let isBreakInProgress = false;
let snoozedUntilMs = 0;

// Initialize on install/startup
chrome.runtime.onInstalled.addListener(async () => {
    console.log('EyeGuard: Extension installed');
    await chrome.storage.local.set({ activeMinutes: 0 });
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
    await ensureBreakTickAlarm();
});

chrome.runtime.onStartup.addListener(async () => {
    console.log('EyeGuard: Extension started');
    const { activeMinutes: saved } = await chrome.storage.local.get('activeMinutes');
    activeMinutes = saved || 0;
    await ensureBreakTickAlarm();
});

// Alarm handlers
chrome.alarms.onAlarm.addListener(async (alarm) => {
    console.log('EyeGuard: Alarm fired:', alarm.name);
    
    switch (alarm.name) {
        case 'eyeguard.break.tick':
            await handleBreakTick();
            break;
        case 'eyeguard.proximity.sample':
            await handleProximitySample();
            break;
    }
});

// Break reminder logic
async function handleBreakTick() {
    const now = Date.now();
    const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get("settings");
    if (!settings.enabled || !settings.breaksEnabled) {
        console.log('EyeGuard: Break system disabled, skipping tick');
        return;
    }
    if (now < snoozedUntilMs) {
        console.log('EyeGuard: Break snoozed, skipping tick');
        return;
    }

    return new Promise((resolve) => {
        chrome.idle.queryState(60, async (state) => {
            try {
                console.log('EyeGuard: Idle state:', state, 'activeMinutes before:', activeMinutes);
                
                if (state === "active" && !isBreakInProgress) {
                    const oldValue = activeMinutes;
                    activeMinutes = oldValue + 1;
                    await chrome.storage.local.set({ activeMinutes });
                    console.log('EyeGuard: Incremented activeMinutes from', oldValue, 'to:', activeMinutes);
                    
                    if (activeMinutes >= settings.breakIntervalMinutes) {
                        activeMinutes = 0;
                        await chrome.storage.local.set({ activeMinutes: 0 });
                        console.log('EyeGuard: Break interval reached, sending reminder');
                        broadcastMessage({ type: "eyeguard.break.reminder" });
                    }
                } else if (state !== "active") {
                    const oldValue = activeMinutes;
                    activeMinutes = 0;
                    await chrome.storage.local.set({ activeMinutes: 0 });
                    console.log('EyeGuard: User idle, reset activeMinutes from', oldValue, 'to 0');
                }
                
                console.log('EyeGuard: handleBreakTick completed, final activeMinutes:', activeMinutes);
                resolve();
            } catch (error) {
                console.error('EyeGuard: Error in handleBreakTick:', error);
                resolve();
            }
        });
    });
}

// Proximity sampling logic
async function handleProximitySample() {
    const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get("settings");
    if (!settings.enabled || !settings.proximityEnabled) {
        console.log('EyeGuard: Proximity system disabled, skipping sample');
        return;
    }
    
    await ensureOffscreenDocument();
    
    // Send sample request to offscreen document
    try {
        await chrome.runtime.sendMessage({ type: 'eyeguard.proximity.sample' });
    } catch (error) {
        console.error('EyeGuard: Failed to send proximity sample request:', error);
    }
}

// Ensure break tick alarm is set
async function ensureBreakTickAlarm() {
    const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get("settings");
    if (!settings.enabled || !settings.breaksEnabled) {
        console.log('EyeGuard: Break system disabled, not setting alarm');
        return;
    }
    
    try {
        await chrome.alarms.create('eyeguard.break.tick', { 
            delayInMinutes: 1, 
            periodInMinutes: 1 
        });
        console.log('EyeGuard: Break tick alarm set');
    } catch (error) {
        console.error('EyeGuard: Failed to set break tick alarm:', error);
    }
}

// Ensure proximity sampling alarm is set
async function ensureProximitySampling() {
    const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get("settings");
    if (!settings.enabled || !settings.proximityEnabled) {
        console.log('EyeGuard: Proximity system disabled, not setting alarm');
        return;
    }
    
    try {
        await chrome.alarms.create('eyeguard.proximity.sample', { 
            delayInMinutes: 0.5, 
            periodInMinutes: settings.proximityPeriodSeconds / 60 
        });
        console.log('EyeGuard: Proximity sampling scheduled every', settings.proximityPeriodSeconds / 60, 'minutes');
    } catch (error) {
        console.error('EyeGuard: Failed to set proximity sampling alarm:', error);
    }
}

// Ensure offscreen document exists
async function ensureOffscreenDocument() {
    try {
        // Check if offscreen document already exists
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: [chrome.runtime.getURL('offscreen.html')]
        });
        
        if (existingContexts.length > 0) {
            console.log('EyeGuard: Offscreen document already exists');
            return;
        }
        
        console.log('EyeGuard: Creating offscreen document...');
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['USER_MEDIA'],
            justification: 'Camera access for proximity detection'
        });
        console.log('EyeGuard: Offscreen document created successfully');
        
    } catch (error) {
        console.error('EyeGuard: Failed to create offscreen document:', error);
    }
}

// Force recreate offscreen document
async function forceRecreateOffscreenDocument() {
    try {
        // Close existing offscreen document
        await chrome.offscreen.closeDocument();
        console.log('EyeGuard: Closed existing offscreen document');
        
        // Wait a moment
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Create new one
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['USER_MEDIA'],
            justification: 'Camera access for proximity detection'
        });
        console.log('EyeGuard: Recreated offscreen document');
        
    } catch (error) {
        console.error('EyeGuard: Failed to recreate offscreen document:', error);
    }
}

// Broadcast message to all tabs
function broadcastMessage(message) {
    chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
            chrome.tabs.sendMessage(tab.id, message).catch(() => {
                // Ignore errors for tabs that don't have content script
            });
        });
    });
}

// Messages from popup/content/offscreen
chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
    switch (message?.type) {
        case "eyeguard.request.status": {
            const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get("settings");
            const minutesRemaining = Math.max(settings.breakIntervalMinutes - activeMinutes, 0);
            const response = {
                activeMinutes,
                minutesRemaining,
                isBreakInProgress,
                settings
            };
            console.log('EyeGuard: Status requested, responding with:', response);
            sendResponse(response);
            return;
        }
        case "eyeguard.break.completed": {
            isBreakInProgress = false;
            activeMinutes = 0;
            await chrome.storage.local.set({ activeMinutes: 0 });
            console.log('EyeGuard: Break completed, reset activeMinutes');
            sendResponse({ success: true });
            return;
        }
        case "eyeguard.break.snooze": {
            const { settings = DEFAULT_SETTINGS } = await chrome.storage.local.get("settings");
            snoozedUntilMs = Date.now() + (settings.snoozeMinutes * 60 * 1000);
            console.log('EyeGuard: Break snoozed for', settings.snoozeMinutes, 'minutes');
            sendResponse({ success: true });
            return;
        }
        case "eyeguard.settings.update": {
            const { payload } = message;
            await chrome.storage.local.set({ settings: payload });
            console.log('EyeGuard: Settings updated:', payload);
            
            // Restart alarms with new settings
            await chrome.alarms.clearAll();
            await ensureBreakTickAlarm();
            await ensureProximitySampling();
            
            // Handle proximity changes
            if (payload.proximityEnabled) {
                await ensureOffscreenDocument();
                await ensureProximitySampling();
            } else {
                // Clear proximity alarm if disabled
                await chrome.alarms.clear('eyeguard.proximity.sample');
            }
            
            sendResponse({ success: true });
            return;
        }
        case "eyeguard.proximity.warning": {
            broadcastMessage({ type: "eyeguard.proximity.warning" });
            sendResponse({ success: true });
            return;
        }
        case "eyeguard.proximity.reset": {
            await forceRecreateOffscreenDocument();
            sendResponse({ success: true });
            return;
        }
    }
});
