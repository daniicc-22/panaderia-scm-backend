import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { registrarEntrada } from '../../services/inventarioService';
import { mensajeDeError } from '../../services/errores';
import type { EntradaRegistrada, OpcionesEntrada } from '../../types/inventario.types';
import {
  aDatosEntrada,
  aNumero,
  errorVencimiento,
  esquemaEntrada,
  valoresVaciosEntrada,
  type ValoresEntrada,
} from './esquemaEntrada';
import { formatoCantidad } from './formatos';

interface Props {
  opciones: OpcionesEntrada;
  onTerminar: (registrada?: EntradaRegistrada) => void;
}

// Campos pensados para el celular: altura táctil cómoda y letra de 16 px (evita el zoom automático en iOS)
const CAMPO = 'min-h-11 text-base sm:text-sm';

export function EntradaForm({ opciones, onTerminar }: Props) {
  const queryClient = useQueryClient();
  const [errorServidor, setErrorServidor] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    formState: { errors },
  } = useForm<ValoresEntrada>({ resolver: zodResolver(esquemaEntrada), defaultValues: valoresVaciosEntrada });

  const [materiaId, presentacionId, cantidadTexto] = useWatch({
    control,
    name: ['materia_prima_id', 'presentacion_id', 'cantidad'],
  });
  const materia = opciones.materias.find((m) => m.id === materiaId);
  const presentacion = materia?.presentaciones.find((p) => p.id === presentacionId);
  const cantidad = aNumero(cantidadTexto);
  const exigeVencimiento = materia?.criterio_rotacion === 'FEFO';
  const sinProveedor = presentacion !== undefined && presentacion.proveedores.length === 0;

  const guardar = useMutation({
    mutationFn: (valores: ValoresEntrada) => registrarEntrada(aDatosEntrada(esquemaEntrada.parse(valores))),
    onSuccess: async (registrada) => {
      await queryClient.invalidateQueries({ queryKey: ['inventario'] });
      onTerminar(registrada);
    },
    onError: (error) => setErrorServidor(mensajeDeError(error, 'No se pudo registrar la entrada.')),
  });

  const enviar = handleSubmit((valores) => {
    setErrorServidor(null);
    const mensaje = errorVencimiento(valores.fecha_vencimiento, opciones.fecha, materia?.criterio_rotacion ?? null);
    if (mensaje) {
      setError('fecha_vencimiento', { message: mensaje });
      return;
    }
    guardar.mutate(valores);
  });

  // Al cambiar de insumo se limpia lo que dependía de él; si solo hay una presentación, se elige sola
  function alCambiarInsumo(id: string) {
    const m = opciones.materias.find((x) => x.id === id);
    setValue('presentacion_id', m && m.presentaciones.length === 1 ? m.presentaciones[0].id : '', { shouldValidate: false });
    setValue('proveedor_id', '');
  }

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4" noValidate>
      <Select
        id="en-insumo"
        label="Insumo"
        className={CAMPO}
        error={errors.materia_prima_id?.message}
        {...register('materia_prima_id', { onChange: (e) => alCambiarInsumo(e.target.value) })}
      >
        <option value="">Elige el insumo</option>
        {opciones.materias.map((m) => (
          <option key={m.id} value={m.id}>
            {m.nombre} ({m.codigo})
          </option>
        ))}
      </Select>

      {materia && materia.presentaciones.length === 0 ? (
        <Alert variant="warning">
          Este insumo todavía no tiene presentaciones. Pide a un administrador crearlas en Materias primas.
        </Alert>
      ) : (
        <Select
          id="en-presentacion"
          label="Presentación"
          className={CAMPO}
          disabled={!materia}
          error={errors.presentacion_id?.message}
          {...register('presentacion_id', { onChange: () => setValue('proveedor_id', '') })}
        >
          <option value="">{materia ? 'Elige la presentación' : 'Primero elige el insumo'}</option>
          {materia?.presentaciones.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
      )}

      {sinProveedor && (
        <Alert variant="warning">
          Esta presentación no tiene un proveedor con precio vigente, por eso no se puede registrar la entrada. Pide a un
          administrador registrar la oferta.
        </Alert>
      )}

      {presentacion && presentacion.proveedores.length > 0 && (
        <Select id="en-proveedor" label="Proveedor" className={CAMPO} error={errors.proveedor_id?.message} {...register('proveedor_id')}>
          <option value="">Automático (mejor precio vigente)</option>
          {presentacion.proveedores.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
      )}

      <div className="flex flex-col gap-1">
        <Input
          id="en-cantidad"
          label={presentacion ? `Cantidad recibida (${presentacion.nombre})` : 'Cantidad recibida'}
          className={CAMPO}
          inputMode="decimal"
          autoComplete="off"
          placeholder="Ej. 2"
          error={errors.cantidad?.message}
          {...register('cantidad')}
        />
        {materia && presentacion && Number.isFinite(cantidad) && cantidad > 0 && (
          <span className="text-xs text-gris-texto">
            Entran {formatoCantidad(Math.round(cantidad * presentacion.contenido * 1000) / 1000, materia.unidad)} al inventario.
          </span>
        )}
      </div>

      <Input
        id="en-vencimiento"
        type="date"
        label={exigeVencimiento ? 'Fecha de vencimiento (obligatoria)' : 'Fecha de vencimiento (si el empaque la trae)'}
        className={CAMPO}
        min={opciones.fecha}
        error={errors.fecha_vencimiento?.message}
        {...register('fecha_vencimiento')}
      />

      <Input
        id="en-codigo"
        label="Código de lote del empaque (opcional)"
        className={CAMPO}
        maxLength={60}
        autoComplete="off"
        placeholder="Si lo dejas vacío, se genera uno"
        error={errors.codigo_lote?.message}
        {...register('codigo_lote')}
      />

      {errorServidor && <Alert variant="error">{errorServidor}</Alert>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="secondary" className="min-h-11" onClick={() => onTerminar()} disabled={guardar.isPending}>
          Cancelar
        </Button>
        <Button type="submit" className="min-h-11" isLoading={guardar.isPending} disabled={sinProveedor}>
          Registrar entrada
        </Button>
      </div>
    </form>
  );
}
