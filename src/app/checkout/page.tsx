import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import SiteHeader from "@/components/SiteHeader";
import SiteFooter from "@/components/SiteFooter";
import PageHeader from "@/components/PageHeader";
import CheckoutForm from "@/components/CheckoutForm";

export default async function CheckoutPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  return <>
    <SiteHeader />
    <main className="mx-auto min-h-[60vh] max-w-6xl px-5 py-10">
      {session.user.role !== "CUSTOMER" ? <div className="panel max-w-2xl p-6">
        <h1 className="text-2xl font-bold">Checkout is for customers</h1>
        <p className="mt-2 text-[var(--muted)]">Vendor and admin accounts cannot place marketplace orders.</p>
        <Link href="/" className="btn btn-secondary mt-5">Return to the shop</Link>
      </div> : <>
        <PageHeader title="Checkout" description="Review your items and shipping details." />
        <CheckoutForm customerName={session.user.name ?? ""} paymentProvider={process.env.PAYMENT_PROVIDER === "razorpay" ? "razorpay" : "simulated"} />
      </>}
    </main>
    <SiteFooter />
  </>;
}
