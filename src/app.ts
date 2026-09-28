import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';

dotenv.config();

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', mensaje: 'API panaderia-scm-backend funcionando' });
});

app.get('/roles', async (_req, res) => {
  try {
    const roles = await prisma.rol.findMany();
    res.json(roles);
  } catch (error) {
    console.error('Error al consultar roles:', error);
    res.status(500).json({ error: 'Error al consultar los roles' });
  }
});

export default app;