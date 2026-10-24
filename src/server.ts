import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { crearApp } from './app';

// El .env se lee antes de crear la aplicación y la conexión a la base de datos
dotenv.config();

const PORT = Number(process.env.PORT) || 3000;

const app = crearApp(new PrismaClient());

app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
});
