(function () {
	let breakOverlayEl = null;
	let countdownInterval = null;

	function createToast(message) {
		const id = "eyeguard-proximity-toast";
		if (document.getElementById(id)) return;
		const container = document.createElement("div");
		container.id = id;
		container.style.position = "fixed";
		container.style.top = "16px";
		container.style.right = "16px";
		container.style.zIndex = 999999;
		container.style.background = "#fff";
		container.style.border = "2px solid #fb923c";
		container.style.boxShadow = "0 4px 12px rgba(0,0,0,.15)";
		container.style.borderRadius = "12px";
		container.style.padding = "12px 14px";
		container.style.maxWidth = "320px";
		container.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
		container.innerHTML = `<div style="font-weight:700; margin-bottom:6px; color:#111827;">Too Close to Screen</div>
			<div style="font-size:13px; color:#374151; margin-bottom:8px;">You're sitting too close. Move back to maintain optimal eye health.</div>
			<div style="display:flex; gap:8px;">
				<button id="eyeguard-toast-ok" style="padding:6px 10px; border:none; background:#0b8793; color:#fff; border-radius:8px; cursor:pointer;">Got it</button>
				<button id="eyeguard-toast-settings" style="padding:6px 10px; border:1px solid #e5e7eb; background:#fff; color:#111827; border-radius:8px; cursor:pointer;">Adjust Settings</button>
			</div>`;
		document.body.appendChild(container);
		document.getElementById("eyeguard-toast-ok").onclick = () => container.remove();
		document.getElementById("eyeguard-toast-settings").onclick = () => { 
			container.remove(); 
			try {
				chrome.runtime.openOptionsPage(); 
			} catch (error) {
				console.error('Failed to open options page:', error);
			}
		};
	}

	// Make createToast globally available for testing
	window.createToast = createToast;

	function showBreakOverlay(durationSeconds) {
		if (breakOverlayEl) return;
		const overlay = document.createElement("div");
		breakOverlayEl = overlay;
		overlay.style.position = "fixed";
		overlay.style.inset = "0";
		overlay.style.background = "rgba(2, 132, 199, 0.9)";
		overlay.style.backdropFilter = "blur(2px)";
		overlay.style.zIndex = 999999;
		overlay.style.display = "flex";
		overlay.style.alignItems = "center";
		overlay.style.justifyContent = "center";
		overlay.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
		const card = document.createElement("div");
		card.style.background = "#fff";
		card.style.borderRadius = "14px";
		card.style.boxShadow = "0 10px 30px rgba(0,0,0,.25)";
		card.style.padding = "20px 22px";
		card.style.width = "min(420px, 90vw)";
		card.innerHTML = `<div style="font-weight:800; font-size:20px; margin-bottom:6px; color:#0b8793;">Time for a Break!</div>
			<div style="font-size:14px; color:#334155; margin-bottom:12px;">You've been looking at the screen for 20 minutes. Look 20 feet away for 20 seconds.</div>
			<div id="eyeguard-countdown" style="font-weight:800; font-size:32px; text-align:center; margin:8px 0 16px; color:#0f172a;">${durationSeconds}</div>
			<div style="display:flex; gap:8px; justify-content:flex-end;">
				<button id="eyeguard-start-break" style="padding:10px 12px; border:none; background:#0b8793; color:#fff; border-radius:8px; cursor:pointer;">Start Break</button>
				<button id="eyeguard-skip-break" style="padding:10px 12px; border:1px solid #e5e7eb; background:#fff; color:#111827; border-radius:8px; cursor:pointer;">Skip This Time</button>
			</div>`;
		overlay.appendChild(card);
		document.body.appendChild(overlay);

		const startBtn = document.getElementById("eyeguard-start-break");
		const skipBtn = document.getElementById("eyeguard-skip-break");
		startBtn.onclick = () => startCountdown(durationSeconds);
		skipBtn.onclick = () => {
			cleanupOverlay();
			try {
				chrome.runtime.sendMessage({ type: "eyeguard.break.snooze" });
			} catch (error) {
				console.error('Failed to send snooze message:', error);
			}
		};
	}

	function startCountdown(secs) {
		const label = document.getElementById("eyeguard-countdown");
		let remaining = secs;
		if (countdownInterval) clearInterval(countdownInterval);
		countdownInterval = setInterval(() => {
			remaining -= 1;
			label.textContent = String(remaining);
			if (remaining <= 0) {
				clearInterval(countdownInterval);
				cleanupOverlay();
				try {
					chrome.runtime.sendMessage({ type: "eyeguard.break.completed" });
				} catch (error) {
					console.error('Failed to send completed message:', error);
				}
			}
		}, 1000);
	}

	function cleanupOverlay() {
		if (breakOverlayEl) {
			breakOverlayEl.remove();
			breakOverlayEl = null;
		}
	}

	chrome.runtime.onMessage.addListener((message) => {
		try {
			if (message?.type === "eyeguard.proximity.warning") {
				console.log('EyeGuard: Content script received proximity warning');
				createToast("Too close to screen");
			}
			if (message?.type === "eyeguard.break.reminder") {
				showBreakOverlay(20);
			}
			if (message?.type === "eyeguard.break.start") {
				showBreakOverlay(message?.durationSeconds || 20);
			}
		} catch (error) {
			console.error('Failed to handle message:', message, error);
		}
	});
})(); 