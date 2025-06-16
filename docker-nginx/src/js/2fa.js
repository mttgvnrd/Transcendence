/**
 * @fileoverview Two-Factor Authentication (2FA) implementation for ft_transcendence SPA.
 * Handles 2FA setup, QR code generation, token verification, and backup codes management.
 * @module 2fa
 * @requires api
 * @requires toast
 */

/**
 * Hides the loading state element from the UI.
 * Used during 2FA setup and verification processes.
 * @function hideLoadingState
 * @returns {void}
 */
function hideLoadingState() {
	const loadingElement = document.getElementById('loading');
	if (loadingElement) {
		loadingElement.style.display = 'none';
	}
}

/**
 * Verifies a 2FA token or backup code with the server.
 * Handles both initial 2FA setup verification and ongoing 2FA authentication.
 * On successful verification, redirects to the account page.
 * 
 * @async
 * @function verify2FAToken
 * @param {string} [token] - The 2FA token to verify. If not provided, will be read from #token input.
 * @param {string} [backupCodes] - Backup codes to verify. If not provided, will be read from #backup_codes input.
 * @returns {Promise<boolean>} True if verification successful, false otherwise
 * @throws {Error} If verification request fails
 * 
 * @example
 * // Verify with explicit token
 * const success = await verify2FAToken('123456');
 * 
 * @example
 * // Verify with form input (no parameters)
 * const success = await verify2FAToken();
 */
async function verify2FAToken(token, backupCodes) {
	try {
		if (!token) {
			token = document.getElementById('token').value;
		}
		if (!backupCodes) {
			const backupCodesElement = document.getElementById('backup_codes');
			if (backupCodesElement) {
				backupCodes = backupCodesElement.value;
			}
		}
		const response = await window.api.post('/api/auth/2fa/verify/', {
			token: token,
			backup_codes: backupCodes
		});
		
		if (response.success) {
			showSuccessToast(response.message || "Autenticazione a due fattori configurata con successo!");
			// Show backup codes download button
			const downloadBtn = document.getElementById('downloadBackupCodesBtn');
			if (downloadBtn) {
				downloadBtn.style.display = 'block';
			}
			history.pushState(null, null, '/account');
			if (typeof handleRouting === 'function') {
				handleRouting();
			} else {
				window.location.href = '/account';
			}
			return true;
		} else {
			showErrorToast(response.error || "Codice non valido. Riprova.");
			return false;
		}
	} catch (error) {
		showErrorToast("Si è verificato un errore durante la verifica. Riprova più tardi.");
		return false;
	}
}

/**
 * Initializes the 2FA setup process.
 * Verifies authentication, generates QR code and backup codes,
 * and sets up event listeners for verification.
 * 
 * The setup process includes:
 * 1. Authentication check
 * 2. QR code generation for authenticator apps
 * 3. Backup codes generation
 * 4. UI setup for verification
 * 
 * @async
 * @function initialize2FA
 * @returns {Promise<void>}
 * @throws {Error} If 2FA setup fails or authentication is invalid
 * 
 * @example
 * // Initialize 2FA setup
 * await initialize2FA();
 */
async function initialize2FA() {
	console.log("Inizializzazione 2FA...");
	try {
		let isAuth = false;
		if (window.isAuthenticated)
			isAuth = await window.isAuthenticated();
		if (!isAuth) {
			if (typeof handleRouting === 'function') {
				history.replaceState(null, null, '/401');
				handleRouting();
			}
			hideLoadingState();
			return;
		}
		const response = await window.api.post('/api/auth/2fa/setup/');
		if (response.success) {
			document.getElementById('loading').style.display = 'none';
			document.getElementById('qr-code').src = 'data:image/png;base64,' + response.qr_code;
			document.getElementById('qr-code').style.display = 'block';
			if (response.backup_codes) {
				document.getElementById('backup_codes').value = JSON.stringify(response.backup_codes);
				localStorage.setItem('2fa_backup_codes', JSON.stringify(response.backup_codes));
			}
		}
	}
	catch (error) {
		console.error('Errore nella configurazione di 2FA:', error);
		showErrorMessage("Si è verificato un errore durante la configurazione di 2FA. Riprova più tardi.");
	}
	
	// Set up event listeners
	const btn = document.getElementById('verify2faBtn');
	if (btn) {
		btn.addEventListener('click', function(event) {
			event.preventDefault();
			verify2FAToken();
		});
	}
}

// Export functions to global scope
window.initialize2FA = initialize2FA;
window.verify2FAToken = verify2FAToken;




