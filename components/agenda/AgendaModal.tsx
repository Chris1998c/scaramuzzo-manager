"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabaseClient";
import { motion } from "framer-motion";
import { useActiveSalon } from "@/app/providers/ActiveSalonProvider";
import { X, Search, Plus, Check, StickyNote, User, Scissors, Clock3 } from "lucide-react";

interface Props {
  isOpen: boolean;
  close: () => void;
  currentDate: string; // yyyy-mm-dd
  selectedSlot: { time: string; staffId: string | null } | null;
  onCreated?: () => void;
}

export default function AgendaModal({
  isOpen,
  close,
  selectedSlot,
  currentDate,
  onCreated,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const { activeSalonId } = useActiveSalon();

  // --- STATI DATI ---
  const [customers, setCustomers] = useState<any[]>([]);
  const [filteredCustomers, setFilteredCustomers] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);

  // --- STATI FORM ---
  const [qCustomer, setQCustomer] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);
  const [serviceAssignments, setServiceAssignments] = useState<Record<number, string | null>>({});
  const [notes, setNotes] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  // --- EFFETTI DI RESET E CARICAMENTO ---
  useEffect(() => {
    if (!isOpen) return;

    setErr("");
    setSaving(false);
    setQCustomer("");
    setCustomerId("");
    setSelectedServiceIds([]);
    setServiceAssignments({});
    setNotes("");

    const init = async () => {
      await Promise.all([loadCustomers(), loadServices(), loadStaff()]);
    };
    void init();
  }, [isOpen]);

  // Filtro ricerca clienti locale
  useEffect(() => {
    const q = qCustomer.toLowerCase().trim();
    if (!q) {
      setFilteredCustomers(customers);
      return;
    }
    setFilteredCustomers(
      customers.filter((c: any) => {
        const full = String(c.full_name ?? "").toLowerCase();
        const phone = String(c.phone ?? "").toLowerCase();
        return full.includes(q) || phone.includes(q);
      })
    );
  }, [qCustomer, customers]);

  // --- FUNZIONI DI CARICAMENTO ---
  async function loadCustomers() {
    const { data, error } = await supabase
      .from("customers")
      .select("id, first_name, last_name, phone")
      .order("last_name");
    
    if (error) return console.error("Error customers:", error);
    
    const list = (data || []).map((c: any) => ({
      ...c,
      full_name: `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim(),
    }));
    setCustomers(list);
    setFilteredCustomers(list);
  }

  async function loadServices() {
    const { data, error } = await supabase
      .from("services")
      .select("id, name, price, duration, color_code, active")
      .eq("active", true)
      .order("name");
    
    if (error) return console.error("Error services:", error);
    setServices(data || []);
  }

  async function loadStaff() {
    const { data, error } = await supabase
      .from("staff")
      .select("id, name")
      .eq("active", true)
      .order("name");
    
    if (error) return console.error("Error staff:", error);
    setStaffList(data || []);
  }

  // --- LOGICA SELEZIONE SERVIZI ---
  function toggleService(id: number) {
    setSelectedServiceIds((prev) => {
      const isAlreadySelected = prev.includes(id);
      if (isAlreadySelected) {
        const newAssignments = { ...serviceAssignments };
        delete newAssignments[id];
        setServiceAssignments(newAssignments);
        return prev.filter((x) => x !== id);
      } else {
        // Seleziona il servizio e assegna di default lo staffId dello slot cliccato
        setServiceAssignments(p => ({ ...p, [id]: selectedSlot?.staffId || null }));
        return [...prev, id];
      }
    });
  }

  // --- CALCOLO TIMELINE SEQUENZIALE (UI) ---
  const serviceTimeline = useMemo(() => {
    if (!selectedSlot) return [];
    
    let currentCursor = new Date(`${currentDate}T${selectedSlot.time}:00`);
    
    return selectedServiceIds.map((sid) => {
      const s = services.find((x) => Number(x.id) === sid);
      const startTimeStr = currentCursor.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const duration = Math.max(15, Number(s?.duration ?? 15));
      
      const item = { id: sid, name: s?.name, startTime: startTimeStr, duration };
      
      // Sposta il cursore in avanti per il prossimo servizio
      currentCursor = new Date(currentCursor.getTime() + duration * 60000);
      return item;
    });
  }, [selectedServiceIds, services, currentDate, selectedSlot]);

  const totalMinutes = useMemo(() => {
    return serviceTimeline.reduce((acc, s) => acc + s.duration, 0);
  }, [serviceTimeline]);

  // --- SALVATAGGIO ---
  async function createAppointment() {
    if (!selectedSlot || saving) return;
    setErr("");

    if (!activeSalonId) return setErr("Salone non configurato.");
    if (!customerId) return setErr("Seleziona un cliente.");
    if (selectedServiceIds.length === 0) return setErr("Seleziona almeno un servizio.");

    setSaving(true);
    const groupId = crypto.randomUUID(); 
    let cursor = new Date(`${currentDate}T${selectedSlot.time}:00`).getTime();

    try {
      // Inserimento sequenziale per ogni servizio (Logica Blocchi Atomici)
      for (const sid of selectedServiceIds) {
        const s = services.find((x: any) => Number(x.id) === Number(sid));
        const dur = Math.max(15, Number(s?.duration ?? 15));
        
        const blockStart = new Date(cursor).toISOString().replace("Z", "");
        const blockEnd = new Date(cursor + dur * 60_000).toISOString().replace("Z", "");

        const { error: insErr } = await supabase.from("appointments").insert({
          salon_id: Number(activeSalonId),
          customer_id: customerId,
          staff_id: serviceAssignments[sid] || null,
          service_id: sid,
          start_time: blockStart,
          end_time: blockEnd,
          status: "scheduled",
          notes: notes?.trim() || null,
          group_id: groupId 
        });

        if (insErr) throw insErr;
        
        // Avanza il cursore temporale
        cursor += dur * 60_000;
      }

      onCreated?.();
      close();
    } catch (e: any) {
      console.error(e);
      setErr("Errore durante il salvataggio: " + e.message);
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen || !selectedSlot) return null;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 backdrop-blur-md p-4 text-white">
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="w-full max-w-2xl rounded-[2.5rem] border border-[#5c3a21]/60 bg-[#140b07] shadow-[0_0_100px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* HEADER */}
        <div className="px-8 py-6 border-b border-[#5c3a21]/40 flex justify-between items-center bg-black/20">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[#f3d8b6]/50 font-black">Planning Agenda</p>
            <h2 className="text-2xl font-black text-[#f3d8b6] mt-0.5">
              {currentDate} <span className="text-white/20 mx-2 font-light">/</span> {selectedSlot.time}
            </h2>
          </div>
          <button 
            onClick={close} 
            className="p-3 hover:bg-white/5 rounded-2xl transition-colors border border-white/5"
          >
            <X size={22} className="text-[#f3d8b6]" />
          </button>
        </div>

        {/* CONTENUTO SCROLLABILE */}
        <div className="p-8 space-y-8 overflow-y-auto custom-scrollbar">
          
          {/* SEZIONE 1: CLIENTE */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[#f3d8b6] font-extrabold text-sm uppercase tracking-wider">
              <User size={18} className="text-[#f3d8b6]"/> Selezione Cliente
            </div>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
              <input 
                className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 outline-none focus:border-[#f3d8b6]/50 focus:ring-1 focus:ring-[#f3d8b6]/50 transition-all text-lg"
                placeholder="Cerca per nome o cellulare..." 
                value={qCustomer} 
                onChange={e => setQCustomer(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1">
              {filteredCustomers.length > 0 ? (
                filteredCustomers.slice(0, 20).map(c => (
                  <button 
                    key={c.id} 
                    onClick={() => setCustomerId(c.id)}
                    className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all border ${
                      customerId === c.id 
                        ? 'bg-[#f3d8b6] text-black border-[#f3d8b6] shadow-[0_0_15px_rgba(243,216,182,0.3)]' 
                        : 'bg-white/5 border-white/10 hover:border-white/30 text-white/70'
                    }`}
                  >
                    {c.full_name}
                  </button>
                ))
              ) : (
                <p className="text-xs text-white/30 italic px-2">Nessun cliente trovato...</p>
              )}
            </div>
          </div>

          {/* SEZIONE 2: SERVIZI E OPERATORI */}
          <div className="space-y-5">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2 text-[#f3d8b6] font-extrabold text-sm uppercase tracking-wider">
                <Scissors size={18}/> Menu Servizi
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#f3d8b6]/10 border border-[#f3d8b6]/20">
                <Clock3 size={14} className="text-[#f3d8b6]" />
                <span className="text-xs font-black text-[#f3d8b6] uppercase">{totalMinutes} min</span>
              </div>
            </div>

            <div className="grid gap-3">
              {services.map(s => {
                const timelineInfo = serviceTimeline.find(t => t.id === s.id);
                const isActive = !!timelineInfo;
                
                return (
                  <div 
                    key={s.id} 
                    className={`group p-4 rounded-[1.5rem] border transition-all duration-300 ${
                      isActive 
                        ? 'bg-[#f3d8b6]/5 border-[#f3d8b6]/40 shadow-inner' 
                        : 'bg-white/[0.02] border-white/5 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4">
                      <button 
                        onClick={() => toggleService(s.id)} 
                        className="flex items-center gap-4 flex-1 text-left"
                      >
                        <div 
                          className={`w-1.5 h-10 rounded-full transition-transform ${isActive ? 'scale-y-110' : 'opacity-40'}`} 
                          style={{ backgroundColor: s.color_code || '#666' }} 
                        />
                        <div>
                          <p className={`font-bold transition-colors ${isActive ? 'text-[#f3d8b6] text-lg' : 'text-white/60'}`}>
                            {s.name}
                          </p>
                          <p className="text-xs text-white/30 font-medium">
                            {s.duration} min <span className="mx-1">•</span> {s.price}€
                          </p>
                        </div>
                      </button>
                      
                      {isActive && (
                        <div className="flex items-center gap-6 animate-in fade-in slide-in-from-right-4 duration-500">
                          <div className="text-right">
                            <p className="text-[10px] uppercase font-black text-[#f3d8b6]/50 tracking-tighter">Inizio</p>
                            <p className="text-sm font-mono font-black text-white">{timelineInfo.startTime}</p>
                          </div>
                          
                          <div className="h-10 w-px bg-white/10" />
                          
                          <div className="min-w-[120px]">
                            <p className="text-[10px] uppercase font-black text-white/30 tracking-tighter mb-1">Eseguito da</p>
                            <select 
                              value={serviceAssignments[s.id] || ""} 
                              onChange={e => setServiceAssignments(p => ({...p, [s.id]: e.target.value}))}
                              className="bg-transparent text-xs font-bold text-[#f3d8b6] outline-none cursor-pointer w-full"
                            >
                              <option value="" className="bg-[#140b07]">Auto</option>
                              {staffList.map(st => (
                                <option key={st.id} value={st.id} className="bg-[#140b07]">{st.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      )}

                      <button 
                        onClick={() => toggleService(s.id)} 
                        className={`p-3 rounded-2xl transition-all ${
                          isActive 
                            ? 'bg-[#f3d8b6] text-black scale-110 rotate-0' 
                            : 'bg-white/5 text-white/20 hover:text-white/50 rotate-90 scale-90'
                        }`}
                      >
                        {isActive ? <Check size={20} strokeWidth={3} /> : <Plus size={20} />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SEZIONE 3: NOTE */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-[#f3d8b6] font-extrabold text-sm uppercase tracking-wider">
              <StickyNote size={18}/> Note Interne
            </div>
            <textarea 
              className="w-full bg-white/5 border border-white/10 rounded-[1.5rem] p-5 text-sm outline-none focus:border-[#f3d8b6]/50 min-h-[100px] transition-all resize-none"
              placeholder="Inserisci eventuali note per l'appuntamento (es. preferenze colore, allergie...)" 
              value={notes} 
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* FOOTER AZIONI */}
        <div className="p-8 border-t border-[#5c3a21]/40 bg-black/40 flex flex-col sm:flex-row gap-4">
          <button 
            disabled={saving} 
            onClick={createAppointment}
            className="flex-[2] bg-[#f3d8b6] text-black font-black py-5 rounded-2xl hover:brightness-110 active:scale-[0.98] disabled:opacity-50 transition-all shadow-[0_10px_30px_rgba(243,216,182,0.15)] flex justify-center items-center gap-3 uppercase tracking-widest text-sm"
          >
            {saving ? (
              <>
                <div className="w-5 h-5 border-4 border-black/20 border-t-black rounded-full animate-spin" />
                Salvataggio...
              </>
            ) : "Conferma Prenotazione"}
          </button>
          
          <button 
            disabled={saving}
            onClick={close} 
            className="flex-1 px-8 py-5 bg-white/5 font-bold rounded-2xl hover:bg-white/10 transition-all border border-white/5 text-white/60 uppercase tracking-widest text-xs"
          >
            Annulla
          </button>
        </div>

        {err && (
          <motion.div 
            initial={{ height: 0 }} animate={{ height: 'auto' }}
            className="bg-red-500 text-white text-[11px] font-black text-center py-3 uppercase tracking-widest"
          >
            {err}
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}