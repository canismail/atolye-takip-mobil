import React, { useEffect, useState } from 'react';
import type { ProductStats, StockItem } from '../db/types';
import { num, numInput, today } from '../domain/format';
import { useApp } from '../state/app';
import { ChoiceField, DateField, FormModal, n, NumberField, SelectField, TextField, type Option } from '../ui/forms';
import { Banner, Muted } from '../ui/kit';

/** Malzeme bileşenini veya ürünü Stok listesine ekler (istenirse başlangıç miktarıyla). */
export function AddStockForm({ item, product, onClose, onDone }: {
  item?: StockItem | null; product?: ProductStats | null; onClose: () => void; onDone?: (stockId: number) => void;
}) {
  const { repo, bump } = useApp();
  const [kind, setKind] = useState<'Malzeme Bileşeni' | 'Ürün'>('Malzeme Bileşeni');
  const [mats, setMats] = useState<Option<number>[]>([]);
  const [prods, setProds] = useState<Option<number>[]>([]);
  const [pick, setPick] = useState<number | null>(null);
  const [qty, setQty] = useState('0');
  const [on, setOn] = useState<string | null>(today());
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const fixed = item ?? product ?? null;

  useEffect(() => {
    (async () => {
      const items = (await repo.stock.list()).filter((i) => !i.in_stock);
      setMats(items.map((i) => ({ value: i.id, label: `${i.code} · ${i.name}` })));
      const inStockPids = new Set((await repo.stock.list({ inStock: true, withProducts: true })).map((i) => i.product_id).filter(Boolean));
      setProds((await repo.products.withStats()).filter((p) => !inStockPids.has(p.id)).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })));
    })();
  }, [repo]);
  useEffect(() => setPick(null), [kind]);

  const isProduct = product ? true : item ? false : kind === 'Ürün';
  const options = isProduct ? prods : mats;
  const target = item ? item.id : product ? product.id : pick;
  const unit = isProduct ? 'adet' : item?.unit ?? 'adet';

  const save = async () => {
    if (target === null) return setErr('Seçim yapın.');
    try {
      const sid = isProduct ? await repo.stock.addProductToStock(target, n(qty), note, on ?? undefined)
        : (await repo.stock.addToStock(target, n(qty), note, on ?? undefined), target);
      bump();
      onDone?.(sid);
      onClose();
    } catch (e) {
      setErr(String((e as Error).message ?? e));
    }
  };

  return (
    <FormModal visible title="Stoğa Ekle" onClose={onClose} onSave={save} saveLabel="Ekle" error={err}>
      {fixed ? <Muted>{(item ?? product)!.code} · {(item ?? product)!.name}{product ? ' (ürün)' : ''}</Muted> : (
        <>
          <ChoiceField label="Ne eklenecek?" value={kind} options={['Malzeme Bileşeni', 'Ürün'] as const} onChange={setKind} />
          {options.length ? (
            <SelectField label="Seçim" value={pick} options={options as Option<number | null>[]} onChange={setPick} placeholder="Seçin" />
          ) : (
            <Banner tone="yellow" text={isProduct ? 'Stoğa eklenecek ürün yok. Önce Ürünler sayfasından ürün ekleyin.' : 'Stoğa eklenecek bileşen yok. Önce Malzeme Bileşenleri sayfasından bileşen tanımlayın (tanımlı olanların hepsi zaten stokta).'} />
          )}
        </>
      )}
      <NumberField label={`Başlangıç miktarı (${unit})`} value={qty} onChange={setQty} hint="0 bırakırsan sadece stok listesine eklenir; miktarı sonra girebilirsin." />
      <DateField label="Tarih" value={on} onChange={setOn} />
      <TextField label="Açıklama" value={note} onChange={setNote} placeholder="Örn. Tedarikçi teslimatı / üretimden giriş" />
    </FormModal>
  );
}

const KINDS = ['Giriş (+)', 'Çıkış (−)', 'Sayım düzeltme (=)'] as const;

export function MovementForm({ item, onClose }: { item: StockItem; onClose: () => void }) {
  const { repo, bump } = useApp();
  const [kind, setKind] = useState<(typeof KINDS)[number]>('Giriş (+)');
  const [amt, setAmt] = useState('');
  const [target, setTarget] = useState(numInput(item.quantity));
  const [on, setOn] = useState<string | null>(today());
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const change = kind.startsWith('Sayım') ? n(target) - item.quantity : kind.startsWith('Giriş') ? n(amt) : -n(amt);
  const newQty = item.quantity + change;

  const save = async () => {
    if (change === 0) return setErr('Miktar girin.');
    if (newQty < 0) return setErr('Çıkış miktarı mevcut stoktan fazla.');
    await repo.stock.addMovement(item.id, change, note || kind.split(' ')[0], on ?? undefined);
    bump();
    onClose();
  };
  return (
    <FormModal visible title="Stok Hareketi" onClose={onClose} onSave={save} error={err}>
      <Muted>{item.code} · {item.name} — mevcut: {num(item.quantity)} {item.unit}</Muted>
      <ChoiceField label="Hareket" value={kind} options={KINDS} onChange={setKind} />
      {kind.startsWith('Sayım')
        ? <NumberField label="Sayılan miktar" value={target} onChange={setTarget} suffix={item.unit} />
        : <NumberField label={`Miktar (${item.unit})`} value={amt} onChange={setAmt} suffix={item.unit} />}
      <DateField label="Tarih" value={on} onChange={setOn} />
      <TextField label="Açıklama" value={note} onChange={setNote} placeholder="Örn. Tedarikçi teslimatı, üretime çıkış..." />
      <Banner tone={newQty < 0 ? 'red' : 'blue'} text={`Yeni miktar: ${num(newQty)} ${item.unit}`} />
    </FormModal>
  );
}
