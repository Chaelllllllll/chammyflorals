// Node.js 18+ has built-in fetch, no need for node-fetch
// If running on older Node versions, uncomment: const fetch = require('node-fetch');

/**
 * Send push notification via Expo Push Service
 * @param {string} expoPushToken - The Expo push token
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Additional data to send with notification
 */
async function sendPushNotification(expoPushToken, title, body, data = {}) {
  if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken')) {
    console.log('Invalid Expo push token:', expoPushToken);
    return;
  }

  const message = {
    to: expoPushToken,
    sound: 'default',
    title,
    body,
    data,
    priority: 'high',
    channelId: 'default',
  };

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
    });

    const responseData = await response.json();
    console.log('Push notification response:', responseData);

    // Normalize response for callers: return an object with ok flag and original response
    // Expo may return structured errors (developer faults like InvalidCredentials)
    if (responseData && responseData.data && responseData.data.status === 'error') {
      console.warn('Expo push service returned an error:', responseData.data);
      return { ok: false, response: responseData };
    }

    return { ok: true, response: responseData };
  } catch (error) {
    console.error('Error sending push notification:', error);
    throw error;
  }
}

/**
 * Send batch push notifications
 * @param {Array} messages - Array of message objects
 */
async function sendBatchPushNotifications(messages) {
  if (!messages || messages.length === 0) {
    return;
  }

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const responseData = await response.json();
    console.log('Batch push notifications sent:', responseData);
    return responseData;
  } catch (error) {
    console.error('Error sending batch push notifications:', error);
    throw error;
  }
}

module.exports = {
  sendPushNotification,
  sendBatchPushNotifications,
};
