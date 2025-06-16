/**
 * @fileoverview Waiting screen manager for matchmaking and game initialization.
 * Provides a dynamic loading screen with animations while waiting for opponent.
 * @module waiting_screen
 */

/** @type {HTMLElement|null} Container element for the waiting screen */
let waitingScreenContainer = null;

/** @type {number|null} Interval ID for the searching dots animation */
let searchingDotsInterval = null;

/**
 * Shows the waiting screen with animated elements.
 * Creates and displays a modal-like screen with:
 * - Animated game icon
 * - Loading text with dots animation
 * - Pulsing glow effect
 * - Cancel button
 * 
 * If the screen is already shown, it will just ensure visibility.
 * 
 * @function showWaitingScreen
 * @returns {void}
 * 
 * @example
 * // Show waiting screen while searching for opponent
 * showWaitingScreen();
 */
function showWaitingScreen() {
	if (!waitingScreenContainer) {
		// Create container if it doesn't exist
		waitingScreenContainer = document.createElement('div');
		waitingScreenContainer.style.position = 'fixed';
		waitingScreenContainer.style.top = '0';
		waitingScreenContainer.style.left = '0';
		waitingScreenContainer.style.width = '100%';
		waitingScreenContainer.style.height = '100%';
		waitingScreenContainer.style.backgroundColor = 'white'; // Sfondo bianco completamente opaco
		waitingScreenContainer.style.zIndex = '1000';
		waitingScreenContainer.style.display = 'flex';
		waitingScreenContainer.style.alignItems = 'center';
		waitingScreenContainer.style.justifyContent = 'center';
		
		// Add the waiting screen HTML
		waitingScreenContainer.innerHTML = `
			<div class="waiting-box">
				<div class="user-icon">
					<i class="fas fa-gamepad"></i>
				</div>
				<div class="waiting-text">In attesa di un avversario</div>
				<div class="glow-ball"></div>
				<div class="searching-text" id="searchingText">Ricerca in corso</div>
				<button id="cancelMatchmaking" class="cancel-button">
					<i class="fas fa-times"></i> Annulla
				</button>
			</div>
		`;
		
		document.body.appendChild(waitingScreenContainer);
		
		// Aggiungi event listener per il pulsante annulla
		const cancelButton = document.getElementById('cancelMatchmaking');
		cancelButton.addEventListener('click', () => {
			if (typeof cleanupGame === 'function') {
				cleanupGame('cancelled');
				hideWaitingScreen();
				window.navigateTo('/play');
			}
		});
		
		// Start the dots animation
		const text = document.getElementById('searchingText');
		let dotCount = 0;
		if (searchingDotsInterval) {
			clearInterval(searchingDotsInterval);
		}
		searchingDotsInterval = setInterval(() => {
			if (!document.getElementById('searchingText')) {
				clearInterval(searchingDotsInterval);
				return;
			}
			dotCount = (dotCount + 1) % 4;
			text.textContent = 'Ricerca in corso' + '.'.repeat(dotCount);
		}, 500);
	}
	waitingScreenContainer.style.display = 'flex';
}

/**
 * Hides and cleans up the waiting screen.
 * Removes the screen from DOM and clears the dots animation interval.
 * 
 * @function hideWaitingScreen
 * @returns {void}
 * 
 * @example
 * // Hide waiting screen when opponent is found
 * hideWaitingScreen();
 */
function hideWaitingScreen() {
	if (waitingScreenContainer) {
		// Remove the container from DOM completely
		waitingScreenContainer.remove();
		waitingScreenContainer = null;
	}
	if (searchingDotsInterval) {
		clearInterval(searchingDotsInterval);
		searchingDotsInterval = null;
	}
}

/**
 * Cleans up the waiting screen when navigating away.
 * Called during route changes to ensure proper cleanup.
 * 
 * @function cleanupWaitingScreen
 * @returns {void}
 */
function cleanupWaitingScreen() {
	hideWaitingScreen();
}

// Add event listener for navigation
document.addEventListener('click', function(e) {
	const target = e.target.closest('a');
	if (target && target.href && target.href.includes(window.location.origin)) {
		cleanupWaitingScreen();
	}
});

// Add event listener for popstate (browser back/forward)
window.addEventListener('popstate', function() {
	cleanupWaitingScreen();
});

/**
 * Styles for the waiting screen components.
 * Includes animations for:
 * - Fade in effect
 * - Pulsing glow ball
 * - Button hover states
 * 
 * @type {HTMLStyleElement}
 */
const style = document.createElement('style');
style.textContent = `
	.waiting-box {
		width: 300px;
		height: 360px;
		background-color: white;
		border: 2px solid #3b82f6;
		border-radius: 20px;
		box-shadow: 0 0 30px rgba(59, 130, 246, 0.3);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		text-align: center;
		padding: 20px;
		animation: fadeIn 0.3s ease-out;
	}

	.user-icon {
		font-size: 48px;
		margin-bottom: 20px;
		color: #3b82f6;
		width: 80px;
		height: 80px;
		background-color: rgba(59, 130, 246, 0.1);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.waiting-text {
		font-size: 20px;
		font-weight: 600;
		color: #1e293b;
		margin-bottom: 10px;
	}

	.glow-ball {
		margin: 30px 0;
		width: 16px;
		height: 16px;
		border-radius: 50%;
		background-color: #3b82f6;
		box-shadow: 0 0 20px rgba(59, 130, 246, 0.6);
		animation: pulse 2s infinite ease-in-out;
	}

	.searching-text {
		font-size: 16px;
		color: #64748b;
		font-weight: 500;
		margin-bottom: 30px;
	}

	.cancel-button {
		background-color: #ef4444;
		color: white;
		border: none;
		border-radius: 8px;
		padding: 10px 20px;
		font-size: 16px;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s ease;
		display: flex;
		align-items: center;
		gap: 8px;
	}

	.cancel-button:hover {
		background-color: #dc2626;
		transform: translateY(-1px);
	}

	.cancel-button:active {
		transform: translateY(1px);
	}

	@keyframes pulse {
		0%, 100% {
			transform: scale(1);
			box-shadow: 0 0 20px rgba(59, 130, 246, 0.6);
		}
		50% {
			transform: scale(1.4);
			box-shadow: 0 0 30px rgba(59, 130, 246, 0.8);
		}
	}

	@keyframes fadeIn {
		from { opacity: 0; transform: translateY(20px); }
		to { opacity: 1; transform: translateY(0); }
	}
`;
document.head.appendChild(style);

// Export functions to global scope
window.showWaitingScreen = showWaitingScreen;
window.hideWaitingScreen = hideWaitingScreen;
window.cleanupWaitingScreen = cleanupWaitingScreen; 