"use client";

import { useSyncExternalStore } from "react";

export type CartItem = {
  id: string;
  title: string;
  price: number;
  image: string | null;
  shop: string;
  stock: number;
  qty: number;
};

const KEY = "nexvia-cart";
const EMPTY: CartItem[] = [];
const listeners = new Set<() => void>();

let lastRaw: string | null = null;
let lastItems: CartItem[] = EMPTY;

function read(): CartItem[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = localStorage.getItem(KEY);
  if (raw === lastRaw) return lastItems;
  lastRaw = raw;
  try {
    lastItems = raw ? (JSON.parse(raw) as CartItem[]) : EMPTY;
  } catch {
    lastItems = EMPTY;
  }
  return lastItems;
}

function write(items: CartItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function addItem(item: Omit<CartItem, "qty">, qty = 1) {
  const items = [...read()];
  const found = items.find((i) => i.id === item.id);
  if (found) {
    found.qty = Math.min(found.qty + qty, item.stock);
    found.stock = item.stock;
    found.price = item.price;
  } else {
    items.push({ ...item, qty: Math.min(qty, item.stock) });
  }
  write(items);
}

export function setQty(id: string, qty: number) {
  const items = read()
    .map((i) => (i.id === id ? { ...i, qty: Math.min(qty, i.stock) } : i))
    .filter((i) => i.qty > 0);
  write(items);
}

export function removeItem(id: string) {
  write(read().filter((i) => i.id !== id));
}

export function clearCart() {
  write([]);
}

export function useCart() {
  const items = useSyncExternalStore(subscribe, read, () => EMPTY);
  const count = items.reduce((n, i) => n + i.qty, 0);
  const total = items.reduce((n, i) => n + i.qty * i.price, 0);
  return { items, count, total };
}
