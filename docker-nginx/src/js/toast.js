/**
 * @fileoverview Toast notification system for ft_transcendence.
 * Provides functions for displaying non-intrusive temporary notifications.
 * @module toast
 */

/**
 * @type {HTMLElement|null}
 * @description Container element for all toast notifications
 */
let toastContainer = null;

/**
 * Initializes or returns the toast container element.
 * Creates a new container if it doesn't exist and appends it to the document body.
 * @function initToastContainer
 * @returns {HTMLElement} The toast container element
 */
function initToastContainer() {
	if (!toastContainer) {
		toastContainer = document.createElement('div');
		toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
		toastContainer.style.zIndex = '1100';
		document.body.appendChild(toastContainer);
	}
	return toastContainer;
}

/**
 * Shows a toast notification with the specified message and type.
 * @function showToast
 * @param {string} message - The message to display in the toast
 * @param {('success'|'error'|'warning'|'info')} [type='info'] - The type of toast
 * @param {number} [duration=3000] - Duration in milliseconds before the toast auto-hides
 * @returns {HTMLElement} The created toast element
 * @fires {bootstrap.Toast#shown.bs.toast} When the toast is shown
 * @fires {bootstrap.Toast#hidden.bs.toast} When the toast is hidden
 */
function showToast(message, type = 'info', duration = 3000) {
	const container = initToastContainer();
	const toastId = 'toast-' + Date.now();
	let icon = '';
	let bgClass = '';

	switch (type) {
		case 'success':
			icon = '<i class="fas fa-check-circle me-2"></i>';
			bgClass = 'bg-success';
			break;
		case 'error':
			icon = '<i class="fas fa-exclamation-circle me-2"></i>';
			bgClass = 'bg-danger';
			break;
		case 'warning':
			icon = '<i class="fas fa-exclamation-triangle me-2"></i>';
			bgClass = 'bg-warning';
			break;
		case 'info':
		default:
			icon = '<i class="fas fa-info-circle me-2"></i>';
			bgClass = 'bg-info';
			break;
	}
	const toastHTML = `
		<div id="${toastId}" class="toast align-items-center ${bgClass} text-white border-0" role="alert" aria-live="assertive" aria-atomic="true">
			<div class="d-flex">
				<div class="toast-body">
					${icon}${message}
				</div>
				<button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
			</div>
		</div>
	`;
	container.insertAdjacentHTML('beforeend', toastHTML);
	const toastElement = document.getElementById(toastId);
	const toast = new bootstrap.Toast(toastElement, {
		autohide: true,
		delay: duration
	});
	toast.show();
	toastElement.addEventListener('hidden.bs.toast', function () {
		toastElement.remove();
	});
	return toastElement;
}

/**
 * Shows a success toast notification.
 * @function showSuccessToast
 * @param {string} message - The success message to display
 * @param {number} [duration=3000] - Duration in milliseconds before the toast auto-hides
 * @returns {HTMLElement} The created toast element
 */
function showSuccessToast(message, duration = 3000) {
	return showToast(message, 'success', duration);
}

/**
 * Shows an error toast notification.
 * @function showErrorToast
 * @param {string} message - The error message to display
 * @param {number} [duration=3000] - Duration in milliseconds before the toast auto-hides
 * @returns {HTMLElement} The created toast element
 */
function showErrorToast(message, duration = 3000) {
	return showToast(message, 'error', duration);
}

/**
 * Shows a warning toast notification.
 * @function showWarningToast
 * @param {string} message - The warning message to display
 * @param {number} [duration=3000] - Duration in milliseconds before the toast auto-hides
 * @returns {HTMLElement} The created toast element
 */
function showWarningToast(message, duration = 3000) {
	return showToast(message, 'warning', duration);
}

/**
 * Shows an info toast notification.
 * @function showInfoToast
 * @param {string} message - The info message to display
 * @param {number} [duration=3000] - Duration in milliseconds before the toast auto-hides
 * @returns {HTMLElement} The created toast element
 */
function showInfoToast(message, duration = 3000) {
	return showToast(message, 'info', duration);
}

// Export functions to window object
window.showToast = showToast;
window.showSuccessToast = showSuccessToast;
window.showErrorToast = showErrorToast;
window.showWarningToast = showWarningToast;
window.showInfoToast = showInfoToast;