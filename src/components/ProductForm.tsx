import React, { useState } from 'react';
import { PRODUCT_CATEGORIES, PRODUCT_STATUSES } from '../db/schema';
import type { Product } from '../db/types';
import { numInput } from '../domain/format';
import { deleteImage, emptyPhoto, resolvePhoto } from '../services/images';
import { useApp } from '../state/app';
import { ChoiceField, FormModal, n, NumberField, PhotoField, SelectField, TextField } from '../ui/forms';
import { Muted } from '../ui/kit';

const ICONS = ['📦', '🔩', '⚙️', '🔧', '🛠️', '🚰', '🧰', '🏭', '⛓️', '🪛'];

export function ProductForm({ product, onClose, onSaved }: { product: Product | null; onClose: () => void; onSaved?: (id: number) => void }) {
  const { repo, bump } = useApp();
  const [name, setName] = useState(product?.name ?? '');
  const [category, setCategory] = useState(product?.category ?? PRODUCT_CATEGORIES[0]);
  const [icon, setIcon] = useState(product?.icon ?? '📦');
  const [price, setPrice] = useState(numInput(product?.unit_price ?? 0));
  const [status, setStatus] = useState(product?.status ?? 'Aktif');
  const [desc, setDesc] = useState(product?.description ?? '');
  const [photo, setPhoto] = useState(emptyPhoto);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    if (!name.trim()) return setErr('Ürün adı zorunludur.');
    try {
      const { image, oldToDelete } = await resolvePhoto(product?.image, photo, 'urun');
      const id = await repo.products.save({ name, category, icon, unit_price: n(price), status, description: desc, image }, product?.id);
      deleteImage(oldToDelete);
      bump();
      onSaved?.(id);
      onClose();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    }
  };

  return (
    <FormModal visible title={product ? 'Ürünü Düzenle' : 'Yeni Ürün'} onClose={onClose} onSave={save} error={err}>
      <TextField label="Ürün Adı *" value={name} onChange={setName} placeholder="Örn. Su Başlığı" autoCapitalize="words" />
      {product ? <Muted>Kod: {product.code}</Muted> : <Muted>Kod, ürün adına göre otomatik oluşturulur.</Muted>}
      <SelectField label="Kategori" value={category} options={PRODUCT_CATEGORIES.map((c) => ({ value: c, label: c }))} onChange={setCategory} />
      <SelectField label="Simge" value={icon} options={ICONS.map((c) => ({ value: c, label: c }))} onChange={setIcon} />
      <NumberField label="Satış Fiyatı" value={price} onChange={setPrice} />
      <ChoiceField label="Durum" value={status as any} options={PRODUCT_STATUSES as any} onChange={setStatus} />
      <TextField label="Açıklama" value={desc} onChange={setDesc} multiline />
      <PhotoField current={product?.image} value={photo} onChange={setPhoto} />
    </FormModal>
  );
}
