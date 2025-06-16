/**
 * @fileoverview Account deletion functionality for ft_transcendence.
 * Handles the process of deleting a user account, including 2FA verification if enabled.
 * @module delete-account
 * @requires api
 * @requires toast
 */

/**
 * Initializes the account deletion functionality.
 * Sets up event listeners and verifies authentication status.
 * @function initializeDeleteAccount
 * @returns {void}
 */
function initializeDeleteAccount() {
	setupEventListeners();
	checkAuthAndInit();
}

/**
 * Verifies user authentication and checks 2FA status.
 * Shows 2FA verification field if enabled.
 * @async
 * @function checkAuthAndInit
 * @returns {Promise<void>}
 * @throws {Error} If authentication check fails
 */
async function checkAuthAndInit() {
	try {
		let isAuth = false;
		if (window.isAuthenticated)
			isAuth = await window.isAuthenticated();
		if (!isAuth) {
			history.replaceState(null, null, '/401');
			handleRouting();
			return;
		}

		// Check if user has 2FA enabled
		const response = await window.api.get('/api/account/');
		const hasEnabled2FA = response.two_factor_enabled;

		if (hasEnabled2FA) {
			const twoFactorField = document.getElementById('twoFactorVerificationField');
			if (twoFactorField) {
				twoFactorField.style.display = 'block';
			}
		}
	} catch (error) {
		console.error('Errore durante la verifica dell\'autenticazione:', error);
		showErrorToast('Si è verificato un errore. Riprova più tardi.');
	}
}

/**
 * Sets up event listeners for the account deletion interface.
 * Handles switching between authenticator app and backup code methods for 2FA.
 * @function setupEventListeners
 * @returns {void}
 */
function setupEventListeners() {
	const useBackupBtn = document.getElementById('deleteAccountUseBackupBtn');
	const useAuthBtn = document.getElementById('deleteAccountUseAuthBtn');
	const tokenSection = document.getElementById('deleteAccountTokenSection');
	const backupSection = document.getElementById('deleteAccountBackupSection');
	const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');

	if (useBackupBtn) {
		useBackupBtn.addEventListener('click', () => {
			tokenSection.style.display = 'none';
			backupSection.style.display = 'block';
			useBackupBtn.style.display = 'none';
		});
	}

	if (useAuthBtn) {
		useAuthBtn.addEventListener('click', () => {
			tokenSection.style.display = 'block';
			backupSection.style.display = 'none';
			useBackupBtn.style.display = 'block';
		});
	}

	if (confirmDeleteBtn) {
		confirmDeleteBtn.addEventListener('click', deleteAccount);
	}
}

/**
 * Initiates the account deletion process.
 * Determines whether 2FA verification is needed and calls appropriate deletion method.
 * @async
 * @function deleteAccount
 * @returns {Promise<void>}
 * @throws {Error} If the deletion process fails
 */
async function deleteAccount() {
	try {
		const response = await window.api.get('/api/account/');
		const hasEnabled2FA = response.two_factor_enabled;

		if (hasEnabled2FA) {
			await deleteAccountWith2FA();
		} else {
			await deleteAccountConfirmed();
		}
	} catch (error) {
		console.error('Errore durante l\'eliminazione dell\'account:', error);
		showErrorToast('Si è verificato un errore. Riprova più tardi.');
	}
}

/**
 * Handles account deletion for users with 2FA enabled.
 * Validates and submits either the authenticator token or backup code.
 * @async
 * @function deleteAccountWith2FA
 * @returns {Promise<void>}
 * @throws {Error} If the 2FA verification or deletion fails
 * 
 * @example
 * // The function expects one of these input elements to be present:
 * // <input id="twoFactorToken" type="text">
 * // <input id="deleteAccountBackupCode" type="text">
 */
async function deleteAccountWith2FA() {
	const token = document.getElementById('twoFactorToken').value.trim();
	const backupCode = document.getElementById('deleteAccountBackupCode').value.trim();
	
	if (!token && !backupCode) {
		showErrorToast('Inserisci un codice di verifica o un codice di backup.');
		return;
	}
	
	try {
		const response = await window.api.post('/api/account/delete/', { 
			token: token || null,
			backup_code: backupCode || null
		});
		
		if (response.success) {
			showSuccessToast('Account eliminato con successo.');
			window.location.href = '/';
		} else {
			showErrorToast(response.error || 'Non è stato possibile eliminare l\'account. Riprova più tardi.');
		}
	} catch (error) {
		console.error('Errore durante l\'eliminazione dell\'account:', error);
		if (error.response && error.response.data && error.response.data.error) {
			showErrorToast(error.response.data.error || 'Codice non valido. Riprova.');
		} else {
			showErrorToast('Non è stato possibile eliminare l\'account. Riprova più tardi.');
		}
	}
}

/**
 * Handles account deletion for users without 2FA enabled.
 * Makes a direct API call to delete the account.
 * @async
 * @function deleteAccountConfirmed
 * @returns {Promise<void>}
 * @throws {Error} If the deletion request fails
 */
async function deleteAccountConfirmed() {
	try {
		await window.api.post('/api/account/delete/');
		showSuccessToast('Account eliminato con successo.');
		window.location.href = '/';
	} catch (error) {
		console.error('Errore durante l\'eliminazione dell\'account:', error);
		showErrorToast('Non è stato possibile eliminare l\'account. Riprova più tardi.');
	}
}

// Export initialization function
window.initializeDeleteAccount = initializeDeleteAccount; 