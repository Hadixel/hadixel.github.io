// The operator's product reads, as the gateway returns them.
//
// A page renders a product; it does not query one. So each read here answers the question one page
// asked, and the answer is that page's shape rather than the row: the list is a table of names,
// counts and badges, and the detail page is a form that has to be seeded.
//
// Two rules shaped what is *not* sent. The spec values cross as a record keyed by spec-field id
// because that is what the form holds — the panel used to build that record out of a list of rows
// itself, and a projection the panel has to perform is a projection that can be performed wrongly.
// And `seo` is a record or `null` rather than an opaque `Json`, so the form's prop type is the
// response's type and the page holds no cast.

/** One row of the operator's product table. */
export interface ProductListRow {
  id: string;
  name: string;
  slug: string;
  model: string;
  status: string;
  /**
   * The category, nested.
   *
   * Nested rather than flattened to a name, because the table's category cell reads the name off
   * the row it was given and a read that answered a different shape is a translation the panel has to
   * write — which is the duplication this read exists to remove.
   */
  category: { id: string; name: string };
  /** How many variants this product has. Counted here so the page never has to. */
  variantCount: number;
  updatedAt: string;
}

/**
 * One page of the product table.
 *
 * `page` and `size` come back because the server clamped them. The page asks for a bounded size and
 * is told which one it got, so the pager's arithmetic cannot disagree with the slice that was read.
 */
export interface ProductPage {
  products: ProductListRow[];
  total: number;
  page: number;
  size: number;
}

/** One product in full, as the edit form seeds itself from. */
export interface ProductDetail {
  id: string;
  name: string;
  brand: string;
  model: string;
  slug: string;
  categoryId: string;
  description: string | null;
  features: string[];
  status: string;
  allowBackorder: boolean;
  seo: Record<string, unknown> | null;
  variants: {
    id: string;
    colorName: string;
    colorCode: string | null;
    sku: string;
    price: number;
    stock: number;
    allowBackorder: boolean;
    images: string[];
  }[];
  /** The category's declared fields, keyed by spec-field id. Already the shape the form holds. */
  specValues: Record<string, string>;
}
