import { CfnOutput, Stack, type StackProps } from "aws-cdk-lib";
import { AttributeType, Billing, TableV2 } from "aws-cdk-lib/aws-dynamodb";
import type { Construct } from "constructs";

import { PRODUCTS_TABLE_CATEGORY_INDEX } from "./constants";

export class ProductsDbStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const productsTable = new TableV2(this, "ProductsTable", {
      partitionKey: { name: "id", type: AttributeType.STRING },
      billing: Billing.onDemand()
    });
    productsTable.addGlobalSecondaryIndex({
      indexName: PRODUCTS_TABLE_CATEGORY_INDEX,
      partitionKey: { name: "category", type: AttributeType.STRING },
      sortKey: { name: "id", type: AttributeType.STRING }
    });

    new CfnOutput(this, "ProductsTableOutput", { value: productsTable.tableName });
  }
}
