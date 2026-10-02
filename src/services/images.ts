import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { getSession } from './session';

/** Fotoğraflar sunucuda saklanır; veritabanında yalnızca dosya adı tutulur. */
export function imageUri(name: string | null | undefined): string | null {
  const s = getSession();
  if (!name || !s) return null;
  return `${s.url}/images/${encodeURIComponent(name)}?t=${encodeURIComponent(s.token)}`;
}

export async function deleteImage(name: string | null | undefined): Promise<void> {
  const s = getSession();
  if (!name || !s) return;
  try {
    await fetch(`${s.url}/images/${encodeURIComponent(name)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${s.token}` } });
  } catch { /* sunucuda kalan dosya zararsız */ }
}

/** Sunucu tüm veriyi sıfırlarken fotoğrafları da siler. */
export function clearAllImages(): void {}

export async function storePickedImage(srcUri: string, prefix: string): Promise<string> {
  const s = getSession();
  if (!s) throw new Error('Oturum yok.');
  const name = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}.jpg`;
  const blob = await (await fetch(srcUri)).blob();
  let res: Response;
  try {
    res = await fetch(`${s.url}/images/${name}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${s.token}`, 'Content-Type': 'image/jpeg' }, body: blob,
    });
  } catch {
    throw new Error('Fotoğraf yüklenemedi: sunucuya ulaşılamadı.');
  }
  if (!res.ok) throw new Error(`Fotoğraf yüklenemedi (${res.status}).`);
  return name;
}

export interface PhotoState {
  /** Yeni seçilen (henüz kaydedilmemiş) görselin geçici adresi */
  uri: string | null;
  removed: boolean;
}
export const emptyPhoto: PhotoState = { uri: null, removed: false };

/** Kaydetme anında: yeni dosyayı sunucuya yükler; eski dosyanın adını `oldToDelete` ile döndürür (kayıt başarılı olduktan sonra silin). */
export async function resolvePhoto(current: string | null | undefined, st: PhotoState, prefix: string):
  Promise<{ image: string | null; oldToDelete: string | null }> {
  if (st.uri) return { image: await storePickedImage(st.uri, prefix), oldToDelete: current ?? null };
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
