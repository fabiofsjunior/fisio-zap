import 'dotenv/config';
import express from 'express';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'fisio-zap-backend' });
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`FisioZap backend local: http://localhost:${port}`));
