import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

const uploadRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Setup S3 Client (assuming env variables are provided)
  const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY || 'MOCK_ACCESS',
      secretAccessKey: process.env.AWS_SECRET_KEY || 'MOCK_SECRET',
    },
  });

  fastify.post('/presigned-url', async (request, reply) => {
    try {
      const { fileName, mimeType, fileSize } = request.body as { fileName: string; mimeType: string; fileSize: number };

      const MAX_SIZE = 50 * 1024 * 1024; // 50MB
      if (fileSize > MAX_SIZE) {
        return reply.status(400).send({ error: 'File too large' });
      }

      const allowedTypes = ['image/jpeg', 'image/png', 'video/mp4', 'application/pdf', 'audio/webm', 'application/zip', 'application/msword'];
      if (!allowedTypes.includes(mimeType)) {
        return reply.status(400).send({ error: 'Invalid file type' });
      }

      const extension = fileName.split('.').pop();
      const key = `chat-media/${uuidv4()}.${extension}`;

      const command = new PutObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET || 'my-bucket',
        Key: key,
        ContentType: mimeType,
      });

      const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });

      return reply.send({
        uploadUrl: presignedUrl,
        fileUrl: `https://${process.env.AWS_S3_BUCKET}.s3.${process.env.AWS_REGION || 'us-east-1'}.amazonaws.com/${key}`,
        key
      });

    } catch (error) {
      fastify.log.error(error);
      return reply.status(500).send({ error: 'Failed to generate url' });
    }
  });
};

export default uploadRoutes;
