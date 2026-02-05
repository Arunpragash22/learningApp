/**
 * Push Notification Service
 * Handles Web Push subscription and initialization
 */

const API_BASE_URL = import.meta.env.VITE_API_URL;
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

/**
 * Convert base64 VAPID key to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Check if push notifications are supported
 */
export function isPushSupported(): boolean {
  return (
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

/**
 * Request notification permission from user
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    console.log('❌ Notifications not supported');
    return 'denied';
  }

  if (Notification.permission === 'granted') {
    console.log('✅ Notification permission already granted');
    return 'granted';
  }

  if (Notification.permission === 'denied') {
    console.log('❌ Notification permission denied');
    return 'denied';
  }

  // Request permission
  const permission = await Notification.requestPermission();
  console.log(`📢 Notification permission: ${permission}`);
  return permission;
}

/**
 * Register service worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.log('❌ Service workers not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/push-sw.js', {
      scope: '/'
    });
    
    console.log('✅ Service worker registered:', registration);
    
    // Wait for service worker to be ready
    await navigator.serviceWorker.ready;
    
    return registration;
  } catch (error) {
    console.error('❌ Service worker registration failed:', error);
    return null;
  }
}

/**
 * Subscribe to push notifications
 */
export async function subscribeToPush(
  registration: ServiceWorkerRegistration
): Promise<PushSubscription | null> {
  try {
    if (!VAPID_PUBLIC_KEY) {
      console.error('❌ VAPID_PUBLIC_KEY not configured');
      return null;
    }

    const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: applicationServerKey
    });

    console.log('✅ Push subscription created:', subscription);
    return subscription;
  } catch (error) {
    console.error('❌ Push subscription failed:', error);
    return null;
  }
}

/**
 * Send subscription to backend
 */
export async function sendSubscriptionToBackend(
  subscription: PushSubscription
): Promise<boolean> {
  try {
    const token = sessionStorage.getItem('access_token');
    
    if (!token) {
      console.error('❌ No access token found');
      return false;
    }

    const subscriptionJSON = subscription.toJSON();

    const response = await fetch(`${API_BASE_URL}/api/notifications/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        endpoint: subscriptionJSON.endpoint,
        keys: subscriptionJSON.keys
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Failed to send subscription to backend:', errorText);
      return false;
    }

    const result = await response.json();
    console.log('✅ Subscription saved to backend:', result);
    return true;
  } catch (error) {
    console.error('❌ Error sending subscription to backend:', error);
    return false;
  }
}

/**
 * Initialize push notifications (main function)
 * Call this after student login
 */
export async function initPushNotifications(): Promise<boolean> {
  console.log('🔔 Initializing push notifications...');

  // Check if push is supported
  if (!isPushSupported()) {
    console.log('❌ Push notifications not supported on this browser');
    return false;
  }

  // Check if running on HTTPS (required for push notifications)
  if (location.protocol !== 'https:' && location.hostname !== 'localhost') {
    console.log('❌ Push notifications require HTTPS');
    return false;
  }

  try {
    // 1. Request notification permission
    const permission = await requestNotificationPermission();
    
    if (permission !== 'granted') {
      console.log('❌ Notification permission not granted');
      return false;
    }

    // 2. Register service worker
    const registration = await registerServiceWorker();
    
    if (!registration) {
      console.log('❌ Service worker registration failed');
      return false;
    }

    // 3. Check if subscription already exists, otherwise create new one
    let subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      // Create new subscription
      subscription = await subscribeToPush(registration);
      
      if (!subscription) {
        console.log('❌ Push subscription failed');
        return false;
      }
    } else {
      console.log('✅ Existing push subscription found');
    }

    // 4. Send subscription to backend (upsert - will update if exists)
    const saved = await sendSubscriptionToBackend(subscription);
    
    if (!saved) {
      console.log('❌ Failed to save subscription to backend');
      return false;
    }

    console.log('✅ Push notifications initialized successfully!');
    console.log('📱 Subscription endpoint:', subscription.endpoint.substring(0, 50) + '...');
    return true;
    
  } catch (error) {
    console.error('❌ Error initializing push notifications:', error);
    return false;
  }
}

/**
 * Unsubscribe from push notifications
 */
export async function unsubscribeFromPush(): Promise<boolean> {
  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    
    if (!subscription) {
      console.log('No active subscription found');
      return true;
    }

    // Unsubscribe from push manager
    const unsubscribed = await subscription.unsubscribe();
    
    if (unsubscribed) {
      console.log('✅ Unsubscribed from push notifications');
      
      // Optionally notify backend
      const token = sessionStorage.getItem('access_token');
      if (token) {
        await fetch(`${API_BASE_URL}/api/notifications/unsubscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
      }
    }
    
    return unsubscribed;
  } catch (error) {
    console.error('❌ Error unsubscribing from push:', error);
    return false;
  }
}

