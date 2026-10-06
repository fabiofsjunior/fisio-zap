import http from 'node:http';
import { Readable } from 'node:stream';

export function createServer(env, auth = {}) {
  const original = { ...process.env };
  Object.assign(process.env, env);

  const handler = async (req, res) => {
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ status: 'ok', service: 'fisio-zap-backend' }));
    }

    const origin = req.headers.origin;
    if (origin === env.FRONTEND_ORIGIN) res.setHeader('access-control-allow-origin', origin);

    if (req.url === '/chat') {
      if (!req.headers.authorization) {
        res.writeHead(401, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Autenticação necessária.' }));
      }

      if (!auth.tokenUser) {
        res.writeHead(401, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'Sessão inválida ou expirada.' }));
      }

      let body = '';
      for await (const chunk of req) body += chunk;
      const parsed = body ? JSON.parse(body) : {};
      const message = typeof parsed.message === 'string' ? parsed.message.trim() : '';

      if (!message) {
        res.writeHead(400, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'A mensagem é obrigatória.' }));
      }
      if (message.length > 4000) {
        res.writeHead(422, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ error: 'A mensagem deve ter no máximo 4000 caracteres.' }));
      }

      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({
        message: 'Demonstração FisioZap: recebi sua mensagem, profissional. A integração de IA ainda não está ativa.',
        mode: 'demo',
      }));
    }

    res.writeHead(404);
    res.end();
  };

  const server = http.createServer(handler);
  server.listen(0);
  return {
    request: async (path, options = {}) => {
      const address = server.address();
      const url = `http://127.0.0.1:${address.port}${path}`;
      const response = await fetch(url, {
        ...options,
        headers: { 'content-type': 'application/json', ...(options.headers || {}) },
        body: options.body && JSON.stringify(options.body),
      });
      return response;
    },
    close: async () => {
      server.close();
      process.env = original;
    },
  };
}
