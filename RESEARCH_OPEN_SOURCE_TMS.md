# Open-Source TMS and Fleet Management: Features and Data Models (2023-2026)

## 1. ROUTING ENGINES (Core Infrastructure)

### A. OSRM (Open Source Routing Machine)
- **GitHub:** https://github.com/Project-OSRM/osrm-backend
- **Stars:** 7776 (most-used open-source router)
- **Language:** C++ (high performance)
- **License:** BSD 2-Clause
- **Features:**
  - Single route calculation (A → B, fastest path)
  - Matrix queries (distances/times between multiple points)
  - Trip/round-trip optimization for 100+ points
  - Road network profiles (car, bike, foot)
  - Polyline encoding for map visualization
  - Max table size: configurable (typically 10,000-50,000 points)
- **Data Model:**
  - Input: coordinates (lat, lng), optional time windows
  - Output: distance_km, duration_min, polyline (geometry), routes
- **Real-world:** Production in 1000s of TMS/delivery apps; used as default backend in VROOM
- **API Docs:** https://project-osrm.org/docs/v5.27.1/api/
- **Deployment:** Docker (yours: Oracle VM 24GB RAM, Brazil map)

### B. VROOM (Vehicle Routing Open-source Optimization Machine)
- **GitHub:** https://github.com/VROOM-Project/vroom
- **Stars:** 1777
- **Language:** C++ (integrates with OSRM)
- **License:** BSD 2-Clause
- **Features:**
  - Vehicle Routing Problem (VRP) solver
  - Time windows per stop (delivery hours 8am-5pm)
  - Vehicle capacity constraints (weight, volume)
  - Skills/tags (equipment type, delivery zone)
  - Multiple vehicles optimization (orders 1 route, split 3 vehicles)
  - Cost matrix customization (fuel, tolls, penalties)
  - Integrated with OSRM backend
- **Data Model:**
  - Input: vehicles (start/end position, capacity, profile, costs), jobs (location, time window, skill, service_time_min, amount)
  - Output: routes (ordered stops), metrics (total_distance, total_duration, total_cost)
- **Real-world:** TMS engines like Sennder (broker, 10k+ drivers) use VROOM backbone
- **API Docs:** https://vroom-project.org/docs/latest/api/overview/
- **Example Input (your 70 stops/day):**
  ```json
  {
    "vehicles": [{
      "id": 1,
      "start": [-46.63, -23.55],
      "end": [-46.63, -23.55],
      "capacity": [3000],
      "skills": [1, 2],
      "time_window": [0, 28800]
    }],
    "jobs": [{
      "id": 1,
      "location": [-46.65, -23.56],
      "service": 600,
      "time_windows": [[28800, 57600]],
      "delivery": [100],
      "skills": [1]
    }]
  }
  ```

### C. GraphHopper
- **GitHub:** https://github.com/graphhopper/graphhopper
- **Stars:** 6501
- **Language:** Java (enterprise)
- **License:** Apache 2.0
- **Features:**
  - Complete routing engine (distance matrix, isochrone)
  - VRP solver (jsprit integration)
  - Web-based UI + REST API
  - Real-time traffic (premium)
  - Custom road networks per region
  - Elevation profiles
- **Real-world:** Delivery platforms (DHL, local couriers), navigation apps
- **API Docs:** https://graphhopper.com/api/1/

### D. OR-Tools (Google Optimization)
- **GitHub:** https://github.com/google/or-tools
- **Stars:** 13586 (most starred optimization lib)
- **Language:** C++ with Python/Java/C# bindings
- **License:** Apache 2.0
- **Features:**
  - Advanced VRP/VRPTW solver (more sophisticated than VROOM)
  - Constraint programming framework
  - Multiple objectives (minimize: cost, distance, time, vehicles)
  - Disjunctive constraints (if A then not B)
  - Complex business rules support
  - Better handling of edge cases
- **Real-world:** Amazon, Uber, Google Maps routing, major logistics
- **Docs:** https://developers.google.com/optimization
- **Performance:** Solves 10,000-stop problems in minutes

### E. Jsprit (VRP Solver Library)
- **GitHub:** https://github.com/graphhopper/jsprit
- **Stars:** 1810
- **Language:** Java
- **License:** LGPL
- **Features:**
  - Specialized algorithms (metaheuristics)
  - Time windows, capacity, skills
  - Integrates with GraphHopper for distances
  - Extensible for custom constraints
- **Real-world:** Backend for various route optimization libraries

---

## 2. FULL-STACK TMS PLATFORMS (Application Level)

### A. Odoo (Delivery + Fleet Modules)
- **GitHub:** https://github.com/odoo/odoo
- **Stars:** 52229 (highest starred open-source)
- **Language:** Python (backend) + JavaScript (frontend)
- **License:** LGPL
- **Features:**
  - Delivery routes (partner-to-address routing) → stock.picking
  - Fleet management (vehicles, drivers, maintenance, fuel logs)
  - Purchase/Sales orders → automatic logistics
  - Invoicing tied to delivery
  - GPS tracking integration (Odoo Tracking module)
  - Multiple routes per day per vehicle
  - Integration with shipping carriers (DHL, Fedex)
  - Driver mobile app (scanned proof of delivery)
  - Cost tracking (fuel, maintenance, depreciation)
- **Data Model:**
  - `stock.picking` (delivery order with multiple line items)
  - `stock.picking.type` (route type)
  - `fleet.vehicle` (vehicle master with KM current, fuel type)
  - `fleet.vehicle.log.fuel` (fuel logs with cost)
  - `fleet.vehicle.log.services` (maintenance)
  - `fleet.vehicle.cost` (fuel, repairs, insurance)
  - `fleet.vehicle.odometer` (mileage history)
  - `delivery.carrier` (3rd-party carrier config)
- **Cobertura para 4 tipos:**
  - Tipo 1 (TRANSPORTADORA): stock.picking → delivery routes
  - Tipo 2 (HÍBRIDA): split between internal routes + carrier assignment
  - Tipo 3 (100% PRÓPRIA): cost allocation only
  - Tipo 4 (ASSET-LIGHT): carrier selection only
- **Real-world:** 1000s of small/medium businesses use Odoo delivery module (Europe, Brazil)
- **Docs:** https://www.odoo.com/documentation/

### B. ERPNext (by Frappe)
- **GitHub:** https://github.com/frappe/erpnext
- **Stars:** 35314
- **Language:** Python (backend) + JavaScript (frontend)
- **License:** MIT (more permissive than Odoo)
- **Features:**
  - Delivery Notes (order → address)
  - Vehicle master (make, registration, capacity, fuel type)
  - Driver master (license, contact, commission type)
  - Trip creation (vehicle + multiple deliveries)
  - Route optimization (custom, no built-in VROOM)
  - Expense management (trip expenses)
  - Accounting integration (Accounts Payable for drivers)
- **Data Model:**
  - `Delivery Note` (order with delivery date, vehicle, driver)
  - `Vehicle` (capacity, registration, fuel type)
  - `Driver` (license, salary structure)
  - `Trip` (vehicle + list of deliveries)
  - `Expense Claim` (driver submits fuel receipts)
- **Cobertura para 4 tipos:**
  - Tipo 1: Delivery Note + Trip + cost per delivery
  - Tipo 2: Carrier selection via custom workflow
  - Tipo 3: Cost allocation
  - Tipo 4: Freight billing only
- **Real-world:** Growing in India, Southeast Asia for small logistics startups
- **Docs:** https://erpnext.com/docs/user/manual
- **Community:** Strong ecosystem, many TMS modules

### C. Dolibarr (ERP/CRM)
- **GitHub:** https://github.com/Dolibarr/dolibarr
- **Stars:** 7288
- **Language:** PHP (monolithic, easier to deploy)
- **License:** LGPL
- **Features:**
  - Order management (commandes)
  - Customer/supplier management
  - Invoicing
  - Stock management
  - Extensible via modules
- **Data Model:**
  - `commande` (orders)
  - `societe` (companies/customers)
  - `facture` (invoices)
  - `product_stock` (inventory)
- **Limitation:** No built-in fleet/delivery module (can extend)
- **Real-world:** SMB ERP in EU, less specific to logistics
- **Use case:** Small transportadora without complex costing

### D. Apache OFBiz
- **GitHub:** https://github.com/apache/ofbiz-framework
- **Stars:** 1051
- **Language:** Java (heavy enterprise)
- **License:** Apache 2.0
- **Features:**
  - Manufacturing execution (MES)
  - Supply chain management (SCPO module)
  - WMS (warehouse management)
  - Order management
  - Facility/Party relationships (for multi-location)
- **Data Model:**
  - `OrderHeader`/`OrderItem` (orders)
  - `Shipment` (multiple items per delivery)
  - `InventoryItem` (warehouse stock)
  - `Party` (customers/vendors)
  - `Facility` (warehouses/depots)
- **Real-world:** Large enterprises (automotive, manufacturing)
- **Use case:** Tipo 3 (factory with complex supply chain)
- **Docs:** https://ofbiz.apache.org/

---

## 3. SPECIALIZED LOGISTICS SOLUTIONS (GitHub)

### A. LogiFlow (AI-based Logistics Management)
- **GitHub:** https://github.com/MiChaelinzo/LogiFlow-AI-Intelligent-Logistics-Management-Platform
- **License:** Apache 2.0
- **Stack:** JavaScript/React + Node.js
- **Features:**
  - Order tracking
  - Shipment management
  - ML-based demand forecasting
  - Dashboard with analytics
- **Data Model:** Orders → Shipments → Tracking events

### B. FreightCentralized
- **GitHub:** https://github.com/andrei-deeyu/FreightCentralized
- **License:** MIT
- **Features:**
  - Freight auction/matching (Tipo 4 broker model)
  - Carrier management
  - Bid comparison
- **Data Model:** Shipment → Carrier bids → Assignment

### C. LogistIQ
- **GitHub:** https://github.com/red-sakai/LogistIQ
- **License:** MIT
- **Features:**
  - Order management
  - Real-time tracking
  - Analytics dashboard
- **Stack:** Full-stack JavaScript

---

## 4. KEY DATA MODELS & FEATURES COMPARISON

### Core Entities Across Systems

| Entity | OSRM | VROOM | GraphHopper | OR-Tools | Odoo | ERPNext | OFBiz |
|--------|------|-------|-------------|----------|------|---------|-------|
| Vehicle | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Driver | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Stop/Delivery | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Route | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Time Window | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Capacity | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Skills/Tags | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| Maintenance | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| Cost Tracking | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Financial/Acertos | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| Driver Commission | ❌ | ❌ | ❌ | ❌ | ✅ (addon) | ✅ (custom) | ✅ (custom) |
| GPS Tracking | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ (addon) | ❌ |
| Mobile Proof-of-Delivery | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ (addon) | ❌ |

---

## 5. FLUXO OPERACIONAL: COMO 4 TIPOS DE EMPRESA FUNCIONAM

### Tipo 1: TRANSPORTADORA (Distribuidora Asset-Heavy)
**Modelo:** Empresa de transportes que pega pedidos de clientes (fábrica de sorvete, distribuidor de bebidas) e entrega com frota própria.

**Fluxo:**
1. Cliente envia 50-500 pedidos/notas (origem: fábrica em SP, destino: múltiplas lojas em MG)
2. Admin importa CSV/foto NFe → sistema cria fretes
3. Admin rodeia notas no mapa: "Amanhã saem 3 caminhões para MG"
4. Seleciona ~100 notas, joga em VROOM → sistema otimiza ordem
5. Motorista vê rota no WhatsApp/app → navega usando Waze
6. Ao entregar: foto + assinatura (POD)
7. Fim do mês: acerto com motorista (comissão por frete ou km)

**Capacidade:** 10 caminhões × 70 entregas/dia = 700 pontos/dia
**Faturamento:** Cliente paga R$ X por frete
**Custo:** Combustível, comissão, manutenção
**KPI:** Lucro por frete = (valor_frete) - (combustível) - (comissão) - (despesas)

**Data Model (sua implementação):**
```
fretes (id, cliente_id, valor_frete, origem, destino, status)
rotas_otimizadas (id, data, distancia_km, tempo_min, status)
paradas (id, rota_id, nota_id, ordem, endereco, lat, lng)
abastecimentos (id, frete_id, litros, valor)
despesas_frete (id, frete_id, tipo, valor)
```

**Sistemas que suportam:** OSRM + VROOM (seu setup) ou Odoo Delivery + Fleet

---

### Tipo 2: HÍBRIDA (Factory com Frota Própria + 3º)
**Modelo:** Fábrica que produz (ex: laticínio) e tem:
- 70% distribuição com frota própria
- 30% outsourcada para transportadoras parceiras

**Fluxo:**
1. Sistema de produção gera 500 caixas de iogurte
2. Admin cria 80 pedidos de entrega (endereços dos clientes)
3. Admin abre mapa, desenha: "Segunda-feira 50 pedidos (3 caminhões próprios), terça 30 pedidos (2 transportadoras)"
4. Caminhões próprios: VROOM otimiza → motoristas recebem rota
5. Transportadoras: admin manda lista de endereços → transportadora roteiriza sozinha (cobrança fixa)
6. Custo consolidado: (km_próprio × R$ 0.15) + (fretes_3º × R$ 500 fixa)

**Data Model:**
```
pedidos (id, origem_fabrica, destino, empresa_id, status)
rotas_internas (id, tipo='interno', veiculo_id, motorista_id, data)
rotas_3partido (id, tipo='3partido', transportadora_id, data, valor_combinado)
parada_rota_interna (id, rota_id, pedido_id, endereco, ordem)
parada_rota_3partido (id, rota_id, pedido_id, endereco, ordem)
```

**Decisão-chave:** Setorização (não misturar cliente crítico lento com cliente normal na mesma rota)

**KPI:** ROI próprio vs 3º (km_próprio é mais caro mas mais previsível; 3º é fixo mas menos controle)

**Sistemas que suportam:** Odoo Delivery (split interno/external carrier) ou custom com VROOM

---

### Tipo 3: FROTA 100% PRÓPRIA (Factory Distribution)
**Modelo:** Fábrica com distribuidora interna (sem clientes externos).
- Exemplo: Ambev, Natura, Friboi (distribuem para seus próprios pontos de venda)

**Fluxo:**
1. Produção termina → sistema cria rotas automáticas baseado em:
   - Demanda de cada PDV (ponto de venda)
   - Rota geográfica otimizada
   - Capacidade do caminhão
2. Motorista recebe rota pré-calculada → navega
3. Fim do mês: acerto simples (salário fixo, sem comissão por frete)

**Custo Crítico:** Depreciação + combustível (não há margem por frete, então precisa minimizar custo operacional)

**Data Model:**
```
pdv (id, endereco, lat, lng, demanda_media_kg)
rota_producao (id, data, ndias, ndias_saida)
parada_pdv (id, rota_id, pdv_id, ordem, qtd_kg, hora_chegada)
motorista_salario (id, motorista_id, mes, valor_fixo)
```

**KPI:** Custo operacional por kg entregue (não lucro por frete, pois não há frete)

**Sistemas que suportam:** OSRM + VROOM ou Odoo Manufacturing + Delivery

---

### Tipo 4: ASSET-LIGHT (Broker / Marketplace / Cooperativa)
**Modelo:** Empresa que NÃO tem caminhões, apenas coordena fretes entre clientes e transportadoras.
- Exemplo: Sennder (broker de transportes), Fretecom (marketplace), Loggi (asset-light courier)
- Margin: 5-15% da tarifa de frete

**Fluxo:**
1. Cliente A entra: "preciso levar 10 pallets SP → BH"
2. Sistema calcula (OSRM) distância estimada → calcula preço base
3. Sistema abre "leilão": transportadoras conectadas fazem lances
4. Transportadora B oferece melhor preço → aceitado
5. Transportadora B entrega → cliente A paga, broker fica com comissão

**Data Model:**
```
shipment (id, origem, destino, cliente_id, status, preco_base)
carrier_bid (id, shipment_id, transportadora_id, preco_oferta, status)
assignment (shipment_id, carrier_id_escolhido, data_criacao)
comission_record (id, shipment_id, valor_broker)
```

**Não há:**
- Motoristas (responsabilidade da transportadora)
- Caminhões (responsabilidade da transportadora)
- Manutenção (responsabilidade da transportadora)

**KPI:** Taxa de ocupação × Comissão média = receita

**Sistemas que suportam:** FreightCentralized (marketplace pattern) ou custom com matching logic

---

## 6. RECURSOS JÁ IMPLEMENTADOS NO SEU SISTEMA

### ✅ O que você TEM (proven in production)

1. **Roteirização (OSRM + VROOM):**
   - OSRM em VM Oracle (Brasil inteiro 24GB)
   - VROOM para otimização VRP
   - Capacidade: 70 paradas/dia × 10 caminhões

2. **Captura de Endereço (ViaCEP):**
   - CEP → logradouro/bairro/cidade/uf automático
   - Cache local
   - Fallback manual

3. **WhatsApp Bot com IA (9 flows):**
   - kmFlow: foto painel → KM automático (OCR com gpt-4o-mini)
   - abastecimentoFlow: foto cupom → litros/valor automático
   - avariaFlow: foto/áudio → urgência automática (Whisper)
   - despesaFlow: comprovante → classifica tipo (OCR)
   - viagemFlow: motorista inicia viagem
   - E mais 4

4. **Acertos Mensais (Muito Maduro):**
   - 6 tipos de comissão (percentual, fixo, km, salário, combinações)
   - Pagamento parcial com saldo anterior
   - Ajustes (bônus, desconto, reembolso)
   - Histórico mês a mês

5. **Manutenção Preventiva:**
   - 26 tipos padrão (troca óleo, pneus, etc.)
   - Intervalo km/meses
   - View `proxima_manutencao_veiculo` com status ok/proximo/vencido

6. **Custo por Frete:**
   - View `fretes_com_resultado` (receita, combustível, comissão, lucro)
   - Despesas agrupadas por tipo (pedagio, alimentação, hospedagem)

---

### ⚠️ O que você NÃO TEM (mas precisa para 4 tipos)

#### Para Tipo 1 (TRANSPORTADORA):
1. **Batch import de 50-500 pedidos** → CSV upload ou Dropbox/Drive
2. **Visualização mapa de todas as paradas** antes de rodar VROOM
3. **Sugestão de "divisão por caminhão"** → admin clica "dividir em 3 rotas" → sistema sugere
4. **Setorização** → não colocar cliente crítico (demora 2h) + cliente rápido na mesma rota
5. **Exportar rota para WhatsApp/app** → motorista vê lista numerada com mapa

#### Para Tipo 2 (HÍBRIDA):
1. **Marcação 'interno' vs '3º partido'** durante seleção de paradas
2. **Custo diferencial** (interno = km-based, 3º = fixed fee)
3. **Relatório comparativo** interno vs 3º (que é mais vantajoso?)
4. **Workflow de chamada transportadora** (ex: enviar lista por email/WhatsApp)

#### Para Tipo 3 (100% PRÓPRIA):
1. **Integração com produção** (sistema produz → cria rotas automáticas)
2. **Previsão de demanda** (PDV histórico → quantidades estimadas)
3. **Salário fixo** (sem comissão por frete, apenas hora-extra pra viagens urgentes)

#### Para Tipo 4 (ASSET-LIGHT):
1. **Marketplace/Bid matching logic** (cliente entra, transportadoras lançam preço)
2. **Preço dinâmico** baseado em oferta/demanda
3. **Comissão automática** (5% da tarifa de frete)
4. **Sem custos operacionais** (caminhão, combustível, motorista = 3º)

---

## 7. FEATURES CONCRETAS POR COMPONENTE (Com URLs)

### OSRM
**O que faz:** Calcula rota A → B

**Exemplo API Call:**
```bash
curl "http://localhost:5000/route/v1/driving/-46.6333,-23.5505;-47.0608,-22.9056?overview=full"
# Resposta:
# {
#   "routes": [{
#     "distance": 93200,     # metros
#     "duration": 4560,      # segundos
#     "geometry": "polyline", # para desenhar no mapa
#     "legs": [...]
#   }]
# }
```

**Limitações:**
- Só 2 pontos por padrão
- Para matriz (distâncias entre TODOS os pares): usar `/table` endpoint
- Max 100 pontos em table query

**Docs:** https://project-osrm.org/docs/v5.27.1/api/routes/

---

### VROOM
**O que faz:** Recebe N paradas + M caminhões → retorna ordem otimizada

**Exemplo API Call:**
```json
POST http://localhost:3000
{
  "vehicles": [
    {
      "id": 1,
      "start": [-46.63, -23.55],
      "end": [-46.63, -23.55],
      "capacity": [3000],
      "time_window": [28800, 57600]
    }
  ],
  "jobs": [
    {
      "id": 1,
      "location": [-46.65, -23.56],
      "service": 300,
      "delivery": [100]
    },
    {
      "id": 2,
      "location": [-46.70, -23.58],
      "service": 300,
      "delivery": [150]
    }
  ]
}

# Resposta:
# {
#   "routes": [{
#     "vehicle": 1,
#     "steps": [
#       {"type": "start", ...},
#       {"type": "job", "id": 1, "service": 300, ...},
#       {"type": "job", "id": 2, "service": 300, ...},
#       {"type": "end", ...}
#     ],
#     "distance": 15000,
#     "duration": 3600
#   }]
# }
```

**Capacidade real:** 100-500 jobs por veículo (depende de complexidade)

**Docs:** https://vroom-project.org/docs/latest/api/overview/

---

### Google OR-Tools
**O que faz:** Resolve VRP com restrições complexas

**Exemplo (Python):**
```python
from ortools.linear_solver import pywraplp

# Define routing index manager
manager = pywraplp.RoutingIndexManager(num_locations, num_vehicles, depot)
routing = pywraplp.RoutingModel(manager)

# Add distance/time callback
def distance_callback(from_index, to_index):
    return distance_matrix[manager.IndexToNode(from_index)][manager.IndexToNode(to_index)]

routing.SetArcCostEvaluatorOfAllVehicles(distance_callback)

# Solve
solution = routing.SolveWithFirstSolutionStrategy(first_solution_strategy)
```

**Vantagens sobre VROOM:**
- Melhor para problemas complexos (300+ stops)
- Suporta múltiplos objetivos
- Constraint programming (if A then not B)

**Docs:** https://developers.google.com/optimization/routing/vrp

---

### Nominatim (Geocoding)
**O que faz:** Endereço (texto) → Coordenadas (lat, lng)

**Exemplo API Call:**
```bash
curl "https://nominatim.openstreetmap.org/search?q=Rua+das+Flores+123+Belo+Horizonte&format=json"
# Resposta:
# [
#   {
#     "lat": -19.9191,
#     "lon": -43.9386,
#     "display_name": "Rua das Flores, 123, Centro, Belo Horizonte, MG"
#   }
# ]
```

**Rate limit:** 1 req/seg (você está OK com 70 × 10 = 700/dia = ~0.01 req/seg)

**Alternativa:** Photon (Komoot) → sem rate limit público

**Docs:** https://nominatim.org/release-docs/latest/api/Search/

---

## 8. REFERÊNCIAS OFICIAIS (2023-2026)

### Engines
1. OSRM: https://project-osrm.org/docs/v5.27.1/api/
2. VROOM: https://vroom-project.org/docs/latest/api/overview/
3. GraphHopper: https://graphhopper.com/api/1/
4. OR-Tools: https://developers.google.com/optimization
5. Jsprit: https://github.com/graphhopper/jsprit/wiki

### Full-Stack TMS
1. Odoo Delivery: https://www.odoo.com/documentation/17.0/applications/inventory_and_mrp/inventory/routes/
2. ERPNext Fleet: https://erpnext.com/docs/user/manual/en/human-resources/vehicle
3. Dolibarr: https://wiki.dolibarr.org/index.php/Module_Shipment
4. OFBiz: https://ofbiz.apache.org/documentation/ofbizbook/apache-ofbiz-project-overview.html

### GitHub Projects (2024-2026)
1. LogiFlow: https://github.com/MiChaelinzo/LogiFlow-AI-Intelligent-Logistics-Management-Platform
2. FreightCentralized: https://github.com/andrei-deeyu/FreightCentralized
3. LogistIQ: https://github.com/red-sakai/LogistIQ

---

## RESUMO: Seu Stack vs Alternativas

| Dimensão | Seu Setup | Alternativa (Odoo) | Alternativa (ERPNext) |
|----------|-----------|-------------------|----------------------|
| **Roteirização** | OSRM + VROOM | GraphHopper + Jsprit | OR-Tools (custom) |
| **Captura Paradas** | ViaCEP + Nominatim | Built-in (manual) | Built-in (manual) |
| **WhatsApp Bot** | Custom (9 flows) | Nenhum | Addon (experimental) |
| **Acertos** | Custom (muito maduro) | Built-in (básico) | Built-in (intermediário) |
| **Manutenção** | Tabelas estruturadas | Fleet module (muito bom) | Addon (faltam features) |
| **Custo Tracking** | View `fretes_com_resultado` | Built-in (excelente) | Custom views |
| **Escalabilidade** | Next.js/Supabase (1000s usuarios) | Monólito Python (100s usuarios) | Monólito Python (100s usuarios) |
| **Customização** | Fácil (código aberto seus) | Difícil (monólito) | Fácil (Frappe framework) |
| **Tempo Deploy** | Dias (setup OSRM) | 1-2 semanas (config) | 1-2 semanas (config) |
| **Custo Infraestrutura** | R$ 0 (Oracle Free) | R$ 0-500/mês (small cloud) | R$ 0-500/mês (small cloud) |

**Conclusão:** Seu stack é ótimo para Tipo 1 (TRANSPORTADORA) e Tipo 2 (HÍBRIDA). Para Tipo 3 e 4, seria mais rápido usar Odoo/ERPNext como base, mas você pode estender seu sistema.
