declare module 'react-dom/server' {
  export function renderToStaticMarkup(element: any): string;
  export function renderToString(element: any): string;
}

declare module 'react-native-webview' {
  const WebView: any;
  export { WebView };
  export default WebView;
}

declare module 'expo-image-picker' {
  export enum PermissionStatus {
    GRANTED = 'granted',
    DENIED = 'denied',
    UNDETERMINED = 'undetermined',
  }
  export const MediaTypeOptions: any;
  export function requestMediaLibraryPermissionsAsync(): Promise<any>;
  export function requestCameraPermissionsAsync(): Promise<any>;
  export function launchImageLibraryAsync(options?: any): Promise<any>;
  export function launchCameraAsync(options?: any): Promise<any>;
}

