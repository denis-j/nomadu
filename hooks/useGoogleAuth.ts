import { useEffect, useRef } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { signInWithGoogleToken } from '../lib/auth';
import * as AuthSession from 'expo-auth-session';

WebBrowser.maybeCompleteAuthSession();

const IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

export function useGoogleAuth() {
  const [request, response, promptAsync] = Google.useIdTokenAuthRequest({
    iosClientId: IOS_CLIENT_ID,
    webClientId: WEB_CLIENT_ID,
    redirectUri: AuthSession.makeRedirectUri({
      native: 'com.nomady.app:/oauthredirect',
    }),
  });

  useEffect(() => {
    if (request?.redirectUri) {
      console.log('Generierter Redirect URI für Google:', request.redirectUri);
    } else {
      console.log('Request-Objekt oder redirectUri ist noch nicht verfügbar.');
    }
  }, [request]);

  const resolveRef = useRef<((token: string) => void) | null>(null);
  const rejectRef = useRef<((err: Error) => void) | null>(null);

  useEffect(() => {
    if (!response) return;

    if (response.type === 'success' && response.params.id_token) {
      resolveRef.current?.(response.params.id_token);
    } else if (response.type === 'dismiss' || response.type === 'cancel') {
      rejectRef.current?.(new Error('Google Sign-In was cancelled.'));
    } else {
      rejectRef.current?.(new Error('Google Sign-In failed.'));
    }
  }, [response]);

  /** Triggers the Google OAuth flow and resolves with the raw id_token. */
  const getIdToken = () => {
    return new Promise<string>((resolve, reject) => {
      resolveRef.current = resolve;
      rejectRef.current = reject;
      promptAsync();
    });
  };

  /** Convenience: get an id_token and immediately sign in with it. */
  const signIn = async () => {
    const token = await getIdToken();
    return signInWithGoogleToken(token);
  };

  return { signIn, getIdToken, ready: !!request };
}
