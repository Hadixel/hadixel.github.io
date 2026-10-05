import type { ComponentProps } from "@kmodern/contracts";
import { SectionHeader } from "@kmodern/ui";
import { Section } from "./section";
import type { BlockRendererProps } from "./types";

export function ComparisonTableBlock({ block }: BlockRendererProps) {
  const p = block.props as ComponentProps["comparisonTable"];
  // The gateway built this: the published products, and a value per product for every spec field
  // they share. The renderer used to query both halves itself and then zip them by spec *name*,
  // which meant a block listing a product that was later unpublished rendered a row of dashes
  // rather than the comparison it was written to be. Two products is the minimum for a comparison
  // to be one, and that rule is kept here because it is about drawing, not about the data.
  const comparison = block.data.comparison;
  if (!comparison || comparison.products.length < 2) return null;
  const products = comparison.products;
  const fieldNames = comparison.fields.map((f) => f.name);
  const valueOf = (productId: string, fieldName: string) => {
    const field = comparison.fields.find((f) => f.name === fieldName);
    const at = products.findIndex((pr) => pr.id === productId);
    return field?.values[at] ?? "—";
  };
  return (
    <Section>
      {p.title && <SectionHeader title={p.title} />}
      <div className="overflow-x-auto rounded-card border border-plaster">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="bg-plaster text-right">
              <th className="px-4 py-3 font-semibold text-ash">ویژگی</th>
              {products.map((pr) => (
                <th key={pr.id} className="px-4 py-3 font-semibold text-ink">{pr.name}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-plaster">
            {fieldNames.map((name) => (
              <tr key={name}>
                <td className="px-4 py-2.5 text-ash">{name}</td>
                {products.map((pr) => (
                  <td key={pr.id} className="px-4 py-2.5 text-ink">{valueOf(pr.id, name)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
