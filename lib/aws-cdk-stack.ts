import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { aws_dynamodb, aws_lambda, aws_apigateway, aws_ec2 } from 'aws-cdk-lib';
import { Instance, InstanceType, InstanceClass, InstanceSize, AmazonLinuxImage, Vpc, SubnetType, SecurityGroup, Port, Peer, Protocol } from 'aws-cdk-lib/aws-ec2';
import { Role } from 'aws-cdk-lib/aws-iam';
import { DynamoEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';

export class AwsCdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    //S3 bucket that stores the file and text_input and ID generated using NANOID
    const s3Bucket = new s3.Bucket(this, 'FocusS3BucketFromCDK', {
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    });

    s3Bucket.grantRead(new iam.AccountRootPrincipal());

    //API Gateway that inserts data from react app to DynamoDB using lambda function
    const api = new aws_apigateway.RestApi(this, 'MyApi', {});
    api.root.addCorsPreflight({
      allowOrigins: ['*'],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Amz-Date', 'X-Api-Key', 'X-Amz-Security-Token', 'X-Amz-User-Agent'],
      allowCredentials: false,
    })


    //Creating the DynamoDB
      const test_table = new aws_dynamodb.Table(this, 'MyTestTable1', {
      partitionKey: { name: 'ID', type: aws_dynamodb.AttributeType.STRING },
      stream: aws_dynamodb.StreamViewType.NEW_IMAGE,
      });

    //Creating the VM (VPC with subnets to create the EC2 instance) that will be used by the below lambda function
    const vpc = new Vpc(this, 'MyCDKVpc', {
      subnetConfiguration: [
        {
          cidrMask: 24,
          name: 'Public',
          subnetType: SubnetType.PUBLIC,
        },
      ],
    });

    const securityGroup = new SecurityGroup(this, 'MyCDKSecurityGroup', {
      vpc,
    });

    // Allowing inbound SSH traffic
    const sshPort = Port.tcp(22);
    //securityGroup.addIngressRule(Peer.anyIpv4(), sshPort);
    securityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(22),
      'Allows SSH access from Internet'
    )

    securityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(80),
      'Allows HTTP access from Internet'
    )

    securityGroup.addIngressRule(
      Peer.anyIpv4(),
      Port.tcp(443),
      'Allows HTTPS access from Internet'
    )

    // Creating an EC2 instance
    const instance = new Instance(this, 'MyCDKInstance1', {
      instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MICRO),
      machineImage: new AmazonLinuxImage(),
      vpc,
      securityGroup,
    });

    //Lambda function that inserts records from the react app to DynamoDB created above
    const insertRecord_handler = new aws_lambda.Function(this, 'InsertRecordLambda', {
      runtime: aws_lambda.Runtime.NODEJS_LATEST,
      code: aws_lambda.Code.fromAsset('lambda'),
      handler: 'insertRecord-handler.handler',
      environment: {
        TABLE_NAME: test_table.tableName,
        EC2_INSTANCE_ID: instance.instanceId,
      },
    });
    //granting READ-WRITE access to the lambda service
    test_table.grantReadWriteData(insertRecord_handler);

    //integrating the created API gateway with the lambda function to store data to dynamoDB
    const insertRecord_integration = new aws_apigateway.LambdaIntegration(insertRecord_handler);
    const insertDataResource = api.root.addResource('insertdata');
    //A post request to the API gateway with the endpoint /insertdata will do the operation
    insertDataResource.addMethod('POST', insertRecord_integration);

    //lambda trigger for DB insert action:
    const lambdaFunction = new aws_lambda.Function(this, 'MyLambda', {
      runtime: aws_lambda.Runtime.NODEJS_LATEST,
      handler: 'insertTrigger-handler.handler',
      code: aws_lambda.Code.fromAsset('lambda'),
      environment: {
        TABLE_NAME: test_table.tableName,
      },
    });
    lambdaFunction.addEventSource(new DynamoEventSource(test_table, {
      startingPosition: aws_lambda.StartingPosition.LATEST,
    }))
  }
}

const app = new cdk.App();
new AwsCdkStack(app, 'S3BucketStack');