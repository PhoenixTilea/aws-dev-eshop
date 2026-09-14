import type { infer as zInfer } from "zod";
import { strictObject, string, uuid, enum as zEnum, number as zNumber } from "zod";

export const Category = {
  Arrows: "Arrows",
  Masks: "Masks",
  Potions: "Potions",
  Shields: "Shields"
} as const;
export const CategorySchema = zEnum(Category);
export type Category = typeof Category[keyof typeof Category];

export const Product = strictObject({
  id: uuid(),
  title: string().min(1).max(200),
  description: string().nonempty(),
  price: zNumber().int().positive(),
  category: CategorySchema
});
export type Product = zInfer<typeof Product>;

export const ProductCreateData = Product.omit({ id: true });
export type ProductCreateData = zInfer<typeof ProductCreateData>;

export const ProductUpdateData = Product.omit({ id: true, category: true });
export type ProductUpdateData = zInfer<typeof ProductUpdateData>;
