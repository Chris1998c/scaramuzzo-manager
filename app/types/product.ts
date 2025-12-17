export interface ProductStock {
  product_id: number;
  name: string;
  category: string | null;
  barcode: string | null;
  quantity: number;
  cost?: number;
  type?: string | null;
  description?: string | null;
}
