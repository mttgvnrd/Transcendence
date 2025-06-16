/**
 * @fileoverview Two-Factor Authentication (2FA) disabling functionality.
 * Handles the process of disabling 2FA using either authenticator app or backup codes.
 * @module disable-2fa
 * @requires api
 * @requires toast
 */

/**
 * Initializes the 2FA disabling functionality.
 * Sets up event listeners and verifies authentication status.
 * @function initializeDisable2FA
 * @returns {void}
 */
function initializeDisable2FA() {
	setupEventListeners();
	checkAuth();
}

/**
 * Verifies user authentication and 2FA status.
 * Redirects to appropriate pages based on authentication state.
 * @async
 * @function checkAuth
 * @returns {Promise<void>}
 * @throws {Error} If authentication check fails
 */
async function checkAuth() {
	try {
		let isAuth = false;
		if (window.isAuthenticated)
			isAuth = await window.isAuthenticated();
		if (!isAuth) {
			history.replaceState(null, null, '/401');
			handleRouting();
			return;
		}

		// Verify that 2FA is actually enabled
		const response = await window.api.get('/api/account/');
		if (!response.two_factor_enabled) {
			history.replaceState(null, null, '/account');
			handleRouting();
			showErrorToast('L\'autenticazione a due fattori non è abilitata.');
			return;
		}
	} catch (error) {
		console.error('Errore durante la verifica dell\'autenticazione:', error);
		showErrorToast('Si è verificato un errore. Riprova più tardi.');
	}
}

/**
 * Sets up event listeners for the 2FA disabling interface.
 * Handles switching between authenticator app and backup code methods.
 * @function setupEventListeners
 * @returns {void}
 */
function setupEventListeners() {
	const useBackupCodeBtn = document.getElementById('useBackupCodeBtn');
	const useAuthAppBtn = document.getElementById('useAuthAppBtn');
	const tokenSection = document.getElementById('disable2FATokenSection');
	const backupSection = document.getElementById('disable2FABackupSection');
	const confirmDisableBtn = document.getElementById('confirmDisable2FABtn');

	if (useBackupCodeBtn) {
		useBackupCodeBtn.addEventListener('click', () => {
			tokenSection.style.display = 'none';
			backupSection.style.display = 'block';
			useBackupCodeBtn.style.display = 'none';
		});
	}

	if (useAuthAppBtn) {
		useAuthAppBtn.addEventListener('click', () => {
			tokenSection.style.display = 'block';
			backupSection.style.display = 'none';
			useBackupCodeBtn.style.display = 'block';
		});
	}

	if (confirmDisableBtn) {
		confirmDisableBtn.addEventListener('click', confirmDisable2FA);
	}
}

/**
 * Handles the 2FA disabling confirmation process.
 * Validates and submits either the authenticator token or backup code.
 * @async
 * @function confirmDisable2FA
 * @returns {Promise<void>}
 * @throws {Error} If the API request fails
 * 
 * @example
 * // The function expects one of these input elements to be present:
 * // <input id="disable2FAToken" type="text">
 * // <input id="disable2FABackupCode" type="text">
 */
async function confirmDisable2FA() {
	const token = document.getElementById('disable2FAToken').value.trim();
	const backupCode = document.getElementById('disable2FABackupCode').value.trim();
	
	if (!token && !backupCode) {
		showErrorToast('Inserisci un codice di verifica o un codice di backup.');
		return;
	}
	
	try {
		const response = await window.api.post('/api/auth/2fa/disable/', { 
			token: token || null,
			backup_code: backupCode || null
		});
		
		if (response.success) {
			showSuccessToast(response.message || 'Autenticazione a due fattori disattivata con successo.');
			history.pushState(null, null, '/account');
			handleRouting();
		} else {
			showErrorToast(response.error || 'Non è stato possibile disattivare l\'autenticazione a due fattori. Riprova più tardi.');
		}
	} catch (error) {
		console.error('Errore durante la disattivazione 2FA:', error);
		if (error.response && error.response.data && error.response.data.error) {
			showErrorToast(error.response.data.error || 'Codice non valido. Riprova.');
		} else {
			showErrorToast('Si è verificato un errore durante la disattivazione dell\'autenticazione a due fattori. Riprova più tardi.');
		}
	}
}

// Export initialization function
window.initializeDisable2FA = initializeDisable2FA; 