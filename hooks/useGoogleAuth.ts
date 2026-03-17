import { useEffect, useRef } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { signInWithGoogleToken } from '../lib/auth';

WebBrowser.maybeCompleteAuthSession();

const IOS_CLIENT_ID =
  '1044287572548-oiqqo1s9pqt6ot6vpa0bdv8gotakocrs.apps.googleusercontent.com';
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

export function useGoogleAuth() {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: IOS_CLIENT_ID,
    webClientId: WEB_CLIENT_ID,
  });

  const resolveRef = useRef<((user: any) => void) | null>(null);
  const rejectRef = useRef<((err: Error) => void) | null>(null);

  useEffect(() => {
    if (!response) return;

    if (response.type === 'success' && response.params.id_token) {
      signInWithGoogleToken(response.params.id_token)
        .then((user) => resolveRef.current?.(user))
        .catch((err) => rejectRef.current?.(err));
    } else if (response.type === 'dismiss' || response.type === 'cancel') {
      rejectRef.current?.(new Error('Google Sign-In was cancelled.'));
    } else {
      rejectRef.current?.(new Error('Google Sign-In failed.'));
    }
  }, [response]);

  const signIn = () => {
    return new Promise<any>((resolve, reject) => {
      resolveRef.current = resolve;
      rejectRef.current = reject;
      promptAsync();
    });
  };

  return { signIn, ready: !!request };
}
