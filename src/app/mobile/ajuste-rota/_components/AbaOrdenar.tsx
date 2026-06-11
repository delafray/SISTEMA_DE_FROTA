'use client';

/**
 * AbaOrdenar — aba "Ordenar" da tela de Ajuste de Rota.
 *
 * Renderiza a lista drag-and-drop (dnd-kit) com SortableTijolinho.
 * O estado das paradas e o DndContext ficam na page — aqui apenas
 * o layout e o mapeamento dos items sortaveis.
 */

import {
  DndContext,
  closestCenter,
  type DragEndEvent,
  type SensorDescriptor,
  type SensorOptions,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTijolinho } from './SortableTijolinho';
import type { Parada } from '@/lib/routing/types';

export interface AbaOrdenarProps {
  paradas: Parada[];
  sensors: SensorDescriptor<SensorOptions>[];
  distancias: number[];
  paradaSelecionada: string | null;
  onDragStart: (event: { active: { id: string | number } }) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onParadaClick: (id: string) => void;
}

export function AbaOrdenar({
  paradas,
  sensors,
  distancias,
  paradaSelecionada,
  onDragStart,
  onDragEnd,
  onParadaClick,
}: AbaOrdenarProps): React.ReactElement {
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={paradas.map((p) => p.id)} strategy={verticalListSortingStrategy}>
        {paradas.map((p, i) => (
          <div
            key={p.id}
            onClick={() => onParadaClick(p.id)}
          >
            <SortableTijolinho
              parada={p}
              distanciaAnteriorKm={distancias[i]}
              destacado={paradaSelecionada === p.id}
            />
          </div>
        ))}
      </SortableContext>
    </DndContext>
  );
}
