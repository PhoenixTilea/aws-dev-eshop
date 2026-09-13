import { z } from "zod";

export const Category = {
  Arrows: "Arrows",
  Masks: "Masks",
  Potions: "Potions",
  Shields: "Sheilds"
} as const;
export const CategorySchema = z.enum(Category);
export type Category = typeof Category[keyof typeof Category];

export const Product = z.strictObject({
  id: z.uuid(),
  title: z.string().min(1).max(200),
  description: z.string().nonempty(),
  price: z.number().int().positive(),
  category: CategorySchema
});
export type Product = z.infer<typeof Product>;

export const ProductCreateData = Product.omit({ id: true });
export type ProductCreateData = z.infer<typeof ProductCreateData>;

export const ProductUpdateData = Product.omit({ id: true, category: true });
export type ProductUpdateData = z.infer<typeof ProductUpdateData>;
