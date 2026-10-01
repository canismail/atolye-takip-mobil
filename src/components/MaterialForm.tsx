import React, { useEffect, useMemo, useState } from 'react';
import { DEFAULT_DENSITY, STOCK_CATEGORIES, UNITS } from '../db/schema';
import type { MaterialType, StockItem } from '../db/types';
import { money, num, numInput } from '../domain/format';
import { calcUnitWeight, hammaddeUnitCost, volumeCm3 } from '../domain/weight';
import { deleteImage, emptyPhoto, resolvePhoto } from '../services/images';
import { useApp } from '../state/app';
import { ChoiceField, FormModal, n, NumberField, PhotoField, SelectField, TextField } from '../ui/forms';
import { Banner, Muted } from '../ui/kit';

export function MaterialForm({ item, onClose, onSaved }: { item: StockItem | null; onClose: () => void; onSaved?: (id: number) => void }) {
  const { repo, bump } = useApp();
  const [types, setTypes] = useState<MaterialType[]>([]);
  const [name, setName] = useState(item?.name ?? '');
  const [category, setCategory] = useState(item?.category ?? STOCK_CATEGORIES[1]);
  const [unit, setUnit] = useState(item?.unit ?? 'adet');
  const [minQty, setMinQty] = useState(numInput(item?.min_qty ?? 0));
  const [cost, setCost] = useState(numInput(item?.unit_cost ?? 0));
  const [shape, setShape] = useState<'Dikdörtgen / Kare' | 'Yuvarlak'>(item?.shape === 'round' ? 'Yuvarlak' : 'Dikdörtgen / Kare');
  const [a, setA] = useState(numInput(item?.dim_a ?? 0));
  const [b, setB] = useState(numInput(item?.dim_b ?? 0));
  const [len, setLen] = useState(numInput(item?.length_mm ?? 0));
  const [grade, setGrade] = useState<string | null>(item?.grade ?? null);
  const [kg, setKg] = useState(numInput(item?.kg_price ?? item?.unit_cost ?? 0));
  const [photo, setPhoto] = useState(emptyPhoto);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    repo.settings.materialTypes().then((t) => {
      // ayarlardan silinmiş eski cins de listede kalsın
      const list = [...t];
      if (item?.grade && !list.some((x) => x.name === item.grade)) list.push({ name: item.grade, density: item.density || DEFAULT_DENSITY });
      setTypes(list);
      setGrade((g) => g ?? list[0]?.name ?? null);
    });
  }, [repo, item]);

  const isHam = category === 'Hammadde';
  const sh = shape === 'Yuvarlak' ? 'round' : 'rect';
  const density = types.find((t) => t.name === grade)?.density ?? 0;
  const weight = useMemo(() => (isHam ? calcUnitWeight(sh, n(a), sh === 'round' ? 0 : n(b), n(len), density) : 0),
    [isHam, sh, a, b, len, density]);
  const unitCost = hammaddeUnitCost(unit, weight, n(kg));

  const save = async () => {
    if (!name.trim()) return setErr('Bileşen adı zorunludur.');
    try {
      const { image, oldToDelete } = resolvePhoto(item?.image, photo, 'malzeme');
      const id = await repo.stock.saveMaterial({
        name, category, unit, min_qty: n(minQty), unit_cost: n(cost), shape: isHam ? sh : null, dim_a: n(a), dim_b: n(b),
        length_mm: n(len), grade: isHam ? grade : null, kg_price: isHam ? n(kg) : null, image,
      }, item?.id);
      deleteImage(oldToDelete);
      bump();
      onSaved?.(id);
      onClose();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    }
  };

  return (
    <FormModal visible title={item ? 'Malzeme Bileşenini Düzenle' : 'Yeni Malzeme Bileşeni'} onClose={onClose} onSave={save} error={err}>
      <TextField label="Bileşen Adı *" value={name} onChange={setName} placeholder="Örn. Alüminyum Profil" autoCapitalize="words" />
      <Muted>{item ? `Kod: ${item.code}` : 'Kod, bileşen adına göre otomatik oluşturulur.'}</Muted>
      <ChoiceField label="Kategori" value={category as any} options={STOCK_CATEGORIES as any} onChange={setCategory} />
      <SelectField label="Birim" value={unit} options={UNITS.map((u) => ({ value: u, label: u }))} onChange={setUnit} />
      <NumberField label="Minimum Stok" value={minQty} onChange={setMinQty} />

      {isHam ? (
        <>
          <ChoiceField label="Kesit" value={shape} options={['Dikdörtgen / Kare', 'Yuvarlak'] as const} onChange={setShape} />
          {sh === 'rect' ? (
            <>
              <NumberField label="En (mm)" value={a} onChange={setA} />
              <NumberField label="Boy (mm)" value={b} onChange={setB} />
            </>
          ) : (
            <NumberField label="Çap (mm)" value={a} onChange={setA} />
          )}
          <NumberField label="Uzunluk (mm)" value={len} onChange={setLen} />
          {types.length ? (
            <SelectField label="Malzeme Cinsi" value={grade} options={types.map((t) => ({ value: t.name, label: `${t.name}  (${num(t.density)} g/cm³)` }))} onChange={setGrade} />
          ) : (
            <Banner tone="yellow" text="Malzeme cinsi tanımlı değil. Ayarlar → Malzeme Cinsleri bölümünden ekleyin." />
          )}
          {weight > 0 ? (
            <Banner tone="green" text={`Birim ağırlık: ${num(weight)} kg / parça · hacim ${num(volumeCm3(sh, n(a), n(b), n(len)))} cm³ × ${num(density)} g/cm³`} />
          ) : (
            <Muted>Ölçüleri ve cinsi seçince parça başına kilo otomatik hesaplanır.</Muted>
          )}
          <NumberField label="Kg Fiyatı" value={kg} onChange={setKg} />
          {weight > 0 ? (
            <>
              <Banner tone="green" text={`Birim maliyet: ${money(unitCost)} (${num(weight)} kg × ${money(n(kg))}/kg)`} />
              {unit !== 'adet' ? <Muted>Ölçülü hammadde parça sayısıyla takip edilir; kaydedince birim adet yapılır.</Muted> : null}
            </>
          ) : (
            <Muted>Ölçü girilmediği için birim maliyet ağırlıktan hesaplanamadı; kg fiyatı birim maliyet olarak kullanılır.</Muted>
          )}
        </>
      ) : (
        <NumberField label="Birim Maliyet" value={cost} onChange={setCost} />
      )}
      <PhotoField current={item?.image} value={photo} onChange={setPhoto} />
      {!item ? <Muted>Stok miktarını girmek için kaydettikten sonra "Stoğa Ekle" ile stok listesine alın.</Muted> : null}
    </FormModal>
  );
}
