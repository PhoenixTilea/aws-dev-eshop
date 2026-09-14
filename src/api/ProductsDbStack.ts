import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import { AttributeType, Billing, TableV2 } from "aws-cdk-lib/aws-dynamodb";
import type { Construct } from "constructs";

import { PRODUCTS_TABLE_NAME, PRODUCTS_TABLE_CATEGORY_INDEX } from "./constants";

export class ProductsDbStack extends Stack {
  readonly productsTable: TableV2;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.productsTable = new TableV2(this, "ProductsTable", {
      tableName: PRODUCTS_TABLE_NAME,
      partitionKey: { name: "id", type: AttributeType.STRING },
      billing: Billing.onDemand()
    });
    this.productsTable.addGlobalSecondaryIndex({
      indexName: PRODUCTS_TABLE_CATEGORY_INDEX,
      partitionKey: { name: "category", type: AttributeType.STRING },
      sortKey: { name: "id", type: AttributeType.STRING }
    });
  }
}
