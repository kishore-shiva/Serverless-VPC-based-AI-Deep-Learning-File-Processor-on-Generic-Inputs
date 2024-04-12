import { DynamoDBClient, GetItemCommand } from "@aws-sdk/client-dynamodb";
import { EC2Client, StartInstancesCommand, StopInstancesCommand, DescribeInstancesCommand } from "@aws-sdk/client-ec2"
import { SendCommandCommand, SSMClient } from '@aws-sdk/client-ssm';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

export async function handler(event: any): Promise<any> {
    try{
    //Logs used for debugging:
    console.log("Event type is: "+ JSON.stringify(event.eventType));
    console.log("Event is: "+JSON.stringify(event));
    console.log("Event records: "+JSON.stringify(event.Records));
    console.log("Event name: "+event.Records[0].eventName +"\n Event ID: "+event.Records[0].dynamodb.Keys.ID.S);

    if(event.Records[0].eventName === "INSERT"){

        try{
            if(event.Records[0].dynamodb.NewImage.output_file_path != undefined){
                console.log("output file path exists: not to perform any operation");
            }
            else{
                console.log("output_file_path does not exist: perform all the operations");

                const record_ID = event.Records[0].dynamodb.Keys.ID.S;
                let input_text, input_file_path;

                const client: DynamoDBClient = new DynamoDBClient({});

                //Retrieving the Data from DynamoDB using its ID:
                const get_command: GetItemCommand = new GetItemCommand({
                    TableName: process.env.TABLE_NAME,
                    Key: {
                    ID: { S: record_ID } // Assuming ID is a string type
                    }
                });

                try {
                    const response = await client.send(get_command);
                    console.log(response);
                    if (response.Item) {
                    // Data found from DB
                    console.log("Data Success fetching from DynamoDB: " + JSON.stringify(response.Item) + " fetched id: " + JSON.stringify(response.Item!.ID.S));

                    input_text = JSON.stringify(response.Item!.input_text.S)
                    input_file_path = JSON.stringify(response.Item!.input_file_path.S);
                    } else {
                    // Data not found
                    console.log("Data not found! from DB");
                    }
                } catch (error) {
                    console.error("Error retrieving data from DynamoDB:", error);
                }

                const bucket_name = input_file_path?.split('/')[0].substring(1);
                console.log("Bucket name: " + bucket_name);

                //Firstly, create a shell script file and upload it to S3 to make it downloadable from our EC2:
                const shellScriptContent = `#!/bin/bash
                aws s3 cp s3://${input_file_path} filecontents.txt
                echo "$(cat filecontents.txt) : ${input_text}" > outputFile.txt
                aws s3 cp outputFile.txt s3://${bucket_name}/outputFile.txt
                aws dynamodb put-item \
                    --table-name Music  \
                    --item \
                        '{"ID": {"S": ${record_ID}}, "output_file_path": {"S": ${bucket_name}/outputFile.txt}}'
                `;

                // Convert the shell script content to a Buffer
                const shellScriptBuffer = Buffer.from(shellScriptContent, 'utf-8');

                // Upload the shell script to the S3 bucket
                const s3Client = new S3Client({ region: 'us-east-2' });
                const putObjectCommand = new PutObjectCommand({
                Bucket: bucket_name,
                Key: 'shell_script.sh', // Name of the shell script file
                Body: shellScriptBuffer,
                });

                try {
                const response = await s3Client.send(putObjectCommand);
                console.log('Shell script uploaded successfully:', response);
                } catch (error) {
                console.error('Error uploading shell script:', error);
                }

                //FROM THE VM TASK: Starting the EC2 instance after DB Data insertion:
                const ec2Client = new EC2Client({ region: 'us-east-2' }); // Replace 'your-region' with your AWS region

                // Specify the instance ID of the EC2 instance to start
                const instanceId = "i-0203c63f87bbf65b5"; // Replace 'your-instance-id' with your EC2 instance ID

                // Specify the parameters for starting the instance
                const params = {
                InstanceIds: [instanceId],
                };

                console.log("The instance ID is " + instanceId);

                // Create the start instances command
                const startCommand = new StartInstancesCommand(params);

                // Start the EC2 instance
                try {
                const data = await ec2Client.send(startCommand);
                console.log('Success started instance', data.StartingInstances);

                //Wait for the instance to started and running to execute the shell commands
                for(let i=0; i<10; i++){
                    const describe_command = new DescribeInstancesCommand(params);
                    const describe_response = await ec2Client.send(describe_command);
                    if(describe_response.Reservations != null){
                        if(describe_response.Reservations[0].Instances != null){
                            if(describe_response.Reservations[0].Instances[0].State!.Name === "running"){
                                console.log("Successfully build the EC2 instance and running!");
                                break;
                            }
                            else{
                                console.log("Current state of EC2 instance is: "+ describe_response.Reservations[0].Instances[0].State!.Name);
                            }
                        }
                    }
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }

                //start executing the scripts in the EC2 instance
                const ssmClient = new SSMClient({ region: 'us-east-2' });

                // Specify the command to execute on your EC2 instance
                console.log("input text: "+input_text+" Input file path: "+input_file_path);

                const command = {
                    InstanceIds: [instanceId],
                    DocumentName: "AWS-RunShellScript",
                    Parameters: {
                        commands: [
                            shellScriptBuffer.toString('base64')
                        ],
                    },
                };

                // Create the send command command
                const sendCommand = new SendCommandCommand(command);
                const response = await ssmClient.send(sendCommand);
                console.log("command execution status: " + JSON.stringify(response));

                } catch (err) {
                console.log('Error', err);
                }

                //Stopping the EC2 instance:
                const stopCommand = new StopInstancesCommand(params);
                try {
                    const data = await ec2Client.send(stopCommand);
                    console.log('Success stopping the VM', data.StoppingInstances);
                    } catch (err) {
                    console.log('Error', err);
                    }
            }
        }
        catch(err){
            console.log(err)
        }
    }

    return {
        statusCode: 200,
        body: JSON.stringify({
          message: "Trigger called successfully",
        }),
          headers: {
            'Access-Control-Allow-Origin' : "'*'",
            'Access-Control-Allow-Headers':"'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
            'Access-Control-Allow-Credentials' : true,
            'Content-Type': "'application/json'"
        }
      };
    }
    catch(err){
        console.log("Error: " + JSON.stringify(err));
        return {
            statusCode: 404,
            body: JSON.stringify({
              message: "Error in the trigger request",
              Error: JSON.stringify(err)
            }),
              headers: {
                'Access-Control-Allow-Origin' : "'*'",
                'Access-Control-Allow-Headers':"'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token'",
                'Access-Control-Allow-Credentials' : true,
                'Content-Type': "'application/json'"
            }
          };
    }
}