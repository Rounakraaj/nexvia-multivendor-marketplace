type Props = {
  action: (formData: FormData) => void | Promise<void>;
  submitLabel: string;
  product?: {
    title: string;
    description: string | null;
    price: number;
    stock: number;
    category: string;
    image: string | null;
  };
};

const input =
  "w-full rounded-xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

export default function ProductForm({ action, submitLabel, product }: Props) {
  return (
    <form action={action} className="space-y-4">
      <input name="title" required minLength={2} defaultValue={product?.title} placeholder="Product title" className={input} />
      <textarea name="description" rows={3} defaultValue={product?.description ?? ""} placeholder="Description (optional)" className={input} />
      <div className="grid grid-cols-2 gap-4">
        <input name="price" type="number" step="0.01" min="0.01" required defaultValue={product?.price} placeholder="Price (INR)" className={input} />
        <input name="stock" type="number" min="0" required defaultValue={product?.stock ?? 0} placeholder="Stock" className={input} />
      </div>
      <input name="category" required minLength={2} defaultValue={product?.category} placeholder="Category (e.g. Electronics)" className={input} />
      <input name="image" type="url" defaultValue={product?.image ?? ""} placeholder="Image URL (optional)" className={input} />
      <button className="w-full rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700">
        {submitLabel}
      </button>
    </form>
  );
}
