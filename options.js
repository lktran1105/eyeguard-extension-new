const DEFAULTS = {
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

// Validation rules
const VALIDATION_RULES = {
	sensitivity: { min: 1.1, max: 2.0 },
	proximityPeriodSeconds: { min: 10, max: 300 },
	breakIntervalMinutes: { min: 5, max: 120 },
	breakDurationSeconds: { min: 10, max: 300 },
	snoozeMinutes: { min: 1, max: 60 }
};

// Notification system
function showNotification(message, type = 'success') {
	// Remove existing notifications
	const existing = document.querySelector('.notification');
	if (existing) existing.remove();
	
	const notification = document.createElement('div');
	notification.className = `notification notification-${type}`;
	notification.textContent = message;
	notification.style.cssText = `
		position: fixed;
		top: 20px;
		right: 20px;
		padding: 12px 16px;
		border-radius: 8px;
		color: white;
		font-weight: 500;
		z-index: 1000;
		opacity: 0;
		transform: translateX(100%);
		transition: all 0.3s ease;
		${type === 'success' ? 'background: #10b981;' : 'background: #ef4444;'}
	`;
	
	document.body.appendChild(notification);
	
	// Animate in
	setTimeout(() => {
		notification.style.opacity = '1';
		notification.style.transform = 'translateX(0)';
	}, 100);
	
	// Auto remove after 3 seconds
	setTimeout(() => {
		notification.style.opacity = '0';
		notification.style.transform = 'translateX(100%)';
		setTimeout(() => notification.remove(), 300);
	}, 3000);
}

// Enhanced validation
function validateSettings(settings) {
	const errors = [];
	
	// Validate sensitivity
	if (settings.sensitivity < VALIDATION_RULES.sensitivity.min || 
		settings.sensitivity > VALIDATION_RULES.sensitivity.max) {
		errors.push(`Sensitivity must be between ${VALIDATION_RULES.sensitivity.min} and ${VALIDATION_RULES.sensitivity.max}`);
	}
	
	// Validate proximity period
	if (settings.proximityPeriodSeconds < VALIDATION_RULES.proximityPeriodSeconds.min || 
		settings.proximityPeriodSeconds > VALIDATION_RULES.proximityPeriodSeconds.max) {
		errors.push(`Proximity sampling must be between ${VALIDATION_RULES.proximityPeriodSeconds.min} and ${VALIDATION_RULES.proximityPeriodSeconds.max} seconds`);
	}
	
	// Validate break interval
	if (settings.breakIntervalMinutes < VALIDATION_RULES.breakIntervalMinutes.min || 
		settings.breakIntervalMinutes > VALIDATION_RULES.breakIntervalMinutes.max) {
		errors.push(`Break interval must be between ${VALIDATION_RULES.breakIntervalMinutes.min} and ${VALIDATION_RULES.breakIntervalMinutes.max} minutes`);
	}
	
	// Validate break duration
	if (settings.breakDurationSeconds < VALIDATION_RULES.breakDurationSeconds.min || 
		settings.breakDurationSeconds > VALIDATION_RULES.breakDurationSeconds.max) {
		errors.push(`Break duration must be between ${VALIDATION_RULES.breakDurationSeconds.min} and ${VALIDATION_RULES.breakDurationSeconds.max} seconds`);
	}
	
	// Validate snooze time
	if (settings.snoozeMinutes < VALIDATION_RULES.snoozeMinutes.min || 
		settings.snoozeMinutes > VALIDATION_RULES.snoozeMinutes.max) {
		errors.push(`Snooze time must be between ${VALIDATION_RULES.snoozeMinutes.min} and ${VALIDATION_RULES.snoozeMinutes.max} minutes`);
	}
	
	return errors;
}

// Enhanced form validation with real-time feedback
function setupFormValidation() {
	const inputs = document.querySelectorAll('input[type="number"], input[type="range"]');
	
	inputs.forEach(input => {
		input.addEventListener('input', () => {
			// Remove existing error styling
			input.style.borderColor = '';
			const errorMsg = input.parentNode.querySelector('.error-message');
			if (errorMsg) errorMsg.remove();
			
			// Validate current value
			const value = Number(input.value);
			const fieldName = input.id;
			
			if (VALIDATION_RULES[fieldName]) {
				const rule = VALIDATION_RULES[fieldName];
				if (value < rule.min || value > rule.max) {
					input.style.borderColor = '#ef4444';
					const error = document.createElement('div');
					error.className = 'error-message';
					error.textContent = `Must be between ${rule.min} and ${rule.max}`;
					error.style.cssText = 'color: #ef4444; font-size: 12px; margin-top: 4px;';
					input.parentNode.appendChild(error);
				}
			}
		});
	});
}

async function loadSettings() {
	try {
		const { settings } = await chrome.storage.local.get("settings");
		return settings || DEFAULTS;
	} catch (error) {
		console.error('Failed to load settings:', error);
		showNotification('Failed to load settings. Using defaults.', 'error');
		return DEFAULTS;
	}
}

function populateForm(s) {
	document.getElementById("enabled").checked = s.enabled;
	document.getElementById("autoStart").checked = s.autoStart;
	document.getElementById("theme").value = s.theme;
	document.getElementById("proximityEnabled").checked = s.proximityEnabled;
	document.getElementById("sensitivity").value = s.sensitivity;
	document.getElementById("proximityPeriodSeconds").value = s.proximityPeriodSeconds;
	document.getElementById("breaksEnabled").checked = s.breaksEnabled;
	document.getElementById("breakIntervalMinutes").value = s.breakIntervalMinutes;
	document.getElementById("breakDurationSeconds").value = s.breakDurationSeconds;
	document.getElementById("snoozeMinutes").value = s.snoozeMinutes;
}

function readForm() {
	return {
		enabled: document.getElementById("enabled").checked,
		autoStart: document.getElementById("autoStart").checked,
		theme: document.getElementById("theme").value,
		proximityEnabled: document.getElementById("proximityEnabled").checked,
		sensitivity: Number(document.getElementById("sensitivity").value),
		proximityPeriodSeconds: Number(document.getElementById("proximityPeriodSeconds").value),
		breaksEnabled: document.getElementById("breaksEnabled").checked,
		breakIntervalMinutes: Number(document.getElementById("breakIntervalMinutes").value),
		breakDurationSeconds: Number(document.getElementById("breakDurationSeconds").value),
		snoozeMinutes: Number(document.getElementById("snoozeMinutes").value)
	};
}

async function saveSettings() {
	try {
		const payload = readForm();
		
		// Validate settings
		const errors = validateSettings(payload);
		if (errors.length > 0) {
			showNotification(`Validation errors: ${errors.join(', ')}`, 'error');
			return;
		}
		
		// Save to storage
		await chrome.storage.local.set({ settings: payload });
		
		// Send to background script
		try {
			await chrome.runtime.sendMessage({ type: "eyeguard.settings.update", payload });
		} catch (error) {
			console.warn('Background script not available, settings saved locally:', error);
		}
		
		showNotification('Settings saved successfully!', 'success');
		
	} catch (error) {
		console.error('Failed to save settings:', error);
		showNotification('Failed to save settings. Please try again.', 'error');
	}
}

// Enhanced reset with confirmation
async function resetSettings() {
	if (!confirm('Are you sure you want to reset all settings to defaults? This cannot be undone.')) {
		return;
	}
	
	try {
		populateForm(DEFAULTS);
		await chrome.storage.local.set({ settings: DEFAULTS });
		
		// Send to background script
		try {
			await chrome.runtime.sendMessage({ type: "eyeguard.settings.update", payload: DEFAULTS });
		} catch (error) {
			console.warn('Background script not available, settings reset locally:', error);
		}
		
		showNotification('Settings reset to defaults!', 'success');
		
	} catch (error) {
		console.error('Failed to reset settings:', error);
		showNotification('Failed to reset settings. Please try again.', 'error');
	}
}


// Event listeners
document.getElementById("save").addEventListener("click", saveSettings);
document.getElementById("reset").addEventListener("click", resetSettings);

document.getElementById("grantCamera").addEventListener("click", async () => {
  try {
    // Trigger Chrome’s camera prompt from a visible page with a user gesture
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    // Close the stream immediately; we only need to establish permission
    stream.getTracks().forEach(t => t.stop());
    showNotification("Camera access granted!", "success");
  } catch (e) {
    console.error("Camera prompt failed:", e);
    showNotification("Camera access failed. Check Chrome and macOS camera permissions.", "error");
  }
});

// Initialize
(async function init() {
	try {
		const settings = await loadSettings();
		populateForm(settings);
		setupFormValidation();
		
		console.log('Settings page initialized successfully');
	} catch (error) {
		console.error('Failed to initialize settings page:', error);
		showNotification('Failed to load settings page. Please refresh.', 'error');
	}
})();
