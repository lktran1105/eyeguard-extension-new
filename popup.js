const DEFAULT_SETTINGS = {
	enabled: true,
	proximityEnabled: true,
	breaksEnabled: true,
	breakIntervalMinutes: 20,
	breakDurationSeconds: 20,
	snoozeMinutes: 5,
	proximitySampleSeconds: 2,
	proximityPeriodSeconds: 30,
	sensitivity: 1.5,
	autoStart: true,
	theme: "system"
};

async function getStatus() {
	try {
		// Try to get status from background script
		const response = await chrome.runtime.sendMessage({ type: "eyeguard.request.status" });
		
		// Check if response is valid
		if (response && typeof response === 'object' && response.minutesRemaining !== undefined) {
			console.log('Popup: Got status from background script:', response);
			return response;
		} else {
			console.log('Popup: Background script returned invalid response:', response);
			throw new Error('Invalid response from background script');
		}
	} catch (error) {
		console.error('Background script not available, using fallback:', error);
		
		// Fallback: Calculate status from storage directly
		try {
			const { activeMinutes = 0, settings = DEFAULT_SETTINGS } = await chrome.storage.local.get(["activeMinutes", "settings"]);
			const minutesRemaining = Math.max(settings.breakIntervalMinutes - activeMinutes, 0);
			
			const fallbackResponse = {
				activeMinutes,
				minutesRemaining,
				isBreakInProgress: false,
				settings
			};
			
			console.log('Popup: Using fallback status:', fallbackResponse);
			return fallbackResponse;
		} catch (storageError) {
			console.error('Storage fallback also failed:', storageError);
			// Return default values
			const defaultResponse = {
				activeMinutes: 0,
				minutesRemaining: 20,
				isBreakInProgress: false,
				settings: DEFAULT_SETTINGS
			};
			console.log('Popup: Using default status:', defaultResponse);
			return defaultResponse;
		}
	}
}

function setToggle(id, checked) {
	const el = document.getElementById(id);
	el.checked = !!checked;
}

function wireToggles(settings) {
	document.getElementById("toggle-proximity").addEventListener("change", async (e) => {
		try {
			await chrome.runtime.sendMessage({ type: "eyeguard.settings.update", payload: { proximityEnabled: e.target.checked } });
		} catch (error) {
			console.error('Failed to update proximity setting:', error);
			// Revert the toggle if update failed
			e.target.checked = !e.target.checked;
		}
	});
	document.getElementById("toggle-breaks").addEventListener("change", async (e) => {
		try {
			await chrome.runtime.sendMessage({ type: "eyeguard.settings.update", payload: { breaksEnabled: e.target.checked } });
		} catch (error) {
			console.error('Failed to update breaks setting:', error);
			// Revert the toggle if update failed
			e.target.checked = !e.target.checked;
		}
	});
	
	document.getElementById("btn-break-now").addEventListener("click", async () => {
		try {
			console.log('Popup: Take Break Now button clicked');
			const durationSeconds = (settings?.breakDurationSeconds ?? 20);
			
			// Try to send message to background script
			try {
				await chrome.runtime.sendMessage({ type: "eyeguard.break.start", durationSeconds });
				console.log('Popup: Break started via background script');
			} catch (error) {
				console.log('Popup: Background script unavailable, using fallback for break');
				// Fallback: Reset the timer locally
				await chrome.storage.local.set({ activeMinutes: 0 });
				console.log('Popup: Reset timer via fallback');
			}
			
			// Close the popup to show the break overlay
			window.close();
		} catch (error) {
			console.error('Failed to start break:', error);
		}
	});

	document.getElementById("btn-settings").addEventListener("click", () => {
		try {
			chrome.runtime.openOptionsPage();
		} catch (error) {
			console.error('Failed to open options page:', error);
		}
	});
}

function updateTimerDisplay(minutesRemaining) {
	const displayText = minutesRemaining !== undefined && minutesRemaining !== null 
		? `${minutesRemaining} min` 
		: "-- min";
	document.getElementById("next-break").innerText = `Next break in ${displayText}`;
}

async function refreshStatus() {
	try {
		const status = await getStatus();
		console.log('Popup: Refreshed status:', status);
		updateTimerDisplay(status?.minutesRemaining);
	} catch (error) {
		console.error('Failed to refresh status:', error);
	}
}

async function init() {
	try {
		console.log('Popup: Initializing...');
		const status = await getStatus();
		console.log('Popup: Initial status:', status);
		
		setToggle("toggle-proximity", status?.settings?.proximityEnabled);
		setToggle("toggle-breaks", status?.settings?.breaksEnabled);
		
		// Better error handling for minutesRemaining
		updateTimerDisplay(status?.minutesRemaining);
		
		wireToggles(status?.settings || {});
		
		// Set up periodic refresh every 30 seconds
		setInterval(refreshStatus, 30000);
		console.log('Popup: Initialization complete');
	} catch (error) {
		console.error('Failed to initialize popup:', error);
		// Set a fallback display
		updateTimerDisplay(null);
	}
}

document.addEventListener("DOMContentLoaded", init); 