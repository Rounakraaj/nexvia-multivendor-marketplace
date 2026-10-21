import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import CartView from "@/components/CartView";

export default function CartPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-6xl px-5 py-10">
        <h1 className="mb-8 text-3xl font-extrabold tracking-[-0.03em]">Your cart</h1>
        <CartView />
      </main>
      <SiteFooter />
    </>
  );
}
