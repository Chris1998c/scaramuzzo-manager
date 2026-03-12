SCARAMUZZO MANAGER ARCHITECTURE

Framework
Next.js 15
Supabase (PostgreSQL + RLS)

Modules

AGENDA
appointments
appointment_services

CASSA
sales
sale_items
cash_sessions

MAGAZZINO
products
product_stock
stock_movements

TRASFERIMENTI
transfers
transfer_items

CLIENTI
customers
customer_profile
customer_service_cards
customer_notes

SALONI
salons
staff
user_salons
roles

REPORT
sales
sale_items
appointments
cash_sessions

Important flows

Appointment → sale → stock_move → appointment.done

Stock movements
load
unload
transfer
sale

Salon id 5 = Magazzino Centrale