import { useQueryClient } from '@tanstack/react-query';

// Todo lo que depende de un precio debe recargarse cuando uno cambia
export function useRefrescarPrecios() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all(
      ['precios', 'proveedores', 'materias-primas', 'formulaciones', 'formulacion', 'clasificacion-abc', 'reposicion'].map((k) =>
        queryClient.invalidateQueries({ queryKey: [k] }),
      ),
    );
}
