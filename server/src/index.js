import express from 'express';

const app = express();
const port = process.env.PORT || 3000;

app.disable('x-powered-by');
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Nurture API is running' });
});

app.listen(port, (error) => {
  if (error) throw error;
  console.log(`Nurture API: http://localhost:${port}`);
});
