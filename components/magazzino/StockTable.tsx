"use client";

interface Product {
  id: number;
  name: string;
  category?: string;
  supplier?: string;
  quantity: number;
  price?: number;
}

interface StockTableProps {
  products: Product[];
}

export default function StockTable({ products }: StockTableProps) {
  return (
    <div className="bg-white p-6 rounded-xl shadow overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            <th className="p-3">Prodotto</th>
            <th className="p-3">Categoria</th>
            <th className="p-3">Fornitore</th>
            <th className="p-3">Qty</th>
            <th className="p-3">Prezzo</th>
          </tr>
        </thead>

        <tbody>
          {products.map((p: Product) => (
            <tr key={p.id} className="border-b">
              <td className="p-3">{p.name}</td>
              <td className="p-3">{p.category ?? "-"}</td>
              <td className="p-3">{p.supplier ?? "-"}</td>
              <td className="p-3">{p.quantity}</td>
              <td className="p-3">{p.price ? `${p.price}€` : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
