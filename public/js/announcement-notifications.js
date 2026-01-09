// Announcement Notifications - Polls for new announcements and triggers notifications
(function() {
    let lastAnnouncementId = localStorage.getItem('lastAnnouncementId');
    let checkInterval = null;

    async function checkForNewAnnouncements() {
        try {
            const response = await fetch(`${API_URL}/api/announcements/active`);
            
            if (!response.ok) return;

            const data = await response.json();
            const announcements = data.announcements || [];
            
            if (announcements.length > 0) {
                const newestAnnouncement = announcements[0];
                
                // Check if this is a new announcement
                if (lastAnnouncementId && newestAnnouncement.id !== parseInt(lastAnnouncementId)) {
                    // New announcement detected - trigger notification
                    if (window.notificationManager) {
                        window.notificationManager.notifyAnnouncement({
                            title: newestAnnouncement.title,
                            message: newestAnnouncement.message
                        });
                    }
                }
                
                // Update last announcement ID
                localStorage.setItem('lastAnnouncementId', newestAnnouncement.id);
                lastAnnouncementId = newestAnnouncement.id;
            }
        } catch (error) {
            console.error('Error checking announcements:', error);
        }
    }

    // Check immediately on load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkForNewAnnouncements);
    } else {
        checkForNewAnnouncements();
    }

    // Check every 30 seconds
    checkInterval = setInterval(checkForNewAnnouncements, 30000);
})();
