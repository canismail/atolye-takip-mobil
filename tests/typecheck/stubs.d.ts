// Yalnızca `tsc` ile kendi kodumuzu kontrol etmek için (npm paketleri kurulu değilken). Gerçek projede kullanılmaz.
declare namespace React {
  type ReactNode = any;
  type DependencyList = readonly unknown[];
  type ComponentProps<T> = any;
  type Dispatch<T> = (v: T) => void;
  interface Context<T> { Provider: any; _t?: T }
  function createContext<T>(v: T): Context<T>;
  function useState<T>(init: T | (() => T)): [T, (v: T | ((p: T) => T)) => void];
  function useEffect(f: () => void | (() => void), d?: DependencyList): void;
  function useMemo<T>(f: () => T, d: DependencyList): T;
  function useCallback<T extends (...a: any[]) => any>(f: T, d: DependencyList): T;
  function useRef<T>(v: T): { current: T };
  function useContext<T>(c: Context<T>): T;
}
declare module 'react' { export = React; }
declare namespace JSX {
  type Element = any;
  interface IntrinsicElements { [k: string]: any }
  interface ElementChildrenAttribute { children: {} }
  interface IntrinsicAttributes { key?: string | number }
}
declare function setTimeout(f: () => void, ms?: number): number;
declare module 'react-native' {
  export type StyleProp<T> = T | T[] | null | undefined | false | StyleProp<T>[];
  export type ViewStyle = Record<string, any>;
  export const View: any, Text: any, TextInput: any, ScrollView: any, Pressable: any, Modal: any, FlatList: any,
    ActivityIndicator: any, RefreshControl: any, Switch: any, StyleSheet: any, Alert: any, Platform: any,
    KeyboardAvoidingView: any, Linking: any;
}
declare module '@expo/vector-icons';
declare module 'expo-image';
declare module 'expo-status-bar';
declare module 'expo-sqlite';
declare module 'expo-file-system' { export class Directory { [k: string]: any; constructor(...a: any[]); }
  export class File { [k: string]: any; constructor(...a: any[]); }
  export const Paths: any; }
declare module 'expo-image-picker' { export type ImagePickerOptions = Record<string, any>; const x: any; export = x; }
declare module 'expo-document-picker';
declare module 'expo-sharing';
declare module 'react-native-safe-area-context';
declare module '@react-native-community/datetimepicker';
declare module 'expo-router' {
  export const Stack: any;
  export const Tabs: any;
  export function useRouter(): { push(p: string): void; back(): void };
  export function useLocalSearchParams<T>(): T;
  export function useFocusEffect(cb: () => void | (() => void)): void;
}
