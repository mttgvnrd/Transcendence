/**
 * @fileoverview Module for handling user registration functionality.
 * @module register
 * @requires toast
 * @requires api
 */

/**
 * Initializes the registration form functionality.
 * Sets up event listeners and handles form submission with validation.
 * @function initializeRegistration
 * @returns {void}
 * 
 * @fires {Event} submit - When the registration form is submitted
 * @listens {Event} submit - Handles the registration form submission
 * 
 * @example
 * // The function expects a form with the following structure:
 * // <form id="registrationForm">
 * //   <input id="username" type="text">
 * //   <input id="email" type="email">
 * //   <input id="password" type="password">
 * //   <input id="confirmPassword" type="password">
 * // </form>
 */
function initializeRegistration() {
	const registrationForm = document.getElementById('registrationForm');
	
	if (registrationForm) {
		registrationForm.addEventListener('submit', async (e) => {
			e.preventDefault();
			const username = document.getElementById('username').value;
			const email = document.getElementById('email').value;
			const password = document.getElementById('password').value;
			const confirmPassword = document.getElementById('confirmPassword').value;

			if (password !== confirmPassword) {
				showErrorToast("Le password non coincidono!");
				return;
			}

			try {
				const data = await window.api.post('/api/auth/register/', {
					username,
					email,
					password,
					password2: confirmPassword
				});

				if (data.message === "Utente registrato con successo!") {
					showSuccessToast('Registrazione completata con successo!');
					history.replaceState(null, null, '/login');
					handleRouting();
				} else {
					if (typeof data === 'object' && data !== null) {
						let errorMessages = [];
						for (const field in data) {
							if (Array.isArray(data[field])) {
								errorMessages = errorMessages.concat(data[field]);
							}
						}
						showErrorToast(errorMessages[0] || data.message || 'Errore durante la registrazione');
					}
				}
			} catch (error) {
				console.error('Registration error:', error);
				showErrorToast('Si è verificato un errore durante la registrazione. Riprova più tardi.');
			}
		});
	}
}

// Export the initialization function
window.initializeRegistration = initializeRegistration;

/**
 * Event listener for DOMContentLoaded.
 * Automatically initializes registration functionality when the page loads.
 * @listens {Event} DOMContentLoaded
 */
document.addEventListener('DOMContentLoaded', initializeRegistration);