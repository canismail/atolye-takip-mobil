import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable } from 'react-native';
import { useApp } from '../state/app';
import { FormModal, TextField } from './forms';
import { colors } from './theme';

/** Üst çubukta sağdaki göz simgesi: parasal verileri gizler; açmak için şifre ister. */
export function PrivacyButton() {
  const { hidden, hide, unlock } = useApp();
  const [ask, setAsk] = useState(false);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const close = () => { setAsk(false); setPw(''); setErr(null); };
  const submit = () => { if (unlock(pw)) close(); else setErr('Şifre hatalı.'); };
  return (
    <>
      <Pressable onPress={() => (hidden ? setAsk(true) : hide())} hitSlop={12} style={{ paddingHorizontal: 12 }}
        accessibilityLabel={hidden ? 'Gizli verileri göster' : 'Hassas verileri gizle'}>
        <Ionicons name={hidden ? 'eye-off' : 'eye-outline'} size={22} color={hidden ? colors.red : colors.primary} />
      </Pressable>
      {ask ? (
        <FormModal visible title="Verileri Göster" saveLabel="Göster" onClose={close} onSave={submit} error={err}>
          <TextField label="Şifre" value={pw} onChange={setPw} placeholder="Şifre" secure />
        </FormModal>
      ) : null}
    </>
  );
}
