//using AWS-SDK for javascript V3 as per the requirements - the "npm run build" makes everything to SDK V3 Javascript
import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import {
  PutCommand,
  DynamoDBDocumentClient,
  PutCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { EC2Client, StartInstancesCommand, StopInstancesCommand, DescribeInstancesCommand } from "@aws-sdk/client-ec2"
import { SendCommandCommand, SSMClient } from '@aws-sdk/client-ssm';

export async function handler(event: any): Promise<any> {

  const client: DynamoDBClient = new DynamoDBClient({});
  const docClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(client);

  const bodyJSON = JSON.parse(event.body);

  const command: PutCommand = new PutCommand({
    TableName: process.env.TABLE_NAME,
    Item: {
      ID: bodyJSON.ID,
      input_text: bodyJSON.input_text,
      input_file_path: bodyJSON.input_file_path
    },
  });

  const response = await docClient.send(command);
  console.log(response);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: "Record Insertion success",
      "response ": response,
    }),
    // headers: {
    //     'Content-Type': 'application/json',
    //     // 👇 allow CORS for all origins
    //     'Access-Control-Allow-Origin': '*', // Required for CORS support to work
    //     'Access-Control-Allow-Headers':
    //       'Content-Type,Authorization,X-Api-Key,X-Amz-Security-Token,X-Amz-User-Agent',
    //     'Access-Control-Allow-Credentials': 'true', // Required for cookies, authorization headers with HTTPS
    //     'Access-Control-Allow-Methods': 'OPTIONS,GET,PUT,POST,DELETE',
    //   }
      headers: {
        'Access-Control-Allow-Origin' : "'*'",
        'Access-Control-Allow-Headers':"'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
        'Access-Control-Allow-Credentials' : true,
        'Content-Type': "'application/json'"
    }
  };
}
