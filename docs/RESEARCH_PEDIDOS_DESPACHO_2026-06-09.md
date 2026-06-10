# Pesquisa bruta — Pedidos & Despacho (14 agentes haiku, 2026-06-09)

> Material bruto dos 14 agentes de pesquisa (7 fóruns/comunidades + 7 GitHub/sistemas prontos) que embasou docs/PROPOSTA_PEDIDOS_DESPACHO.md. Cada seção: nomenclatura encontrada, fluxos observados, recomendações do agente e fontes com resumo.

---

# forum:nomenclatura-br
## Nomenclatura
- PEDIDO = solicitação/registação inicial de uma carga a transportar; contém informações básicas do cliente, origem, destino, volumes, peso; emitido ANTES da contratação de frete; pode estar pendente de aprovação de valor
- FRETE = (1) como VALOR: preço cobrado pela prestação de serviço de transporte de mercadoria; (2) como SERVIÇO: o transporte em si; (3) como DOCUMENTO: CT-e (Conhecimento de Transporte Eletrônico) que formaliza a prestação de serviço
- CARGA = volume/conjunto de mercadorias a ser transportado; pode compor um Pedido ou uma Viagem
- COLETA = serviço de retirada de mercadoria no endereço do remetente; primeiro passo do ciclo operacional
- ORDEM DE COLETA (modelo 20) = documento emitido pela transportadora ao buscar a mercadoria; documenta a etapa inicial do transporte; obrigatório em SP, MG, GO; opcional no resto do Brasil; não é documento fiscal
- DESPACHO = conjunto de atividades administrativas para preparar e autorizar uma carga para transporte; inclui: conferência de documentação, registro em sistema, validações, liberação; é um 'elo' entre origem e destino da mercadoria
- ROMANEIO = documento INTERNO (não fiscal) que lista detalhes da carga: volumes, quantidades, pesos, dimensões, identificação; acompanha o Manifesto; funciona como checklist para conferência no carregamento/descarregamento
- MANIFESTO ELETRÔNICO (MDF-e) = documento fiscal eletrônico que agrupa múltiplos CT-e transportados em um único veículo; emissão obrigatória; resumo de informações contidas nos CT-e
- CT-e (Conhecimento de Transporte Eletrônico) = documento fiscal eletrônico obrigatório para qualquer transporte de carga; emitido pela transportadora; contém: shipper, destinatário, origem, destino, valores, dados fiscais; base legal do transporte
- VIAGEM = agrupamento de múltiplos Pedidos/Fretes em um VEÍCULO com MOTORISTA específico; é o ciclo completo de saída e retorno; agrupa documentação (CT-e, MDF-e, Romaneio), despesas (combustível, pedágio) e receitas
- MINUTA DE FRETE = documento contratual que formaliza a prestação de serviço de transporte rodoviário; contém: contratante, contratado, detalhes da carga, valores de frete (incluindo piso mínimo ANTT), forma de pagamento; obrigatório por Lei
- ORDEM DE SERVIÇO DE ENTREGA (OS/OT) = documento emitido para o motorista após DESPACHO; contém: endereço de coleta/entrega, dados do remetente e destinatário, descrição da mercadoria, sequência de paradas; é o 'roteiro' operacional do motorista
- PEDIDO DE FRETE = documento gerado ao CONCLUIR uma Ordem de Despacho; é o contrato formal de transporte com cálculo final de frete + todas as validações; precursor do CT-e
- ORDEM DE DESPACHO = agrupa múltiplas notas fiscais (NF-e) que formarão uma única viagem/carga; ao ser CONCLUÍDA, gera Pedido de Frete e possibilita emissão de documentos fiscais (CT-e, MDF-e)
- CONHECIMENTO DE TRANSPORTE = termo genérico para documento que confirma recebimento de bens a serem transportados; pode ser papel (tradicional) ou eletrônico (CT-e)
## Fluxos
- FLUXO OPERACIONAL TRANSPORTADORA BRASILEIRA - COLETA → DESPACHO → ENTREGA: (1) COLETA: empresa entra em contato com transportadora solicitando retirada de mercadoria; Ordem de Coleta (modelo 20) é emitida; produto é coletado no endereço do remetente; (2) RECEBIMENTO E TRIAGEM: mercadoria chega ao armazém da transportadora; passa por conferência e identificação; produtos são separados por destino (triagem); (3) ARMAZENAGEM: itens são estocados conforme características; cadastrados em sistema de gestão logística; (4) DESPACHO/EXPEDIÇÃO: etapa administrativa de preparação e organização da carga para transporte; envolve 5 sub-etapas: (a) Conferência de documentação (notas fiscais, ordens de coleta); (b) Registro de informações da carga nos sistemas; (c) Validação interna/externa; (d) Autorização para transporte; (e) Encerramento e registro; emissão de ROMANEIO (lista de volumes com detalhes); emissão de MANIFESTO (MDF-e); geração de CONHECIMENTO DE TRANSPORTE (CT-e); geração de ORDEM DE SERVIÇO DE ENTREGA (para motorista); (5) ROTEIRIZAÇÃO: planejamento inteligente das rotas; otimiza percurso dos caminhões considerando distâncias, prazos, trânsito; (6) ENTREGA: motorista realiza múltiplas entregas (fracionado) ou entrega completa (lotação); controle de entregas efetuadas/canceladas; rastreamento de ocorrências; POD (prova de entrega); fonte: TOTVS, Rigabras, Bsoft
- FLUXO DE DOCUMENTOS FISCAIS - CT-e → MDF-e → ROMANEIO: Cada Pedido de Carga/Frete gera um CT-e (Conhecimento de Transporte Eletrônico) = documento fiscal eletrônico obrigatório que registra a prestação de serviço de transporte e contém dados do remetente, destinatário, mercadoria, valores; MDF-e (Manifesto Eletrônico de Documentos Fiscais) = agrupa múltiplos CT-e em uma única carga de um caminhão; Romaneio = documento INTERNO (não fiscal) que lista volumes transportados com quantidade, peso, dimensões, identificação; acompanha o MDF-e; fonte: TOTVS, Solidá Transporte
- FLUXO LANÇAMENTO PEDIDO EM SISTEMA TMS: (1) PEDIDO/CARGA LANÇADA: cliente (ou sistema embarcador) entra com informação de carga a transportar; Pedido de Carga é registrado no TMS; contém: dados do cliente, origem, destino, volumes, peso, valor aproximado; (2) COTAÇÃO/NEGOCIAÇÃO: comercial realiza cotação de frete (tabela de preços); aprova valor com cliente; (3) CONFIRMAÇÃO: Pedido é confirmado no sistema; recebe status de 'Ativo' ou 'Confirmado'; (4) AGRUPAMENTO: múltiplos Pedidos podem ser agrupados em uma Viagem (carro/motorista + múltiplas paradas); (5) DESPACHO: nesta etapa, cria-se ORDEM DE DESPACHO (agrupa notas fiscais); Ordem de Despacho é CONCLUÍDA; ao concluir, gera PEDIDO DE FRETE = contrato formal de transporte com cálculo final de frete + validações; fonte: Sankhya, Bsoft, TOTVS
- FLUXO 'VIAGEM' EM SISTEMA TRANSPORTADORA: Viagem = agrupamento de múltiplos Pedidos/Fretes em um VEÍCULO com MOTORISTA específico; contém informações de: veículo usado, motorista designado, data/hora de saída, sequência de paradas, documentação (CT-e, MDF-e, Romaneio); Viagem pode ser parcial (fracionado = múltiplos clientes no mesmo carro) ou lotação (um cliente, carro inteiro); serve para: agrupar despesas (combustível, pedágio), calcular KM percorrido, rastrear entregas, fazer acerto com motorista; fonte: Bsoft TMS (módulo Controle de Viagens), TOTVS
## Recomendações
- RENOMEAR MENU 'VIAGENS' → 'PEDIDOS' ou 'CARGAS': O termo 'Viagem' é muito genérico e confunde com a entidade técnica (agrupamento de Pedidos em um veículo/motorista). No mercado, TMS brasileiros usam 'Pedidos de Carga', 'Ordens de Coleta' ou simplesmente 'Cargas' para a tela de LANÇAMENTO inicial. 'Viagem' fica melhor reservado para o agrupamento de múltiplos pedidos já no despacho.
- RENOMEAR MENU 'FRETES' → 'DESPACHO' ou 'EXPEDIÇÃO': O termo 'Frete' refere-se ao VALOR/SERVIÇO/DOCUMENTO fiscal, não à operação de vincular carga a caminhão. A operação correta em TMS é chamada 'DESPACHO' (preparação/autorização) ou 'EXPEDIÇÃO' (emissão de documentos). Sankhya/SAP usam 'Ordem de Despacho' → 'Conclusão' → gera 'Pedido de Frete'. Bsoft organiza em módulos separados 'Pedidos de Carga' → 'Controle de Viagens'.
- ADICIONAR TELA INTERMEDIÁRIA: Entre 'Lançamento de Pedido' e 'Despacho para Caminhão', criar uma tela de 'Ordem de Despacho' que agrupe múltiplos Pedidos que sairão no MESMO caminhão (mesma Viagem). Esta tela é o momento em que o gestor decide: 'Estes 5 pedidos saem juntos no caminhão XYZ com motorista ABC'. Ao CONCLUIR a Ordem, gera automaticamente os Pedidos de Frete (contratação formal).
- FLUXO RECOMENDADO PARA O SISTEMA: (1) Lançamento de Pedido/Carga (entrada: cliente, origem, destino, volume, peso); (2) [OPCIONAL] Importação em massa via DANFE/XML/XLS; (3) Tela Ordem de Despacho (agrupamento de Pedidos em Viagens); (4) Designação de Caminhão + Motorista na Viagem (com troca opcional do motorista); (5) Liberação/Despacho (gera CT-e, MDF-e, Romaneio, Ordem de Serviço para motorista); (6) Rastreamento de Entrega; (7) POD (prova de entrega com foto/GPS).
- NOMENCLATURA RECOMENDADA PARA MENUS: Menu Principal: 'Operação' ou 'Logística' → Submenus: (a) 'Pedidos/Cargas' (lançamento, importação em massa); (b) 'Ordens de Despacho' (agrupamento, vinculação veículo/motorista); (c) 'Emissão de Documentos' (CT-e, MDF-e, Romaneio); (d) 'Viagens' (rastreamento, acerto com motorista); (e) 'Entregas/POD' (prova de entrega). Isso segue padrão de Bsoft + Sankhya + TOTVS.
- PREPARAR SISTEMA PARA PEDIDOS 'CLIENTE AVULSO': Lançamento de Pedido deve permitir cliente não-cadastrado (entrada de dados freetext: nome, endereço, telefone) E vincular múltiplas notas/entregas ao mesmo pedido. Armazenar esse 'cliente avulso' na tabela de Pedidos, não na master de Clientes. Ao gerar CT-e, usar os dados avulsos.
- IMPORTAÇÃO EM MASSA (DANFE/XML/XLS): Criar parser que: (1) extrai remetente, destinatário, peso, volumes de PDF de DANFE ou XML de NF-e; (2) cria um Pedido por NF-e ou agrupa múltiplas NF-e em 1 Pedido (regra a definir); (3) cria entrada de Entrega/Parada por linha da NF-e ou por endereço de entrega; (4) predefine valores de frete com base em tabelas de cliente (se existir) ou deixa zerado para negociação posterior. Benchmark: Bsoft, Sankhya, DataFrete oferecem isso.
- DOCUMENTOS QUE SISTEMA DEVE EMITIR: (1) CT-e (eletrônico via Sefaz, obrigatório); (2) MDF-e (eletrônico, agrupa múltiplos CT-e por Viagem, obrigatório); (3) Romaneio (interno, PDF simples com lista de paradas e volumes); (4) Ordem de Serviço de Entrega (PDF para motorista com endereços, sequência, contato cliente). Integrações fiscais: Sienge, Nfse.io ou similar para emissão de CT-e/MDF-e.
- MANTER VIAGEM COMO CONCEITO TÉCNICO INTERNO: No banco de dados e API, continue usando 'viagem' para: agrupamento de Pedidos em um veículo/motorista/data; cálculo de KM e despesas (combustível, pedágio); acerto com motorista. Mas na UI/menus, use termos mais descritivos. Exemplo: menu 'Despacho' contém grid de Viagens com status, ou menu 'Viagens Ativas' mostra Viagens em trânsito para rastreamento.
## Fontes
- **Bsoft TMS — Sistema de Gestão de Transportadoras** — https://bsoft.com.br/produtos/software-controle-transportadoras
  - Maior fornecedor de TMS no Brasil. Plataforma em nuvem com módulos de: Fiscal (CT-e, MDF-e, CIOT), Fleet Management (ordens de serviço, manutenção), Commercial (pedidos de carga, fretes, cotações, Kanban), Travel Control (agrupamento de documentos, cálculo de viagens). Organização de interface com menus separados: 'Ordens de Coleta', 'Pedidos de Carga', 'Controle de Viagens', 'Emissão de Documentos'.
- **TOTVS — Glossário de Logística e Guias de Despacho** — https://www.totvs.com/blog/gestao-logistica/despacho-cargas/
  - Documentação oficial sobre conceitos logísticos brasileiros. Define: Despacho = atividades administrativas para preparar e liberar carga; Expedição = emissão de romaneios e documentos; Coleta = retirada no remetente; Entrega = fase final do transporte. Fluxo de 5 etapas: Recebimento → Armazenagem → Picking → Embalagem → Envio.
- **Rigabras — 5 Etapas do Fluxo de Transporte de Cargas** — https://blog.rigabras.com.br/etapas-do-fluxo-de-transporte-de-cargas/
  - Descreve ciclo completo: (1) Recebimento e identificação da carga; (2) Armazenamento; (3) Picking/Separação; (4) Embalagem; (5) Envio ao consumidor. Enfatiza que roteirização é a criação de rotas exatas que otimizam deslocamento, distâncias e prazos.
- **Solidá Transporte — O que é Romaneio de Carga** — https://solidatransporte.com.br/como-emitir-romaneio-de-carga-e-qual-a-sua-finalidade/
  - Define romaneio como documento de controle INTERNO (não fiscal) usado em transporte rodoviário; lista volumes com quantidade, peso, dimensões; funciona como checklist de conferência; acompanha Manifesto de Carga; não requer transmissão a órgãos fiscais.
- **Bsoft — Ordem de Coleta de Carga** — https://bsoft.com.br/blog/ordem-de-coleta-de-carga
  - Documento modelo 20 emitido pela transportadora ao buscar mercadoria; documenta apenas a etapa inicial do transporte; não é documento fiscal eletrônico; não tem padronização nacional; obrigatório em SP, MG, GO; serve como registro interno entre remetente e transportadora.
- **Sankhya/SAP — Pedido de Frete na Conclusão de Ordem de Despacho** — https://ajuda.sankhya.com.br/hc/pt-br/articles/360044599154-Pedido-de-Frete-na-conclus%C3%A3o-da-Ordem-de-Despacho
  - Define: Ordem de Despacho = agrupa notas fiscais que formam a carga de um caminhão; ao ser CONCLUÍDA, gera Pedido de Frete (contrato formal com cálculo final de frete). Diferencia: Ordem de Despacho precede Pedido de Frete. Se cliente é 'transportadora própria', não gera frete.
- **Plimor — Dicionário do Frete** — https://blog.plimor.com.br/dicionario-do-frete-palavras/
  - Glossário operacional de termos de transporte: FTL (Full Truck Load, carga fechada), LTL (Less Than Truckload, fracionado), CIF (frete pago origem), FOB (frete pago destino), piso mínimo ANTT, CT-e, MDF-e, Romaneio.
- **TOTVS — Módulos e Fluxo de TMS** — https://blog.favorita.com.br/tms-sistema-de-gerenciamento-transporte/
  - TMS organiza-se em 4 pilares: (1) Planejamento (cotação, despacho); (2) Execução (rastreamento, emissão CT-e/MDF-e); (3) Auditoria de Frete (validação de faturas); (4) Analytics (SLA, performance regional). Centraliza informações: comercial (cotações), operação (volumes, etiquetas), frota (veículos, motoristas, viagens).
- **Hivecloud — Romaneio de Carga e Gestão** — https://www.hivecloud.com.br/post/romaneio-de-carga/
  - Romaneio é ferramenta de controle interno de transportadora; contém lista de entregas a fazer ou pedidos de clientes; funciona como packing list; mostra conteúdo completo, quantidades, volumes, especificações dos produtos transportados.
- **Potenza Transportes — Ordem de Serviço de Entrega** — https://potenzatransportes.com/glossario/o-que-e-ordem-de-servico-de-entrega/
  - Ordem de Serviço (OS) é documento emitido APÓS confirmação do pedido de transporte; preenchida com: endereço coleta/entrega, dados remetente/destinatário, descrição mercadoria; enviada ao motorista como roteiro operacional; diferencia-se de Pedido de Frete que é cotação/contratação.

---

# forum:fluxo-transportadora-br
## Nomenclatura
- PEDIDO = Unidade de faturamento: cliente (ou avulso), valor, caminhão atribuído, motorista; nasce no lançamento
- ENTREG/PARADA = Ponto individual dentro de um pedido; endereço específico com um ou mais itens
- ORDEM DE COLETA (OS) = Documento de retirada da mercadoria no remetente; funciona como checklist de conferência (quantidade, volumes); OPCIONAL em alguns estados, mas essencial para controle operacional
- ROMANEIO = Documento que lista volumes/itens embarcados num veículo; criado antes da saída; permite conferência na origem, no embarque (motorista assina) e na entrega (destinatário confere); caráter OPERACIONAL (não fiscal)
- MANIFESTO = Documento fiscal oficial que consolida TODAS as notas fiscais (NFe) ou CT-e (Conhecimento de Transporte Eletrônico) de um ÚNICO veículo; emitido antes da saída; é o MDF-e (Manifesto de Documento Fiscal Eletrônico); caráter FISCAL obrigatório
- CT-e (Conhecimento de Transporte Eletrônico) = Documento fiscal de transporte de uma mercadoria/lote; obrigatório para cada carregamento de valor significativo; atrelado à NFe (Nota Fiscal Eletrônica) do cliente
- NFe = Nota Fiscal Eletrônica; documento comercial/fiscal que representa a venda ou prestação de serviço
- VIAGEM = Operação de transporte: um caminhão + motorista + carga saindo de A e entregando em N pontos até retornar ou destino final; tem uma saída, uma rota, múltiplas entregas, um retorno
- FRETE = Modalidade/tipo de transporte: pode ser DEDICADO (apenas 1 cliente, 1 destino, FTL/Full TruckLoad) ou FRACIONADO (múltiplos clientes, múltiplos destinos, LTL/Less Than TruckLoad); é também o SERVIÇO de despacho (=ato de vincular pedido a caminhão)
- POD (Proof of Delivery) / CANHOTO DIGITAL = Comprovante de entrega eletrônico com: GPS, foto, assinatura digital do recebedor, timestamp; armazenado em XML por 5 anos; pode ter biometria
- ROTEIRIZAÇÃO = Processo de calcular melhor sequência de paradas/pontos para um motorista num dia (distance, tempo, janelas de entrega, capacidade); estática (pré-planejada) ou dinâmica (tempo real)
- DESPACHADOR/PROGRAMADOR DE FROTA = Profissional que recebe pedidos lançados e atribui a caminhões/motoristas; otimiza rotas e cargas; coordena saída dos veículos
- CLIENTE AVULSO = Pedido sem cliente cadastrado no sistema; permite lançar uma única operação de transporte sem manutenção de cadastro de cliente recorrente
## Fluxos
- ORIGEM: Pedido lançado no sistema (cliente cadastrado ou "avulso" sem cadastro) → LANÇAMENTO: Pedido cria ordem de coleta (Ordem de Coleta = OS, documento de controle, opcional em alguns estados); pode importar em massa via Excel/XML/DANFE/NFe
- COLETA: Transportadora/motorista busca mercadoria na origem com cópia da Ordem de Coleta assinada como comprovante
- PROGRAMAÇÃO/DESPACHO: Programador de frota (despachador) recebe pedidos lançados e atribui a um caminhão (pode trocar motorista naquele dia, mesmo que tenha motorista padrão); gera Romaneio de Coleta (lista de volumes/itens embarcados)
- SAÍDA: Motorista sai da origem com carga confirmada no Romaneio; ao chegar na transportadora, emite CT-e (Conhecimento de Transporte Eletrônico) e MDF-e (Manifesto de Documento Fiscal Eletrônico)
- ROTEIRIZAÇÃO: Sistema calcula melhor rota com base em entregas do dia, localização, janelas, capacidade; pode ser estática (planejada antes) ou dinâmica (ajustada em tempo real)
- TRIAGEM/CENTRO DE DISTRIBUIÇÃO: Carga é segregada por destino/parada; motorista recebe Manifesto (que consolida todos os CT-e/NFe daquele veículo) como documento oficial de saída
- EM TRÂNSITO: Motorista executa rota com app (coleta GPS em tempo real)
- ENTREGA: Motorista chega ao endereço final, tira FOTO da entrega, captura ASSINATURA digital do recebedor, registra GPS/hora; gera POD digital (Proof of Delivery); canhoto digital gerado = XML armazenado 5 anos
- COMPROVAÇÃO: Canhoto/POD retorna ao sistema como prova de entrega; NFe + CT-e + Romaneio + Canhoto Digital formam documentação completa
## Recomendações
- NOMENCLATURA: Renomear "Viagens" → "OPERAÇÕES" ou "VIAGENS" (mantém nome, mas clarear que é veículo + rota + motorista). Renomear "Fretes" → "DESPACHO" ou "ATRIBUIÇÃO PEDIDO-VEÍCULO", já que frete é na verdade a modalidade (dedicado/fracionado), não a etapa. Melhor: "Viagens" (operação) + "Despacho" (ato de vincular pedido a caminhão).
- FLUXO ATUAL: "1) Lançar pedido, 2) Despachar para caminhão" está CORRETO mas incompleto. Faltam: (a) ORDEM DE COLETA entre lançamento e despacho (ou gerar automaticamente); (b) ROMANEIO gerado antes da saída (consolida pedidos daquele caminhão); (c) Distinção entre MANIFESTO (fiscal) e ROMANEIO (operacional); (d) POD/CANHOTO digital na entrega.
- IMPORTAÇÃO EM MASSA: Implementar parser de XML/NFe/DANFE que auto-popula: cliente (ou marca como avulso), valor, endereço origem/destino, descrição itens. Pode fazer upload em lote (zip de XMLs) ou copiar/colar JSON. NÃO reinventar — existem libs OPEN-SOURCE para parsing NFe/CT-e em Brasil.
- CLIENTE AVULSO: Já suportado (bom). Recomendar: criar botão rápido "+ Cliente Avulso" no lançamento, auto-preenchendo campos obrigatórios (nome, telefone, endereço); salvar como rascunho de cliente não-recorrente.
- DOCUMENTAÇÃO OPERACIONAL: Prioridade alta — sistema precisa rastrear: Ordem de Coleta → Romaneio → CT-e/MDF-e → POD. Cada etapa é um checkpoint; faltando um, pode indicar erro no fluxo.
- ROTEIRIZAÇÃO: Já implementada (VROOM). Recomendar: expor TIPO DE ROTA ao motorista (dedicada vs fracionada) e permitir replanejamento dinâmico se houver cancelamentos/atrasos.
- POD/PROVA DE ENTREGA: Implementado com foto + GPS. Recomendar: adicionar assinatura digital do recebedor (ou biometria), armazenar como blob + gerar XML para conformidade fiscal (5 anos).
- AUTORIZAÇÃO/RESPONSABILIDADES: Lançamento de Pedido (qualquer user/atendente) → Despacho (só programador/gestor) → Saída (só motorista) → Entrega (só motorista). RLS/roles já presentes no sistema, só validar se estão aplicadas.
- RELATÓRIOS: Adicionar visibilidade: (1) Pedidos não-despachados (backlog); (2) Veículos com romaneios pendentes (saída iminente); (3) Entregas sem POD (risco de disputa); (4) Taxa de frete dedicado vs fracionado (KPI).
- NOMENCLATURA FINAL RECOMENDADA: Menu superior: [Pedidos] [Operações/Viagens] [Despacho/Atribuição] [Entregas]. Cada aba com status claro (lançado → despachado → em trânsito → entregue). Canhoto Digital e Comprovação em aba própria com link para arquivos/XML.
## Fontes
- **Romaneio: guia completo para otimizar sua logística** — https://transporte.rodojacto.com.br/romaneio-o-que-e-como-fazer/
  - Define romaneio como documento operacional que lista volumes de uma carga, essencial para conferência na origem, embarque e entrega. Diferencia romaneio (controle físico) de manifesto (regulação fiscal).
- **Tudo sobre romaneio de carga: guia para gestores de frota** — https://www.grupotracker.com.br/blog/romaneio-de-carga-guia/
  - Descreve fluxo de participantes no romaneio: remetente valida, motorista assina assumindo responsabilidade, destinatário confirma recebimento. Romaneio + manifesto + nota fiscal formam documentação completa.
- **O que é um TMS? Guia Completo para Gestão de Transporte** — https://driv.in/pt/o-que-e-um-tms-guia-completo
  - Explica TMS como sistema integrado com 3 fases: planejamento, execução (ordens de coleta/serviço, documentos fiscais), monitoramento. Mostra integração entre lançamentos de documentos e processamento financeiro.
- **Como emitir Ordem de Coleta de carga e por que é importante** — https://bsoft.com.br/blog/ordem-de-coleta-de-carga
  - Ordem de Coleta (OS) é documento de retirada no remetente que registra etapa inicial do transporte (origem → centro de distribuição). Funciona como checklist de conferência e controle financeiro.
- **Entenda a diferença de carga dedicada e carga fracionada** — https://www.prestex.com.br/blog/entenda-diferenca-de-carga-fracionada-e-carga-dedicada/
  - Define FRETE DEDICADO (1 cliente, FTL, saída direto) vs FRETE FRACIONADO (múltiplos clientes, LTL, triagem em hub). Terminologia padrão de mercado para tipos de operação.
- **O que é roteirização de transporte?** — https://emiteai.com.br/que-e-roteirizacao-transporte/
  - Roteirização é planejamento de sequência de paradas (saída → N entregas → destino), otimizando distância, tempo, janelas. Pode ser estática (pré-planejada) ou dinâmica (tempo real).
- **Canhoto digital na logística** — https://www.mecalux.com.br/blog/canhoto-eletronico
  - Canhoto/POD digital captura GPS, foto, assinatura digital (ou biometria), gerando XML armazenado 5 anos. Prova legal de entrega vinculada a CT-e e NFe.
- **Comprovante de Entrega Eletrônico (Canhoto Digital): guia completo** — https://blog.tecnospeed.com.br/canhoto-digital/
  - Detalha fluxo de canhoto digital: autorização de protocolo, timestamp, ID do recebedor, chave da NFe. Integração automática com documentos fiscais (CT-e ↔ NFe).
- **Etapas do transporte de cargas: quais são e como funcionam?** — https://emiteai.com.br/etapas-transporte-cargas/
  - Descreve fluxo completo: coleta (com programação) → documentação (CT-e, MDF-e) → despacho → triagem → transporte → entrega → recebimento. Ressalta importância de TMS/WMS/ERP.
- **Gestor de Frotas: o que faz e quais suas responsabilidades?** — https://blog.deltaglobal.com.br/gestor-de-frotas-suas-responsabilidade/
  - Gestor/despachador atribui tarefas a motoristas, otimiza rotas, rastreia veículos, colabora com equipe. É estrategista que coordena cargas e comunicação com clientes/motoristas.

---

# forum:despacho-ux
## Nomenclatura
- FRETE = valor financeiro cobrado/pago pelo transporte de mercadorias entre origem e destino. É o custo da operação logística.
- VIAGEM = operação completa de transporte, da saída do veículo até retorno ou encerramento. Pode conter múltiplas paradas (entregas/coletas). Uma viagem agrupa N pedidos/cargas.
- PEDIDO/CARGA = unidade de faturamento no sistema do cliente. Uma carga pode ser dividida em N ENTREGAS (paradas individuais de rota). No contexto transportadora: é o que entra na fila de despacho.
- ENTREGA = parada individual de uma viagem. Local específico com endereço, cliente/destinatário, quantidade, e eventualmente janela de horário. Uma carga pode conter múltiplas entregas.
- DESPACHO = processo administrativo de preparar, organizar e autorizar a liberação de uma carga/viagem para transporte. Inclui: escolha de veículo, atribuição de motorista, consolidação de cargas, emissão de documentos.
- DESPACHO MANUAL = operador seleciona manualmente quais pedidos/cargas saem juntos em uma viagem. Oferece controle fino mas requer decisão humana.
- DESPACHO AUTOMÁTICO = sistema classifica pedidos e cria rotas automaticamente sem intervenção. Contínuo: pedidos entram, são processados, atribuídos a motoristas conforme disponibilidade real-time.
- ROTEIRIZAÇÃO = planejamento de rotas otimizadas, considerando: destino, peso/volume do veículo, janelas de entrega, capacidade de carga, custos (combustível, distância). Resultado: sequência de paradas para menor custo/tempo.
- CONSOLIDAÇÃO DE CARGAS = agrupamento de múltiplos pedidos em uma única viagem para otimizar capacidade do veículo e reduzir custo unitário. Critérios: destino comum, peso/volume compatível, urgência/prazo.
- MOTORISTA PADRÃO = motorista titular/habitual vinculado a um veículo. Sistema conhece essa associação e oferece como padrão ao despachar. Pode ser alterado pontualmente (folga, férias, ausência).
- MOTORISTA SUBSTITUTO = motorista alternativo acionado quando o padrão não está disponível. Pode ser outro da frota ou contratado sob demanda.
- PLP (Pré Lista de Postagem) = documento que agrupa pedidos antes de serem enviados à transportadora. Usado no Intelipost: permite preparação, ajustes e envio controlado.
- MANIFESTO DE CARGA (MDF-e) = documento fiscal que agrupa vários CT-es e NF-es de uma mesma viagem. Emitido antes da saída, regista todas as cargas sob responsabilidade do motorista.
- CONHECIMENTO DE TRANSPORTE (CT-e) = documento fiscal que comprova prestação de serviço de transporte, identificando remetente, destinatário, trajeto, valor, impostos. Um por carga.
- NOTA FISCAL (NF-e) = documento fiscal da mercadoria. Uma carga pode ter N NF-es (múltiplos produtos de múltiplos clientes).
- CHECKLIST DE SAÍDA = processo obrigatório antes da viagem: verificar validade CNH/certificações motorista, testar sensores do veículo (desengate, trava, bloqueio, sirene), confirmar documentação completa, validar carregamento.
- TRACKING/RASTREAMENTO = acompanhamento em tempo real da viagem via GPS e telemetria. Permite monitorar localização, velocidade, desvios de rota, paradas não programadas.
- ROMANEIO = lista/relação de notas embarçadas em um veículo para uma viagem. Documento operacional que registra tudo o que sai naquela saída.
- ACERTO COM MOTORISTA = procedimento de cálculo final: valor de frete - adiantamentos - despesas (combustível, pedágio, etc.) = valor a pagar ao motorista. Realizado ao final da viagem.
## Fluxos
- [Sistema Intelipost] Despacho Manual: Menu > Operação > Despacho Manual → Busca de Pedidos (até 30 por consulta) → Seleção/agrupamento em PLP (Pré Lista de Postagem) → Verificação de dados antes de envio → Disparo para transportadora → Status processando/sucesso/erro
- [Sistema Bsoft TMS] Gestão de Viagens: Recebimento de Pedidos → Atribuição a Veículo (com motorista padrão) → Lançamento de adiantamentos e despesas → Consolidação de Cargas (agrupamento por destino/rota) → Emissão de Manifesto/CT-e → Saída do Veículo (checklist de motorista/documentação/sensores) → Rastreamento em Tempo Real → Acerto com Motorista
- [Roteirização/Despacho Automático] Pedidos entram na fila → Sistema classifica por destino/urgência/capacidade → Roteirizador calcula rotas otimizadas → Cria viagens consolidadas → Atribui automaticamente a motoristas/veículos disponíveis → Continuamente ajusta baseado em atualizações em tempo real
- [Operação Manual (Pequena Transportadora 10 caminhões)] Pedidos chegam (DANFE/XML/planilha/manualmente) → Operador analisa fila de pendentes → Agrupa pedidos por: destino comum, peso/volume, urgência/prazo → Seleciona veículo com base em capacidade e motorista padrão → Se motorista ausente, seleciona substituto/disponível → Confirma atribuição e gera manifesto de carga → Motorista faz checklist de saída → Viagem sai com rastreamento GPS
- [Fluxo de Consolidação de Carga] Recebimento e conferência documental → Armazenamento até quantidade suficiente → Pesagem/embalagem/preparação → Agrupamento por destino/rota → Carregamento ordenado no veículo → Encaminhamento com rastreio → Na entrega, separação novamente para destinatários finais
- [Saída de Viagem/Checklist] Confirmação de Motorista (validade CNH, certificações) → Integração com Sistema TMS → Teste de Sensores (desengate, trava, bloqueio, sirene) → Verificação de Documentação (CT-e, NF-e, Manifesto) → Confirmação de Carregamento → Liberação para Saída → Geração de Romaneio/Tracking
## Recomendações
- Criar duas telas sequenciais no frontend: (1) LANÇAMENTO DE PEDIDOS — seleção de cliente ou 'avulso' + valor + local/cidades de entrega + import massivo (aceitar DANFE, XML, planilha XLS com parsing automático); (2) DESPACHO — fila visual de pedidos pendentes, agrupamento manual/sugerido por destino/capacidade, seleção de veículo (mostra motorista padrão), opção de trocar motorista (dropdown com disponíveis ou link para MotoristasPX). Gerar manifesto (MDF-e) e CT-e automaticamente ao confirmar.
- Implementar lógica de 'motorista padrão' no cadastro de veículo: associar 1 motorista de referência, mas permitir override no despacho. Ao selecionar veículo, pré-popular motorista padrão; usuário pode clicar para trocar. Registrar mudança em auditoria (quem trocou, quando, por quê).
- Adicionar sugestão automática de agrupamento (não obrigação) ao listar pedidos: algoritmo simples agrupa por CEP/cidade + verifica peso/volume contra capacidade veículo. Mostra 'Sugestões de Consolidação' como cards clicáveis: usuário aprova ou desmonta manualmente.
- Criar view 'Fila de Despacho' (dispatch board): lista visual de todos os pedidos lançados aguardando despacho. Colunas: número do pedido, cliente, destino, volume, urgência, data. Permite arrastar pedidos entre 'Novo' → 'Agrupado em Viagem X' → 'Despachado'. Kanban visual como Bsoft usa.
- Registrar VIAGEM como entidade com status (planejada, em carregamento, despachada, em trânsito, concluída). Uma viagem agrupa N pedidos. Ao despachar, gerar um manifesto único (MDF-e) para a viagem, um CT-e por pedido (se necessário conforme cliente), e um romaneio que o motorista leva.
- Antes de permitir saída de viagem, exigir checklist: (1) verificar validade CNH motorista atual no sistema, (2) confirmação visual de que documentação está pronta (CT-e/NF-e/Manifesto), (3) campo de observações (sensores, combustível, problemas conhecidos). Bloquear saída se qualquer item critico falhar.
- Permitir import massivo na tela 1 (Lançamento): aceitar arquivo ZIP com múltiplos XMLs de NF-e, ou planilha XLS padrão (coluna para cliente, destino, peso, valor). Parsear automaticamente, criar pedidos em batch, sugerir agrupamento por destino. Mostrar resumo de o que foi importado antes de confirmar.
- Diferenciar nomenclatura no menu: trocar 'Viagens' por 'Despacho' (stage 2) e 'Fretes' por 'Pedidos Lançados' (stage 1). Ou: Pedidos → Despacho → Viagens (histórico/rastreamento). A navegação deve ser linear: não tem despacho sem pedidos lançados antes.
- Integrar rastreamento GPS em tempo real na view de Viagens em andamento. Cada viagem mostra motorista (nome + foto), veículo (placa), rota prevista vs rota real, próxima parada. Permitir atualizar status de parada (chegou, entregando, saiu) via app do motorista ou painel web.
- Criar relatório de 'Acerto com Motorista' automático ao encerrar viagem: soma frete(s) da viagem, subtrai adiantamentos lançados e despesas (combustível, pedágio, etc.), mostra líquido a pagar. Oferecimento de salvar/exportar para comprovante e histórico.
## Fontes
- **TOTVS - Despacho de Cargas** — https://www.totvs.com/blog/gestao-logistica/despacho-cargas/
  - Define despacho como conjunto de atividades administrativas e operacionais para preparar e liberar carga. Etapas: preparação documental, registro, acompanhamento, autorização, encerramento. Enfatiza centralização de dados, rastreamento real-time e redução de erros manuais.
- **Geotab - Fleet Dispatching** — https://www.geotab.com/blog/what-is-fleet-dispatching/
  - Explica que dispatching é visibilidade+controle de frota, oferecendo roteamento otimizado com flexibilidade para mudanças em tempo real. Permite despachar paradas isoladamente mesmo com viagem em andamento. Diferencia entre abordagem rígida vs dinâmica/móvel.
- **Intelipost - Despacho Manual de Pedidos** — https://ajuda.intelipost.com.br/pt-BR/articles/5527404-como-realizar-o-despacho-manual-de-pedidos
  - Detalha fluxo de PLP (Pré Lista de Postagem) no Intelipost: seleção manual de até 30 pedidos, agrupamento em PLP, verificação de dados, disparo com status processando/sucesso/erro. Oferece controle sobre quando e quais pedidos despachados.
- **Mecalux - Consolidação de Cargas** — https://www.mecalux.com.br/blog/consolidacao-carga
  - Detém as 5 fases operacionais: recebimento, armazenamento, gerenciamento (pesagem/embalagem), agrupamento por destino/peso/volume/urgência, envio. Menciona critérios: destino comum (principal), capacidade de veículo, prazo, rota eficiente.
- **Blog FreteBras - Rotina Operacional Transportadora** — https://blog.fretebras.com.br/rotina-trabalho-em-transportadora/
  - Descreve rotina: controle de gestão → assistentes fazem documentação/notas/fretes → consolidação de cargas agrupando por destino → planejamento de rotas (distância, combustível, restrições) → manutenção de frota → organização de equipe com responsabilidades claras.
- **TOTVS - Manifesto de Carga e CT-e** — https://www.totvs.com/blog/gestao-logistica/manifesto-de-carga/
  - Manifesto de carga (MDF-e) agrupa vários CT-es/NF-es em uma viagem. CT-e é documento fiscal que prova serviço de transporte. Manifesto agrupa, CT-e individualiza. Emitido antes do início do transporte, permanece ativo até encerramento.
- **Senior TMS - Roteirização** — https://documentacao.senior.com.br/gestaodetransportestms/7.0.0/manual-processos/roteirizacao/roteirizacao.htm
  - Descreve integração automática de documentos (Ordem de Coleta, NFS-e, CT-e) no processo de roteirização. O sistema adapta fluxo conforme tipo de documento. Foco em integração técnica, não detalha algoritmo de agrupamento.
- **Bsoft TMS - Gestão de Viagens e Acertos** — https://bsoft.com.br/bsoft-tms
  - TMS da Bsoft oferece: registro de avanços e despesas por viagem, cálculo final para pagamento do motorista, Kanban para tracking de fluxo de pedidos, controle de tripulação e viagens. Detalha integração com acerto de motoristas.
- **TOTVS - Checklist de Viagem e Saída** — https://tdninterno.totvs.com/pages/releaseview.action?pageId=567765876
  - Checklist de saída envolve: verificação de motorista (CNH, certificações), integração com TMS, teste de sensores do veículo (desengate, trava, bloqueio), documentação (CT-e, NF-e, Manifesto), confirmação de carregamento, liberação para saída.
- **Drivin - O que é um TMS** — https://driv.in/pt/o-que-e-um-tms-guia-completo
  - TMS é solução para planejamento, execução e otimização de cargas. Cobre: planejamento de rotas, despacho, rastreamento, gestão de frota, documentação fiscal. Usa algoritmos para otimizar rotas considerando capacidade, tipos de porta, restrições geográficas.
- **MotoristasPX - Contratação de Motoristas Sob Demanda** — https://motoristapx.com.br/
  - Plataforma digital que conecta motoristas autônomos a transportadoras. Oferece flexibilidade para resolver ausências de motoristas. Relevante para entender como pequenas frotas lidam com substituição de motorista padrão quando folga/férias.

---

# forum:entrada-notas-br
## Nomenclatura
- PEDIDO (Order) = Solicitação de transporte com cliente, endereço, peso, valor, itens; lançado manualmente ou importado de XML/NOTFIS; status 'pendente' até ser alocado a caminhão
- VIAGEM (Trip) = Agrupamento de um ou mais pedidos alocados a um caminhão (+ motorista) em uma jornada; usada para organizar receitas (frete), despesas (combustível, pedágio, manutenção) e acerto com motorista
- FRETE (Freight/Shipping) = Valor cobrado pelo transporte; também refere-se ao módulo de cálculo/tabela de valores de frete por km, peso, eixos, adicionais
- DESPACHO (Dispatch) = Ato de enviar mercadoria/alocar pedido a um caminhão e motorista; primeira etapa após lançamento do pedido
- EXPEDIÇÃO (Expedition) = Processo completo de preparar carga para transporte: separação, emissão de documentos (NF-e, CTe, MDFe), conferência, embalagem, carregamento
- CTe (Conhecimento de Transporte Eletrônico) = Documento fiscal obrigatório emitido pela transportadora para cada frete/viagem; pode ser importado de XML do cliente ou gerado automaticamente pelo TMS após criar viagem
- MDFe (Manifesto de Frete Eletrônico) = Documento fiscal que agrupa múltiplos CTes em uma mesma viagem (um ou mais caminhões); reúne todos os dados da jornada
- NFe (Nota Fiscal Eletrônica) = Documento fiscal emitido pelo cliente/embarcador (quem vende a mercadoria); transportadora importa XML dela para extrair dados e criar pedido
- NOTFIS = Layout EDI padrão PROCEDA; arquivo .txt com dados de invoices para transporte; embarcador envia, transportadora importa automaticamente e gera CTe sem digitação
- ROMANEIO = Documento emitido pelo embarcador (fornecedor) listando notas fiscais/cargas que sairão em um veículo; rastreabilidade entre NF e viagem
- CLIENTE AVULSO (Ad-hoc Client) = Pedido sem cliente cadastrado no sistema; aceito por transportadora com documento minuta ou nota fiscal avulsa (NFA-e); permitido apenas em casos especiais
- OCR (Reconhecimento Óptico de Caracteres) = Tecnologia que converte DANFE em PDF ou imagem em dados estruturados (XML), permitindo leitura automática e importação sem digitação
- CONEMB = Arquivo de retorno EDI enviado pela transportadora ao embarcador após emitir CTe; contém dados de transporte realizado (integração bidirecional PROCEDA)
## Fluxos
- Recebimento de Demanda (Cliente): Cliente envia arquivo XML de NFe por email, API, EDI (padrão NOTFIS) ou upload manual de PDF DANFE para o portal TMS da transportadora
- Lançamento de Pedido: Operador importa XML/arquivo (automático ou manual, drag-drop de múltiplos arquivos/ZIP), sistema extrai dados fiscais (cliente, endereço, peso, valor, itens) e cria PEDIDO no TMS com status 'pendente'
- Despacho/Alocação (Viagem): Operador seleciona pedido(s) lançado(s), escolhe caminhão (que já tem motorista padrão ou se troca naquele dia por folga), atribui motorista, confirma alocação > sistema cria VIAGEM
- Emissão de Documentos: Sistema emite automaticamente CTe (Conhecimento de Transporte Eletrônico) e MDFe (Manifesto de Frete Eletrônico) com base nos dados do pedido importado e viagem criada
- Encerramento de Viagem: Após entrega (POD - foto+GPS), motorista/operador encerra viagem > sistema calcula receitas (frete), despesas (abastecimento, manutenção, pedágios), adiantamentos, e gera acerto final com motorista
- Fluxo EDI NOTFIS (opcional, para clientes integrados): Cliente envia arquivo NOTFIS .txt (padrão PROCEDA) com dados de NF, sistema importa automaticamente, gera CTe/MDFe, e retorna CONEMB com informações do transporte realizado
## Recomendações
- Para UMA TELA SIMPLES de lançamento de pedidos: implementar upload/drag-drop de múltiplos XMLs/ZIPs de NFe (padrão de 70-100 pedidos/dia para 10 caminhões é viável). Sistema extrai cliente, endereço, itens, valor; operador confirma em modal e pedidos ficam em fila 'pendente'. Se cliente não existe, criar 'cliente avulso' automaticamente (CNPJ_avulso_data ou deixar em branco se pessoa física).
- Para importação em MASSA: oferecer 3 canais (por ordem de facilidade): (1) Upload ZIP com XMLs/PDFs DANFE, (2) Monitorar pasta FTP/email do cliente (integração contínua), (3) API simples (JSON) para clientes maiores. Priorizar ZIP + OCR de DANFE para pequenas transportadoras.
- Tela 2 (DESPACHO): após lançar pedidos, operador entra em 'Criar Viagem', filtra pedidos pendentes por data/rota/peso, seleciona caminhão (lista com motorista padrão), troca motorista se necessário (folga, doença), confirma. Sistema emite CTe/MDFe automaticamente e move pedidos para status 'em rota'.
- Nomenclatura: usar PEDIDO para a tela 1 (clara para usuário final), não 'nota' ou 'frete'. Usar VIAGEM ou DESPACHO para tela 2 — 'Despacho' é mais intuitivo (significa 'enviar'), VIAGEM é melhor para análise financeira post-entrega (receitas/despesas). Considerar usar ambas: 'Despachar Pedido' > criar Viagem.
- Modelo de negócio: atual é frota própria (10 caminhões fixos + 1 motorista padrão por caminhão). Sistema está bem dimensionado para frota própria ou híbrida. Se mudar para broker/agregada no futuro, adicionar seletor de 'Tipo de Veículo' (próprio vs terceiro) ao despachar.
- Documentação fiscal automática é CRÍTICO: quando pedido é despachado em uma viagem, CTe/MDFe DEVEM ser emitidos instantaneamente para atender exigências de SEFAZ (governo). TMS convencional faz isso via web service.
- Cliente avulso é LEGAL (NFA-e) mas apenas para pessoa física SEM CNPJ cadastrado. Se for PJ, exigir CNPJ mínimo ou rejeitar. Transportadora pode optar por não aceitar (risco fiscal).
- Despesas na viagem (combustível, manutenção, pedágio, abastecimento) devem ser lançadas separadamente na tela de Encerramento da Viagem, NÃO no Lançamento de Pedido. Pedido é 'frete de entrada' (receita), viagem é 'gestão de custos'.
- Para máquina de 10 caminhões × 70 entregas/dia: volume é totalmente compatível com importação automática de XML. Recomendação: implementar detecção de duplicatas (mesmo CNPJ_NFe_chave não rodar 2x) e fila de processamento com relatório de sucesso/erro.
## Fontes
- **Bsoft TMS - Controle de Viagens** — https://bsoft.com.br/produtos/bsoft-tms/controle-de-viagens
  - Plataforma TMS brasileira que agrupa documentos de frete em 'Viagens' para organizar despesas, receitas, adiantamentos e acertos com motorista. Oferece controle integrado de pedidos, documentos fiscais (CTe/MDFe), cálculo de fretes por tabela e gestão de transportadora de pequeno/médio porte.
- **Blog Datamex - Arquivo NOTFIS EDI PROCEDA** — https://www.datamex.com.br/blog/arquivo-notfis-edi-proceda-o-que-e-como-funciona/
  - Explica que NOTFIS é um layout EDI padrão (PROCEDA) com dados de notas fiscais enviadas por embarcadores. Transportadora importa arquivo .txt, sistema extrai dados automaticamente e gera CTe/MDFe sem digitação manual. Padrão ainda ativo para integrações com clientes.
- **Blog Vinco - Importar XML NFe** — https://blog.vinco.com.br/como-obter-e-importar-xml/
  - Descreve que transportadora pode receber XML de NFe de cliente e importar automaticamente em TMS usando web services de consulta à SEFAZ (Secretaria de Fazenda). Sistema elimina digitação manual, extraindo dados fiscais, itens e valores para emissão de CTe.
- **TOTVS Protheus TMS - Importação TMSAE80** — https://centraldeatendimento.totvs.com/hc/pt-br/articles/360026949131-Logística-Linha-Protheus-TMS-TMSAE80-Importação-de-Notas-Fiscais-XML
  - Módulo TMSAE80 de importação de NFe em XML para o Protheus TMS (ERP de transportadora). Documenta que sistema importa chave de acesso, arquivo XML ou CTe; extrai itens da NF-e se configurado; e popula campos de documento automaticamente.
- **Blog Buonny - Romaneio de Carga** — https://buonny.com.br/blog/romaneio/
  - Define que romaneio é documento emitido pelo FORNECEDOR listando cargas a transportar (lista de notas embarcadas em veículo). Manifesto é emitido pela TRANSPORTADORA listando tudo que sairá em um ou mais veículos. Ambos vinculados à viagem.
- **Intelipost - APIs para Despacho e Rastreio** — https://www.intelipost.com.br/blog/apis-para-despacho-e-rastreio-na-logistica/
  - Compara EDI (arquivos estruturados em padrão PROCEDA/NOTFIS, .txt ou XML) com API (JSON/REST, mais flexível). APIs garantem maior velocidade e robustez na troca de informações entre embarcador e transportadora para pedidos em larga escala.
- **Blog Bsoft - Tipos de Fretes** — https://bsoft.com.br/blog/tipos-de-fretes-e-servicos
  - Explica que 'frete' é o valor pago pelo transporte e 'viagem de frete' agrupa pedidos em uma jornada do caminhão. Diferencia CIF (pagador na origem, responsável = embarcador) vs FOB (pagador no destino, responsável = comprador).
- **Blog Bsoft - Emitir CTe sem NFe** — https://bsoft.com.br/blog/emitir-cte-sem-nota-fiscal-eletronica
  - Clarifica que em casos especiais (cliente avulso/retorno) é possível emitir CTe sem NFe de entrada, usando documento minuta ou avulso. Transportadora pode aceitar ou rejeitar carga sem documentação fiscal.
- **Qive - Importação XML Automatizada** — https://qive.com.br/blog/lancar-notas-protheus
  - Descreve mecanismos de importação automática de XML: pasta/diretório monitorado, leitura de email, FTP, ou API HTTP. Suporta drag-drop de arquivo único ou ZIP com múltiplos XMLs; sistema valida tudo e retorna resultado.

---

# forum:cliente-avulso
## Nomenclatura
- Pedido (Order) = requisição inicial de transporte/venda, unidade de faturamento. Inicia o fluxo de fulfillment.
- Despacho/Expedição = processo de separação, embalagem, pesagem e carregamento de materiais em veículos. Ato de liberação da mercadoria para transporte.
- Despacho (Ordem de Despacho) = documento que agrupa todas as NFs que formam uma carga única a ser transportada. Base para faturamento do frete.
- Frete = valor cobrado pelo serviço de transporte, pode ser por peso (Frete Peso), carga parcial (Frete Fracionado), ou carga cheia (Frete Lotação).
- Viagem (Trip/Rota) = percurso planejado escolhido para o transporte do veículo, indica origem e destino, cidades/estados.
- Operação (Operation) = execução completa e integrada: planejamento → coleta → consolidação → transporte → rastreamento → entrega. Compreende todo o ciclo logístico.
- Carga (Cargo/Load) = mercadoria agrupada para transporte, pode ser fracionada (múltiplos NFs) ou lotação (uma empresa, um destino).
- Manifesto (Manifest) = documento de controle de transporte fracionado que agrupa documentos de uma origem para destino. Vinculado à viagem.
- MDF-e (Manifesto Eletrônico de Documentos Fiscais) = documento fiscal eletrônico que agrega resumo de TODA operação logística. Emitido uma única vez.
- Ordem de Coleta = documento que regula retirada de mercadoria no remetente, especificando itens, quantidades, endereços, volumes, dados do motorista/veículo.
- Ordem de Serviço de Entrega = documento com informações de coleta/entrega, dados de remetente/destinatário, descrição de mercadoria, para garantir eficiência e segurança.
- Consumidor Final = cliente PF ou PJ adquirindo mercadoria para consumo próprio (não revenda). Configurado via tag indFinal em NF-e.
- Cliente Avulso = cliente não cadastrado previamente no sistema, lançamento de pedido/venda em balcão sem necessidade de registro formal. Padrão em PDV (Saipos, Tiny, Bling).
- Consumidor Final Genérico = cliente sem identificação específica, cadastro 'Consumidor Final' ou 'Consumidor Padrão' sem CPF/CNPJ individual (usa CPF genérico ou deixa em branco).
- CT-e (Conhecimento de Transporte Eletrônico) = documento fiscal de transporte, pode ser emitido importando dados de NF-e (XMLs).
- NFC-e (Nota Fiscal do Consumidor Eletrônica) = nota fiscal para vendas ao consumidor final, permite lançamento sem CPF/CNPJ completo.
- Fulfillment = conjunto de operações desde recebimento de pedido até entrega ao cliente, inclui serviços pós-venda em alguns casos.
- Nível de Serviço Logístico = cadeia de atividades atendendo vendas: recepção de pedido → preparação → transporte → entrega → apoio técnico.
## Fluxos
- FLUXO ERP (Bling/Tiny/Omie): Lançamento Pedido → Consulta/Criação Cliente → Separação (Despacho/Expedição) → Nota Fiscal (NF-e/NFC-e) → Faturamento
- FLUXO TMS (TOTVS/Senior/Sankhya): Pedido de Frete → Cálculo de Rota → Despacho (Ordem de Despacho com NFs agrupadas) → Manifesto → Viagem com GPS/Rastreamento → Entrega → POD (Prova de Entrega)
- FLUXO TRANSPORTADORA PEQUENA (10 caminhões): Recebe Pedido (cliente/endereço/valor/mercadoria) → Aloca Caminhão + Motorista (padrão ou flexível no dia) → Gera CT-e (via import XML do cliente) → Despacha → Rastreia → Entrega com POD (foto+GPS)
- FLUXO CLIENTE AVULSO (PDV/Balcão): Venda Balcão SEM Cliente Cadastrado → Registra Produtos/Valor/Local → Gera NFC-e (consumidor final genérico) → Pagamento → Entrega Imediata ou Agendada
- FLUXO IMPORTAÇÃO EM MASSA: Upload ZIP com XMLs (NFs do cliente) → Sistema importa em lotes (500 por lote) → Auto-preenche CT-e → Agrupa em Manifesto/Despacho → Gera Viagem → Atribui Caminhão
- FLUXO DESPACHO DE PEDIDO LANÇADO: Pedido já existe no sistema → Tela 'Despacho' (segunda etapa) → Seleciona Caminhão (com motorista padrão) → Opção trocar motorista (folga, ausência) → Finaliza Despacho → CT-e gerado
- FLUXO FISCAL (NF-e → CT-e): Importa XML NF-e do cliente → Preenche automaticamente 90% dos dados CT-e (origem, destino, volumes, valores) → Operador revisa/ajusta → Emite CT-e → Gera Manifesto se múltiplos documentos
- FLUXO CADASTRO UNIFICADO: Pessoa (física ou jurídica) cadastrada UMA VEZ → Marca papéis desejados (cliente, fornecedor, transportadora) → Sistema unifica histórico, evita duplicidade, melhora auditoria
## Recomendações
- CLIENTE AVULSO: Adote padrão 'consumidor final genérico' como no Saipos/Tiny/Bling. Permita lançar pedido em 'despacho' sem cliente pré-cadastrado, registrando apenas essenciais (local, valor, notas/entregas). Após a viagem, permita retroativamente cadastrar cliente se houver histórico futuro. Evita travamento no despacho diário.
- CADASTRO UNIFICADO: Implemente modelo de 'Pessoa' com múltiplos papéis (cliente, fornecedor, transportadora) em UMA tabela. Reduz duplicidade, melhora histórico, facilita buscas. Essencial se motorista/transportador também puder ser cliente (fretes cruzados).
- IMPORTAÇÃO EM MASSA: Implemente upload de ZIPs com XMLs (NFs do cliente). Auto-preencha ~90% de CT-e (origem, destino, volumes, valores) a partir dos dados NF-e. Processe em lotes (500+). Crie tela de revisão antes de emitir CT-e. Ganha agilidade 10x em despacho de múltiplos pedidos.
- NOMENCLATURA TELA 1 vs TELA 2: Tela 1 = 'Lançamento de Pedidos' (unidade de venda/faturamento, cliente+endereço+valor+notas). Tela 2 = 'Despacho' (alocação de caminhão, escolha motorista no dia, validação doc. fiscal, geração CT-e). Não use 'Viagem' (confunde com rota) nem 'Frete' (é valor, não operação).
- DESPACHO: Segunda tela deve permitir: (a) selecionar caminhão (exibe motorista padrão), (b) trocar motorista (dropdown com motoristas ativos), (c) validar/gerar CT-e, (d) agrupar em Manifesto se múltiplos pedidos mesmo destino. Evite renomear para 'Viagem'.
- CONSUMIDOR FINAL FISCAL: Use tag indFinal=1 em NF-e/NFC-e. Para cliente sem ID, deixe CPF em branco OU use CPF genérico (padrão varia por estado). Consulte SEFAZ do estado para CPF válido. Evite rejeiçõesOccurrence 805 (operação inválida).
- HISTÓRICO vs FATURAMENTO: Clientes avulsos sem cadastro completo NÃO quebram faturamento (NFC-e resolve). Mas prejudicam histórico (não há rastreabilidade de cliente repeat). Solução: após entrega, opção retroativa 'Vincular Pedido Avulso a Cliente' se cliente aparecer depois. Cria ponte histórica.
- DUPLICIDADE EVITADA: Adote cadastro UNIFICADO + validação CNPJ/CPF único por pessoa (não permita mesmo CNPJ 2x). Use soft-delete em vez de hard-delete. Auditoria: log de todas as criações/modificações de cliente com timestamp + usuário.
- FLUXO IMPORTAÇÃO: Para transportadora que RECEBE cargas de múltiplos clientes (ex: 10 NFs em um dia), implemente: upload ZIP → preview dos XMLs → selecionar quais importar → consolidar em 1 ou N despachos. Não force 1:1 (1 NF = 1 despacho). Agrupe por destino/caminhão.
- ROTEIRIZAÇÃO (VROOM já existe): Combine despacho + roteirização. Após alocar caminhão, chame VROOM com múltiplos endereços (pedidos) → retorna ordem ótima → app motorista segue ordem → POD valida na sequência correta. Melhora eficiência 15-30%.
- INTEGRAÇÃO FISCAL-OPERACIONAL: CT-e = documento fiscal (obrigatório). Manifesto = controle interno (recomendado para fracionado). Viagem = rastreamento logístico (opcional via GPS). Não misture níveis: CT-e é fiscal (Receita Federal), manifesto é operacional (seu TMS), viagem é rastreamento (seu app).
- PEQUENA TRANSPORTADORA (10 caminhões): Não precisa TMS completo. Essencial: (a) cadastro de pedido simples (cliente avulso OK), (b) tela despacho (aloca caminhão/motorista), (c) CT-e automático (import XML), (d) POD com foto+GPS (app motorista). Planilha ou sistema simples resolve. Escalabilidade vem depois.
## Fontes
- **TOTVS - Sistema de Gestão de Transportes (TMS)** — https://www.totvs.com/logistica/tms/
  - Apresenta o fluxo operacional de um TMS: planejamento/cotação de fretes, execução/emissão de documentos (CT-e, NFS-e), rastreamento em tempo real e auditoria de operações. Mostra integração de viagens, fretes e operações logísticas em um único sistema.
- **Senior - Sistema TMS** — https://www.senior.com.br/blog/sistema-tms
  - Descreve os 4 estágios principais de um TMS: Planning & Quoting (parametrização de fretes), Execution & Documentation (CT-e, manifesto), Real-time Tracking (monitoramento de carga), e Audit & Analytics (reconciliação). Não diferencia explicitamente pedido/despacho/frete/viagem como conceitos isolados.
- **LinkedIn - Termos e Siglas da Logística** — https://pt.linkedin.com/pulse/os-termos-e-siglas-mais-usados-na-log%C3%ADstica-achiles-rodrigues
  - Define nomenclatura padronizada: Pedido = requisição inicial; Despacho/Expedição = separação, embalagem, carregamento; Frete = pagamento por transporte; Viagem/Rota = percurso escolhido; Operação = execução completa (coleta→consolidação→transporte→entrega).
- **Fadel Transportes - Termos da Logística** — https://fadeltransportes.com.br/termos-e-siglas-da-logistica-conheca-os-mais-usados/
  - Glossário de termos logísticos: Despacho = liberação de mercadorias para transporte; Ordem de Despacho = documento com todas NFs que formam a carga; Ordem de Serviço Entrega = essencial para garantir eficiência e segurança do transporte com dados de coleta/entrega.
- **Saipos - Venda de Balcão sem Cliente** — https://meajuda.saipos.com/hc/pt-br/articles/20211655951124-Como-lan%C3%A7ar-uma-venda-de-balc%C3%A3o-sem-cliente
  - Demonstra pattern brasileiro em PDV: permite lançar venda de balcão SEM cliente, sem necessidade de cadastro prévio. Oferece flexibilidade: cadastrar cliente durante a venda ou realizar operação sem cliente pré-registrado.
- **Blog Bluesoft - ICMS e Consumidor Final** — https://blog.bluesoft.com.br/definicao-de-icms-para-consumidor-final-venda-para-revendas-e-transferencia/
  - Explica configuração fiscal: cliente consumidor final pode ser PF ou PJ adquirindo para uso próprio. Campo consumidor final fica em branco se cliente revende E consome, para usar definição da transação. Integração ERP otimiza faturamento consumidor final.
- **Nfe.io - Consumidor Final em NF-e** — https://nfe.io/blog/nota-fiscal/consumidor-final/
  - Define indFinal (tag NF-e): valor 1=operação com consumidor final, valor 0=contribuinte/revenda. Recomenda validar Inscrição Estadual do cliente via CNPJ. Melhor prática: automatizar validação para evitar rejeições fiscais.
- **Conta Azul - Cadastro Unificado** — https://ajuda.contaazul.com/hc/pt-br/articles/7983084325517-Cliente-fornecedor-e-transportadora-no-mesmo-cadastro
  - Mostra solução de ERPs modernos: cadastro UNIFICADO de pessoas com múltiplos papéis (cliente, fornecedor, transportadora) simultaneamente. Reduz duplicidade e melhora controle de contatos marcando apenas papéis desejados.
- **Sistema Sankhya - Portal Importação XML** — https://ajuda.sankhya.com.br/hc/pt-br/articles/360044594354-Portal-de-importa%C3%A7%C3%A3o-de-XML
  - Permite importação em lotes (ZIP com múltiplos XMLs) processados em blocos de 500. Automatiza preenchimento de informações de compra no sistema. Para sistemas de transporte, importar XML NF-e preenche automaticamente dados para CT-e.
- **TOTVS - Manifesto de Carga** — https://www.totvs.com/blog/gestao-logistica/manifesto-de-carga/
  - Manifesto = documento de controle de transporte fracionado, agrupa documentos de origem para destino. Vinculado a TRIP contendo informações de expedidor/destinatário. MDF-e (manifesto eletrônico) agrega resumo da operação inteira, emitido uma vez.
- **Blog Bsoft - Gestão de Frota Pequena** — https://bsoft.com.br/blog/como-fazer-a-gestao-de-frota
  - Transportadoras pequenas (até 10 veículos) podem usar sistemas simples ou até planilhas+emissor fiscal (CT-e, MDF-e). Soluções acessíveis e sob medida existem. TMS moderno controla frota, motoristas, despacho, rastreamento e custos integrados.
- **Omie Developer Portal - API** — https://developer.omie.com.br/
  - ERP brasileiro com APIs (SOAP/JSON). Métodos para registrar clientes/fornecedores e criar pedidos de venda. Documentação sugere cliente obrigatório para transações (não há 'cliente avulso' explícito via API, mas suporta consumidor final/genérico).
- **Vinco - Importação XML NF-e/CT-e** — https://blog.vinco.com.br/como-obter-e-importar-xml/
  - Processo de importação de XMLs em sistemas TMS: NF-e → CT-e automático. Agiliza registro de documentos fiscais obrigatórios. Ideal para transportadores que recebem lotes de notas de clientes.

---

# forum:internacional
## Nomenclatura
- SHIPMENT = ato/transporte de mercadoria do origin ao destination; termo mais genérico (abrange LTL e FTL, encomendas avulsas)
- LOAD = quantidade de cargo transportado em um veículo/contenedor; usado para 'load tendering' (oferta formal do que transportar) e 'load booking' (aceitação/confirmação)
- ORDER = transação comercial/requisição do cliente para transport; diferencia-se de shipment/load (é o 'pedido' inicial, não a execução física)
- DISPATCH = (1) como substantivo = o ato de enviar truck+driver para execução após assignment; (2) como verbo = alocar/designar um load para um driver/carrier
- LOAD TENDER = oferta formal (EDI 204 ou API) enviada por shipper/broker para carrier, com detalhes: origin, destination, weight, rate, equipment type, schedule. Carrier responde ACCEPT/REJECT via EDI 990
- LOAD TENDERING (serviço) = processo de oferecer shipment para múltiplos carriers via competitive bidding; acontece PRÉ-shipment
- DISPATCH (serviço) = scheduling, routing, real-time monitoring de veículos durante transit; acontece DURANTE/EXECUTION
- BOL (Bill of Lading) = documento itemizado emitido por shipper com listagem de goods, weights, shipper/consignee details. Dispatcher coleta na pickup
- POD (Proof of Delivery) = recibo assinado pelo receiver confirmando recebimento. Coleta na delivery, crítico para invoicing + dispute resolution
- FRETE (pt-BR) = transporte de mercadoria / tarifa pelo transporte. Usado em contexto de 'frete pago', 'valor do frete', 'negociar frete'
- DESPACHO (pt-BR) = ato de preparar/enviar mercadoria; em logística = pode significar (1) customs clearance (despacho aduaneiro), ou (2) alocação de transporte (menos comum, mais usado 'atribuir' ou 'designar')
- PEDIDO (pt-BR) = requisição/ordem de cliente para serviço de transporte. Equivale a 'order' em inglês
- P&D = Pickup & Delivery (operações de coleta e entrega)
- HOS = Hours of Service (regulação de horas dirigindo; crítico para dispatch = disponibilidade do driver)
- RPM = Revenue Per Mile (métrica de rentabilidade)
- DEADHEAD = rodar truck vazio entre deliveries (custo puro, sem receita)
- LTL = Less-Than-Truckload (carga < 10k lbs, não ocupa truck inteiro); costuma ser consolidada
- TL = Truckload (carga > 10k lbs ou ocupa truck inteiro)
- ATTEMPTED PICKUP = carrier enviado para pickup, mas freight não pronto na chegada (custo/atraso)
- TURN = round-trip (ida+volta) em slang de dispatcher; ex: 'fazer um turn'
- JIT = Just-In-Time Delivery (freight chega exatamente quando needed, não pode chegar cedo)
- FORCED DISPATCH = dispatcher força driver aceitar load (com penalidades se recusa); common em grandes carriers, raro em pequenas frotas
- TMS = Transportation Management System (software que gerencia planning, execution, settlement de freight)
## Fluxos
- Fluxo Internacional Standard (TMS/Broker perspective): SHIPMENT CREATION → LOAD TENDERING → CARRIER/DRIVER ACCEPTANCE → DISPATCH ASSIGNMENT → EXECUTION (BOL collect, real-time tracking) → DELIVERY (POD collect) → SETTLEMENT/INVOICING
- Fluxo Small Fleet Owner (própria frota, 5-20 caminhões): ORDER/LOAD CREATION (manual entry ou import) → SCHEDULING/ROUTE PLANNING → DRIVER ASSIGNMENT (baseado em disponibilidade, localização, HOS) → DRIVER NOTIFICATION (email/tablet) → EXECUTION (pickups/deliveries) → BOL + POD collection → INVOICING
- Fluxo de Data Entry (Problema crítico): Manual entry em forms (3-4h/dia para dispatcher) → Errors (~4% taxa) → Fragmentação em múltiplos sistemas → Solução: Bulk import (EDI 204, XML, CSV, PDF parsing) ou APIs que auto-populam
- Fluxo de Assignment/Dispatch (Confusão de termos): (1) LOAD TENDER = oferta formal enviada ao carrier (EDI 204), carrier responde com acceptance (EDI 990); (2) DISPATCH = após acceptance, assignment real do truck+driver+route; (3) DELIVERY = execution com BOL + POD
- Fluxo Vehicle vs Driver Assignment: Para frotas pequenas com drivers estáveis = prefira assignment por DRIVER (simplifica, driver continuity/customer relationship); se veículos especializados = vehicle-based; sistemas modernos suportam HYBRID (alguns por driver, outros por vehicle)
## Recomendações
- RENOMEAR 'Viagens' → 'Pedidos' (alinha com terminologia internacional ORDER) e 'Fretes' → 'Despachos' ou 'Atribuições' (alinha com DISPATCH/ASSIGNMENT). Pedido = unidade de requisição (cliente + locais + peso/valor); Despacho = alocação real a um caminhão/motorista
- Implementar TWO-STAGE WORKFLOW claro: (1) PEDIDO - tela simples (cliente/avulso, valor, pontos de entrega, notas fiscais); (2) DESPACHO - tela de alocação (seleciona caminhão já tem motorista padrão, permite trocar motorista naquele dia). Atual 'Viagens' + 'Fretes' confunde porque ambos são ordem → dispatch, nome não diferencia stage
- Data entry é PAIN POINT crítico (4% error rate, 3-4h/dia manual): implementar BULK IMPORT para PDFs DANFE/NFe (parse OCR ou XML se disponível), planilhas XLS (campos: cliente, peso, pontos, valor), ou até foto de papel em field. Industry usa EDI 204 (carriers grandes); small fleet usa CSV/Excel
- Para 'pedido sem cliente cadastrado' (cliente avulso): criar picker com opção '+ Novo cliente avulso' inline na tela de pedido — permite lançar sem sair do fluxo
- ASSIGNMENT MODEL: implementar DRIVER-BASED (pequenas frotas com drivers estáveis preferem isso). Tela de despacho mostra: Driver → Motorista padrão já pré-selecionado (clicável para trocar) + disponibilidade (HOS check) + localização. Não precisa escolher veículo se drivers têm truck fixo
- NOMENCLATURA NOS CAMPOS: Use 'Pedido' (não 'Viagem'), 'Despacho' ou 'Atribuição' (não 'Frete'), 'Cliente/Avulso' (não misture), 'Pontos de Entrega' (não 'Entregas', que é o resultado pós-despacho)
- BOL + POD workflow: após lançamento do pedido, exigir BOL coleta (drivers fotografam DANFE no pickup, ou digitam manual). Após entrega, exigir POD (foto+assinatura). Crítico para acertos mensais + disputes
- Considerar 'despacho em lote' — seleção de múltiplos pedidos + alocação ao mesmo driver/truck (LTL consolid ou multi-stop local). UI: checkbox + 'Despachar juntos' reduz cliques
- Integração futura com roteirização (VROOM já existe): após despacho, auto-gerar rota otimizada mostrando sequência de pickups/deliveries ao driver (map-based, claro para driver no campo)
- Para 'trocar motorista naquele dia' (folga etc): tela de despacho mostra Motorista padrão; combo dropdown com substitutos disponíveis naquele dia (filtrados por HOS + localização). Histórico de substituições para audit
- Simplicidade > Features: TMS enterprise falham em small fleets porque têm muitos fields. Pegar modelo de Truckbase/Connecteam = mandatory fields (cliente, value, pickup, delivery) + optional (notes, commodity, weight). Não obrigar tudo
- Mobile-first para drivers: despacho enviado via push/WhatsApp com BOL + rota, driver clica → recebe endereços em mapa, confirma pickup/delivery com foto+GPS. Não tablet pesado; conversa simples no WhatsApp já existente
- Real-time visibility: após despacho, dispatcher vê motorista em mapa (GPS do app), clica para chamar WhatsApp/call, vê status de cada ponto (aguardando pickup, em rota, entregue). Não precisa de Qualcomm caro; app + WhatsApp é suficiente
- Unificar BOL+POD capture: após despacho, driver fotografa DANFE na pickup (BOL) e papel assinado na delivery (POD) — ambos salvos no pedido. Fecha fluxo sem papel
- ALTERNATIVA AO TERMO 'DESPACHO': considerar 'ATRIBUIÇÃO' ou 'SAÍDA' se 'despacho' confundir com despacho aduaneiro (Brasil). Mas 'despacho' é termo standard internacional, vale usar se explicar bem no onboarding
## Fontes
- **Overdrive Trucking Glossary** — https://www.overdriveonline.com/partners-in-business/finish-line/article/15740188/trucking-glossary-200-terms-for-owneroperators-small-fleets
  - Glossário de 200+ termos para owner-operators e frotas pequenas. Define dispatch, layover, turn, JIT, forced dispatch, under dispatch. Mostra que ~91.5% dos carriers US operam <= 10 trucks e dependem de decisões de dispatcher um load por vez.
- **Loadboard Ninja: Freight Dispatching Demystified** — https://loadboard.ninjatms.com/dispatching-trucks.php
  - Workflow padrão de dispatch: load search → broker negotiation → driver assignment → BOL/POD collection → invoicing. Nota crítica: 'one phone call re-arranges entire afternoon' = workflow é dinâmico, exige flexibilidade na UI. Dispatcher usa DAT/Truckstop/TruckSmarter para encontrar loads.
- **Arrivy: Best Dispatch Software for Small Trucking Companies** — https://www.arrivy.com/blog/best-dispatch-software-for-small-trucking-companies/
  - Pain points de pequenas transportadoras: recursos limitados, reliance em processos manuais, falta expertise em routing, gaps de comunicação, falta visibility real-time. Soluções: task+route assignment automation, real-time tracking, route optimization. UX deve ser simples + cost-effective.
- **Warp Glossary: Load Tender** — https://www.wearewarp.com/glossary/load-tender
  - Load tender = oferta formal enviada via EDI 204 de shipper para carrier/broker. Carrier responde via EDI 990 (accept/reject). Sequence: tender → acceptance → dispatch → BOL → freight movement. Tendencia de aceitação é métrica crítica de reliability (95% = partner, 70% = unreliable).
- **UNIS: Load Tendering vs Dispatch Services** — https://www.unisco.com/comparison/load-tendering-vs-dispatch-services
  - Load tendering = oferece shipment para múltiplos carriers via competitive bid (PRÉ-shipment). Dispatch = scheduling, routing, monitoring real-time DURANTE transit. Tendering seleciona WHO moves, dispatch determina HOW. Small fleets com frota própria usam dispatch, não tendering.
- **Beacon Transport Glossary** — https://www.beacontransport.net/trucking-logistics-terminology-a-glossary-of-terms/
  - Termos de dispatcher: Bill of Lading, P&D (pickup & delivery), TL vs LTL, deadhead, check call, empty call. Define trip types (line-haul, local, over-the-road) e operações de cartage. Mostra estrutura de compensação (drop pay = pagamento extra por stops adicionais).
- **Freightquote: Shipping Logistics Terminology** — https://www.freightquote.com/how-to-ship-freight/shipping-logistics-terminology/
  - Define shipment (goods being transported), freight (goods), pickup (attempted pickup = não estava pronto), delivery (destination), POD (proof of delivery = recibo assinado). Foca em operational checkpoints: BOL documents, pickup initiates, POD confirms.
- **Upper Inc: Assign Routes to Vehicles vs Drivers** — https://www.upperinc.com/blog/assign-routes-vehicle-vs-driver/
  - Para small fleets: driver-based assignment é melhor (veículos intercambiáveis, drivers estáveis, customer continuity). Vehicle-based se veículos especializados. Hybrid approach = assign some to drivers, some to vehicles. Decision: mede ooque muda mais (drivers ou vehicles).
- **OrderEase: Costs of Manual Data Entry in Supply Chain** — https://www.orderease.com/community/costs-of-manual-data-entry-in-supply-chain-operations
  - Manual entry error rate ~4%. Principais problemas: inventory levels visibility, shipping addresses, pricing info. Solução: automation platforms (ERP+EDI+eCommerce integration), real-time data sync, integrated order management. Mostra custo de 3h/dia de dispatcher em manual updates.
- **TheTrackersReport Forum: Dispatch/Routing Software for Small Fleet** — https://www.thetruckersreport.com/truckingindustryforum/threads/dispatch-routing-software-mobile-app-for-small-fleet.774866/
  - Discussões reais de owners com 2-4 rigs. Pain point: falta 'turnkey solution que mande invoices+BOLs+routing para tablet do driver'. Fragmentação de features em platforms diferentes. Usuários testam TruckLogics, Mystc, TruckingOffice mas nenhum resolve tudo. Custo under $5k raro oferece dispatch-to-tablet completo.
- **Redwood Logistics: 5 UX Features Your TMS Needs** — https://www.redwoodlogistics.com/insights/5-ux-features-your-next-tms-needs
  - Boas práticas TMS: simplicity (minimiza cliques), adoption rate depende de UX intuitiva. Features críticas: configurable workflows, personalized dashboards (rearrange tools/widgets), integrated messaging, live tracking com visual representation, drag-and-drop dispatch views.
- **EDI for Freight & Trucking (ALJEX)** — https://www.aljex.com/news/edi-for-freight/
  - EDI = automated data exchange (paperless) entre shippers, carriers, 3PLs. EDI 204 = motor carrier load tender (shipper → carrier de que transportar). EDI 210 = motor carrier freight details+invoice (carrier → shipper pós-delivery). Small carriers usam via LSP partner. Suporte XML/JSON além ANSI X12.

---

# forum:tms-comerciais-br
## Nomenclatura
- PEDIDO = unidade de faturamento ao cliente; contém cliente, valor, local entrega, itens/notas. No mercado também chamado de 'Solicitação de Transporte' ou 'Demanda'
- FRETE = serviço de transporte de um pedido; contém custos (por km, por kg, por m³, por volume, taxas adicionais). Quando abre Minuta, o frete tem valor previsto
- VIAGEM = agrupamento de múltiplos documentos fiscais (fretes/pedidos) que saem juntos em um veículo com um motorista; serve para organizar receitas, despesas, cálculo final. 'Viagem' e 'Viájem' são usados intercambiavelmente
- DESPACHO = ato de vincular um pedido/lote a um veículo/motorista e autorizar saída. 'Despacho' refere-se tanto à ação quanto à tela onde faz. Sinônimos: 'Expedição' (mais usado em armazéns); 'Envio'
- MINUTA DE DESPACHO = documento preparatório que lista fretes a despachar com transportadora, valores estimados, e libera inclusão de documentos. Depois vira CT-e oficial
- CONHECIMENTO DE TRANSPORTE (CT-e) = documento fiscal eletrônico que prova transporte de carga entre municípios/estados. Obrigatório desde 2012. Emitido pela transportadora ou pelo TMS integrado
- MANIFESTO (MDF-e) = Manifesto Eletrônico de Documentos Fiscais; agrupa todos os CT-es e NF-es de uma viagem em uma única 'capa' que identifica o transporte, motorista, veículo e rota. Obrigatório para transporte rodoviário
- ORDEM DE COLETA = documento que autoriza coleta de mercadoria no cliente/shipper antes do despacho. Listam itens, quantidades, endereço, motorista/veículo. Emitido no Módulo Operacional antes de Minuta
- ORDEM DE CARREGAMENTO = sinônimo de Ordem de Coleta em alguns TMS (Hermes); em outros refere-se à sequência de carga no veículo (Bsoft)
- ROMANESCO / ROMANEIO = lista de notas fiscais que saem em uma viagem; praticamente sinônimo de 'manifesto operacional' (antes de gerar MDF-e fiscal)
- ACERTO DE MOTORISTA = liquidação final de valores com o motorista (salário/diária + adiantamentos + gastos da viagem). Módulo Financeiro
- CIOT = Conhecimento de Embarcação de Operador de Transporte; documento para rastreamento da carga em tempo real
## Fluxos
- LANÇAMENTO DE PEDIDOS (Módulo Comercial/Operacional) - SSW/Bsoft/ESL: (1) Registrar pedido com cliente, valor, local de entrega; (2) Opcionalmente gerar Ordem de Coleta (documento preparatório) para coleta de mercadoria no shipper; (3) Integrar/importar NFe/DANFE (em TMS modernos como Sygma) ou lançar manual; (4) Sistema calcula fretes e custos preparatórios
- DESPACHO (Módulo Operacional) - Lançar Minuta de Despacho: (1) Selecionar pedidos/documentos a despachar; (2) Vincular a veículo e motorista padrão da transportadora; (3) Substituir motorista se necessário (folga/indisponibilidade); (4) Gerar Minuta de Despacho (preview dos valores); (5) Liberar para saída
- AGRUPAMENTO EM VIAGEM - Após despacho (1) Agrupar múltiplos documentos fiscais (CT-es, NF-es) em uma única Viagem; (2) Calcular Receitas e Despesas da viagem; (3) Registrar Abastecimentos e Despesas adicionais; (4) Gerar MDF-e (Manifesto Eletrônico) consolidando tudo
- EMISSÃO FISCAL (Módulo Fiscal) - Em sequência: (1) CT-e (Conhecimento de Transporte Eletrônico) gerado automaticamente pela transportadora contratada ou pelo TMS; (2) MDF-e (Manifesto Eletrônico) agrupa todos os CT-es/NF-es de uma viagem em uma única declaração; (3) CIOT (Conhecimento de Embarque) para rastreamento; (4) NFSe (NF de Serviço) para faturamento ao cliente
- ESTRUTURA DE MENU TÍPICA - (1) CADASTROS: Clientes, Fornecedores, Motoristas, Veículos, Tabelas de Fretes; (2) MÓDULO COMERCIAL: Cotações, Propostas, Contratos; (3) MÓDULO OPERACIONAL: Pedidos/Ordens de Coleta, Minuta de Despacho, Fretes, Manifestos; (4) MÓDULO FISCAL: Emissão CT-e, MDF-e, CIOT, NF-e; (5) FINANCEIRO: Receitas/Despesas, Acerto com Motorista, Relatórios; (6) FLEET: Manutenção, Combustível, Pneus, Rastreamento
## Recomendações
- NOMENCLATURA: Renomear 'Viagens' → 'Despachos' (ou manter 'Viagens' para agrupamento pós-saída) e 'Fretes' → 'Pedidos' ou 'Solicitações de Transporte'. Isso reduz confusão com nomes de mercado (pedido = faturável ao cliente, viagem = agrupamento fiscal/operacional)
- MENU: Estruturar em 4-5 módulos visíveis: (1) OPERACIONAL (Pedidos, Ordens de Coleta, Minutas de Despacho, Manifestos), (2) CADASTROS (Clientes, Motoristas, Veículos), (3) FINANCEIRO (Receitas/Despesas, Acertos), (4) FISCAL (CT-e, MDF-e), (5) RELATÓRIOS. Padrão adotado por Bsoft, ESL, KMM
- TELA 1 - LANÇAMENTO DE PEDIDO (Módulo Operacional): (a) Seletor de Cliente (com 'Cliente Avulso' como fallback); (b) Campos: Valor, Local Entrega, itens/notas; (c) Botão IMPORTAR [XML/DANFE/XLS] que popula pedidos em lote via parser CNPJ ou email fornecedor; (d) Preview de frete calculado; (e) Salvar + ir para Despacho
- TELA 2 - DESPACHO (Módulo Operacional, 'Minuta de Despacho'): (a) Seletor de Pedidos (com filtro por status 'Lançado'); (b) Seletor de Veículo (que carrega motorista padrão cadastrado); (c) Dropdown 'Trocar Motorista' se folga/indisponível; (d) Preview do Frete e Receita estimada; (e) Botão 'Gerar Minuta de Despacho' (salva e muda status); (f) Sequência automática → pode vincular a Viagem (agrupamento) ou fazer direto
- FLUXO: Pedido (status: Lançado) → Minuta de Despacho (status: Despachado) → Agrupamento em Viagem (status: Saído) → Geração de CT-e + MDF-e (automático ou com clique). Adicionar UI Kanban (tipo Bsoft) para visualização de status em tempo real
- IMPORTAÇÃO: Integrar parser de DANFE (biblioteca open-source como `pdf-parse` + OCR ou XML-parser nativo) e XLS. Ao subir bloco de arquivos, extrair CNPJ fornecedor, itens, valor, endereço. Permitir mapping manual se campo não encontrado. Sugerir cliente pelo CNPJ ou criar 'Cliente Avulso' automático
- MOTORISTA PADRÃO: Armazenar motorista padrão por veículo no cadastro (campo 'Motorista Padrão'). Na tela de Despacho, carregar automaticamente. Dropdown 'Substituir Motorista' ativa campo de seletor alternativo com filtro por disponibilidade (sem viagem ativa no período)
- DOCUMENTOS FISCAIS: Após Minuta de Despacho, oferecer botão 'Gerar CT-e' e 'Gerar MDF-e'. CT-e gerado automaticamente pela transportadora (se terceirizado) ou pelo TMS (se frota própria). MDF-e consolida múltiplos CT-es de uma Viagem. Estocar em histórico/auditoria
- TESTE COM USUÁRIO: Validar a proposta de 2 telas (Lançamento + Despacho) contra 2-3 usuários de transportadora real. Confirmar se 'Minuta de Despacho' é nomenclatura aceitável ou se preferem 'Ordem de Despacho' / 'Despacho' simples
- CONSIDERAR MODO OFFLINE: Se o app motorista (que já existe) usa Dexie para cache, estender cache_pedidos + despachos para que motorista consiga ver itinerário sem WiFi durante 7 dias (como memo do projeto indica)
## Fontes
- **Bsoft TMS - Sistema para Gestão de Transportadoras** — https://bsoft.com.br/bsoft-tms
  - TMS líder brasileiro com 35 anos de experiência combinada (Bsoft + Datamex). Estrutura em Módulos: Fiscal, Frota, Comercial, Viagens, Financeiro, Fretes. Funcionalidades: Kanban de pedidos, Ordem de Coleta/Carregamento, Agrupamento de Documentos, Acerto com Motorista, emissão automática CT-e/MDF-e/CIOT.
- **ESL Cloud TMS - Documentação** — https://eslcloud.zendesk.com/hc/pt-br/categories/115000178172-M%C3%B3dulo-TMS
  - TMS cloud com módulos Operacional, Cadastros, Integração. Fluxo claro: Minuta de Despacho (rodoviário/aéreo) → CT-e → MDF-e. Interface com 'Manifestos' para agrupar e 'Minutas de Despacho' para preview de valor antes de liberar fretes.
- **Fretefy TMS - Sistema de Gerenciamento de Transporte** — https://www.fretefy.com.br/tms-sistema-de-gerenciamento-de-transporte
  - TMS moderno com fluxo: Planejamento → Roteirização → Rastreamento Real-time → Gestão de Ocorrências. Inclui Kanban de entregas, Portal do Cliente, App de motorista. Ênfase em automação e visibilidade fim-a-fim.
- **Hermes TMS - Base de Conhecimento** — https://faq.hermestms.com.br/ordem-de-carregamento/
  - TMS com fluxo operacional claro: Cadastros → Ordem de Coleta → Ordem de Carregamento → Manifesto/MDF-e. Diferencia 'Ordem de Carregamento' (emitida ao cliente se configurado) e 'Processo de Retirada' (interno).
- **KMM TMS - Sistema para Transportadoras** — https://kmm.com.br/tms-kmm/
  - TMS focado em PME-grandes. Menu: Cadastros (rotas geográficas), Coleta/Entrega (agendamento), Roteirização, Rastreamento real-time. Emissão automática CT-e/MDF-e/CIOT. Ênfase em conformidade com Lei do Motorista.
- **Senior TMS - Documentação** — https://documentacao.senior.com.br/gestaodetransportestms/
  - TMS integrado com módulos: Ordem de Coleta, Coletas e Entregas, Tabelas de Fretes, Manifestos. Interfaces (APIs/EDI) com ERPs. Uso de 'Conhecimento de Transporte Rodoviário de Cargas' (CTRC/CT-e) como documento base.
- **Bsoft - Manifesto de Transporte (Fluxo)** — https://bsoft.com.br/blog/como-fazer-o-manifesto-de-transporte
  - Explicação do workflow fiscal: Lançar Pedidos → Gerar CT-e → Agrupar em Viagem → Emitir MDF-e (manifesto que funciona como 'capa' da viagem inteira). MDF-e consolida N CT-es em documento único para fiscalização.
- **TMS Brasileiro - Estrutura Genérica (Blog)** — https://transciardi.com.br/tms/
  - Resumo de como TMS brasileiro típico estrutura fluxo: Viagens agrupam documentos para organizar receitas/despesas. Coletas e Entregas gerenciam movimentação. Fretes calculados por km/kg/m³. Expedição com automação de endereçamento.
- **Importação XML/NFe em TMS (Sygma)** — https://www.sygmasistemas.com.br/importacao-de-xml/
  - TMS modernos (Sygma, ERPFlex) permitem importação em lote de XML de NFe/DANFE via chave de acesso, arquivo XML ou confirmação do recebedor. Automatiza criação de pedidos/fretes no sistema.

---

# github:tms-novos
## Nomenclatura
- Pedido (Order) = Solicitação de transporte de mercadoria de um ponto A a B; unidade de faturamento e rastreamento; pode ter cliente identificado ou ser 'cliente avulso' (sem cadastro; descrito nas NF-e como remetente/destinatário)
- Frete (Freight) = Valor cobrado pelo transporte; também refere-se ao serviço de transporte e à modalidade (FOB/CIF). Em TMS, frete = tabela de preços × km, peso, volume, tipo de carga
- Viagem (Trip/Journey) = Agrupamento de 1+ pedidos/notas fiscais em um veículo/motorista específico; entidade de controle financeiro (receitas e despesas por viagem). Viagem ≠ pedido; 1 viagem pode ter múltiplos pedidos
- Despacho (Dispatch) = Ato de enviar ordem de serviço para motorista/veículo; última etapa operacional pré-rota; envolve confirmar carga, gerar manifestação (lista de paradas), notificar motorista. Também: gerenciamento de ocorrências durante viagem
- Expedição (Shipping/Warehouse dispatch) = Etapa anterior ao despacho de transporte; picking, conferência, embalagem de itens no WMS antes de sair do armazém
- Romaneio (Packing list/Shipping manifest) = Documento de embarque que lista todas mercadorias da carga (descrição, volume, peso, embalagem, valor NF, frete). Acompanha veículo durante viagem; não substitui NF-e mas é documento auxiliar obrigatório
- Entrega (Delivery) = Parada individual do veículo para entregar carga em um endereço; N entregas podem ser agrupadas em 1 pedido (modelo PEDIDO → N ENTREGAS)
- POD (Prova de Entrega) = Comprovante eletrônico de entrega: foto da mercadoria/canhoto + GPS + assinatura digital do recebedor; capturado via app do motorista; reduz erros e atividades burocráticas
- Cliente Avulso (Occasional/One-time customer) = Pedido sem cliente cadastro prévio; comum em fretes pontuais; sistema deve aceitar pedido com dados mínimos (origem, destino, peso, valor) e gerar documento (NF-e) no nome do remetente/destinatário
- Atribuição (Assignment) = Ato de vincular pedido/viagem a motorista + veículo; pode ser feito antes de lançar pedido (pré-planejamento) ou no dia (despacho dinâmico); deve alertar sobre documentos vencidos
- Motorista Padrão (Default driver) = Motorista normalmente vinculado a um veículo; no despacho pode ser substituído se motorista em folga/doença/indisponível
## Fluxos
- [Fleetbase] 1. Configuração: setup áreas de serviço, motoristas, veículos, contatos → 2. Criação de Ordem: especificar detalhes (pickup/delivery) e escolher Order Config (workflow + campos) → 3. Atribuição de Motorista: clicar 'Assign Driver', selecionar motorista e veículo (status permanece 'created') → 4. Despacho: clicar 'Dispatch', ordem enviada ao app Navigator do motorista via push notification → 5. Execução: motorista aceita, inicia rota, locação ao vivo aparece no mapa → 6. POD: coleta assinatura/foto de entrega → 7. Rastreamento: atualizações de atividades ao longo do processo
- [Bsoft TMS] 1. Lançamento de Pedido: criação de pedido em painel kanban com colunas 'to do/doing/done' → 2. Agrupamento em Viagem: agrupa pedidos/documentos (notas fiscais) em uma viagem para cálculo de receitas/despesas e acerto com motorista → 3. Atribuição de Motorista/Veículo: (detalhe não explícito, inferido do fluxo de acerto) → 4. Despacho: registra ocorrências durante viagem, oferece rastreamento completo ao cliente → 5. Controle de Viagens: monitora receitas, despesas (combustível, estacionamento, etc.) por viagem
- [CoopCycle] 1. Recebimento de Pedido: pedido chega via e-commerce/API → 2. Criação de Tarefas: cada entrega gera 2 tasks (pickup + dropoff) → 3. Atribuição de Corredor (Courier): admin/dispatcher atribui tarefas selecionando courier e tarefa, ou vice-versa → 4. Notificação: corredor recebe tarefas no smartphone → 5. Execução: corredor marca tarefas como concluída ou falha → 6. Rastreamento: admin acompanha posição real-time no painel de despacho
- [TOTVS TMS] 1. Importação de XML: sistema TMSAE80 recebe XMLs de NF-e dos clientes (automático, sem digitação) → 2. Validação: verifica se CNPJ transportadora = SIGAMAT em uso → 3. Inclusão no Sistema: notas importadas gravadas em tabelas (DE5) → 4. Atribuição a Viagem/Motorista: pedidos agrupados em viagens → 5. Geração de Documentos: emissão de CT-e, MDF-e, NFS-e (obrigatórios no Brasil) → 6. Liquidação: acerto com motorista agrupando receitas/despesas por viagem
- [Setor de Logística Brasil] 1. Recebimento/Expedição: picking, conferência, embalagem de itens no WMS → 2. Lançamento de Pedido: cria pedido (com cliente ou 'avulso') com detalhes (volumes, peso, valor, notas fiscais) → 3. Criação de Romaneio: lista de todas as mercadorias da carga (lista de empacotamento + checklist embarcação) → 4. Despacho: conferência final, emissão de documentos de transportador (CT-e, MDF-e se consolidado), envio a transportadora → 5. Atribuição a Veículo/Motorista: motorista recebe manifestação de carga (lista de paradas/entregas) → 6. Execução de Rota: motorista segue sequência de entregas com POD (foto + GPS + assinatura) → 7. Rastreamento: cliente e operação acompanham em tempo real
## Recomendações
- 1. NOMENCLATURA CLARA NAS TELAS: Use 'Pedido' (não 'Viagem') para lançamento inicial. Use 'Despacho' ou 'Atribuição' (não 'Frete') para etapa 2 onde motorista/veículo são vinculados. Isso segue padrão de Bsoft, Fleetbase, TOTVS, CoopCycle e mercado brasileiro.
- 2. SEPARAR 2 TELAS CONFORME PEDIDO: Tela 1 = 'Lançamento de Pedido' (simples, com cliente ou 'avulso', notas/entregas). Tela 2 = 'Despacho' ou 'Atribuição de Viagem' (agrupa pedidos em viagem, seleciona motorista/veículo, gera romaneio).
- 3. IMPORTAÇÃO EM MASSA: Implementar upload de XMLs (NF-e), PDFs (DANFE), ou planilhas XLS/CSV. Padrão TOTVS: job automático que lê XML e cria pedidos sem digitação. Validar CNPJ da empresa. Aplicável para lotes diários de 50+ pedidos.
- 4. CLIENTE AVULSO COMO PADRÃO: Não exigir cliente cadastrado para pedido. Aceitar dados mínimos (origem, destino, peso, valor). Sistema gera documento (NF-e) com remetente/destinatário como 'Cliente Avulso' ou nome extraído da NF-e. Comum em transportadoras de pequeno/médio.
- 5. ROMANEIO AUTOMÁTICO: Ao agrupar pedidos em viagem/despacho, gerar automaticamente 'Romaneio' (lista de mercadorias + checklist de embarque). Document é essencial no Brasil; acompanha veículo. Pode ser PDF ou exibição em tempo real no app do motorista.
- 6. POD INTEGRADO: Cada entrega deve terminar com POD (foto + GPS + assinatura). App do motorista captura dados; backend sincroniza com TMS. Reduz confirmação manual de entrega. Stack: dexie.db (offline) + sync quando rede disponível.
- 7. ATRIBUIÇÃO COM ALERTAS: Antes de atribuir motorista a viagem, alertar sobre: (a) documentação vencida (CNH, CRLV, inspeção veicular), (b) motorista em folga/doença, (c) capacidade de veículo (peso/volume). Padrão TMS Brasil.
- 8. MOTORISTA PADRÃO MUTÁVEL: Veículo tem motorista padrão. No despacho, permitir trocar motorista (por dia) sem perder atribuição do veículo. Comum em operações com folgas/rodízio.
- 9. NOMENCLATURA TABELAS BANCO: Use nome 'pedidos' (não 'fretes' ou 'viagens'). pedidos → N entregas. Uma coluna 'cliente_id' NULLABLE (para avulso). Tabela 'viagens' para agrupamento pós-despacho (para acerto financeiro com motorista).
- 10. MODELO FLEETBASE COMO REFERÊNCIA: Fleetbase oferece estrutura pronta (Order Board, Order Config, activity flows, POD). Open-source em GitHub. Se replicar modelo: Order = pedido, Shipment = viagem agrupada, Activity = entrega/POD. Economiza 2-4 sprints de design.
## Fontes
- **Fleetbase Docs (fleet-ops)** — https://www.fleetbase.io/docs/fleet-ops/getting-started/
  - Documentação oficial do Fleetbase para gestão de frotas. Define fluxo de criação de ordem, atribuição de motorista, despacho e rastreamento. Oferece visão passo-a-passo desde configuração até POD com assinatura/foto.
- **Bsoft TMS (Site + Blog)** — https://bsoft.com.br/bsoft-tms
  - TMS líder no Brasil com suporte CTe/MDFe/NFe. Define telas: Pedido (painel kanban), Viagem (agrupamento para acerto), Despacho (rastreamento ao cliente). Interface multi-empresa. Menu integrado com gestão de transportes.
- **CoopCycle Docs (Admin/Dispatcher)** — https://docs.coopcycle.org/en/admin/intro/
  - Plataforma de delivery para cooperativas. Modelo: pedido → tasks (pickup+dropoff) → atribuição a corredor → rastreamento real-time. Task assignment via swipe ou seleção de corredor primeiro.
- **TOTVS TMS (Importação XML + Roteirização)** — https://centraldeatendimento.totvs.com/hc/pt-br/articles/360026949131-Log%C3%ADstica-Linha-Protheus-TMS-TMSAE80-Importa%C3%A7%C3%A3o-de-Notas-Fiscais-XML
  - Solução enterprise. Suporta importação automática de XML (NF-e) via job (TMSAE80) sem digitação. Integração com Protheus ERP. Atendimento ao padrão CT-e/MDF-e/NFS-e brasileiro.
- **TOTVS Blog - Romaneio (definição)** — https://www.totvs.com/blog/gestao-logistica/romaneio/
  - Define romaneio como documento de embarque com lista de mercadorias (volume, peso, embalagem, valor NF, frete). Acompanha veículo durante transporte. Não substitui NF-e; é documento auxiliar.
- **Rodojacto (Transporte) - Fluxo TMS** — https://transporte.rodojacto.com.br/romaneio-o-que-e-como-fazer/
  - Descreve fluxo de pedido em TMS: lançamento → atribuição a motorista (baseado em rota/localização) → despacho (confirmação de carga, geração de manifestos) → execução de rota → confirmação de entrega (foto/assinatura).
- **Cobli/Driv.in - O que é TMS** — https://www.cobli.co/blog/tms/
  - Visão geral de TMS: planejamento, execução, monitoramento de transporte. Integração com ERP para receber pedidos. Atribuição baseada em rota/localização. Rastreamento em tempo real para motoristas e clientes.
- **GitHub - Fleetbase** — https://github.com/fleetbase/fleetbase
  - Repositório do Fleetbase (open-source). Plataforma modular de logística. Código-base PHP com arquitetura orientada a abstrações de logistics/supply-chain. Navigator app (driver) incluso.
- **GitHub - LoadPartner TMS** — https://github.com/loadpartner/tms
  - TMS open-source para freight brokers. Stack: Laravel + Inertia.js + React. Repositório público permite explorar arquitetura de banco de dados e fluxo, embora documentação limitada.
- **Track-POD - Prova de Entrega** — https://www.track-pod.com/pt/
  - Solução dedicada a POD digital: foto, assinatura, GPS, notificação instantânea. Motorista envia prova via app; automação reduz burocracia. Integra-se a TMS/WMS.
- **Odoo Dispatch Management** — https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/shipping_receiving/setup_configuration/dispatch.html
  - Módulo de despacho do Odoo. Setup: Fleet app → configurar capacidade veículos → criar método de entrega → 2-3 step delivery. Agrupamento de produtos em lotes + atribuição a docks/veículos. Google Maps integrado.
- **SAP - O que é TMS** — https://www.sap.com/brazil/products/scm/transportation-logistics/what-is-a-tms.html
  - Definição enterprise de TMS: planejamento, execução, monitoramento de movimento físico. Controla processos de transportador/embarcador. Abrange áreas: comercial, operacional, SAC, seguros, faturamento, financeira, logística.

---

# github:fleetbase
## Nomenclatura
- Order = unidade principal de trabalho em Fleetbase. Criada com status=created, passa por transitions (dispatched, started, completed). Comporta múltiplas Entities (itens) e deve ser vinculada a um Order Config que define campos, fluxo de atividades e método POD.
- Order Config = template que determina: (1) quais campos customizados aparecem no formulário de criação, (2) fluxo de status de atividade (accept→start→complete), (3) tipo de Entity attachada (parcel, container, waste, etc). Um sistema pode ter vários order configs para diferentes tipos de entrega.
- Entity/Payload = item(ns) sendo transportado(s) dentro de uma Order. Armazena: descrição, barcode, dimensões, peso, tracking number próprio, destino (pickup=0 ou dropoff=N). Múltiplas entities por order.
- Place = localização/waypoint reutilizável: nome, endereço geocodificado, avatar. Usada em pickup/dropoff de ordens. Pode ser criada ao lançar ordem (inline) ou pré-criada e selecionada.
- Driver = usuário especializado: nome, telefone (chave para login Navigator), avatar, qualificações/licenças, opcional vinculação a conta. Atribuído a ordens; recebe notificações push.
- Vehicle = recurso de transporte: tipo, capacidade (payload_capacity e payload_capacity_volume), status (active/inactive), online flag. Vinculado a driver (pairing) ou atribuído por ordem; usado em cálculos de alocação.
- Service Rate = tabela de preços/taxa de serviço: base fee, método de cálculo (fixed meter=R$/km, per meter=valor×distância, per drop-off, custom algorithm), surcharge horário de pico, restrições por order type.
- Dispatch = ato de atribuir ordem a driver+vehicle, mudar status para 'dispatched' e notificar driver via push. Pode ser automatizado via Orchestrator phases ou manual na Workbench.
- Orchestrator = motor de otimização com phases: avalia ordens contra pool de vehicles, respeita constraints (disponibilidade, localização, capacidade, skills), retorna atribuições. Engines: greedy, vroom ou custom.
- Assignment = resultado de uma phase do Orchestrator: vehicle-to-order matching. Pode ser ajustado manualmente depois.
- Activity Flow = sequência de estados que driver deve marcar/confirmar: accept→start→(intermediate steps)→complete. Cada activity pode exigir validações (foto, assinatura, QR) ou ser automática.
- POD (Proof of Delivery) = captura ao finalizar: foto, assinatura, QR scan, GPS timestamp. Configurado no Order Config; marca ordem como completed quando triggered.
- Frete (português) = valor/taxa de transporte; em contexto de despacho, refere-se ao cálculo de preço de serviço (similar a Service Rate).
- Pedido (português) = ciclo tempo desde colocação até chegada ao cliente; usado como sinônimo de Order em sistemas brasileiros.
- Entrega (português) = operações última milha (hub→endereço do cliente); em TMS, refere-se ao estágio final de fulfillment de uma Order.
- Despacho (português) = liberação de carga para transporte; em operações, refere-se ao ato de atribuir e enviar ordem para driver (equivalente a Dispatch).
## Fluxos
- FLUXO 1 - Criação de Ordem (Console Fleetbase):
(1) Menu: Operations → Orders
(2) Clicar '+New Order' → form abre
(3) Selecionar Order Config dropdown (ex: 'Delivery', 'Express', etc) → carrega campos e fluxo
(4) Preencher campos obrigatórios (pickup/dropoff, entities, customer, custom fields)
(5) Clicar 'Save' → ordem criada com status=created, aparece na lista
(6) Acionável apenas para atribuição (não dispatchada ainda)
- FLUXO 2 - Atribuição de Driver e Vehicle (Console):
(1) Clique na ordem na lista → detail panel abre à direita
(2) Clicar 'Assign Driver' → select driver da lista disponível
(3) Opcionalmente clicar 'Assign Vehicle' → select vehicle (ou deixar vazio)
(4) Clicar 'Save Assignment' → ordem ainda em status=created (assignment ≠ dispatch)
- FLUXO 3 - Despacho Automático via Orchestrator (Fase de Otimização):
(1) Ordém chega em pool; Orchestrator fase 'assign_vehicles' começa
(2) Engine (greedy/vroom) avalia: vehicle status=active, online=true, localização GPS, capacidade
(3) Se driver já pareado com vehicle, vehicle vai com driver
(4) Engine retorna atribuições; aparecem em Workbench para review
(5) Operador pode aceitar (execute) ou ajustar manualmente antes de confirmar
- FLUXO 4 - Despacho Manual (Dispatch):
(1) Order com driver+vehicle atribuídos
(2) Clicar 'Dispatch Order' na detail panel
(3) Status muda: created → dispatched
(4) Driver recebe push notification no Navigator com order brief (detalhes, pickup/dropoff, entities)
(5) Em paralelo, mapa console mostra driver+vehicle location + order
- FLUXO 5 - Execução no Driver App (Navigator):
(1) Driver recebe notificação push com ordem
(2) Abre app → ordem aparece em 'Active Jobs' ou lock-screen
(3) Driver toca 'Accept Job' → status=started, localização live ativa no console
(4) App mostra turn-by-turn navigation para pickup
(5) Ao chegar, driver marca activity step (ex: 'Arrived at Pickup')
(6) Coleta items, captura foto/barcode se exigido
(7) Navega para dropoff
(8) Ao chegar, marca activity 'Deliver' e captura POD (foto/assinatura/QR)
(9) Activity com complete-flag ativada → ordem status=completed
- FLUXO 6 - Criação em Lote (API/Bulk):
(1) Sistema externo (WMS, ERP) faz POST /api/orders com array de pedidos
(2) Cada ordem criada com status=created, aparece em queue
(3) Orchestrator phases rodam automaticamente (ou manualmente dispara)
(4) Ordens fluxam para atribuição→despacho→execução conforme acima
- FLUXO 7 - Cálculo de Taxa (Service Rate):
(1) Ordem criada, pickup+dropoff preenchidos
(2) Sistema calcula distance (distância em km entre lugares)
(3) Service Rate vinculada ao order type aplicada:
   - Fixed Meter: taxa_base + (km × taxa_por_km)
   - Per Meter: km × taxa_unitária_por_metro
   - Per Drop-off: taxa_base + (num_stops × taxa_por_parada)
   - Custom Algorithm: avalia variáveis customizadas
(4) Se horário em peak_hours, aplica surcharge
(5) Taxa aparece na ordem; pode ser faturada ao cliente
## Recomendações
- Para o sistema do contexto (SISTEMA_DE_FROTA): Nomenclatura - Renomear 'Viagens' para 'PEDIDOS' (unidade de faturamento com cliente, valor, caminhão fixo) e 'Fretes' para 'DESPACHO' (etapa de atribuição a caminhão específico naquele dia, permitindo trocar motorista). Isso alinha com nomenclatura Fleetbase (Order→Dispatch) e padrão TMS global.
- Implementar dois formulários distintos: (1) LANÇAMENTO DE PEDIDO (Pedido → Entrega): entrada simplificada (cliente/avulso, valor, local, notas). (2) DESPACHO (Pedido → Caminhão/Motorista): seletor de caminhão com motorista padrão, override de motorista, cálculo de taxa de serviço se aplicável. Separação clara reduz confusão operacional.
- Importação em lote: Suportar CSV com colunas (cliente, valor, endereço_coleta, endereço_entrega, notas) e/ou upload de DANFE/XML/XLS. Fleetbase faz isso via API bulk (POST /orders array). Implementar parser para extrair dados de PDF DANFE (OCR ou parsing structured data).
- Place/Localização: Pré-cachear endereços de clientes como 'Places' reutilizáveis (semelhante a Fleetbase Places). Ao lançar pedido avulso, permitir 'selecionar de mapa' ou 'autocomplete' de cliente existente. Isso acelera dados e reduz erros.
- Order Config variável: Criar tipos de pedido (Normal, Express, Refrigerado, etc) cada um com campos customizados (temperatura, fragilidade, assinatura obrigatória). Isso permite ser flexible com diferentes tipos de carga sem hardcodar.
- Activity Flow/POD: Copiar modelo Fleetbase de activity steps customizáveis no Order Config. Para último-km, exigir POD (foto obrigatória). App motorista já tem isso; console poder ver POD na dashboard.
- Service Rate automática: Se aplicável ao modelo, implementar tabela de 'Tipos de Serviço' (ex: Normal 5km=R$50, Express 5km=R$80) e aplicar ao pedido conforme tipo e distância. Fleetbase faz via Service Rate + distance calculation; considerar usar VROOM já integrado para distance.
- Motorista padrão × dia: Permitir que ao despachar pedido (Etapa 2), operador selecione caminhão → motorista padrão pré-carrega, mas pode trocar no dropdown (se motorista tiver folga naquele dia, ex). Isso é UX Fleetbase (Assign Driver step).
- Atribuição automática via Orchestrator: Se em breve o dono quiser auto-assigning (rolar Orchestrator phases), Fleetbase é referência. Por agora, manter manual Assign Driver na UI; estruturar dados para aceitar atribuição programática depois.
- Real-time map + live location: Ambas as telas (Pedidos, Despacho) devem mostrar mapa com caminhão+motorista+pedido vinculado. Fleetbase Navigator fornece isso; sistema precisa integrar tracking vem-do app motorista (já tem via Supabase real-time ou similar).
- Validação pedido: Garantir km_final >= km_inicial (Fleetbase não trava isso explicitamente; validar no schema/RPC). Se erro, avisar operador antes de despachar.
- Nomenclatura interna × UX: Usar internamente Order/Entity/Place/Driver/Vehicle (padrão global), mas UI em português para dono: Pedido, Item de Pedido, Local/Endereço, Motorista, Caminhão. Tradução em layer UI não afeta backend.
## Fontes
- **Fleetbase Documentation - Order Configuration** — https://docs.fleetbase.io/guides/fleet-ops/order-config/
  - Define como ordem é criada em Fleetbase: campos customizáveis, validações obrigatórias, fluxo de status (criado→despachado→iniciado→concluído), e tipos de entidade attachadas. Ordem Config é a espinha dorsal que determina workflow steps, entity fields e método POD.
- **Fleetbase Documentation - Getting Started Quickstart** — https://www.fleetbase.io/docs/fleet-ops/getting-started/quickstart
  - Fluxo passo-a-passo: criar ordem → selecionar Order Config (tipo) → preencher formulário → salvar (status=created) → atribuir driver → atribuir veículo (opcional) → despachar. Ordem é vista no mapa e driver recebe notificação push no Navigator.
- **Fleetbase Documentation - Vehicle Allocation & Orchestrator** — https://www.fleetbase.io/docs/fleet-ops/operations/orchestrator/vehicle-allocation
  - Orchestrator é motor de otimização que roda phases: avalia veículos contra pool de ordens, considera disponibilidade (status=active+online), localização GPS, capacidade (payload), driver pairing. Engines: greedy, vroom ou custom. Atribuições podem ser manuais na Workbench.
- **Fleetbase Documentation - Service Rates** — https://docs.fleetbase.io/guides/fleet-ops/service-rates/
  - Calcula taxas de entrega automaticamente: campos base fee, fixed meter (R$/km), per meter (multiplica distância), per drop-off, custom algorithm com variáveis. Pode haver surcharge por horário de pico e restrições por tipo de ordem.
- **Fleetbase Documentation - Places** — https://docs.fleetbase.io/guides/fleet-ops/places/
  - Places são pontos de referência (waypoints) no sistema: armazenam nome, endereço geocodificado, avatar. Criadas automaticamente ao lançar ordem ou criadas manualmente e reutilizadas. Usadas para pickup/dropoff em ordens.
- **Fleetbase Documentation - Drivers** — https://docs.fleetbase.io/guides/fleet-ops/drivers/
  - Drivers são usuários especializados: vinculação a conta de usuário (opcional), detalhes pessoais, telefone (obrigatório para login no Navigator), qualificações/licenças. Atribuídos a ordens; recebem push notifications. Podem ser exportados em lote.
- **Fleetbase API Documentation** — https://docs.fleetbase.io/developers/api/
  - API RESTful para criar ordens (POST /orders com pickup/dropoff obrigatórios), entities array com destino/nome/preço, despachar (PATCH /orders/{id}/dispatch), atualizar. SDKs: JavaScript e PHP. Webhooks para eventos (criação, dispatch, GPS, conclusão).
- **Fleetbase Navigator - Driver App** — https://fleetbase.io/products/navigator
  - App móvel open-source (React Native): recebe ordens despachadas via push notification, lista de jobs ativa, turn-by-turn navigation, activities flow (steps), POD (foto/assinatura/QR), messaging com operações. White-label disponível.
- **Glossário de Logística Português** — https://trackage.com.br/blog/glossario-da-logistica/
  - Termologia em português: Frete=valor do transporte, Pedido=ciclo tempo ordem→entrega, Entrega=operações última milha (hub→cliente), Despacho=liberação de carga para transporte/distribuição.
- **TMS Terminology - Geotab & Industry Standards** — https://www.geotab.com/blog/tms-software/
  - Padrão TMS global: Order=vem de ERP/WMS, Shipment=ordem pode virar múltiplos shipments (consolidação), Task/Job=worksheet para driver. Push notification ao assignment, rastreamento full-lifecycle warehouse→destino.

---

# github:nfe-parsing
## Nomenclatura
- NFe (Nota Fiscal Eletrônica) = documento fiscal eletrônico brasileiro, formato XML, padrão SEFAZ. Contém dados do emissor, destinatário, produtos/serviços, valores, impostos.
- DANFE = Documento Auxiliar da NF-e, versão em PDF para impressão/acompanhamento físico da carga. Apenas ~10% dos dados do XML aparecem na DANFE — 90% fica só no XML.
- Destinatário = receptor da nota fiscal, pode ser cliente (PJ/PF) ou endereço de entrega. Tags XML: xLgr (rua), nro (número), xBairro, CEP, xMun (cidade), UF.
- Frete = custo/valor do serviço de transporte de mercadoria. Pode ser CIF (fornecedor paga) ou FOB (comprador/transportadora paga).
- Despacho = ato operacional de envio de um pedido, inclui labeling/etiquetagem automática, submissão à transportadora e início de rastreio. Diferente de 'frete' (custo).
- Lançamento de Pedido = entrada inicial do pedido no sistema, pode ser manual ou importado de XML/NFe de fornecedor. Registra cliente, valor, local de entrega.
- Pedido = unidade de faturamento (cliente + valor + local entrega). Um pedido pode ter múltiplas Entregas (paradas diferentes).
- Entrega = parada individual dentro de um pedido, endereço específico com documentação (foto, assinatura, POD).
- TMS (Transport Management System) = sistema especializado em gestão de transportes, integra-se com ERP para automatizar cálculo de fretes, despacho e rastreio.
- ERP Logística = sistema integrado que conecta estoque → faturamento → separação → entrega. Cérebro operacional que fala com TMS.
- CT-e (Conhecimento de Transporte Eletrônico) = documento fiscal de transporte, pode ser emitido automaticamente a partir de dados de NFe importada.
- XML parser = ferramenta que lê XML e extrai dados estruturados. nfe-xml usa regex (rápido, leve); djf-nfe usa API fluente; fast-xml-parser é genérico robusto.
- OCR (Optical Character Recognition) = extrai texto de imagens/PDFs digitalizados via IA (Tesseract). Muito lento (5-30s por página) e menos preciso que parsing XML.
- PDF.js = engine Mozilla que converte PDFs em estrutura navegável (páginas, textos com coordenadas). Base para extração de DANFE em PDF.
- Bulk Import = processo de importar múltiplos XMLs/PDFs em massa, ideal para transportadora receber frota de pedidos de clientes simultaneamente.
- Schema validation = verificar se XML está bem-formado antes de processar, evita erros de parsing. SEFAZ exige validação antes de aceitar NFe.
## Fluxos
- FLUXO 1 (Entrada de Pedido via XML NFe) — Sistema Transportadora: (1) Cliente/fornecedor envia XML de NFe por email/upload; (2) Sistema lê arquivo → nfe-xml.parse(); (3) Extrai: destinatário (nome, CNPJ, endereço, CEP), produtos (descrição, qtd, valor unitário), valor total; (4) Validação schema SEFAZ; (5) Cria registro PEDIDO com status 'rascunho'; (6) Alimenta campos de cliente, valor, local de entrega automaticamente.
- FLUXO 2 (Lançamento de Pedido Simples) — Sem XML: (1) Operador acessa tela 'Novo Pedido'; (2) Seleciona cliente (ou cria 'cliente avulso'); (3) Preenche: valor, local entrega, notas fiscais/entregas (manual ou importadas); (4) Sistema calcula/confirma preço de frete (consulta TMS ou tabela fixa); (5) Salva PEDIDO com status 'lançado'.
- FLUXO 3 (Despacho de Pedido para Caminhão) — Etapa 2: (1) Operador acessa 'Despacho' com pedidos 'lançados'; (2) Seleciona pedido; (3) Escolhe caminhão (sistema sugere motorista padrão do veículo); (4) Pode trocar motorista (folga, alocação); (5) Sistema gera rota otimizada (VROOM); (6) Gera Manifesto/CT-e automaticamente; (7) Envia dados para app do motorista; (8) Status pedido → 'despachado'.
- FLUXO 4 (Importação em Massa de XMLs) — Backend: (1) API POST /api/pedidos/bulk-import recebe array de XMLs (arquivo ou string base64); (2) Loop sobre cada XML; (3) nfe-xml.parse() → extrai dados; (4) Validação schema; (5) INSERT PEDIDO com dados extraídos; (6) Retorna JSON: {sucesso: 45, falhas: 2, erros: [{arquivo: 'x', motivo: 'schema inválido'}]}.
- FLUXO 5 (Extração de DANFE em PDF - Rota A: Layout) — Sem OCR: (1) Upload PDF de DANFE; (2) pdf2json.parse() → converte em JSON com coordenadas; (3) Localiza campos por posição: 'Valor Total' está na coordenada (x, y); (4) Extrai texto daquela região; (5) Regex para limpar: remove 'R$', espaços, formata número; (6) Mapeia para campo PEDIDO.valor. Rápido (< 1s), preciso.
- FLUXO 5B (Extração de DANFE em PDF - Rota B: OCR) — Se layout não funciona: (1) Upload PDF; (2) pdf.js converte para canvas; (3) Tesseract.js executa OCR (5-30s); (4) Retorna texto bruto; (5) Regex para extrair campos (pode falhar em fontes ruins); (6) Menos confiável, mais lento, use só se Layout falhar.
- FLUXO 6 (Atualização de Pedido com múltiplas Entregas) — Um pedido X pode ter N entregas: (1) Sistema cria PEDIDO principal; (2) XML tem 1 destinatário → 1 ENTREGA; (3) Mas operador pode adicionar mais entregas manualmente (split de pedido = múltiplas paradas); (4) Cada ENTREGA tem endereço, CEP, documentação própria; (5) Despacho aloca tudo no mesmo caminhão (rota otimiza ordem).
- FLUXO 7 (Validação e Tratamento de Erros) — Processamento seguro: (1) XML recebido → validação schema (xsd) obrigatória; (2) Se inválido: erro 400, retorna 'XML não conforme SEFAZ'; (3) Se válido → parsing seguro com try-catch; (4) Campo obrigatório faltando (ex: CEP) → aviso 'pedido criado com status rascunho, completa CEP manualmente'; (5) Log de cada import (ID, arquivo, status, timestamp).
- FLUXO 8 (Decisão: Qual Parser Usar) — Estratégia: Para bulk import (50+ XMLs/dia) → usar nfe-xml (regex, rápido, zero deps). Para poucos XMLs + precisão extrema → djf-nfe (API fluente, validação). Para PDFs → se DANFE bem-formado (impresso) → pdf2json; se DANFE digitalizado/ruim → Tesseract.js (+ lento). Nunca confie só em OCR para valores críticos.
## Recomendações
- IMPLEMENTAÇÃO TÉCNICA: Backend Next.js (API Route `/api/pedidos/bulk-import`) → recebe XMLs (multipart/form-data ou array base64) → loop nfe-xml.parse() → inserir na tabela PEDIDOS. Tempo: ~50-100ms por XML (nfe-xml é muito rápido). Alocar fila Bull/Bullmq se > 100 XMLs simultâneos.
- PARSING DE XML: Use `nfe-xml` (npm i nfe-xml) por padrão — é o mais rápido (regex-based), mantido, recomendado para transportadora. Código sample: `const nfe = require('nfe-xml'); const xml = fs.readFileSync('nfe.xml', 'utf-8'); const dados = {destinatario: nfe(xml).destinatario().nome().done(), valor: nfe(xml).valor().toNumber().done()};`
- EXTRAÇÃO DE DANFE PDF: Priorize `pdf2json` (npm i pdf2json) para DANFEs impressas/digitalizadas de qualidade. Preserva coordenadas (essencial para localizar 'Valor Total' ou 'Endereço Destinatário'). Se DANFE estiver corrompido ou ilegível → fallback para Tesseract.js, mas nunca use OCR como source-of-truth para valores (só para revisão humana).
- NÃO USE OCR COMO PRIMARY: Tesseract.js (OCR) é lento (5-30s por página) e impreciso em DANFEs com fontes/layouts customizados. Usar OCR só se: (a) arquivo é imagem/scan ruim, (b) PDF layout-less (scaneado), (c) operador quer validação dupla. Para fluxo normal → PDF parsing é suficiente.
- CAMPOS OBRIGATÓRIOS DO XML NFe: Extraia SEMPRE: `destinatario.nome`, `destinatario.endereco.logradouro`, `destinatario.endereco.numero`, `destinatario.endereco.cep`, `total.icmsTotal.vNF` (valor NFe). Marque como 'aviso' se algum faltar — permita salvar em 'rascunho' para operador completar manualmente.
- VALIDAÇÃO SCHEMA: Antes de parse, valide XML contra schema SEFAZ (xsd disponível em nfe.fazenda.gov.br). Use biblioteca como `xsd-validator` (npm). Se schema falhar → rejeite arquivo, retorne erro claro: 'XML não conforme padrão SEFAZ v4.0, favor verificar com seu provedor fiscal'.
- NOMENCLATURA RECOMENDADA PARA UI: Evite 'Viagens' (confuso). Use: (1) 'Novo Pedido' (tela de lançamento/importação) → (2) 'Despacho' (tela de alocação em caminhão + motorista). 'Frete' = custo/valor da transportagem (mostrar em relatório financeiro). 'Entrega' = parada individual dentro do pedido.
- FLUXO DE IMPORTAÇÃO EM MASSA RECOMENDADO: (1) Página `/admin/pedidos/importar` com drag-drop de XMLs ou pasta .zip; (2) Backend processa em fila assincrona (Bull); (3) Retorna: {processados: 45, sucesso: 44, falhas: 1}; (4) Exibe relatório com links para cada pedido criado; (5) Falhas exportáveis em CSV para análise.
- PARA 'CLIENTE AVULSO': Se pedido sem cliente cadastrado → crie campo 'destinatario_avulso' (struct: nome, cnpj, endereco) na tabela PEDIDOS. Permite lançar pedido rápido sem cadastrar cliente no master. Transportadora depois pode retroativamente 'vincular' a cliente existente ou manter como avulso no relatório.
- ESTRUTURA DE DADOS PEDIDO SUGERIDA: `{id, cliente_id, destinatario_nome, destinatario_cnpj, destinatario_endereco, destinatario_cep, valor, status: 'rascunho'|'lançado'|'despachado'|'entregue', origem: 'manual'|'importacao_nfe', nfe_xml_ref: 'hash', created_at, updated_at}`. Cada PEDIDO pode ter N ENTREGAS (paradas).
- IMPORTAÇÃO DE PDFs: Suporte apenas DANFEs originais de sistema fiscal (Sefaz-approved). Se cliente envia DANFE 'caseira' (PDF gerado manualmente) → rejeite com aviso 'solicite XML da NFe' (XML é a fonte oficial). DANFE PDF é só para impressão/acompanhamento, não para integração.
- INTEGRAÇÃO COM DESPACHO: Após importar pedido → não abre automático no despacho. Fica em 'rascunho' até operador revisar. Quando clica 'confirmar lançamento' → status = 'lançado' e fica disponível para despacho (tela 2). Isso evita erros de importação criar despachos automáticos.
- TRATAMENTO DE ERROS NO BULK: Se 1 de 50 XMLs falhar (schema inválido) → não aborte tudo. Continue processando os outros, salve em DB cada sucesso/falha com mensagem. Retorne ao usuário: '{sucesso: 49, falhas: 1, erros: [{arquivo: 'nf123.xml', motivo: 'tag <nfe> ausente'}]}'.
- PERFORMANCE EXPECTATIONS: nfe-xml parse ~50-100ms/arquivo. pdf2json parse ~500-1000ms/arquivo (deve ser separado, async). Para 100 XMLs/dia = ~100ms × 100 = 10s processamento (aceitável). Para 100 PDFs/dia = ~500ms × 100 = 50s (aceitável se em fila background). Não bloquear UI.
- SEGURANÇA: XMLs podem conter dados sensíveis (CPF emitente, valores). Se armazenar XML cru no DB → considere encriptação. Logs de importação devem ser auditados (quem importou, quando, quantos). Tokens/API keys de acesso a importação devem ser role-based (admin/operador logistics only).
- PRÓXIMAS DECISÕES PARA DONO: (1) Qual é a fonte principal de pedidos? (a) Cliente envia NFe em massa, (b) Pedidos manuais da transportadora, (c) Integração API com cliente; (2) Qual frequência? (a) 10 pedidos/dia, (b) 50+/dia; (3) Qual % em PDF vs XML? Respostas definem se prioriza OCR ou PDF parsing. Recomendo: MVP com XML (nfe-xml) + PDF parsing (pdf2json) opcional em v2.
## Fontes
- **nfe-xml (npm package)** — https://www.npmjs.com/package/nfe-xml
  - Parser baseado em regex para manipular XML de NFe, recomendado para processamento em massa por sua velocidade. Oferece API fluente com métodos como .produtos(), .each(), .map(), .filter() e .reduce() para extrair destinatário, produtos e valores de múltiplas notas fiscais. Zero dependências, 6 anos estável.
- **djf-nfe (npm package)** — https://www.npmjs.com/package/djf-nfe
  - Parser simples de XML de NFe com API fluente para acessar dados independente da versão do schema. Oferece interface intuitiva para extrair dados como destinatário e produtos. Atualizado há 3 meses, aceita contribuições para novos campos.
- **pdf2json (npm package)** — https://www.npmjs.com/package/pdf2json
  - Converte PDF para JSON estruturado preservando coordenadas e contexto espacial — essencial para extrair campos específicos de DANFE (número fiscal, valor, endereço destinatário) que precisam ser localizados posicionalmente na página.
- **pdf.js-extract (npm package)** — https://www.npmjs.com/package/pdf.js-extract
  - Extrai texto, anotações e imagens de PDFs baseado no pdf.js do Firefox, com suporte a coordenadas de glyph. Alternativa a pdf2json para extrair dados estruturados de DANFE preservando layout.
- **Tesseract.js (Pure JS OCR)** — https://tesseract.projectnaptha.com/
  - OCR puro em JavaScript para 100+ idiomas, roda em Node.js e browser. Necessário converter PDF em canvas primeiro (via pdf.js) antes de processar com Tesseract — útil para DANFEs digitalizadas (imagens) quando parsing de layout não funciona.
- **Estrutura XML de NFe - Grid Sistemas** — https://gridsistemas.com.br/estruturaxml/
  - Documentação técnica da estrutura do XML de NFe. Seção destinatário contém tags como xLgr (logradouro), nro (número), xBairro, cMun, xMun, UF, CEP para endereço; emitente e itens (produtos) também estruturados hierarquicamente.
- **ERP vs TMS na Logística - Loggi** — https://www.loggi.com/conteudos/gestao/erp-logistica/
  - Explica que ERP logística conecta todas etapas (estoque → faturamento → separação → entrega). Pedido lançado no ERP é recebido por TMS que cota fretes, define transportadora e planeja coletas automaticamente. Despacho = ato operacional de envio com etiquetagem/rastreio automatizados.
- **TMS na Logística - Frete Rápido** — https://freterapido.com.br/sistema-tms-logistica/
  - TMS automatiza fluxo pedido→despacho via integração com transportadoras. Frete = custo/serviço de transporte; Despacho = ato operacional (labeling automático + submission à transportadora). Workflow: pedido → cálculo automático de frete → despacho automático → rastreio unificado.
- **Nomenclatura de Fretes - TPL** — https://www.tpl.com.br/blog/tipos-de-fretes-decisoes-inteligentes-para-suas-entregas
  - Mercado diferencia CIF (fornecedor responsável por frete) e FOB (comprador responsável). Contratação pode ser direta, subcontratação, redespacho (2 transportadoras) ou redespacho intermediário (múltiplas). Impacta na estrutura de como pedidos são despachados.
- **Importação automática de NFe - Omie** — https://ajuda.omie.com.br/pt-BR/articles/1350609-importando-a-nf-e-de-fornecedor-automaticamente
  - Omie importa XML de fornecedor automaticamente: usuário seleciona arquivo → sistema lê dados → registra produtos sem digitação manual. Para transportadora: extrai informações de fornecedor, detalhes de produtos, preços — alimenta automaticamente pedido de compra/entrega.
- **Workflow NFe para Transportadora - useawise** — https://www.useawise.com/programa-para-importar-xml-nfe/
  - Importador de XML de NFe extrai: detalhes de fornecedor, informação de produtos, preços unitários e totais, despesas. Para transportadora: CT-e pode ser emitido a partir de XML da NFe, alimentando automaticamente dados de carga. Elimina digitação, acelera despacho.
- **Fast-XML-Parser** — https://www.npmjs.com/package/fast-xml-parser
  - Parser XML genérico robusto (milhões downloads/semana), suporta arquivos até 100MB, sem dependências C/C++. Alternativa ao nfe-xml para parsing flexível — menos otimizado para NFe especificamente, mas mais completo para campos customizados.
- **Building OCR with Node.js - Medium** — https://medium.com/@rjaloudi/building-an-ocr-application-with-node-js-pdf-js-and-tesseract-js-c54fbd039173
  - Guia prático de arquitetura: pdf.js converte páginas em canvas → Tesseract.js extrai texto via OCR. Útil para DANFEs digitalizadas (scans) quando você não tem XML, mas OCR é lento e menos preciso que parsing XML.
- **7 PDF Parsing Libraries - Strapi** — https://strapi.io/blog/7-best-javascript-pdf-parsing-libraries-nodejs-2025
  - Comparação: pdf-parse (extração simples), pdfjs-dist (motor Firefox com coordenadas), pdf2json (JSON com contexto espacial), pdfreader (streaming para grandes arquivos), unpdf (API TypeScript moderna). Para DANFE: pdf2json ou pdf.js-extract preservam coordenadas essenciais.
- **NFe Product Extractor - GitHub** — https://github.com/xandao-dev/nfe-product-extractor
  - Extrator de produtos NF-e 4.0 de XMLs, originalmente em Python (Sebrae), mas código pode servir como referência de lógica de parsing. Mostra estrutura de como automatizar extração de produtos para sistema Sebrae 4.01.
- **Node.js + NFe Integration - TecnoSpeed** — https://blog.tecnospeed.com.br/nf-e-em-node-js/
  - Documentação prática de como integrar emissão e recebimento de NFe em Node.js. Validação XML contra schema é obrigatória antes de envio. Assinatura digital é etapa mandatória pós-geração XML. APIs REST disponíveis para integração backend.

---

# github:import-spreadsheet
## Nomenclatura
- FRETE = serviço/custo de transporte de mercadoria do embarcador ao destino final (responsabilidade contratual da transportadora; transacional)
- DESPACHO = processo de liberação/autorização de mercadoria para saída do armazém/pátio em direção ao transporte (etapa operacional, não fiscal)
- PEDIDO = unidade de faturamento/venda (cliente, valor, CNJ/número); pode conter 1+ ENTREGAS (paradas individuais com endereço)
- ENTREGA = parada individual dentro de um pedido (endereço específico, CEP, cliente local)
- ROMANEIO = lista de notas/entregas embarcadas num veículo para uma viagem (documento de controle de carregamento)
- DANFE = Documento Auxiliar da Nota Fiscal Eletrônica (acompanha fisicamente a mercadoria)
- NF-e/XML = Nota Fiscal Eletrônica em formato XML (documento fiscal oficial, válido legalmente)
- CT-e = Conhecimento de Transporte Eletrônico (documento fiscal que registra serviço de frete)
- CIF (Cost, Insurance, Freight) = modalidade contratual onde fornecedor paga frete até destino final
- FOB (Free On Board) = modalidade contratual onde comprador assume custos de transporte a partir da origem
- LOGÍSTICA = gestão abrangente da cadeia (transporte + estoque + armazenagem + embalagem + segurança); relacionamento estratégico
- TMS (Transportation Management System) = plataforma centralizada de cotação, emissão de etiquetas, rastreamento, gestão de transportadoras
- OSRM (Open Source Routing Machine) = engine de roteamento open-source baseado em OpenStreetMap para cálculo otimizado de rotas
- POD (Proof of Delivery) = prova de entrega com foto + GPS + assinatura digital
- CLIENTE AVULSO = pedido sem cliente cadastrado no sistema (venda pontual sem registro permanente)
## Fluxos
- IMPORTAÇÃO XLS/CSV (Padrão React): Upload → Seleção de Sheet/Aba → Seleção de Linha de Header → Mapeamento de Colunas (matching automático + remapeamento manual) → Validação Linha-a-Linha → Preview de Dados → Confirmação e Envio para Backend
- PEDIDO NO SISTEMA DE FROTA BRASILEIRO: Recepção (lancamento manual ou importação) → Validação (endereço, cliente, valor) → Armazenamento (status='novo') → Despacho (atribuição a caminhão/motorista) → Roteirização (otimização de rota) → Execução (entrega) → POD (prova com foto/GPS) → Fechamento
- DESPACHO (Workflow no Transporte Brasileiro): Recepção do Pedido Faturado → Liberação de Mercadoria (despacho = autorização de saída) → Atribuição a Veículo → Seleção/Confirmação de Motorista (pode variar dia-a-dia) → Transmissão para APP do Motorista → Saída do Pátio → Roteirização Automática das Entregas
- COLUNA MAPPING (Melhores Práticas): Análise Automática das Primeiras Linhas → Fuzzy Matching contra Schema Conhecido (ex: 'first name'='Nome') → Alternativas/Aliases ('CEP' vs 'postal code') → Exibição de Sample Data para Validação → Remapeamento Manual se Necessário → Confirmação Visual Antes do Import
## Recomendações
- COMPONENTE RECOMENDADO: react-spreadsheet-import (v4.7.1) para importação de PEDIDOS. Razões: (1) wizard completo e testado, (2) integração nativa Chakra UI (já usado no projeto), (3) suporta XLS/XLSX/CSV, (4) fuzzy matching automático de colunas, (5) validação row-level, (6) hooks para transformação de dados pre/post import.
- ALTERNATIVA LEVE: react-csv-importer (open-source) + PapaParse se o projeto quer máxima customização e zero dependências pesadas. Trade-off: mais código boilerplate, mas controle total da UI/UX.
- PARSING: Usar SheetJS (xlsx) ou PapaParse diretamente APENAS se não usar wizard; senão estão encapsulados em react-spreadsheet-import.
- VALIDAÇÃO: Integrar Zod ou similiar (já provável no stack) APÓS o import para validação runtime (presença de colunas, tipos, ranges). React-spreadsheet-import oferece hooks, mas não substitui validação rigorosa de negócio.
- TEMPLATE PADRÃO DE PEDIDOS (Colunas): Cliente (obrigatório ou vazio=avulso), Valor_Frete, CEP_Destino, Endereco, Numero, Complemento, Bairro, Cidade, Estado, Telefone_Destinatario, Data_Entrega (opcional, window), Peso (opcional, para capacity check), Obs/Instrucoes. Inspirado em Route4Me + eLogii.
- TEMPLATE PADRÃO DE DESPACHO (Atribuição): Pedido_ID, Veiculo_Placa (lookup), Motorista_Telefone (se diferente do padrão), Data_Saida, Priorizacao (0-10, default 5). Simples: mapping de pedidos já lançados a caminhões/motoristas.
- FLUXO RECOMENDADO 2-TELAS: Tela 1 (LANÇAMENTO DE PEDIDOS) = import XLS/CSV com validação + preview. Tela 2 (DESPACHO) = seletor de pedidos 'novos' + drag-drop para caminhão (ou modal com seleção de motorista override).
- IMPORTAÇÃO DE DANFE/NFe XML: Não abordar neste ciclo (complexo: OCR de PDF DANFE ou parsing XML de NFe requer bibliotecas pesadas + lógica de matching com catálogo). Manter como roadmap futuro.
- NOMEAÇÃO CORRETA: Renomear menu de 'Viagens' para 'Despacho' (etapa operacional, não fiscal) e 'Fretes' para 'Pedidos' (unidade de faturamento). Eventualmente 'Logística Completa' como módulo futuro (gestão de estoque, etc.).
- OSRM vs Google Geocoding: Para import com validação de endereço, usar Google Geocoding Cache (já decidido no projeto). OSRM é para roteização pós-despacho, não necessário para import.
- VALIDAÇÃO DE ENDEREÇO NO IMPORT: Usar Google Geocoding API para validar CEP+endereço em tempo real (async preview) ou offline via cache. Alertar se endereço 'suspeito' (CEP fora de área de operação, etc.).
- CÓDIGO ABERTO RECOMENDADO: Usar react-spreadsheet-import (MIT license) + PapaParse (MIT) + Zod (MIT). Evitar Flatfile/OneSchema/CSVBox no MVP (custos, vendor lock-in). YoBulk/TableFlow são alternativas se quiser self-hosted no futuro.
- INTEGRAÇÃO COM ROTEIRIZAÇÃO: Após import + despacho, enviar pedidos ao VROOM (já integrado) com caminhão + motorista atribuído. Rotas otimizadas retornam para app do motorista (já existente).
- TESTE COM XLS REAL: Coletar template XLS/CSV de cliente real (faturamento manual) e validar import com react-spreadsheet-import antes de produção. Ajustar colunas conforme variações de mercado.
## Fontes
- **GitHub - UgnisSoftware/react-spreadsheet-import** — https://github.com/UgnisSoftware/react-spreadsheet-import
  - Biblioteca React/Chakra UI com wizard completo: upload XLS/XLSX/CSV → seleção de sheet → seleção de header → mapeamento automático com fuzzy matching → validação com regras (required, unique, regex) → preview e edição inline. Últimas versões: suporte a hooks customizados, transformações de dados, validações em múltiplos níveis.
- **SheetJS (xlsx library) - React Documentation** — https://docs.sheetjs.com/docs/demos/frontend/react/
  - Padrão de mercado para parsing XLS/XLSX: uso de useState com array de objetos (preferido) ou array de arrays. Recomendação explícita de usar runtime validation library (Zod, Joi, etc.) pois tipos TypeScript não garantem presença de colunas. Pattern com useEffect + useCallback para arquivos async. Suporte a date formatting (default yyyy-mm-dd).
- **GitHub - beamworks/react-csv-importer** — https://github.com/beamworks/react-csv-importer
  - Open-source wrapper do PapaParse com UI completa: drag-drop upload → raw preview → column mapping (auto + manual) → data handler callbacks (async-safe). Suporta arquivos >1GB via streaming, i18n (EN/DA/DE/IT/PT/TR), TypeScript, acessibilidade. Componentes: ImporterField com opcional/obrigatório.
- **PapaParse Official - Papa Parse Documentation** — https://www.papaparse.com/
  - Parsing puro em browser (zero dependencies, sem upload para servidor): detecção automática de delimiter, suporte a Web Workers para não travar UI, dynamic typing (strings→numbers/booleans), header mapping, comment filtering. 5.4M downloads/semana. Funcionalidades: parseCSV string, File API local, remote files, streaming row-by-row.
- **TableFlow - Medium: Introducing TableFlow** — https://medium.com/@tableflow/introducing-tableflow-the-open-source-csv-importer-18b0ccb2ad87
  - Open-source CSV importer (Y Combinator) que resolve pain points: file upload + encoding + validation + column mapping + error resolution. Stack: Go + TypeScript + ScyllaDB. Oferece self-hosted (open source) e managed cloud. Futura expansão para múltiplos formatos (não só CSV).
- **CSVBox Blog - Open-source alternatives to Flatfile** — https://blog.csvbox.io/open-source-flatfile-alternatives/
  - Alternativas principais: YoBulk (self-hosted + AI column matching), Impler (mais popular open-source), TableFlow (CSV importer), react-csv-importer (UI+parsing), PapaParse (parsing puro). Trade-off: zero licensing vs. higher engineering effort para upload seguro, mobile, progresso, retry.
- **Route4Me - Order Import Documentation** — https://support.route4me.com/add-upload-import-orders/
  - Workflow prático: 3 métodos (API, spreadsheet CSV, manual). Campos obrigatórios: address. Opcionais: location (lat/lon), customer (nome/email/phone), order details (tipo, priority, PO, ID), scheduling (time windows, recurring), atributos (weight, volume, revenue), custom data (BARCODE para scanning). Validação: geocoding + map review antes de finalizar.
- **eLogii - Delivery Management Software Overview** — https://elogii.com/blog/what-is-delivery-management-software
  - Fluxo padrão de importação em last-mile: 3 métodos (manual, CSV, API/OMS). Campos obrigatórios: date, pickup location+UID, drop-off location+UID, dimensions. Opcionais: contact, time windows, instruções. Cada pedido importado = uma task ('New' status) → scheduling → otimização em rotas → execução.
- **Everlog Brasil - Frete vs Logística** — https://everlogbrasil.com.br/diferencas-entre-frete-e-logistica/
  - Diferenciação clara no contexto brasileiro: FRETE = responsabilidade de coleta e entrega (transacional). LOGÍSTICA = gestão completa da cadeia (transporte + estoque + armazenagem + embalagem + segurança; relacionamento estratégico). Frete contratado pontualmente; logística é parceria integral.
- **TOTVS Blog - Glossário de Logística** — https://www.totvs.com/blog/gestao-logistica/glossario-de-logistica/
  - Definições brasileiras: DESPACHO = 'liberação de mercadorias para transporte ou distribuição' (pode incluir processos aduaneiros). FRETE = valor/tarifa do transporte (modal: rodoviário, ferroviário, aéreo, marítimo). CT-e = Conhecimento Transporte Eletrônico (registro fiscal de serviço de frete). CIF vs FOB = modalidades de responsabilidade contratual.
- **Omie - DANFE XML e Nota Fiscal** — https://www.omie.com.br/blog/danfe-xml-e-nota-fiscal-guia-pratica/
  - Conceitos: DANFE = acompanha fisicamente mercadoria (operacional). NF-e XML = documento fiscal oficial válido legalmente (5 anos arquivamento obrigatório). Em logística: enviar XML para fiscal; DANFE suficiente para operação. Sistema importa XML e extrai automaticamente dados (cliente precisa mapear itens ao catálogo).
- **ImportCSV - React CSV Import Best Practices** — https://www.importcsv.com/blog/react-csv-import
  - Comparação: basic uploads (predictable column names) = PapaParse é suficiente. User-facing imports (column names vary) = react-csv-importer ou managed solution (Flatfile, CSVBox, OneSchema). Complexity real está em mapping UI + validação inline + erro handling. Estado-da-arte: componentes open-source (react-csv-importer + PapaParse) + validation library (Zod).

---

# github:saas-lastmile
## Nomenclatura
- TASK = unidade de trabalho individual (pickup OU dropoff), usada por Onfleet e Bringg. Cada task tem destination e pode ter recipient.
- ORDER = em Onfleet: par de tasks (pickup + dropoff); em Routific: parada/visita individual a ser roteizada; em Bringg: sinônimo de Task. Contexto muda conforme plataforma.
- PEDIDO = no Brasil: requisição individual de cliente (e-commerce). No contexto logístico: pode englobar N entregas (paradas). Centro do modelo de faturamento neste projeto.
- ENTREGA = parada individual com endereço e cliente específico. Pode haver múltiplas entregas por pedido. Sinônimo de STOP ou WAYPOINT em SaaS.
- FRETE = custo/valor do transporte. No Brasil: pode ser percentual do valor ou fixo. Diferencia CARGA FRACIONADA (múltiplos clientes) vs COMPLETA (cliente único).
- VIAGEM = rota completa (trajeto com múltiplas paradas). Executada por um motorista em um dia/turno. Sinônimo de ROUTE ou ROUTE SOLUTION.
- DESPACHO/DISPATCH = etapa 2: decisão de qual motorista/caminhão faz qual rota. Atribuição de order/tasks a vehicles. Pode ser automática (algoritmo) ou manual (dispatcher).
- ROTEIZAÇÃO/ROUTING = etapa de otimização: dado N pedidos (entregas), calcular melhor sequência/agrupamento por veículo.
- CLIENTE AVULSO = cliente sem cadastro prévio. SaaS brasileiros como Nuvem Envio permitem criar entrega sem registrar cliente. Campo 'cliente' opcional na criação.
- POD (PROOF OF DELIVERY) = foto + GPS + assinatura do entregue. Onfleet, Circuit, Detrack, todas suportam captura foto/assinatura.
- DANFE/XML NF-e = Documento Auxiliar Nota Fiscal Eletrônica. DANFE = versão impressa (PDF). XML = arquivo estruturado assinado e enviado à SEFAZ. Usado para validação fiscal de origem de cargas.
- DESTINATION/RECIPIENT/WAYPOINT = termos sinônimos. DESTINATION = local. RECIPIENT = pessoa. WAYPOINT = ponto geográfico na rota.
## Fluxos
- FLUXO PADRÃO LAST-MILE (Onfleet, Routific, Circuit, Bringg, Detrack, OptimoRoute): 1. Order Creation/Capture (adiciona pedidos, validação, enriquecimento de dados) 2. Routing/Optimization (algoritmo: melhor sequência, agrupa por veículo) 3. Dispatch/Assignment (atribui rotas a motoristas) 4. Execution/Tracking (drivers vão para campo, atualização real-time) 5. POD (foto, assinatura) 6. Close/Returns (feedback, resoluções).
- FLUXO ONFLEET: Create/Import Tasks → Auto-assign OR Manual Assign to Worker → Driver receives in mobile app → GPS tracking + manual status + photo POD → Task closed.
- FLUXO ROUTIFIC: Add Orders (drag-drop ou CSV import) → [Optionally auto-optimize] → Dispatch to Drivers (SMS link) → Driver navigates on mobile → Marks complete with POD.
- FLUXO CIRCUIT: Import Spreadsheet (CSV/Excel) → System optimizes stops → Assign to drivers (web) → Drivers see route on mobile → Manual reordering if needed.
- FLUXO BRINGG: Add Orders Manually (type → team → location) → Auto-assign OR Manual assign driver → Driver accepts on app → Navigation + photo POD.
- FLUXO DETRACK: Import deliveries (CSV: D.O. No, Address) → Automatic job assignment per service area/driver → Driver app shows list → Marks complete with photo.
- FLUXO TWO-STEP CLÁSSICO (aplicável a todos): PASSO 1 [LANÇAMENTO/ORDER ENTRY]: minimal fields (address obrigatório, opcionalmente recipient name/phone, notes, time window). Sistema gera ID único, aceita address em 1+ colunas. PASSO 2 [DESPACHO/DISPATCH]: atribui order criado a motorista/caminhão, escolhe sequência na rota, distribui a drivers.
- FLUXO IMPORTAÇÃO EM MASSA: Usuario faz upload CSV/Excel → Sistema detecta headers automaticamente (com data mapping) → Valida endereços (geocoding: Google, ViaCEP, OSM) → Cria orders em lote → Pronto para routing/dispatch.
- FLUXO CLIENTE AVULSO: Ao criar pedido, campo 'cliente' é OPCIONAL. Se não fornecido, sistema gera cliente genérico (ex: 'Avulso #123') ou pede confirmação. Endereço + motorista = suficiente para executar entrega.
## Recomendações
- TELA 1 (LANÇAMENTO/ORDER ENTRY): Desenhar MINIMALISTA como Routific (só address obrigatório). Campos: Address (1+ inputs ou 1 campo unparsed), Customer Name (opcional), Order Number (auto-gerado se vazio), Phone (opcional, para SMS/WhatsApp), Notes (opcional), Time Window Start/End (opcional). Se cliente não existe, criar 'avulso' automático. Design: 1 formulário simples, drag-drop de CSV para import em lote.
- TELA 2 (DESPACHO/DISPATCH): Estilo Routific (timeline + mapa). Mostra: lista de orders/entregas não assinaladas, lista de drivers (com capacidade/zona), drag-and-drop para atribuir ordem → motorista. Sistema auto-reordena rotas após cada atribuição. Botão 'Auto-assign all' com algoritmo de melhor fit.
- CAMPOS MÍNIMOS para importação CSV (copiar de Routific + Detrack + Onfleet): Address (obrigatório), Customer Name (opt), Order Number (opt), Phone (opt), Notes (opt), Time Window Start (opt), Time Window End (opt), Delivery Date (opt). Aceitar: .csv, .xlsx, .txt com header row obrigatório.
- ATRIBUIÇÃO DE MOTORISTA: Oferecer 3 modos (a) Auto-assign com regras: nearest geolocation, driver availability, zone (b) Manual drag-drop na UI (c) Bulk assign (seleciona N orders → seleciona 1 motorista → distribui inteligentemente). Permitir TROCAR motorista depois (folga, doença).
- NOMENCLATURA RECOMENDADA no sistema: Chamar PEDIDO = unidade de faturamento (cliente, valor, data). Chamar ENTREGA = parada individual (dentro de um pedido). Evitar 'viagem' na UI (usar ROTA ou ROTEIRO); evitar 'frete' para menu (usar ENTREGAS ou DESPACHO).
- IMPORTAÇÃO DANFE/NF-e: Futura integração: permitir upload de PDF DANFE ou XML NF-e → extrair automaticamente (cliente, endereço, SKUs, qtds) → pré-preencher pedido. (Nota: requer parser de NF-e + possível integração SEFAZ.)
- TEMPLATE CSV: Fornecer download de template com headers: 'address', 'customer_name', 'order_number', 'phone', 'notes', 'time_window_start', 'time_window_end', 'delivery_date', 'items_description'. Com exemplos reais preenchidos. Exemplo: '123 Rua A, São Paulo, SP' | 'João Silva' | 'PED-001' | '11999999999' | 'Subir 3 andares' | '09:00' | '17:00' | '2026-06-10' | 'Caixa 10kg'.
- VALIDAÇÃO: (1) Endereço: obrigatório, tentar geocoding automático (fallback ViaCEP ou manual). (2) Motorista: se campo fornecido, validar existe e está ativo. (3) Data: validar formato, não permitir passada. (4) Avisar se campos recomendados (phone, time_window) vazios. (5) Permitir DRAFT (salvar incompleto) e PUBLISH (validar tudo).
- FLUXO DOIS PASSOS EXPLÍCITO: Step 1: 'Lançar Pedido' (minimal form), salva como DRAFT. Step 2: 'Confirmar & Despachar' (seleciona motorista, confirma viagem). Ou combinar em 1 tela se UX simples. Botão de atrasado (marcar 'problema' na entrega, deixa nota para motorista).
- MÓVEL DO MOTORISTA: Exibir rotas como LISTA de paradas numeradas (não mapa, por banda larga). Cada parada: address, recipient name, phone, notes, time window. Botão 'Chegou', foto POD, marcação manual status (entregue/recusado/impossível/reagendado). Permitir DRAG para reordenar (local, sem permissão de motorista).
- INTEGRAÇÕES FUTURAS: (1) OpenStreetMap / Google Maps para geocoding + ETA. (2) SEFAZ para validar endereço fiscal de NF-e. (3) WhatsApp para notificação de motorista (usar phone do campo). (4) Relatório de 'impossível entregar' com foto para rastreamento. (5) API para ERP de cliente (integração automática de pedidos).
- NOMENCLATURA NA API: Não usar 'task' (confunde com Onfleet). Usar: 'order' para faturamento, 'delivery' para parada, 'route' para sequência com motorista. Manter compatibilidade futura com Onfleet/Bringg/Routific via webhook/API adapters.
- BENCHMARK MÍNIMO: Cópia Routific para simplificar (só endereço obrigatório). Desenho Detrack para importação (CSV flexível, sem ordem de colunas). Auto-assign Bringg (nearest + zone logic). Drag-drop UI de Circuit. POD com foto como Onfleet. Target: 3 cliques para criar pedido + 1 clique para atribuir motorista.
## Fontes
- **Onfleet API Documentation** — https://docs.onfleet.com/reference/create-task
  - Documentação API oficial mostra que Onfleet usa nomenclatura TASK (pickup ou dropoff individual) e ORDER (par de tasks: pickup + dropoff). Criação de tasks requer destination (address com city, postal_code, state, country). Recipient é opcional. Importação CSV aceita address_line1, city, state, postal_code. Campos obrigatórios para criação: endereço de destino.
- **Onfleet Support - Task Assignment** — https://support.onfleet.com/hc/en-us/articles/360023910111-Task-Assignment
  - Descreve fluxo de atribuição de tarefas a motoristas: tasks podem ser auto-atribuídas ou atribuídas manualmente. Atribuição manual requer seleção de worker (motorista) disponível. Sistema suporta roteamento automático e atribuição em lote.
- **Routific Help Center - How to Add Orders** — https://help.routific.com/en/articles/6-how-to-add-orders
  - Routific exige APENAS endereço como campo obrigatório. Address pode ser 'Street Number, Street Name, City, State, Country' ou lat/long. Campos opcionais: customer name, order number, phone, email, time windows, duration, load, notes. Sistema gera IDs únicos automaticamente se não fornecidos. Importação CSV flexível com mapeamento automático de colunas.
- **Routific Help Center - How to Make Changes to Routes** — https://help.routific.com/en/articles/20-how-to-make-changes-to-your-routes
  - Atribuição de pedidos a motoristas usa drag-and-drop na timeline ou mapa. Sistema automaticamente encontra melhor posição no roteiro quando atribuído. Atribuição pode ser feita antes ou depois de otimizar rotas.
- **Circuit for Teams (Spoke) - Import Spreadsheets** — https://help.getcircuit.com/en/articles/3850966-how-to-import-spreadsheets-into-circuit-for-teams
  - Circuit aceita .csv, .xls, .xlsx, .tsv, .txt. Campo obrigatório: Address Line 1. Campos recomendados: Recipient Email (obrigatório se Customer Notifications ativado), Recipient Name. Sistema faz mapeamento automático de colunas com lembrete de nomes anteriores.
- **Bringg API - Create Order/Task** — https://developers.bringg.com/reference/create_task
  - Bringg usa nomenclatura ORDER = TASK com 1-2 waypoints (pickup, dropoff ou visit). Criação requer: order type (Drop off 1 stop / 2 stops / Pick up / Exchange), team assignment, contact name, location type, address (max 255 chars). Motorista é opcional na criação (pode ser atribuído depois). Suporta atributos customizados e dados de inventário.
- **Bringg Help - Add Orders Manually** — https://help.bringg.com/docs/add-orders-manually
  - Fluxo manual: seleciona type → assigns team → preenche order_id, nome, plano serviço → localização (pickup/dropoff) → motorista (opcional) → inventário → pagamento. Permite atribuição de motorista no momento de criação ou deixa para depois. Requer permissão 'Create Orders'.
- **Detrack Help Center - How To Import Deliveries** — https://help.detrack.com/en/articles/6553433-how-to-import-deliveries
  - Detrack exige 2 campos obrigatórios: D.O. No. (pode ser auto-gerado) e Address. Colunas podem estar em qualquer ordem se header correto. Suporta SKU, Item Description, Quantity para múltiplos itens por entrega. Importação CSV/Excel com 'No fixed order for column headings'.
- **OptimoRoute Help Center - Import Orders from Spreadsheet** — https://help.optimoroute.com/hc/en-us/articles/27661457359124-Import-orders-from-a-spreadsheet
  - OptimoRoute exige pelo menos uma 'location input' (address ou lat/long). Não obriga seguir template específico - sistema tenta match automático de colunas. Para pickup/delivery, usa 'Related Order ID' para vincular par. Aceita Excel, CSV, tab-delimited.
- **Last-Mile Delivery Terminology - Track-POD** — https://www.track-pod.com/blog/logistics-terminology/
  - Define last-mile como final leg da cadeia: de hub/DC para cliente. ORDER, SHIPMENT, DELIVERY têm usos sobrepostos mas distintos. Order = tempo do placement até delivery. Shipment = pacote/carga de um fornecedor. Delivery = ato final de entrega. Processo: order → routing → fulfillment → delivery → returns.
- **Logística Brasil - Terminologia (DiAvanti & BeON)** — https://diavanti.com.br/tipos-de-frete/
  - Indústria brasileira: FRETE = valor pago pelo transporte (pode ser rodoviário, aéreo, etc). VIAGEM = rota/trajeto escolhido. PEDIDO = individual customer order (e-commerce). CARGA FRACIONADA (LTL) vs CARGA COMPLETA (FTL). CIF = vendedor responsável até destino (B2C). FOB = comprador assume risco (B2B).
- **Last-Mile Delivery Orchestration - Upper** — https://www.upperinc.com/blog/last-mile-delivery-orchestration/
  - Workflow padrão: Order Capture → Validation → Assignment (rules: nearest driver, zone, service, capacity) → Optimization → Dispatch → Execution → Tracking → Proof of Delivery. Automação melhora on-time performance 15-20% vs manual. Two-step típico: (1) criar order, (2) assign to vehicle/route.
- **Brazil e-Invoicing: NF-e, DANFE, XML - EDICOM** — https://edicomgroup.com/blog/electronic-invoicing-brazil
  - DANFE = Documento Auxiliar Nota Fiscal Eletrônica (impressão gráfica simplificada). NF-e = nota fiscal eletrônica em XML, assinada digitalmente, enviada à SEFAZ. Importação: sistemas podem extrair XML de emails, importar DANFE. Usado para registrar transações comerciais e controle fiscal. Relevante para lançamento de pedidos com origem em documento fiscal.

---

# github:odoo-erpnext-telas
## Nomenclatura
- Delivery Trip (ERPNext) = Viagem/Manifesto de Entrega — agrupa múltiplas Delivery Notes em 1 veículo/motorista com paradas sequenciadas, cálculo ETA, otimização rota. Equivalente a 'Manifesto de Entregas' ou 'Ordem de Rota' no mercado
- Dispatch (Odoo/mercado) = Despacho — ato de preparar + coordenar envio de bens (order processing, inventory, route planning). No Odoo: é a tela/sistema que agrupa Delivery Orders → Carriers → Batches. NÃO é só a rota, é o agrupamento + alocação
- Shipment (mercado) = Remessa — estado de 'loaded and in transit', contém goods + transporte + tracking + docs. Fase ENTRE dispatch (saiu warehouse) e delivery (chegou cliente)
- Frete (Brasil) = pode significar (1) tarifa de transporte, (2) serviço de transporte, (3) documento (CT-e), (4) viagem. Ambíguo — melhor evitar para tela se quiser clareza
- Despacho (Brasil) = (1) remoção do centro logístico (warehouse saída), (2) agrupamento + alocação a motorista/veículo. O dono quer chamar 2ª etapa de 'despacho' = vinculação pedido a caminhão
- Carrier (Odoo) = método de entrega (delivery method) que encapsula veículo + motorista. Configurado com descrição, placa, produto billing, restrições geográficas
- Batch Transfer (Odoo) = transferência em lote (agrupamento de pickings) alocado a 1 veículo, respeita capacidade, contém loading dock de destino
- Delivery Stop (ERPNext) = parada na viagem, tem cliente + endereço + status (Not Visited/Visited/Not Completed/Completed)
- POD / ePOD = Proof of Delivery (eletrônico) — assinatura digital + foto + GPS + timestamp + código barras por parada, vinculado a driver/stop/rota
- MDF-e (Brasil) = Manifesto Eletrônico Documentos Fiscais — obrigatório transporte interestadual/intermunicipal, agrupa NF-e/CT-e em 1 carga/veículo, transmitido SEFAZ, evento de entrega encerra
- Wave Picking (Odoo) = agrupamento temporário de múltiplas pickings em 'onda' com warehouse keeper, prepara grupo de pedidos para picking coordenado
- Romaneio (Brasil) = lista de notas embarcadas num veículo, documento auxiliar com detalhes de itens/valores, acompanha viagem. Similar a 'packing slip' + manifest
## Fluxos
- ERPNext: Pedido (Sales Order) → Nota de Entrega (Delivery Note) → Viagem (Delivery Trip) — atribui motorista + veículo, puxa endereços, calcula ETA com Google Maps, otimiza rota, lista paradas sequenciadas
- Odoo Stock: Pedido Venda → Nota de Entrega (stock.picking) — estados (Draft → Ready → Done), 3-step (Pick+Pack+Ship) ou 2-step (Pick+Ship), Batch Transfer agrupa pickings, Dispatch Management atribui Carrier (método entrega = veículo + motorista)
- Odoo Dispatch (Despacho): Seleciona múltiplos Delivery Orders → atribui Carrier (veículo) → cria Batch Transfer → valida capacidade (peso+volume) → gera transfers automáticos respeitando limites do veículo
- Odoo Wave Picking (picking_dispatch): agrupa pickings em onda (wave) com warehouse keeper, padrão de short-interval scheduling, possibilita grupar por transporter/tipo-mercadoria/campos customizados
- Brasil Fluxo Transportadora: Coleta (pickup) → Roteirização (route planning) → Despacho (dispatch de centro logístico/warehouse) → Entrega (delivery com POD) → MDF-e (manifesto eletrônico interestadual)
- POD (Prova Entrega): Motorista valida delivery order → clica 'Sign' → captura assinatura digital/foto/GPS/código de barras em um workflow único por parada → sistema vincula tudo (stop, rota, motorista, timestamp)
## Recomendações
- Nomeação tela 2: chamar de 'DESPACHO' (não 'Frete') — alinhado com terminologia Brasil transportadora (despacho = agrupamento+alocação) e mercado ERP (ERPNext=Delivery Trip, Odoo=Dispatch Management). Evita ambiguidade de 'frete' (tarifa/transporte/documento).
- Estrutura Despacho deve ser: (1) Seleciona N Pedidos lançados → (2) Agrupa por Motorista/Veículo (dropdown com histórico do caminhão) → (3) Opção trocar motorista naquele dia (folga) → (4) Valida capacidade simples (se tiver km_inicial/km_final ou peso, checá-lo) → (5) Gera 'Manifesto' (lista paradas, ETA, sequência otimizada)
- Integração Google Maps: implementar cálculo ETA + otimização rota (TSP) como ERPNext faz — requer API Route Optimization (pago) ou fallback gratuito. Recomendado: Google Directions API (grátis até limite diário) com fallback manual sequencing
- POD field-level: adicionar campos no objeto 'Entrega' (ou novo 'EntregaProva'): assinatura_digital (blob), foto_gps (blob + lat/lng), timestamp, motorista_id, parada_sequencia. Integrar com app motorista para captura mobile.
- Fluxo Estados Pedido: considerar estados intermediários (Lançado → Despachado → Em Rota → Entregue) para rastreabilidade cliente. Alinhado com MDF-e (evento de entrega encerra manifestação).
- Capacity Check simples: se sistema não tem peso/volume real, implementar fallback: (1) limite de entregas por motorista (qty padrão), (2) validação km_total < capacidade caminhão, (3) UI warning se exceder 70% capacidade
- Importação em massa recomendada: suportar DANFE XML → extrair dados cliente (CNPJ/nome/endereço) + itens (descrição/valor) → criar Pedido + Entregas automático. Usar tablib ou openpyxl para XLS. Padrão mercado (TOTVS, RoutEasy, etc.)
- Relatório Manifesto: gerar PDF com coluna-checklist para motorista: (1) Nº Pedido, (2) Cliente, (3) Endereço, (4) Itens (descrição/qty), (5) Assinado?, (6) Notas. Similar a 'romaneio' BR + delivery list
- Integração MDF-e futura: se multi-state, criar tabela manifesto (1:N com pedidos despachados), guardar chave MDF-e, evento encerramento ao fecho viagem. Não obrigatório MVP, mas deixar schema preparado
- Motorista Change on Day: permitir sobrescrita em tela Despacho (dropdown motoristas + checkbox 'substituir'), auditar quem/quando mudou, guardar motorista_original vs. motorista_atual em Pedido (ou tabela auditoria_transferencia como você já tem)
## Fontes
- **ERPNext Delivery Trip Documentation (Frappe Docs)** — https://docs.frappe.io/erpnext/delivery-trip
  - Doctype Delivery Trip: agrupa Customer Deliveries em 1 veículo/motorista. Campos: Driver, Vehicle, Date, Departure Date/Time, Delivery Stops (customer+address). Puxa stops de Delivery Notes. Calcula ETA com Google Maps se endereços setados. Otimiza rota com Google Route Optimization API.
- **ERPNext Google Maps Integration** — https://docs.frappe.io/erpnext/user/manual/en/google-maps
  - Integração Google Maps: calcula ETA entre paradas, otimiza ordem das paradas (TSP/VRP), armazena distâncias retornadas, suporta Route Optimization API. Requer API key Google ativa em ERPNext Settings.
- **Odoo Dispatch Management System (v18/19)** — https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/shipping_receiving/setup_configuration/dispatch.html
  - Sistema built-in Odoo Inventory: agrupa Delivery Orders por Carrier (vehicle via delivery method). Workflow: seleciona orders → atribui Carrier → cria Batch Transfer → valida peso/volume vs. capacidade veículo (definida em Fleet Categories). Map button mostra rotas em Google Maps.
- **Odoo Three-Step Delivery (Pick+Pack+Ship)** — https://www.odoo.com/documentation/19.0/applications/inventory_and_mrp/inventory/shipping_receiving/daily_operations/delivery_three_steps.html
  - Workflow Odoo: cria 3 stock.pickings automáticos (PICK, PACK, OUT). Cada picking tem states (Draft→Ready→Done). Para delivery, usa stock.picking.batch com operator atribuído. Delivery Orders são stock.picking com origem warehouse saída.
- **OCA stock_fleet_delivery_driver (delivery-carrier repo)** — https://github.com/OCA/delivery-carrier/tree/16.0/delivery_driver_stock_picking_batch
  - Módulo Odoo alpha que estende delivery/batch: permite selecionar Vehicle padrão em Carriers, propaga driver para Batch automaticamente. Campos: vehicle em carrier, driver em transfer. Requer feature flag Batch Transfer ativa.
- **OCA picking_dispatch (stock-logistics-workflow)** — https://github.com/OCA/stock-logistics-workflow/tree/8.0/picking_dispatch
  - Módulo wave picking Odoo: agrupa múltiplas pickings em 'dispatch order' (picking wave) com warehouse keeper atribuído. Usa short-interval scheduling. Flexível: agrupa por transporter, tipo mercadoria, campos customizados (com stock_picking_to_batch_group_fields).
- **Terminology: Dispatch vs Shipment vs Delivery Trip** — https://www.clappia.com/blog/navigating-logistics-understanding-the-difference-between-dispatch-and-shipment
  - Dispatch = fase de preparação (warehouse saída, alocação recurso), Shipment = estado em trânsito (loaded), Delivery = entregue/recebido. Delivery Trip = rota física com paradas sequenciadas (ERPNext).
- **Brasil: Roteirização de Entregas (Senior/TOTVS/Meu Rastreio)** — https://www.senior.com.br/blog/o-que-e-roteirizacao-de-entregas-e-principais-beneficios
  - Roteirização BR = planejar+otimizar rotas motoristas. Considera: localização, volume, prazos, trânsito, capacidade veículo. Tipos: estática (rota fixa) vs. dinâmica (atualiza real-time). Plataformas: RoutEasy, TOTVS Roteirizador, Senior, Loggi.
- **Brasil: MDF-e (Manifesto Eletrônico) e Fluxo Transportadora** — https://bsoft.com.br/blog/mdfe
  - MDF-e obrigatório transporte interestadual/intermunicipal: agrupa NF-e/CT-e em 1 carga/veículo, transmitido SEFAZ, requer evento encerramento pós-entrega. Fluxo: Coleta → Roteirização → Despacho → Entrega → MDF-e + evento.
- **ePOD / Proof of Delivery Workflow** — https://www.upperinc.com/blog/how-to-collect-electronic-proof-of-delivery/
  - ePOD standard: motorista check-in GPS → entrega bens → captura prova (assinatura/foto/scan barcode) + notas exceção → tudo vinculado (stop, rota, motorista, timestamp). Integra com ERP para reduzir manual entry.
- **Odoo Delivery Order Signature (v16+)** — https://www.cybrosys.com/blog/how-to-enable-and-use-delivery-order-signatures-in-odoo-19
  - Delivery Order signature: após validado, status 'Done', botão 'Sign' abre pop-up → captura assinatura digital (3 modos: Auto/Manual/Canvas). Confirma recebimento cliente. Integra com Sales Order para confirmação de pedido.

---

# github:courier-dispatch
## Nomenclatura
- Pedido (Order) = unidade de faturamento criada por um cliente ou sistema (com ou sem cliente cadastrado)
- Entrega (Delivery/Stop) = parada individual dentro de um pedido, com endereço, destinatário e possíveis itens
- Frete = serviço de transporte de carga, responsabilidade de transportar produtos de A para B (contrato de transporte)
- Viagem (Trip/Route) = agrupamento de múltiplas entregas atribuídas a UM veículo e UM motorista em um dia
- Despacho (Dispatch) = ato de liberar/enviar uma viagem para o motorista; marca o início da execução operacional
- Job (VROOM) = entrega ou pickup individual com localização, duração de serviço e constraints (janelas de tempo, skills, capacidade)
- Shipment (VROOM/Karrio) = par coleta+entrega que devem ocorrer na mesma rota
- Trip/Route = resultado da otimização: sequência de jobs/shipments agrupados em um veículo com duração total e distância
- Status padrão: Unassigned → Assigned → Pending Pickup → Dispatched → In Transit → Delivered
- Motorista = driver/rider; pode ter múltiplas frotas/empresas (transferência entre empresas possível em Fleetbase)
- Romaneio = lista de notas/pedidos embarcados num veículo (documento de controle operacional)
## Fluxos
- Fleetbase: INPUT (pedido/ordem criado) → PLANNING (atribuir a motorista/veículo) → EXECUTION (despacho, navegação) → MONITORING (rastreamento) → ANALYSIS (relatórios)
- Karrio: ORDER CREATION (sincronizar pedido ERP) → SHIPMENT CREATION (criar envio) → LABEL GENERATION (imprimir etiqueta) → TRACKING (monitorar entrega)
- VROOM (Roteirizador): JSON INPUT (jobs/shipments/vehicles) → OPTIMIZATION ENGINE → ROUTE OUTPUT (entregas agrupadas por veículo, sequência otimizada)
- Padrão de Delivery Management: UNASSIGNED (novo) → ASSIGNED (atribuído a motorista/veículo) → PENDING PICKUP (motorista notificado) → DISPATCHED/IN TRANSIT (viagem em curso) → DELIVERED (entrega confirmada)
- Importação em Massa: CSV/Excel/XML (ShipWorks, SKUpreme) → Parse → Criar múltiplos orders via API → Sistema gera tracking
- Troca de Motorista: DRAG-DROP reassignment em interface → Update instantâneo na rota do motorista → Notificação via app mobile (Upper, DispatchTrack, Wise Systems)
## Recomendações
- TELA 1 - Lançamento de Pedidos: Criar formulário SIMPLES (cliente, valor, endereço de entrega, itens/notas). Permitir 'cliente avulso' (sem cadastro). Adicionar botão IMPORTAR COM MASSA (CSV/Excel/XML com parser de DANFE/NFe). Guardar pedido em status UNASSIGNED.
- TELA 2 - Despacho (Trip Assignment): Listagem de pedidos UNASSIGNED → Seletor de VEÍCULO (carrega motorista padrão) → Permite TROCAR MOTORISTA antes de confirmar → Status muda para ASSIGNED. Suporta REASSIGNMENT pós-dispatch se necessário.
- Nomenclatura recomendada: Renomear 'Viagens' para 'PEDIDOS' (pré-despacho) e 'Fretes' para 'VIAGENS' (pós-despacho, agrupamentos atribuídos). Ou usar TRIP para a execução (mais neutro internacionalmente).
- Fluxo de status no backend: UNASSIGNED (criado) → ASSIGNED (atribuído a veículo) → PENDING_DISPATCH (aguardando liberação) → DISPATCHED (enviado ao motorista) → IN_TRANSIT (em execução) → DELIVERED (entregue). Cada transição é uma ação no UI.
- Integração com roteirizador (VROOM/OSRM): Após atribuição, enviar trip (N pedidos + 1 motorista) ao VROOM. Retorna sequência otimizada de entregas. Guardar resultado em tabela TRIPS com status da rota.
- Importação em massa: Suportar CSV (padrão ShipWorks/SKUpreme: id, cliente, valor, endereço). Opcional: parser de PDF/XML de DANFE (bibliotecas pt-BR como 'nfce-reader'). Cada linha = novo pedido UNASSIGNED.
- Motorista: Permitir atribuição + REATRIBUIÇÃO (drag-drop ou seletor). Status de motorista (disponível/folga/viajando) guia oferecimento em tempo real. Não travar por empresa_id se motorista é transferível.
- Campos mínimos de Pedido (baseado em VROOM + Karrio): id, cliente (opt.), endereço (rua, num, bairro, cidade, CEP), itens/notas (lista simples), valor, data de criação, status. Opcional: janela de tempo de entrega, prioridade.
- Campos mínimos de Viagem/Trip: id, motorista_id, veiculo_id, data, lista_pedidos[], status, hora_saída (opt.), hora_retorno (opt.), sequência_otimizada (se usar VROOM).
- API: Criar endpoint POST /pedidos (criar), GET /pedidos?status=UNASSIGNED (listar), PATCH /pedidos/{id}/assinar-viagem (mudar status + atribuir trip), POST /pedidos/importar (bulk via CSV).
## Fontes
- **Fleetbase GitHub Repository** — https://github.com/fleetbase/fleetbase
  - Plataforma open-source modular de logística (LSOS) com modules FleetOps, Storefront, Ledger. Suporta dispatch em real-time, otimização de rotas, rastreamento de frota. Usa API REST, WebSockets, webhooks. Permite customização completa de campos e workflows.
- **VROOM Project - GitHub** — https://github.com/VROOM-Project/vroom
  - Motor open-source de otimização de rotas (C++20) que resolve VRP complexos em milissegundos. Integra com OSRM/OpenRouteService. Modela jobs (entregas), shipments (coleta+entrega), vehicles com capacidades, skills, time windows. JSON input/output estruturado.
- **VROOM API Documentation** — https://github.com/VROOM-Project/vroom/blob/master/docs/API.md
  - Especificação completa de estrutura JSON para VROOM: jobs (id, location, service time, amount, skills, time_windows), vehicles (id, start/end, capacity, costs), shipments (pickup+delivery steps). Define constraints de otimização.
- **Karrio Documentation - Orders** — https://docs.karrio.io/product/orders/
  - Karrio sincroniza pedidos (read-only) de ERP/WMS/OMS via API, CSV, webhooks. Pedido tem order_id, shipping_to (endereço), line_items. Shipments são criados a partir de pedidos. Status: pending → fulfilled (após compra de label).
- **Karrio Documentation - Main** — https://docs.karrio.io/
  - Plataforma open-source de labels de envio multi-carrier. Fluxo: Order → Shipment → Label Generation → Tracking. Integra com carriers, gera manifests, packing slips. API-first, multi-carrier.
- **Fleet Management Workflow Guide - UpperInc** — https://www.upperinc.com/blog/fleet-management-workflow/
  - Workflow padrão da indústria em 5 etapas: INPUT (pedidos/requisições) → PLANNING (distribuição, otimização) → EXECUTION (despacho, navegação, POD) → MONITORING (rastreamento real-time) → ANALYSIS (relatórios, melhoria contínua).
- **Dispatch Workflow & Status - DispatchIt** — https://support.dispatchit.com/en/articles/8654613-delivery-workflow-and-status
  - Status padrão: Unassigned → Assigned (após adicionar a veículo) → Pending Pickup (rota enviada ao motorista) → Dispatched → In Transit → Delivered. Suporta mudanças dinâmicas de motorista.
- **Driver Dispatch & Reassignment - Lunchbox** — https://support.lunchbox.io/en/articles/8684408-delivery-dispatch-manually-assigning-drivers
  - Sistemas modernos permitem reassignment de motorista via drag-drop antes/depois de dispatch. Mudanças são instantâneas no app do motorista. Upper, DispatchTrack, Wise Systems suportam reatribuição dinâmica.
- **Bulk Order Import - ShipWorks** — https://www.shipworks.com/integrations/excel-csv-text/
  - ShipWorks importa pedidos via CSV, XML, Excel, TXT. Cada linha = pedido. Suporta ponto e clique. SKUpreme, MerchOne também oferecem CSV import com criação em massa.
- **Logística vs Frete - Everlog** — https://everlogbrasil.com.br/diferencas-entre-frete-e-logistica/
  - No Brasil: FRETE = serviço de transporte (coleta A→B). LOGÍSTICA = ecossistema maior (transporte, armazenagem, embalagem, segurança). Transportadora = empresa que executa o frete. Viagem = execução de um frete com motorista específico.

