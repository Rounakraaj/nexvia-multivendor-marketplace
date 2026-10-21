"use client";

import { createContext, useContext, useEffect, useSyncExternalStore, type ReactNode } from "react";

export type CartItem = {
  id: string;
  title: string;
  price: number;
  image: string | null;
  shop: string;
  stock: number;
  qty: number;
};

type CartMode = "local" | "redis";
type CartApiResponse = { storage?: CartMode; reason?: "unavailable" | "unconfigured"; items?: CartItem[]; error?: string };
type CartSnapshot = { items: CartItem[]; ready: boolean; fallbackNotice: boolean; ownerId: string | null };
type CartIdentityContext = string | null;

const CartIdentity = createContext<CartIdentityContext>(null);
const KEY = "nexvia-cart";
const EMPTY: CartItem[] = [];
const SERVER_SNAPSHOT: CartSnapshot = { items: EMPTY, ready: false, fallbackNotice: false, ownerId: null };
const listeners = new Set<() => void>();
let mode: CartMode = "local";
let memoryItems: CartItem[] = EMPTY;
let ownerId: string | null = null;
let ready = false;
let fallbackNotice = false;
let lastRaw: string | null = null;
let lastItems: CartItem[] = EMPTY;
let currentSnapshot: CartSnapshot = SERVER_SNAPSHOT;

function readLocal(): CartItem[] {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === lastRaw) return lastItems;
    lastRaw = raw;
    const parsed: unknown = raw ? JSON.parse(raw) : EMPTY;
    lastItems = Array.isArray(parsed) ? parsed : EMPTY;
  } catch {
    lastItems = EMPTY;
  }
  return lastItems;
}

function snapshot(): CartSnapshot {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  const items = mode === "redis" ? memoryItems : readLocal();
  if (currentSnapshot.items !== items || currentSnapshot.ready !== ready || currentSnapshot.fallbackNotice !== fallbackNotice || currentSnapshot.ownerId !== ownerId) {
    currentSnapshot = { items, ready, fallbackNotice, ownerId };
  }
  return currentSnapshot;
}

function notify() {
  currentSnapshot = SERVER_SNAPSHOT;
  listeners.forEach((listener) => listener());
}

function writeLocal(items: CartItem[]) {
  mode = "local";
  memoryItems = items;
  lastItems = items;
  try {
    const raw = JSON.stringify(items);
    lastRaw = raw;
    localStorage.setItem(KEY, raw);
  } catch {
    lastRaw = null;
  }
  notify();
}

export function setCartSnapshot(items: CartItem[], storage: CartMode, notice: boolean, isReady = true, userId = ownerId) {
  mode = storage;
  memoryItems = items;
  ownerId = userId;
  fallbackNotice = notice;
  ready = isReady;
  if (storage === "local") writeLocal(items);
  else notify();
}

export function removeLocalCart() {
  try { localStorage.removeItem(KEY); } catch { /* Browser storage can be disabled. */ }
  lastRaw = null;
  lastItems = EMPTY;
}

export function getLocalCart() {
  return readLocal();
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  const onStorage = () => callback();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

export function CartProvider({ userId, children }: { userId: string | null; children: ReactNode }) {
  useEffect(() => {
    let active = true;
    const localItems = getLocalCart();
    async function sync() {
      if (!userId) {
        if (active) setCartSnapshot(localItems, "local", false, true, null);
        return;
      }
      try {
        const response = await fetch("/api/cart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ items: localItems.map(({ id, qty }) => ({ productId: id, qty })) }),
        });
        const data = await response.json() as CartApiResponse;
        if (!active) return;
        if (response.ok && data.storage === "redis" && data.items) {
          removeLocalCart();
          setCartSnapshot(data.items, "redis", false, true, userId);
        } else {
          setCartSnapshot(localItems, "local", data.reason === "unavailable", true, userId);
        }
      } catch {
        if (active) setCartSnapshot(localItems, "local", true, true, userId);
      }
    }
    void sync();
    return () => { active = false; };
  }, [userId]);

  const state = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
  return <CartIdentity.Provider value={userId}>
    {children}
    {state.fallbackNotice && <div role="status" className="fixed bottom-20 right-4 z-40 max-w-sm rounded-xl border border-[var(--line)] bg-[var(--surface-1)] px-4 py-3 text-xs text-[var(--muted)] shadow-xl">
      Cart sync is temporarily offline. Your changes are saved on this device.
    </div>}
  </CartIdentity.Provider>;
}

async function saveRemote(items: CartItem[]) {
  try {
    const response = await fetch("/api/cart", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: items.map(({ id, qty }) => ({ productId: id, qty })) }),
    });
    const data = await response.json() as CartApiResponse;
    if (response.ok && data.storage === "redis" && data.items) {
      setCartSnapshot(data.items, "redis", false, true, ownerId);
      return true;
    }
  } catch {
    // Keep cart controls working locally when Redis or the API is unreachable.
  }
  setCartSnapshot(items, "local", true, true, ownerId);
  return false;
}

async function write(items: CartItem[]) {
  if (mode === "redis") return saveRemote(items);
  writeLocal(items);
  return true;
}

export async function addItem(item: Omit<CartItem, "qty">, qty = 1) {
  const items = [...snapshot().items];
  const found = items.find((current) => current.id === item.id);
  if (found) {
    found.qty = Math.min(found.qty + qty, item.stock);
    found.stock = item.stock;
    found.price = item.price;
    found.title = item.title;
    found.shop = item.shop;
    found.image = item.image;
  } else {
    items.push({ ...item, qty: Math.min(qty, item.stock) });
  }
  await write(items.filter((current) => current.qty > 0));
}

export async function setQty(id: string, qty: number) {
  const items = snapshot().items
    .map((item) => (item.id === id ? { ...item, qty: Math.min(qty, item.stock) } : item))
    .filter((item) => item.qty > 0);
  await write(items);
}

export async function removeItem(id: string) {
  await write(snapshot().items.filter((item) => item.id !== id));
}

export async function clearCart() {
  if (mode === "redis") {
    try {
      const response = await fetch("/api/cart", { method: "DELETE" });
      const data = await response.json() as CartApiResponse;
      if (response.ok && data.storage === "redis") {
        removeLocalCart();
        setCartSnapshot([], "redis", false, true, ownerId);
        return;
      }
    } catch {
      // Continue by clearing local state and announce that server sync is offline.
    }
    setCartSnapshot([], "local", true, true, ownerId);
    return;
  }
  writeLocal([]);
}

export function useCart() {
  const userId = useContext(CartIdentity);
  const state = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
  const ready = state.ready && state.ownerId === userId;
  const items = ready ? state.items : EMPTY;
  const count = items.reduce((total, item) => total + item.qty, 0);
  const total = items.reduce((sum, item) => sum + item.qty * item.price, 0);
  return { items, count, total, ready, fallbackNotice: ready && state.fallbackNotice };
}
