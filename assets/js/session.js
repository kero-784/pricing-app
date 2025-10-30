// assets/js/session.js

(function() {
    // Set the idle timeout period to 15 minutes (in milliseconds)
    const IDLE_TIMEOUT = 15 * 60 * 1000; // 15 minutes * 60 seconds * 1000 milliseconds

    let idleTimer = null;

    // Function to log the user out and redirect to the login page
    function logout() {
        // We use sessionStorage, but clear localStorage just in case for cleanup
        sessionStorage.removeItem('keroUser');
        localStorage.removeItem('keroUser'); 
        
        // Redirect to login page with a reason
        window.location.href = '/login/?reason=idle'; // Assumes login is at /login/
    }

    // Function to reset the idle timer
    function resetIdleTimer() {
        // Clear the previous timer
        clearTimeout(idleTimer);
        // Set a new timer
        idleTimer = setTimeout(logout, IDLE_TIMEOUT);
    }

    // --- Initialize the idle detection ---
    
    // Add event listeners for user activity
    window.addEventListener('mousemove', resetIdleTimer, false);
    window.addEventListener('mousedown', resetIdleTimer, false);
    window.addEventListener('keypress', resetIdleTimer, false);
    window.addEventListener('touchmove', resetIdleTimer, false);
    window.addEventListener('scroll', resetIdleTimer, false);

    // Start the timer for the first time
    resetIdleTimer();

})();
