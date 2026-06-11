-- SEED: regras — as 18 regras do bot do zap (gatilhos, frases de treino, negativas, escopo/matriz, leitores dedicados)
-- Gerado da produção em 2026-06-11 (18 linhas).
-- Idempotente: ON CONFLICT (id) DO NOTHING — rode quantas vezes quiser.

INSERT INTO public.regras
SELECT * FROM json_populate_recordset(null::public.regras, $json$
[
 {
  "id": "632ec4b4-0b53-4fa3-97a0-c7c9f1a9b891",
  "nome": "Lembrete / Anotar",
  "tipo": "anotar",
  "ativa": true,
  "prioridade": 1000,
  "frases_exemplo": [
   "anota aí que fechei o contrato",
   "me lembra de pagar o fornecedor amanhã",
   "cria um lembrete pra ligar pro cliente",
   "guarda essa nota: comprar pneu",
   "não esquece de revisar o caminhão",
   "lembrete: buscar documento no cartório"
  ],
  "frases_negativas": [
   "nota fiscal",
   "número da nota"
  ],
  "empresas_alvo": [],
  "quem_pode_disparar": [
   "qualquer"
  ],
  "resposta": null,
  "campos": [],
  "escopo_dados": {},
  "exige_confirmacao": false,
  "observacao": "Regra fixa: representa o comportamento de anotar lembrete. Edite os gatilhos/frases aqui.",
  "versao": 1,
  "criado_em": "2026-06-05T16:53:39.998068+00:00",
  "atualizado_em": "2026-06-05T17:13:15.277+00:00",
  "gatilhos": [
   "anota",
   "anote",
   "anotar",
   "lembrete",
   "me lembra",
   "me lembre",
   "lembra",
   "guarda",
   "guardar",
   "não esquece",
   "não esquece de",
   "aviso",
   "nota"
  ],
  "fixa": true,
  "acoes": [],
  "gatilho_inicio": true
 },
 {
  "id": "e90c1ba2-dfae-4767-ad53-6438ea958847",
  "nome": "Mudar Status do Veículo",
  "tipo": "registrar",
  "ativa": true,
  "prioridade": 50,
  "frases_exemplo": [
   "coloca o leão em manutenção",
   "põe o touro na oficina",
   "manda o tigre pra oficina",
   "deixa o leão parado",
   "encosta o touro",
   "tira o ABC1234 de circulação",
   "ô, bota o leão em manutenção pra mim",
   "o touro vai ficar parado essa semana"
  ],
  "frases_negativas": [
   "tem caminhão em manutenção?",
   "quais caminhões estão parados",
   "qual a próxima manutenção do leão",
   "quanto gastei de manutenção"
  ],
  "empresas_alvo": [],
  "quem_pode_disparar": [
   "qualquer"
  ],
  "resposta": null,
  "campos": [],
  "escopo_dados": {
   "colunas": {
    "alocacoes": {
     "status": [
      "alterar"
     ]
    }
   },
   "confirmar": true,
   "status_validos": [
    "manutencao",
    "parado"
   ]
  },
  "exige_confirmacao": true,
  "observacao": "EXECUTA de verdade desde 11/06/2026: propõe→confirma e muda via alocações (fecha a aberta com fim+km_fim, abre nova com o status — igual ao painel). Aceita manutenção/parado; voltar a rodar = painel (precisa do motorista).",
  "versao": 1,
  "criado_em": "2026-06-05T19:49:56.939646+00:00",
  "atualizado_em": "2026-06-05T19:49:56.939646+00:00",
  "gatilhos": [
   "põe em manutenção",
   "coloca em manutenção",
   "manda pra oficina",
   "deixa parado",
   "encosta o",
   "tira de circulação"
  ],
  "fixa": false,
  "acoes": [
   "alterar"
  ],
  "gatilho_inicio": false
 },
 {
  "id": "806d1177-2a57-47a3-b5d5-5159e72447b7",
  "nome": "KM Gestor",
  "tipo": "registrar",
  "ativa": true,
  "prioridade": 50,
  "frases_exemplo": [
   "qual a quilometragem do caminhão touro",
   "altere a quilometragem do touro para 200000",
   "muda o km do ABC1234 pra 89000"
  ],
  "frases_negativas": [
   "qual o km do meu caminhão",
   "atualiza meu km",
   "meu km tá em 152000"
  ],
  "empresas_alvo": [],
  "quem_pode_disparar": [
   "qualquer"
  ],
  "resposta": null,
  "campos": [],
  "escopo_dados": {
   "acoes": [
    "consultar",
    "atualizar"
   ],
   "escopo": "todos_caminhoes",
   "tabela": "veiculos",
   "colunas": {
    "veiculos": {
     "placa": [
      "consultar"
     ],
     "apelido": [
      "consultar"
     ],
     "km_atual": [
      "consultar",
      "alterar"
     ]
    }
   },
   "campo_km": "km_atual",
   "grava_em": "km_logs",
   "confirmar": true,
   "validacao": {
    "km_nao_decresce": true
   },
   "desambiguar": "listar_caminhoes_numerado"
  },
  "exige_confirmacao": true,
  "observacao": "Gestor: consulta/atualiza KM de QUALQUER caminhão. Se não identificar o caminhão, lista (nº, placa, apelido, km) p/ escolher. Mostra KM atual e confirma antes de gravar. KM novo nunca menor.",
  "versao": 1,
  "criado_em": "2026-06-05T19:10:52.028569+00:00",
  "atualizado_em": "2026-06-05T19:10:52.028569+00:00",
  "gatilhos": [
   "km do",
   "quilometragem do",
   "altera o km",
   "atualiza o km do caminhão",
   "muda o km"
  ],
  "fixa": false,
  "acoes": [
   "consultar",
   "alterar"
  ],
  "gatilho_inicio": false
 },
 {
  "id": "78fcf969-528d-42a9-b213-e59e1ef70acc",
  "nome": "KM Motorista",
  "tipo": "registrar",
  "ativa": true,
  "prioridade": 50,
  "frases_exemplo": [
   "qual o km do meu caminhão",
   "meu km tá em 152000",
   "atualiza o km pra 153000",
   "quanto de km meu caminhão",
   "meu hodômetro marca 154200"
  ],
  "frases_negativas": [
   "km do touro",
   "quilometragem do leão",
   "altera o km do ABC1234"
  ],
  "empresas_alvo": [],
  "quem_pode_disparar": [
   "qualquer"
  ],
  "resposta": null,
  "campos": [],
  "escopo_dados": {
   "acoes": [
    "consultar",
    "atualizar"
   ],
   "escopo": "proprio_caminhao",
   "tabela": "veiculos",
   "colunas": {
    "veiculos": {
     "placa": [
      "consultar"
     ],
     "apelido": [
      "consultar"
     ],
     "km_atual": [
      "consultar",
      "alterar"
     ]
    }
   },
   "campo_km": "km_atual",
   "grava_em": "km_logs",
   "validacao": {
    "km_nao_decresce": true
   },
   "requer_caminhao_alocado": true
  },
  "exige_confirmacao": true,
  "observacao": "Motorista: consulta/atualiza o KM do caminhão alocado a ele. Gatilhos genéricos ('km', 'quilometragem', 'meu caminhão') removidos 11/06/2026 — colidiam com KM Gestor; negativas apontam pro gestor quando o caminhão é nomeado.",
  "versao": 1,
  "criado_em": "2026-06-05T19:10:51.883489+00:00",
  "atualizado_em": "2026-06-05T19:10:51.883489+00:00",
  "gatilhos": [
   "meu km",
   "qual meu km",
   "atualiza meu km",
   "meu hodômetro",
   "km do meu caminhão"
  ],
  "fixa": false,
  "acoes": [
   "consultar",
   "alterar"
  ],
  "gatilho_inicio": false
 },
 {
  "id": "d20f6e0c-267d-45eb-805a-0e54607f5f72",
  "nome": "Onde Está o Caminhão",
  "tipo": "consultar",
  "ativa": true,
  "prioridade": 45,
  "frases_exemplo": [
   "onde está o leão?",
   "cadê o touro",
   "por onde anda o tigre",
   "onde tá o caminhão do zé",
   "ô, me diz por onde o leão tá andando"
  ],
  "frases_negativas": [
   "quem está com o leão",
   "o leão já saiu",
   "como tá a rota",
   "onde fica o galpão"
  ],
  "empresas_alvo": [],
  "quem_pode_disparar": [
   "qualquer"
  ],
  "resposta": null,
  "campos": [],
  "escopo_dados": {
   "colunas": {
    "clientes": {
     "nome_fantasia": [
      "consultar"
     ]
    },
    "entregas": {
     "destino": [
      "consultar"
     ],
     "data_fim": [
      "consultar"
     ]
    },
    "veiculos": {
     "placa": [
      "consultar"
     ],
     "apelido": [
      "consultar"
     ]
    }
   },
   "consulta_dedicada": "onde_esta"
  },
  "exige_confirmacao": false,
  "observacao": "GESTOR LEIGO fase 1 (sem GPS): posição aproximada = última entrega concluída (hora + cliente) + quantas faltam, com ressalva na resposta. Fase 2: rastreador terceirizado via token responde posição real SEM mudar a regra. Leitor dedicado onde_esta. ATIVAR só após o deploy de 11/06.",
  "versao": 1,
  "criado_em": "2026-06-11T05:11:03.566265+00:00",
  "atualizado_em": "2026-06-11T05:11:03.566265+00:00",
  "gatilhos": [
   "onde está",
   "onde tá",
   "cadê o",
   "por onde anda"
  ],
  "fixa": false,
  "acoes": [
   "consultar"
  ],
  "gatilho_inicio": false
 },
 {
  "id": "908568dc-63aa-4400-a343-5082a0895bd3",
  "nome": "Vencimentos (docs e revisões)",
  "tipo": "consultar",
  "ativa": true,
  "prioridade": 45,
  "frases_exemplo": [
   "tem documento vencendo?",
   "quando vence o ipva do leão",
   "a cnh do zé tá em dia?",
   "o que vence esse mês",
   "ô, me diz se tem seguro pra renovar",
   "licenciamento de algum caminhão tá vencido?"
  ],
  "frases_negativas": [
   "qual a categoria da cnh do zé",
   "qual a próxima manutenção do leão",
   "quanto paguei de ipva"
  ],
  "empresas_alvo": [],
  "quem_pode_disparar": [
   "qualquer"
  ],
  "resposta": null,
  "campos": [],
  "escopo_dados": {
   "colunas": {
    "veiculos": {
     "placa": [
      "consultar"
     ],
     "apelido": [
      "consultar"
     ],
     "km_atual": [
      "consultar"
     ],
     "ipva_vencimento": [
      "consultar"
     ],
     "km_proxima_revisao": [
      "consultar"
     ]
    },
    "motoristas": {
     "nome": [
      "consultar"
     ],
     "cnh_validade": [
      "consultar"
     ]
    }
   },
   "consulta_dedicada": "vencimentos"
  },
  "exige_confirmacao": false,
  "observacao": "GESTOR LEIGO: tudo que vence em 30 dias — IPVA, licenciamento, seguro, revisão (data e km) e CNH dos motoristas; vencido = 🔴. Leitor dedicado vencimentos. É o gêmeo de consulta do futuro cron de alertas. ATIVAR só após o deploy de 11/06.",
  "versao": 1,
  "criado_em": "2026-06-11T05:11:03.429183+00:00",
  "atualizado_em": "2026-06-11T05:11:03.429183+00:00",
  "gatilhos": [
   "documento vencendo",
   "ipva",
   "licenciamento",
   "seguro do",
   "cnh do",
   "o que vence",
   "vencimento"
  ],
  "fixa": false,
  "acoes": [
   "consultar"
  ],
  "gatilho_inicio": false
 },
 {
  "id": "effa1896-6531-4a3d-9d43-284aeaafa304",
  "nome": "Pedidos em Aberto",
  "tipo": "consultar",
  "ativa": true,
  "prioridade": 45,
  "frases_exemplo": [
   "tem pedido parado?",
   "quais pedidos em aberto",
   "o que tem pra despachar hoje",
   "tem pedido esperando?",
   "ô, me diz se ficou pedido sem despachar",
   "quantos pedidos entraram hoje"
  ],
  "frases_negativas": [
   "anota um pedido",
   "fechei um negócio agora",
   "entregou tudo hoje",
   "cria um pedido novo"
  ],
  "empresas_alvo": [],
  "quem_pode_disparar": [
   "qualquer"
  ],
  "resposta": null,
  "campos": [],
  "escopo_dados": {
   "colunas": {
    "pedidos": {
     "status": [
      "consultar"
     ]
    },
    "clientes": {
     "nome_fantasia": [
      "consultar"
     ]
    }
   },
   "consulta_dedicada": "pedidos_abertos"
  },
  "exige_confirmacao": false,
  "observacao": "GESTOR LEIGO: pedidos agendados (pra despachar) com número e cliente + quantos em andamento. Leitor dedicado pedidos_abertos. ATIVAR só após o deploy de 11/06.",
  "versao": 1,
  "criado_em": "2026-06-11T05:11:03.175807+00:00",
  "atualizado_em": "2026-06-11T05:11:03.175807+00:00",
  "gatilhos": [
   "pedido parado",
   "pedidos em aberto",
   "o que tem pra despachar",
   "pedidos de hoje",
   "tem pedido aberto"
  ],
  "fixa": false,
  "acoes": [
   "consultar"
  ],
  "gatilho_inicio": false
 },
 {
  "id": "6482bccf-c518-480a-be9a-6e82d62de66b",
  "nome": "Resumo do Dia",
  "tipo": "consultar",
  "ativa": true,
  "prioridade": 45,
  "frases_exemplo": [
   "resumo",
   "como foi o dia?",
   "como estamos hoje",
   "me dá a situação geral",
   "ô, me conta como tá tudo aí",
   "resumo do dia por favor"
  ],
  "frases_negativas": [
   "status da frota",
   "quais caminhões estão parados",
   "entregou tudo hoje",
   "resumo do pedido 128"
  ],
  "empresas_alvo": [],
  "quem_pode_disparar": [
   "qualquer"
  ],
  "resposta": null,
  "campos": [],
  "escopo_dados": {
   "colunas": {
    "avarias": {
     "status": [
      "consultar"
     ],
     "urgencia": [
      "consultar"
     ]
    },
    "pedidos": {
     "status": [
      "consultar"
     ]
    },
    "entregas": {
     "status": [
      "consultar"
     ]
    },
    "alocacoes": {
     "status": [
      "consultar"
     ]
    },
    "abastecimentos": {
     "valor_total": [
      "consultar"
     ]
    }
   },
   "consulta_dedicada": "resumo_dia"
  },
  "exige_confirmacao": false,
  "observacao": "GESTOR LEIGO: a foto do dia numa mensagem — frota (rodando/manutenção/parados), entregas feitas×pendentes, pedidos novos/em andamento, avarias abertas, diesel do dia. Leitor dedicado resumo_dia. ATIVAR só após o deploy de 11/06.",
  "versao": 1,
  "criado_em": "2026-06-11T05:11:03.320908+00:00",
  "atualizado_em": "2026-06-11T05:11:03.320908+00:00",
  "gatilhos": [
   "resumo",
   "como foi o dia",
   "como estamos",
   "situação geral",
   "resumo do dia"
  ],
  "fixa": false,
  "acoes": [
   "consultar"
  ],
  "gatilho_inicio": false
 },
 {
  "id": "ddda5fd0-f624-4c35-b900-0d6da808cd1d",
  "nome": "Meus Lembretes (consultar)",
  "tipo": "consultar",
  "ativa": true,
  "prioridade": 45,
  "frases_exemplo": [
   "o que eu te falei pra anotar?",
   "lê meus lembretes",
   "o que tem anotado aí",
   "minhas anotações pendentes",
   "ô, me lê o que eu anotei ontem",
   "quais lembretes ainda estão abertos"
  ],
  "frases_negativas": [
   "anota aí que fechei o contrato",
   "me lembra de pagar o fornecedor",
   "lembrete: buscar documento",
   "guarda essa nota"
  ],
  "empresas_alvo": [],
  "quem_pode_disparar": [
   "qualquer"
  ],
  "resposta": null,
  "campos": [],
  "escopo_dados": {
   "colunas": {
    "lembretes": {
     "texto": [
      "consultar"
     ],
     "ciente_em": [
      "consultar"
     ],
     "criado_por_nome": [
      "consultar"
     ]
    }
   },
   "consulta_dedicada": "meus_lembretes"
  },
  "exige_confirmacao": false,
  "observacao": "GESTOR LEIGO: lê as últimas 5 anotações pendentes (ciente_em IS NULL, sem trava de empresa — decisão do dono). CRIAR lembrete continua na regra fixa Lembrete/Anotar (negativas protegem). Leitor dedicado meus_lembretes. ATIVAR só após o deploy de 11/06.",
  "versao": 1,
  "criado_em": "2026-06-11T05:11:03.684085+00:00",
  "atualizado_em": "2026-06-11T05:11:03.684085+00:00",
  "gatilhos": [
   "meus lembretes",
   "o que tem anotado",
   "o que anotei",
   "lê os lembretes",
   "minhas anotações"
  ],
  "fixa": false,
  "acoes": [
   "consultar"
  ],
  "gatilho_inicio": false
 },
 {
  "id": "17cf893d-b40d-4e7b-9b79-0859e2d2ff9a",
  "nome": "Andamento das Rotas",
  "tipo": "consultar",
  "ativa": true,
  "prioridade": 45,
  "frases_exemplo": [
   "o leão já saiu?",
   "o zé já começou a rota?",
   "como tá a rota do touro",
   "já fez alguma entrega hoje?",
   "andamento das rotas",
   "ô, me diz se o leão já saiu pra entrega",
   "quantas entregas o zé já fez",
   "o tigre tá andando na rota?"
  ],
  "frases_negativas": [
   "quem está com o leão",
   "caminhão parado",
   "onde está o leão",
   "cadê o leão",
   "entregou tudo hoje"
  ],
  "empresas_alvo": [],
  "quem_pode_disparar": [
   "qualquer"
  ],
  "resposta": null,
  "campos": [],
  "escopo_dados": {
   "colunas": {
    "veiculos": {
     "placa": [
      "consultar"
     ],
     "apelido": [
      "consultar"
     ]
    },
    "motoristas": {
     "nome": [
      "consultar"
     ]
    }
   },
   "consulta_dedicada": "andamento_rotas"
  },
  "exige_confirmacao": false,
  "observacao": "GESTOR LEIGO: rota de hoje por caminhão/motorista — saiu? quantas entregas de quantas, última às HH:MM. Leitor dedicado andamento_rotas (rotas_otimizadas+paradas+alocações). ATIVAR só após o deploy de 11/06.",
  "versao": 1,
  "criado_em": "2026-06-11T05:11:02.822208+00:00",
  "atualizado_em": "2026-06-11T05:11:02.822208+00:00",
  "gatilhos": [
   "já saiu",
   "começou a rota",
   "iniciou a rota",
   "como tá a rota",
   "andamento da rota",
   "já fez entrega",
   "saiu pra entrega"
  ],
  "fixa": false,
  "acoes": [
   "consultar"
  ],
  "gatilho_inicio": false
 },
 {
  "id": "33eef9c2-aedb-47a6-abad-095b7abf9ab6",
  "nome": "Status da Frota",
  "tipo": "consultar",
  "ativa": true,
  "prioridade": 45,
  "frases_exemplo": [
   "quais caminhões estão parados",
   "tem caminhão em manutenção?",
   "quem está com o leão",
   "quem tá com o touro hoje",
   "como está a frota",
   "situação dos caminhões",
   "ô, me diz quais caminhões tão rodando",
   "o tigre tá parado ou tá rodando?"
  ],
  "frases_negativas": [
   "põe o leão em manutenção",
   "coloca o touro em manutenção",
   "manda pra oficina",
   "deixa o caminhão parado",
   "tira o tigre de circulação"
  ],
  "empresas_alvo": [],
  "quem_pode_disparar": [
   "qualquer"
  ],
  "resposta": null,
  "campos": [],
  "escopo_dados": {
   "colunas": {
    "veiculos": {
     "placa": [
      "consultar"
     ],
     "apelido": [
      "consultar"
     ]
    },
    "alocacoes": {
     "status": [
      "consultar"
     ]
    },
    "motoristas": {
     "nome": [
      "consultar"
     ]
    }
   }
  },
  "exige_confirmacao": false,
  "observacao": "Status REAL da frota: alocação aberta (fim IS NULL) por veículo + nome do motorista quando operacional. Executor usa consulta dedicada (consultarStatusFrota) — corrigida 11/06/2026; antes listava placas sem status. Só leitura.",
  "versao": 1,
  "criado_em": "2026-06-05T19:49:56.939646+00:00",
  "atualizado_em": "2026-06-05T19:49:56.939646+00:00",
  "gatilhos": [
   "status da frota",
   "como está a frota",
   "caminhão parado",
   "caminhões parados",
   "quem está com",
   "quem tá com",
   "situação dos caminhões"
  ],
  "fixa": false,
  "acoes": [
   "consultar"
  ],
  "gatilho_inicio": false
 },
 {
  "id": "3da9e910-e898-4a82-a652-24bdc5f93f78",
  "nome": "Entregas do Dia",
  "tipo": "consultar",
  "ativa": true,
  "prioridade": 45,
  "frases_exemplo": [
   "entregou tudo hoje?",
   "o que falta entregar",
   "quantas entregas fizemos hoje",
   "tem entrega pendente?",
   "ô, me diz o que ainda falta entregar hoje",
   "as entregas de hoje saíram todas?"
  ],
  "frases_negativas": [
   "o leão já saiu",
   "como tá a rota do zé",
   "onde está o caminhão",
   "quantas entregas o zé já fez"
  ],
  "empresas_alvo": [],
  "quem_pode_disparar": [
   "qualquer"
  ],
  "resposta": null,
  "campos": [],
  "escopo_dados": {
   "colunas": {
    "clientes": {
     "nome_fantasia": [
      "consultar"
     ]
    },
    "entregas": {
     "status": [
      "consultar"
     ],
     "destino": [
      "consultar"
     ],
     "data_fim": [
      "consultar"
     ],
     "nome_cliente_avulso": [
      "consultar"
     ]
    }
   },
   "consulta_dedicada": "entregas_dia"
  },
  "exige_confirmacao": false,
  "observacao": "GESTOR LEIGO: feitas hoje × pendentes, com nome do cliente. Leitor dedicado entregas_dia. ATIVAR só após o deploy de 11/06.",
  "versao": 1,
  "criado_em": "2026-06-11T05:11:03.043216+00:00",
  "atualizado_em": "2026-06-11T05:11:03.043216+00:00",
  "gatilhos": [
   "entregou tudo",
   "falta entregar",
   "entregas de hoje",
   "quantas entregas hoje",
   "o que falta entregar"
  ],
  "fixa": false,
  "acoes": [
   "consultar"
  ],
  "gatilho_inicio": false
 },
 {
  "id": "09e70402-3482-4883-b955-a9cd98ba7e03",
  "nome": "Consultar Veículos",
  "tipo": "consultar",
  "ativa": true,
  "prioridade": 40,
  "frases_exemplo": [
   "quantos caminhões eu tenho",
   "quais são meus veículos",
   "qual a placa do leão",
   "me passa a lista de caminhões",
   "qual o km atual do touro",
   "ô, que caminhões nós temos aí",
   "qual o modelo do leão",
   "dados do tigre"
  ],
  "frases_negativas": [
   "quais caminhões estão parados",
   "quem está com o leão",
   "põe o leão em manutenção",
   "cadastra um caminhão novo"
  ],
  "empresas_alvo": [],
  "quem_pode_disparar": [
   "qualquer"
  ],
  "resposta": null,
  "campos": [],
  "escopo_dados": {
   "acoes": [
    "consultar"
   ],
   "escopo": "todos",
   "tabela": "veiculos",
   "colunas": {
    "veiculos": {
     "ano": [
      "consultar"
     ],
     "marca": [
      "consultar"
     ],
     "placa": [
      "consultar"
     ],
     "modelo": [
      "consultar"
     ],
     "apelido": [
      "consultar"
     ],
     "km_atual": [
      "consultar"
     ]
    }
   }
  },
  "exige_confirmacao": false,
  "observacao": "Lista a frota: placa, apelido, marca, modelo, km. Só leitura. Enriquecida 11/06/2026 (frases de áudio + negativas pra não roubar de Status da Frota / Mudar Status).",
  "versao": 1,
  "criado_em": "2026-06-05T19:49:56.939646+00:00",
  "atualizado_em": "2026-06-05T19:49:56.939646+00:00",
  "gatilhos": [
   "quantos caminhões",
   "quais veículos",
   "minha frota",
   "lista de caminhões",
   "qual a placa do",
   "que caminhões eu tenho"
  ],
  "fixa": false,
  "acoes": [
   "consultar"
  ],
  "gatilho_inicio": false
 },
 {
  "id": "3149d9b5-a315-46b9-9b4d-caf6bd0e3eaf",
  "nome": "Consultar Motoristas",
  "tipo": "consultar",
  "ativa": true,
  "prioridade": 40,
  "frases_exemplo": [
   "quantos motoristas eu tenho",
   "quem são meus motoristas",
   "lista dos motoristas ativos",
   "qual a categoria da cnh do zé",
   "me passa os motoristas",
   "ô, quem tá na equipe de motorista hoje"
  ],
  "frases_negativas": [
   "quem está com o leão",
   "folga do motorista amanhã",
   "cadastra um motorista novo",
   "a cnh do zé tá em dia"
  ],
  "empresas_alvo": [],
  "quem_pode_disparar": [
   "qualquer"
  ],
  "resposta": null,
  "campos": [],
  "escopo_dados": {
   "acoes": [
    "consultar"
   ],
   "escopo": "todos",
   "tabela": "motoristas",
   "colunas": {
    "motoristas": {
     "nome": [
      "consultar"
     ],
     "ativo": [
      "consultar"
     ],
     "cargo": [
      "consultar"
     ],
     "cnh_categoria": [
      "consultar"
     ]
    }
   }
  },
  "exige_confirmacao": false,
  "observacao": "Lista os motoristas ativos (nome, cargo, CNH). Só leitura. Enriquecida 11/06/2026. 'Quem está com o caminhão X' é da regra Status da Frota.",
  "versao": 1,
  "criado_em": "2026-06-05T19:49:56.939646+00:00",
  "atualizado_em": "2026-06-05T19:49:56.939646+00:00",
  "gatilhos": [
   "quantos motoristas",
   "quais motoristas",
   "quem são os motoristas",
   "lista de motoristas"
  ],
  "fixa": false,
  "acoes": [
   "consultar"
  ],
  "gatilho_inicio": false
 },
 {
  "id": "c987fb7d-d3fc-4985-a7cc-cd6674e3bcae",
  "nome": "Consultar Financeiro",
  "tipo": "consultar",
  "ativa": false,
  "prioridade": 35,
  "frases_exemplo": [
   "qual o saldo do caixa",
   "quanto eu tenho a pagar"
  ],
  "frases_negativas": [],
  "empresas_alvo": [],
  "quem_pode_disparar": [
   "qualquer"
  ],
  "resposta": null,
  "campos": [],
  "escopo_dados": {
   "acoes": [
    "consultar"
   ],
   "escopo": "todos",
   "tabela": "financeiro",
   "sensivel": true
  },
  "exige_confirmacao": false,
  "observacao": "DESATIVADA 11/06/2026 (decisão do dono): tabela 'financeiro' não existe e o escopo não tinha colunas — a regra respondia erro. Reativar só quando o executor tiver consulta financeira de verdade.",
  "versao": 1,
  "criado_em": "2026-06-05T19:49:56.939646+00:00",
  "atualizado_em": "2026-06-05T19:49:56.939646+00:00",
  "gatilhos": [
   "saldo",
   "caixa",
   "contas a pagar",
   "financeiro",
   "quanto a receber"
  ],
  "fixa": false,
  "acoes": [
   "consultar"
  ],
  "gatilho_inicio": false
 },
 {
  "id": "bad0b231-3a90-46be-81dd-c440443216f5",
  "nome": "Consultar Avarias",
  "tipo": "consultar",
  "ativa": true,
  "prioridade": 30,
  "frases_exemplo": [
   "quais as avarias do leão",
   "todas as avarias já conhecidas",
   "tem avaria aberta?",
   "algum caminhão com defeito?",
   "o que já quebrou no touro",
   "histórico de avarias da frota",
   "ô, me diz se tem caminhão com defeito aí"
  ],
  "frases_negativas": [
   "quebrou o caminhão agora",
   "registra uma avaria",
   "o leão quebrou na estrada",
   "deu defeito no touro agora"
  ],
  "empresas_alvo": [],
  "quem_pode_disparar": [
   "qualquer"
  ],
  "resposta": null,
  "campos": [],
  "escopo_dados": {
   "colunas": {
    "avarias": {
     "status": [
      "consultar"
     ],
     "urgencia": [
      "consultar"
     ],
     "resolvido_em": [
      "consultar"
     ],
     "descricao_motorista": [
      "consultar"
     ]
    },
    "veiculos": {
     "placa": [
      "consultar"
     ],
     "apelido": [
      "consultar"
     ]
    }
   },
   "consulta_dedicada": "avarias"
  },
  "exige_confirmacao": false,
  "observacao": "GESTOR (e depois motorista): avarias por caminhão ou frota inteira — em aberto com urgência + histórico resolvido recente. Leitor dedicado avarias (11/06). Até o próximo deploy responde no formato genérico (fallback automático). REGISTRAR avaria continua no fluxo do motorista (foto).",
  "versao": 1,
  "criado_em": "2026-06-05T19:49:56.939646+00:00",
  "atualizado_em": "2026-06-05T19:49:56.939646+00:00",
  "gatilhos": [
   "avaria",
   "avarias do",
   "todas as avarias",
   "defeito",
   "problema no caminhão",
   "o que quebrou",
   "histórico de avarias"
  ],
  "fixa": false,
  "acoes": [
   "consultar"
  ],
  "gatilho_inicio": false
 },
 {
  "id": "813210ef-6ce4-44b1-881f-ce1efe81648e",
  "nome": "Consultar Abastecimentos",
  "tipo": "consultar",
  "ativa": true,
  "prioridade": 30,
  "frases_exemplo": [
   "quanto gastei de combustível esse mês",
   "últimos abastecimentos do leão",
   "quantos litros o touro abasteceu",
   "gasto de diesel da frota",
   "ô, quanto foi de óleo diesel essa semana",
   "onde o tigre abasteceu por último"
  ],
  "frases_negativas": [
   "abasteci agora",
   "vou abastecer o leão",
   "registra um abastecimento",
   "abasteci 200 litros no posto"
  ],
  "empresas_alvo": [],
  "quem_pode_disparar": [
   "qualquer"
  ],
  "resposta": null,
  "campos": [],
  "escopo_dados": {
   "acoes": [
    "consultar"
   ],
   "escopo": "todos",
   "tabela": "abastecimentos",
   "colunas": {
    "abastecimentos": {
     "posto": [
      "consultar"
     ],
     "litros": [
      "consultar"
     ],
     "km_no_abast": [
      "consultar"
     ],
     "valor_total": [
      "consultar"
     ]
    }
   }
  },
  "exige_confirmacao": false,
  "observacao": "CONSULTA abastecimentos (litros, valor, posto, km) por veículo/período. Só leitura. REGISTRAR abastecimento é o fluxo do motorista (foto do cupom) — negativas evitam o roubo. Enriquecida 11/06/2026.",
  "versao": 1,
  "criado_em": "2026-06-05T19:49:56.939646+00:00",
  "atualizado_em": "2026-06-05T19:49:56.939646+00:00",
  "gatilhos": [
   "abastecimento",
   "combustível",
   "gasto com diesel",
   "quanto abasteci",
   "gastei de diesel"
  ],
  "fixa": false,
  "acoes": [
   "consultar"
  ],
  "gatilho_inicio": false
 },
 {
  "id": "84167720-3ebb-4ccd-b74a-2ce5995d5a48",
  "nome": "Consultar Manutenções",
  "tipo": "consultar",
  "ativa": true,
  "prioridade": 30,
  "frases_exemplo": [
   "qual a próxima manutenção do leão",
   "a troca de óleo do touro tá em dia?",
   "quais as próximas manutenções da frota",
   "tem manutenção vencida?",
   "quando é a revisão do tigre",
   "o que tá chegando de manutenção",
   "ô, me diz se o óleo do leão tá vencido"
  ],
  "frases_negativas": [
   "põe o leão em manutenção",
   "coloca em manutenção",
   "manda pra oficina",
   "troquei o óleo agora",
   "tem documento vencendo",
   "ipva do leão"
  ],
  "empresas_alvo": [],
  "quem_pode_disparar": [
   "qualquer"
  ],
  "resposta": null,
  "campos": [],
  "escopo_dados": {
   "colunas": {
    "veiculos": {
     "placa": [
      "consultar"
     ],
     "apelido": [
      "consultar"
     ]
    },
    "manutencoes": {
     "status": [
      "consultar"
     ],
     "descricao": [
      "consultar"
     ],
     "km_proxima": [
      "consultar"
     ],
     "data_proxima": [
      "consultar"
     ]
    }
   },
   "consulta_dedicada": "manutencoes_periodicas"
  },
  "exige_confirmacao": false,
  "observacao": "GESTOR: manutenções periódicas (troca de óleo etc.) por caminhão ou frota — fonte view proxima_manutencao_veiculo (vencido/próximo/em dia, km faltando, data). Leitor dedicado manutencoes_periodicas (11/06); até o deploy responde no formato genérico. Documentos (IPVA/CNH) é a regra Vencimentos.",
  "versao": 1,
  "criado_em": "2026-06-05T19:49:56.939646+00:00",
  "atualizado_em": "2026-06-05T19:49:56.939646+00:00",
  "gatilhos": [
   "próxima revisão",
   "manutenção pendente",
   "revisão do",
   "manutenção do",
   "manutenções",
   "troca de óleo",
   "próximas manutenções"
  ],
  "fixa": false,
  "acoes": [
   "consultar"
  ],
  "gatilho_inicio": false
 }
]
$json$::json)
ON CONFLICT (id) DO NOTHING;
