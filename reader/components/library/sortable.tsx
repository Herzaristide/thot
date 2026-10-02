"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { generateKeyBetween } from "fractional-indexing";
import { GripVertical } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Liste réordonnable (souris, toucher, clavier). Après un déplacement,
 * `onMove` reçoit la nouvelle position fractionnaire de l'élément, calculée
 * entre ses deux voisins : un seul élément est réécrit.
 */
export function SortableList<T extends { id: string; position: string }>({
  items,
  onChange,
  onMove,
  render,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  onMove: (id: string, position: string) => void;
  render: (item: T) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    const moved = arrayMove(items, from, to);
    const before = moved[to - 1]?.position ?? null;
    const after = moved[to + 1]?.position ?? null;
    let position: string;
    try {
      position = generateKeyBetween(before, after);
    } catch {
      // Positions égales (données anciennes) : on place après le précédent
      position = generateKeyBetween(before, null);
    }
    const item = moved[to];
    if (!item) return;
    moved[to] = { ...item, position };
    onChange(moved);
    onMove(item.id, position);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        <ul className="divide-y rounded-xl border">
          {items.map((item) => (
            <SortableRow key={item.id} id={item.id}>
              {render(item)}
            </SortableRow>
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 bg-card p-3 first:rounded-t-xl last:rounded-b-xl",
        isDragging && "relative z-10 shadow-lg",
      )}
    >
      <button
        type="button"
        className="cursor-grab touch-none rounded p-1 text-muted-foreground hover:bg-accent active:cursor-grabbing"
        aria-label="Déplacer"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
