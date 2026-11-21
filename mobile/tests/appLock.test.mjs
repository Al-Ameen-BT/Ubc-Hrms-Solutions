import test from 'node:test';
import assert from 'node:assert/strict';

test('app lock configuration stores and deletes correctly in secure store', async () => {
  const store = new Map();
  const mockSecureStore = {
    getItemAsync: async key => store.get(key) || null,
    setItemAsync: async (key, val) => { store.set(key, val); },
    deleteItemAsync: async key => { store.delete(key); },
  };

  assert.equal(await mockSecureStore.getItemAsync('ucb_app_lock_enabled'), null);
  await mockSecureStore.setItemAsync('ucb_app_lock_enabled', 'true');
  assert.equal(await mockSecureStore.getItemAsync('ucb_app_lock_enabled'), 'true');
  await mockSecureStore.deleteItemAsync('ucb_app_lock_enabled');
  assert.equal(await mockSecureStore.getItemAsync('ucb_app_lock_enabled'), null);
});

test('promptAppUnlock requests biometric authentication with device fallback', async () => {
  let calledWith = null;
  const mockLocalAuth = {
    authenticateAsync: async options => {
      calledWith = options;
      return { success: true };
    },
  };

  const res = await mockLocalAuth.authenticateAsync({
    promptMessage: 'Unlock UCB-HRMS',
    cancelLabel: 'Cancel',
    fallbackLabel: 'Use Device PIN / Pattern',
    disableDeviceFallback: false,
  });

  assert.equal(res.success, true);
  assert.equal(calledWith.promptMessage, 'Unlock UCB-HRMS');
  assert.equal(calledWith.disableDeviceFallback, false);
});
