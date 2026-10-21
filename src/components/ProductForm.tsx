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

export default function ProductForm({ action, submitLabel, product }: Props) {
  return (
    <form action={action} className="grid gap-5 md:grid-cols-2">
      <div>
        <label htmlFor="title" className="label">Title</label>
        <input id="title" name="title" required minLength={2} defaultValue={product?.title} className="field" />
      </div>
      <div>
        <label htmlFor="description" className="label">Description</label>
        <textarea id="description" name="description" rows={4} defaultValue={product?.description ?? ""} className="field" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="price" className="label">Price (INR)</label>
          <input id="price" name="price" type="number" step="0.01" min="0.01" required defaultValue={product?.price} className="field" />
        </div>
        <div>
          <label htmlFor="stock" className="label">Stock</label>
          <input id="stock" name="stock" type="number" min="0" required defaultValue={product?.stock ?? 0} className="field" />
        </div>
      </div>
      <div>
        <label htmlFor="category" className="label">Category</label>
        <input id="category" name="category" required minLength={2} defaultValue={product?.category} placeholder="For example: Electronics" className="field" />
      </div>
      <div>
        <label htmlFor="image" className="label">Image URL</label>
        <input id="image" name="image" type="url" defaultValue={product?.image ?? ""} placeholder="https://..." className="field" />
      </div>
      <div className="md:col-span-2">
        <PendingSubmitButton className="btn btn-primary w-full py-3" label={submitLabel} />
      </div>
    </form>
  );
}
import PendingSubmitButton from "@/components/PendingSubmitButton";

