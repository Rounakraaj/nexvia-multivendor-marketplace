"use client";

import { useState } from "react";
import { addItem, useCart } from "@/lib/cart";
import { showToast } from "@/lib/toast";

type Props = {
  id: string;
  title: string;
  price: number;
  image: string | null;
  shop: string;
  stock: number;
};

export default function AddToCartButton(props: Props) {
  const { items, ready } = useCart();
  const [added, setAdded] = useState(false);

  const inCart = items.find((i) => i.id === props.id)?.qty ?? 0;
  const soldOut = props.stock === 0;
  const maxed = inCart >= props.stock;

  function onClick() {
    void addItem(props, 1).then(() => {
      setAdded(true);
      showToast("Added to cart");
      setTimeout(() => setAdded(false), 1500);
    });
  }

  return (
    <button onClick={onClick} disabled={!ready || soldOut || maxed} className="btn btn-primary mt-8 w-full py-4">
      {!ready ? "Loading cart…" : soldOut ? "Out of stock" : maxed ? "Maximum quantity in cart" : added ? "Added to cart" : "Add to cart"}
    </button>
  );
}
