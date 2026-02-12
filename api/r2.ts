import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

const s3Client = new S3Client({
    region: "auto",
    endpoint: process.env.S3_API,
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || '',
        secretAccessKey: process.env.S3_SECRET_KEY || '',
    },
});

export const uploadBase64ToR2 = async (base64: string, mimeType: string): Promise<string> => {
    const buffer = Buffer.from(base64.replace(/^data:image\/\w+;base64,/, ""), 'base64');
    const extension = mimeType.split('/')[1] || 'jpg';
    const fileName = `${randomUUID()}.${extension}`;

    await s3Client.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: fileName,
        Body: buffer,
        ContentType: mimeType,
    }));

    return `${process.env.R2_PUBLIC_URL}/${fileName}`;
}