"use client";

interface Filters {
  categoria: string;
  fornitore: string;
  disponibilita: string;
}

interface SidebarFiltersProps {
  filters: Filters;
  setFilters: (value: Filters) => void;
}

export default function SidebarFilters({ filters, setFilters }: SidebarFiltersProps) {
  function update(key: keyof Filters, value: string) {
    setFilters({
      ...filters,
      [key]: value,
    });
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow space-y-6 w-64">
      <h2 className="text-xl font-semibold text-[#341A09]">Filtri</h2>

      {/* CATEGORIE */}
      <div>
        <h3 className="font-semibold mb-2">Categoria</h3>
        <select
          className="border p-2 rounded w-full"
          value={filters.categoria}
          onChange={(e) => update("categoria", e.target.value)}
        >
          <option value="">Tutte</option>
          <option value="rivendita">Rivendita</option>
          <option value="uso-interno">Uso Interno</option>
          <option value="store">Store</option>
        </select>
      </div>

      {/* FORNITORI */}
      <div>
        <h3 className="font-semibold mb-2">Fornitore</h3>
        <input
          className="border p-2 rounded w-full"
          placeholder="Nome fornitore..."
          value={filters.fornitore}
          onChange={(e) => update("fornitore", e.target.value)}
        />
      </div>

      {/* DISPONIBILITÀ */}
      <div>
        <h3 className="font-semibold mb-2">Disponibilità</h3>
        <select
          className="border p-2 rounded w-full"
          value={filters.disponibilita}
          onChange={(e) => update("disponibilita", e.target.value)}
        >
          <option value="">Tutte</option>
          <option value="disponibili">Disponibili</option>
          <option value="sottoscorta">Sottoscorta</option>
          <option value="esauriti">Esauriti</option>
        </select>
      </div>
    </div>
  );
}
