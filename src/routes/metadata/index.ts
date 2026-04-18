import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import axios from 'axios';

const metadataRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.get('/inspect', async (request, reply) => {
    const { url } = request.query as { url: string };
    if (!url) return reply.status(400).send({ error: 'URL is required' });

    try {
      const response = await axios.get(url, { headers: { 'Accept': 'text/html' } });
      const html = response.data;

      const getMetaTag = (html: string, property: string) => {
        const regex = new RegExp(`<meta.*?property="og:${property}".*?content="(.*?)".*?>`, 'i');
        const match = html.match(regex);
        return match ? match[1] : null;
      };

      const title = getMetaTag(html, 'title') || html.match(/<title>(.*?)<\/title>/i)?.[1];
      const description = getMetaTag(html, 'description');
      const image = getMetaTag(html, 'image');

      return reply.send({ title, description, image, url });
    } catch (error) {
      // Fallback on network error
      return reply.send({ url }); 
    }
  });
};

export default metadataRoutes;
