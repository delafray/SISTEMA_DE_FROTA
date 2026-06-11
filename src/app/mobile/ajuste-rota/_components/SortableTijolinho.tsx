'use client';

/**
 * SortableTijolinho — wrapper drag-and-drop (dnd-kit) em volta do Tijolinho.
 *
 * Bloqueia o drag se a parada estiver fixada ou ja concluida (entregue).
 * touchAction:'none' impede o browser de rolar a pagina enquanto o dnd-kit
 * detecta o long-press; marginInline cria uma faixa lateral livre pra o
 * motorista apoiar o dedo e rolar a pagina sem ativar o drag.
 */

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Tijolinho } from '../components/Tijolinho';
import type { Parada } from '@/lib/routing/types';

export interface SortableTijolinhoProps {
  parada: Parada;
  distanciaAnteriorKm?: number;
  destacado?: boolean;
}

export function SortableTijolinho({
  parada,
  distanciaAnteriorKm,
  destacado,
}: SortableTijolinhoProps): React.ReactElement {
  // Bloqueado pra reorder: fixada (motorista lockou) OU concluida (ja entregue)
  const bloqueado = parada.fixada || Boolean(parada.concluida_em);

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: parada.id,
    disabled: bloqueado,
  });

  // Listeners no wrapper inteiro = motorista pode prender o dedo em qualquer
  // ponto do tijolinho. touchAction:'none' impede o browser de rolar a pagina
  // enquanto o dnd-kit detecta o long-press. marginInline cria uma faixa
  // lateral SEM touchAction:none — motorista usa ela pra rolar a pagina
  // (antes nao tinha lugar nenhum pra apoiar o dedo).
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : parada.concluida_em ? 0.55 : 1,
    touchAction: bloqueado ? 'auto' : 'none',
    cursor: bloqueado ? 'default' : 'grab',
    marginInline: 16,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(bloqueado ? {} : listeners)}
      data-testid={`sortable-${parada.ordem}`}
    >
      {/* Sem draggableHandle — tijolinho inteiro e arrastavel via listeners.
          O icone ☰ era so decorativo e tomava espaco que faltava no celular. */}
      <Tijolinho
        parada={parada}
        modo="ordenar"
        distanciaAnteriorKm={distanciaAnteriorKm}
        destacado={destacado}
      />
    </div>
  );
}
