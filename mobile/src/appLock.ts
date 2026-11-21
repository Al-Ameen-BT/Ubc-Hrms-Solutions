import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const APP_LOCK_KEY = 'ucb_app_lock_enabled';

export async function isAppLockConfigured(): Promise<boolean> {
  try {
    const val = await SecureStore.getItemAsync(APP_LOCK_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function setAppLockConfigured(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await SecureStore.setItemAsync(APP_LOCK_KEY, 'true');
    } else {
      await SecureStore.deleteItemAsync(APP_LOCK_KEY);
    }
  } catch {
    // secure store fallback
  }
}

export async function checkBiometricsAvailable(): Promise<{ hasHardware: boolean; isEnrolled: boolean; biometryType: string }> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    let biometryType = 'Biometrics / Screen Lock';
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      biometryType = 'Face Recognition';
    } else if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      biometryType = 'Fingerprint';
    }
    return { hasHardware, isEnrolled, biometryType };
  } catch {
    return { hasHardware: false, isEnrolled: false, biometryType: 'Screen Lock' };
  }
}

export async function promptAppUnlock(promptMessage = 'Unlock UCB-HRMS with Biometrics or Screen Lock'): Promise<boolean> {
  try {
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      cancelLabel: 'Cancel',
      fallbackLabel: 'Use Device PIN / Pattern',
      disableDeviceFallback: false,
    });
    return result.success;
  } catch {
    return false;
  }
}
