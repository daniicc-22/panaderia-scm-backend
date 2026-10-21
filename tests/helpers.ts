// Utilidades compartidas por las pruebas: respuesta y base de datos simuladas.

export function crearRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = (codigo: number) => {
    res.statusCode = codigo;
    return res;
  };
  res.json = (cuerpo: unknown) => {
    res.body = cuerpo;
    return res;
  };
  return res;
}

// Ejecuta una función silenciando console.error (los middleware lo usan al fallar)
export async function sinErroresEnConsola<T>(fn: () => Promise<T> | T): Promise<T> {
  const original = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = original;
  }
}
