import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

/** Fotoğraflar cihazda `images/` klasöründe tutulur; veritabanında yalnızca dosya adı saklanır
 *  (masaüstü sürümüyle aynı). Yedek dosyasına fotoğraflar dahil değildir. */
function dir(): Directory {
  const d = new Directory(Paths.document, 'images');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

export function imageUri(name: string | null | undefined): string | null {
  if (!name) return null;
  try {
    const f = new File(dir(), name);
    return f.exists ? f.uri : null;
  } catch {
    return null;
  }
}

export function deleteImage(name: string | null | undefined): void {
  if (!name) return;
  try {
    const f = new File(dir(), name);
    if (f.exists) f.delete();
  } catch {
    /* dosya zaten yok */
  }
}

export function clearAllImages(): void {
  try {
    const d = dir();
    for (const item of d.list()) if (item instanceof File) item.delete();
  } catch {
    /* yoksay */
  }
}

/** Seçilen görseli uygulama klasörüne kopyalar ve dosya adını döndürür. */
export function storePickedImage(srcUri: string, prefix: string): string {
  const name = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
  new File(srcUri).copy(new File(dir(), name));
  return name;
}

export interface PhotoState {
  /** Yeni seçilen (henüz kaydedilmemiş) görselin geçici adresi */
  uri: string | null;
  removed: boolean;
}
export const emptyPhoto: PhotoState = { uri: null, removed: false };

/** Kaydetme anında: yeni dosyayı kopyalar; eski dosyanın adını `oldToDelete` ile döndürür (kayıt başarılı olduktan sonra silin). */
export function resolvePhoto(current: string | null | undefined, st: PhotoState, prefix: string):
  { image: string | null; oldToDelete: string | null } {
  if (st.uri) return { image: storePickedImage(st.uri, prefix), oldToDelete: current ?? null };
  if (st.removed) return { image: null, oldToDelete: current ?? null };
  return { image: current ?? null, oldToDelete: null };
}

/** Kamera / galeri seçimi. Seçilen görselin geçici adresini verir, vazgeçilirse null. */
export function pickPhoto(): Promise<string | null> {
  return new Promise((resolve) => {
    const run = async (kind: 'camera' | 'library') => {
      try {
        const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7, allowsEditing: true, exif: false };
        if (kind === 'camera') {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) {
            Alert.alert('İzin gerekli', 'Fotoğraf çekmek için kamera iznini ayarlardan açın.');
            return resolve(null);
          }
          const r = await ImagePicker.launchCameraAsync(opts);
          return resolve(r.canceled ? null : r.assets[0].uri);
        }
        const r = await ImagePicker.launchImageLibraryAsync(opts);
        resolve(r.canceled ? null : r.assets[0].uri);
      } catch (e) {
        Alert.alert('Fotoğraf alınamadı', String((e as Error).message ?? e));
        resolve(null);
      }
    };
    Alert.alert('Fotoğraf', undefined, [
      { text: 'Kamera', onPress: () => run('camera') },
      { text: 'Galeri', onPress: () => run('library') },
      { text: 'Vazgeç', style: 'cancel', onPress: () => resolve(null) },
    ], { cancelable: true, onDismiss: () => resolve(null) });
  });
}
