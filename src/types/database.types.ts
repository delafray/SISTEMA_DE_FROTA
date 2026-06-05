export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      telefones: {
        Row: {
          anotar: boolean
          ativo: boolean
          atualizado_em: string
          criado_em: string
          id: string
          papel: string | null
          permissoes: Json
          telefone: string
          telefone_exibicao: string | null
          usuario_id: string | null
          usuario_nome: string | null
        }
        Insert: {
          anotar?: boolean
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          id?: string
          papel?: string | null
          permissoes?: Json
          telefone: string
          telefone_exibicao?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Update: {
          anotar?: boolean
          ativo?: boolean
          atualizado_em?: string
          criado_em?: string
          id?: string
          papel?: string | null
          permissoes?: Json
          telefone?: string
          telefone_exibicao?: string | null
          usuario_id?: string | null
          usuario_nome?: string | null
        }
        Relationships: []
      }
      regras: {
        Row: {
          ativa: boolean
          atualizado_em: string
          campos: Json
          criado_em: string
          empresas_alvo: string[]
          escopo_dados: Json
          exige_confirmacao: boolean
          frases_exemplo: string[]
          frases_negativas: string[]
          id: string
          nome: string
          observacao: string | null
          prioridade: number
          quem_pode_disparar: string[]
          resposta: string | null
          tipo: string
          versao: number
        }
        Insert: {
          ativa?: boolean
          atualizado_em?: string
          campos?: Json
          criado_em?: string
          empresas_alvo?: string[]
          escopo_dados?: Json
          exige_confirmacao?: boolean
          frases_exemplo?: string[]
          frases_negativas?: string[]
          id?: string
          nome: string
          observacao?: string | null
          prioridade?: number
          quem_pode_disparar?: string[]
          resposta?: string | null
          tipo?: string
          versao?: number
        }
        Update: {
          ativa?: boolean
          atualizado_em?: string
          campos?: Json
          criado_em?: string
          empresas_alvo?: string[]
          escopo_dados?: Json
          exige_confirmacao?: boolean
          frases_exemplo?: string[]
          frases_negativas?: string[]
          id?: string
          nome?: string
          observacao?: string | null
          prioridade?: number
          quem_pode_disparar?: string[]
          resposta?: string | null
          tipo?: string
          versao?: number
        }
        Relationships: []
      }
      abastecimentos: {
        Row: {
          confirmado: boolean | null
          created_at: string | null
          data_pagamento: string | null
          data_vencimento: string | null
          empresa_id: string
          forma_pagamento: string | null
          foto_cupom_urls: string[] | null
          ia_confianca: number | null
          ia_raw_response: Json | null
          id: string
          km_no_abast: number | null
          litros: number
          motorista_id: string
          pago: boolean
          posto: string | null
          valor_litro: number | null
          valor_total: number
          veiculo_id: string
        }
        Insert: {
          confirmado?: boolean | null
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          empresa_id: string
          forma_pagamento?: string | null
          foto_cupom_urls?: string[] | null
          ia_confianca?: number | null
          ia_raw_response?: Json | null
          id?: string
          km_no_abast?: number | null
          litros: number
          motorista_id: string
          pago?: boolean
          posto?: string | null
          valor_litro?: number | null
          valor_total: number
          veiculo_id: string
        }
        Update: {
          confirmado?: boolean | null
          created_at?: string | null
          data_pagamento?: string | null
          data_vencimento?: string | null
          empresa_id?: string
          forma_pagamento?: string | null
          foto_cupom_urls?: string[] | null
          ia_confianca?: number | null
          ia_raw_response?: Json | null
          id?: string
          km_no_abast?: number | null
          litros?: number
          motorista_id?: string
          pago?: boolean
          posto?: string | null
          valor_litro?: number | null
          valor_total?: number
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "abastecimentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimentos_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimentos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "kpi_mensal_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "abastecimentos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "abastecimentos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "status_operacional_veiculos"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "abastecimentos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abastecimentos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos_resultado_periodo"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      acerto_ajustes: {
        Row: {
          acerto_id: string | null
          created_at: string | null
          descricao: string
          id: string
          parcela_atual: number | null
          tipo: string
          total_parcelas: number | null
          valor: number
        }
        Insert: {
          acerto_id?: string | null
          created_at?: string | null
          descricao: string
          id?: string
          parcela_atual?: number | null
          tipo: string
          total_parcelas?: number | null
          valor: number
        }
        Update: {
          acerto_id?: string | null
          created_at?: string | null
          descricao?: string
          id?: string
          parcela_atual?: number | null
          tipo?: string
          total_parcelas?: number | null
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "acerto_ajustes_acerto_id_fkey"
            columns: ["acerto_id"]
            isOneToOne: false
            referencedRelation: "acertos_motorista"
            referencedColumns: ["id"]
          },
        ]
      }
      acertos_motorista: {
        Row: {
          created_at: string | null
          data_pagamento: string | null
          id: string
          mes_referencia: string
          motorista_id: string | null
          observacoes: string | null
          saldo_anterior: number | null
          status: string
          total_ajustes: number | null
          total_fretes: number | null
          updated_at: string | null
          valor_final: number | null
        }
        Insert: {
          created_at?: string | null
          data_pagamento?: string | null
          id?: string
          mes_referencia: string
          motorista_id?: string | null
          observacoes?: string | null
          saldo_anterior?: number | null
          status?: string
          total_ajustes?: number | null
          total_fretes?: number | null
          updated_at?: string | null
          valor_final?: number | null
        }
        Update: {
          created_at?: string | null
          data_pagamento?: string | null
          id?: string
          mes_referencia?: string
          motorista_id?: string | null
          observacoes?: string | null
          saldo_anterior?: number | null
          status?: string
          total_ajustes?: number | null
          total_fretes?: number | null
          updated_at?: string | null
          valor_final?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "acertos_motorista_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      adiantamentos: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          created_at: string | null
          data_pagamento: string | null
          empresa_id: string
          id: string
          justificativa: string | null
          motorista_id: string
          recusa_motivo: string | null
          status: string
          tipo: string
          updated_at: string | null
          valor: number
          valor_prestado_contas: number | null
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          empresa_id: string
          id?: string
          justificativa?: string | null
          motorista_id: string
          recusa_motivo?: string | null
          status?: string
          tipo: string
          updated_at?: string | null
          valor: number
          valor_prestado_contas?: number | null
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string | null
          data_pagamento?: string | null
          empresa_id?: string
          id?: string
          justificativa?: string | null
          motorista_id?: string
          recusa_motivo?: string | null
          status?: string
          tipo?: string
          updated_at?: string | null
          valor?: number
          valor_prestado_contas?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "adiantamentos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "adiantamentos_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      alertas: {
        Row: {
          created_at: string | null
          destinatario: string | null
          empresa_id: string
          enviado_em: string | null
          enviado_whatsapp: boolean | null
          id: string
          lido: boolean | null
          lido_em: string | null
          mensagem: string
          motorista_id: string | null
          referencia_id: string | null
          severidade: string
          tipo: string
          veiculo_id: string | null
        }
        Insert: {
          created_at?: string | null
          destinatario?: string | null
          empresa_id: string
          enviado_em?: string | null
          enviado_whatsapp?: boolean | null
          id?: string
          lido?: boolean | null
          lido_em?: string | null
          mensagem: string
          motorista_id?: string | null
          referencia_id?: string | null
          severidade?: string
          tipo: string
          veiculo_id?: string | null
        }
        Update: {
          created_at?: string | null
          destinatario?: string | null
          empresa_id?: string
          enviado_em?: string | null
          enviado_whatsapp?: boolean | null
          id?: string
          lido?: boolean | null
          lido_em?: string | null
          mensagem?: string
          motorista_id?: string | null
          referencia_id?: string | null
          severidade?: string
          tipo?: string
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "alertas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "kpi_mensal_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "alertas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "alertas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "status_operacional_veiculos"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "alertas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alertas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos_resultado_periodo"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          acao: string
          created_at: string | null
          dados_antes: Json | null
          dados_depois: Json | null
          descricao: string | null
          empresa_id: string | null
          entidade: string
          entidade_id: string | null
          id: string
          ip: unknown
          user_agent: string | null
          usuario_id: string | null
        }
        Insert: {
          acao: string
          created_at?: string | null
          dados_antes?: Json | null
          dados_depois?: Json | null
          descricao?: string | null
          empresa_id?: string | null
          entidade: string
          entidade_id?: string | null
          id?: string
          ip?: unknown
          user_agent?: string | null
          usuario_id?: string | null
        }
        Update: {
          acao?: string
          created_at?: string | null
          dados_antes?: Json | null
          dados_depois?: Json | null
          descricao?: string | null
          empresa_id?: string | null
          entidade?: string
          entidade_id?: string | null
          id?: string
          ip?: unknown
          user_agent?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      avarias: {
        Row: {
          audio_url: string | null
          created_at: string | null
          descricao_ia: string | null
          descricao_motorista: string | null
          empresa_id: string
          foto_urls: string[] | null
          ia_raw_response: Json | null
          id: string
          manutencao_id: string | null
          motorista_id: string | null
          resolvido_em: string | null
          resolvido_por: string | null
          status: string
          updated_at: string | null
          urgencia: string
          veiculo_id: string
        }
        Insert: {
          audio_url?: string | null
          created_at?: string | null
          descricao_ia?: string | null
          descricao_motorista?: string | null
          empresa_id: string
          foto_urls?: string[] | null
          ia_raw_response?: Json | null
          id?: string
          manutencao_id?: string | null
          motorista_id?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          status?: string
          updated_at?: string | null
          urgencia: string
          veiculo_id: string
        }
        Update: {
          audio_url?: string | null
          created_at?: string | null
          descricao_ia?: string | null
          descricao_motorista?: string | null
          empresa_id?: string
          foto_urls?: string[] | null
          ia_raw_response?: Json | null
          id?: string
          manutencao_id?: string | null
          motorista_id?: string | null
          resolvido_em?: string | null
          resolvido_por?: string | null
          status?: string
          updated_at?: string | null
          urgencia?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avarias_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avarias_manutencao_id_fkey"
            columns: ["manutencao_id"]
            isOneToOne: false
            referencedRelation: "manutencoes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avarias_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avarias_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "kpi_mensal_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "avarias_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "avarias_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "status_operacional_veiculos"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "avarias_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avarias_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos_resultado_periodo"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      checklists_diarios: {
        Row: {
          created_at: string | null
          data: string
          empresa_id: string
          id: string
          motorista_id: string
          observacoes: string | null
          problemas: string[] | null
          respostas: Json
          status: string
          veiculo_id: string
        }
        Insert: {
          created_at?: string | null
          data?: string
          empresa_id: string
          id?: string
          motorista_id: string
          observacoes?: string | null
          problemas?: string[] | null
          respostas?: Json
          status?: string
          veiculo_id: string
        }
        Update: {
          created_at?: string | null
          data?: string
          empresa_id?: string
          id?: string
          motorista_id?: string
          observacoes?: string | null
          problemas?: string[] | null
          respostas?: Json
          status?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "checklists_diarios_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_diarios_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_diarios_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "kpi_mensal_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "checklists_diarios_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "checklists_diarios_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "status_operacional_veiculos"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "checklists_diarios_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checklists_diarios_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos_resultado_periodo"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      cliente_contatos: {
        Row: {
          cargo: string | null
          cliente_id: string
          created_at: string | null
          email: string | null
          empresa_id: string
          id: string
          nome: string
          principal: boolean | null
          telefone: string | null
          updated_at: string | null
          whatsapp: string | null
        }
        Insert: {
          cargo?: string | null
          cliente_id: string
          created_at?: string | null
          email?: string | null
          empresa_id: string
          id?: string
          nome: string
          principal?: boolean | null
          telefone?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Update: {
          cargo?: string | null
          cliente_id?: string
          created_at?: string | null
          email?: string | null
          empresa_id?: string
          id?: string
          nome?: string
          principal?: boolean | null
          telefone?: string | null
          updated_at?: string | null
          whatsapp?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cliente_contatos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cliente_contatos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      clientes: {
        Row: {
          ativo: boolean | null
          bairro: string | null
          cep: string | null
          cidade: string | null
          complemento: string | null
          contato_nome: string | null
          created_at: string | null
          documento: string
          email: string | null
          empresa_id: string
          forma_pagamento_padrao: string | null
          id: string
          inscricao_estadual: string | null
          logradouro: string | null
          nome_fantasia: string
          numero: string | null
          observacoes: string | null
          razao_social: string | null
          telefone: string | null
          tipo_pessoa: string
          uf: string | null
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          contato_nome?: string | null
          created_at?: string | null
          documento: string
          email?: string | null
          empresa_id: string
          forma_pagamento_padrao?: string | null
          id?: string
          inscricao_estadual?: string | null
          logradouro?: string | null
          nome_fantasia: string
          numero?: string | null
          observacoes?: string | null
          razao_social?: string | null
          telefone?: string | null
          tipo_pessoa: string
          uf?: string | null
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          complemento?: string | null
          contato_nome?: string | null
          created_at?: string | null
          documento?: string
          email?: string | null
          empresa_id?: string
          forma_pagamento_padrao?: string | null
          id?: string
          inscricao_estadual?: string | null
          logradouro?: string | null
          nome_fantasia?: string
          numero?: string | null
          observacoes?: string | null
          razao_social?: string | null
          telefone?: string | null
          tipo_pessoa?: string
          uf?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "clientes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      despesas_avulsas: {
        Row: {
          categoria: string
          created_at: string
          criado_por: string | null
          data_pagamento: string | null
          data_vencimento: string
          descricao: string
          empresa_id: string
          forma_pagamento: string | null
          fornecedor: string | null
          id: string
          observacoes: string | null
          pago: boolean
          updated_at: string
          valor: number
        }
        Insert: {
          categoria: string
          created_at?: string
          criado_por?: string | null
          data_pagamento?: string | null
          data_vencimento: string
          descricao: string
          empresa_id: string
          forma_pagamento?: string | null
          fornecedor?: string | null
          id?: string
          observacoes?: string | null
          pago?: boolean
          updated_at?: string
          valor: number
        }
        Update: {
          categoria?: string
          created_at?: string
          criado_por?: string | null
          data_pagamento?: string | null
          data_vencimento?: string
          descricao?: string
          empresa_id?: string
          forma_pagamento?: string | null
          fornecedor?: string | null
          id?: string
          observacoes?: string | null
          pago?: boolean
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "despesas_avulsas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      despesas_veiculo: {
        Row: {
          adiantamento_id: string | null
          confirmado: boolean | null
          created_at: string | null
          data_despesa: string
          empresa_id: string
          foto_cupom_urls: string[] | null
          ia_confianca: number | null
          ia_raw_response: Json | null
          id: string
          local: string | null
          motorista_id: string
          tipo: string
          valor: number
          veiculo_id: string
        }
        Insert: {
          adiantamento_id?: string | null
          confirmado?: boolean | null
          created_at?: string | null
          data_despesa?: string
          empresa_id: string
          foto_cupom_urls?: string[] | null
          ia_confianca?: number | null
          ia_raw_response?: Json | null
          id?: string
          local?: string | null
          motorista_id: string
          tipo: string
          valor: number
          veiculo_id: string
        }
        Update: {
          adiantamento_id?: string | null
          confirmado?: boolean | null
          created_at?: string | null
          data_despesa?: string
          empresa_id?: string
          foto_cupom_urls?: string[] | null
          ia_confianca?: number | null
          ia_raw_response?: Json | null
          id?: string
          local?: string | null
          motorista_id?: string
          tipo?: string
          valor?: number
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "despesas_frete_adiantamento_id_fkey"
            columns: ["adiantamento_id"]
            isOneToOne: false
            referencedRelation: "adiantamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_frete_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_frete_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_frete_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "kpi_mensal_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "despesas_frete_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "despesas_frete_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "status_operacional_veiculos"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "despesas_frete_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "despesas_frete_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos_resultado_periodo"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      empresas: {
        Row: {
          bairro: string | null
          cep: string | null
          cidade: string | null
          cnpj: string
          complemento: string | null
          created_at: string | null
          email: string | null
          id: string
          inscricao_estadual: string | null
          logo_url: string | null
          logradouro: string | null
          nome_fantasia: string
          numero: string | null
          razao_social: string | null
          telefone: string | null
          uf: string | null
          updated_at: string | null
          whatsapp_instance: string | null
          whatsapp_numero: string | null
        }
        Insert: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj: string
          complemento?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          inscricao_estadual?: string | null
          logo_url?: string | null
          logradouro?: string | null
          nome_fantasia: string
          numero?: string | null
          razao_social?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string | null
          whatsapp_instance?: string | null
          whatsapp_numero?: string | null
        }
        Update: {
          bairro?: string | null
          cep?: string | null
          cidade?: string | null
          cnpj?: string
          complemento?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          inscricao_estadual?: string | null
          logo_url?: string | null
          logradouro?: string | null
          nome_fantasia?: string
          numero?: string | null
          razao_social?: string | null
          telefone?: string | null
          uf?: string | null
          updated_at?: string | null
          whatsapp_instance?: string | null
          whatsapp_numero?: string | null
        }
        Relationships: []
      }
      entregas: {
        Row: {
          aceito_pelo_motorista_em: string | null
          cliente_id: string | null
          created_at: string | null
          criado_por_usuario_id: string | null
          criado_via: string
          data_coleta_prevista: string | null
          data_entrega_prevista: string | null
          data_fim: string | null
          data_inicio: string | null
          destino: string
          empresa_id: string
          id: string
          km_final: number | null
          km_inicial: number
          km_total: number | null
          motorista_id: string
          nome_cliente_avulso: string | null
          observacoes: string | null
          origem: string
          pedido_id: string | null
          peso_carga_kg: number | null
          status: string
          tipo_carga: string | null
          updated_at: string | null
          veiculo_id: string
        }
        Insert: {
          aceito_pelo_motorista_em?: string | null
          cliente_id?: string | null
          created_at?: string | null
          criado_por_usuario_id?: string | null
          criado_via?: string
          data_coleta_prevista?: string | null
          data_entrega_prevista?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          destino: string
          empresa_id: string
          id?: string
          km_final?: number | null
          km_inicial: number
          km_total?: number | null
          motorista_id: string
          nome_cliente_avulso?: string | null
          observacoes?: string | null
          origem: string
          pedido_id?: string | null
          peso_carga_kg?: number | null
          status?: string
          tipo_carga?: string | null
          updated_at?: string | null
          veiculo_id: string
        }
        Update: {
          aceito_pelo_motorista_em?: string | null
          cliente_id?: string | null
          created_at?: string | null
          criado_por_usuario_id?: string | null
          criado_via?: string
          data_coleta_prevista?: string | null
          data_entrega_prevista?: string | null
          data_fim?: string | null
          data_inicio?: string | null
          destino?: string
          empresa_id?: string
          id?: string
          km_final?: number | null
          km_inicial?: number
          km_total?: number | null
          motorista_id?: string
          nome_cliente_avulso?: string | null
          observacoes?: string | null
          origem?: string
          pedido_id?: string | null
          peso_carga_kg?: number | null
          status?: string
          tipo_carga?: string | null
          updated_at?: string | null
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entregas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_com_resultado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "status_operacional_veiculos"
            referencedColumns: ["pedido_id"]
          },
          {
            foreignKeyName: "entregas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "kpi_mensal_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "entregas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "entregas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "status_operacional_veiculos"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "entregas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entregas_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos_resultado_periodo"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      imprevistos: {
        Row: {
          created_at: string | null
          descricao: string | null
          duracao_estimada_min: number | null
          empresa_id: string
          id: string
          motorista_id: string
          notificado_gestor: boolean | null
          resolvido: boolean | null
          resolvido_em: string | null
          tipo: string
        }
        Insert: {
          created_at?: string | null
          descricao?: string | null
          duracao_estimada_min?: number | null
          empresa_id: string
          id?: string
          motorista_id: string
          notificado_gestor?: boolean | null
          resolvido?: boolean | null
          resolvido_em?: string | null
          tipo: string
        }
        Update: {
          created_at?: string | null
          descricao?: string | null
          duracao_estimada_min?: number | null
          empresa_id?: string
          id?: string
          motorista_id?: string
          notificado_gestor?: boolean | null
          resolvido?: boolean | null
          resolvido_em?: string | null
          tipo?: string
        }
        Relationships: [
          {
            foreignKeyName: "imprevistos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imprevistos_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      lembretes: {
        Row: {
          id: string
          empresa_id: string
          usuario_id: string | null
          texto: string
          origem: string
          criado_em: string
          ciente_em: string | null
          ciente_por: string | null
          criado_por_nome: string | null
          criado_por_telefone: string | null
        }
        Insert: {
          id?: string
          empresa_id: string
          usuario_id?: string | null
          texto: string
          origem?: string
          criado_em?: string
          ciente_em?: string | null
          ciente_por?: string | null
          criado_por_nome?: string | null
          criado_por_telefone?: string | null
        }
        Update: {
          ciente_em?: string | null
          ciente_por?: string | null
        }
        Relationships: []
      }
      km_logs: {
        Row: {
          confirmado: boolean | null
          correcao: boolean | null
          correcao_motivo: string | null
          created_at: string | null
          empresa_id: string
          foto_urls: string[] | null
          ia_confianca: number | null
          ia_raw_response: Json | null
          id: string
          km_lido: number
          motorista_id: string
          tipo: string
          veiculo_id: string
        }
        Insert: {
          confirmado?: boolean | null
          correcao?: boolean | null
          correcao_motivo?: string | null
          created_at?: string | null
          empresa_id: string
          foto_urls?: string[] | null
          ia_confianca?: number | null
          ia_raw_response?: Json | null
          id?: string
          km_lido: number
          motorista_id: string
          tipo: string
          veiculo_id: string
        }
        Update: {
          confirmado?: boolean | null
          correcao?: boolean | null
          correcao_motivo?: string | null
          created_at?: string | null
          empresa_id?: string
          foto_urls?: string[] | null
          ia_confianca?: number | null
          ia_raw_response?: Json | null
          id?: string
          km_lido?: number
          motorista_id?: string
          tipo?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "km_logs_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "km_logs_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "km_logs_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "kpi_mensal_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "km_logs_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "km_logs_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "status_operacional_veiculos"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "km_logs_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "km_logs_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos_resultado_periodo"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      manutencoes: {
        Row: {
          aprovado_em: string | null
          aprovado_por: string | null
          created_at: string | null
          custo_mao_obra: number | null
          custo_pecas: number | null
          custo_total: number | null
          data_pagamento: string | null
          data_proxima: string | null
          data_realizada: string | null
          data_vencimento: string | null
          descricao: string | null
          empresa_id: string
          forma_pagamento: string | null
          fornecedor: string | null
          fornecedor_cnpj: string | null
          id: string
          km_proxima: number | null
          km_realizada: number | null
          nota_fiscal_numero: string | null
          nota_fiscal_urls: string[] | null
          observacoes: string | null
          pago: boolean
          status: string
          tipo_id: string
          updated_at: string | null
          veiculo_id: string
        }
        Insert: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string | null
          custo_mao_obra?: number | null
          custo_pecas?: number | null
          custo_total?: number | null
          data_pagamento?: string | null
          data_proxima?: string | null
          data_realizada?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          empresa_id: string
          forma_pagamento?: string | null
          fornecedor?: string | null
          fornecedor_cnpj?: string | null
          id?: string
          km_proxima?: number | null
          km_realizada?: number | null
          nota_fiscal_numero?: string | null
          nota_fiscal_urls?: string[] | null
          observacoes?: string | null
          pago?: boolean
          status?: string
          tipo_id: string
          updated_at?: string | null
          veiculo_id: string
        }
        Update: {
          aprovado_em?: string | null
          aprovado_por?: string | null
          created_at?: string | null
          custo_mao_obra?: number | null
          custo_pecas?: number | null
          custo_total?: number | null
          data_pagamento?: string | null
          data_proxima?: string | null
          data_realizada?: string | null
          data_vencimento?: string | null
          descricao?: string | null
          empresa_id?: string
          forma_pagamento?: string | null
          fornecedor?: string | null
          fornecedor_cnpj?: string | null
          id?: string
          km_proxima?: number | null
          km_realizada?: number | null
          nota_fiscal_numero?: string | null
          nota_fiscal_urls?: string[] | null
          observacoes?: string | null
          pago?: boolean
          status?: string
          tipo_id?: string
          updated_at?: string | null
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manutencoes_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["tipo_id"]
          },
          {
            foreignKeyName: "manutencoes_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "tipos_manutencao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "kpi_mensal_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "manutencoes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "manutencoes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "status_operacional_veiculos"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "manutencoes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manutencoes_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos_resultado_periodo"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      motorista_veiculo: {
        Row: {
          ativo: boolean
          created_at: string
          empresa_id: string
          id: string
          motorista_id: string
          veiculo_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          empresa_id: string
          id?: string
          motorista_id: string
          veiculo_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          empresa_id?: string
          id?: string
          motorista_id?: string
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "motorista_veiculo_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motorista_veiculo_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motorista_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "kpi_mensal_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "motorista_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "motorista_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "status_operacional_veiculos"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "motorista_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "motorista_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos_resultado_periodo"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      motoristas: {
        Row: {
          ativo: boolean | null
          bairro: string | null
          cargo: string | null
          cep: string | null
          chave_pix: string | null
          cidade: string | null
          cnh_categoria: string
          cnh_ear: boolean | null
          cnh_foto_url: string | null
          cnh_numero: string
          cnh_primeira_habilitacao: string | null
          cnh_validade: string
          complemento: string | null
          cpf: string
          created_at: string | null
          data_admissao: string | null
          data_desligamento: string | null
          data_nascimento: string | null
          email: string | null
          empresa_id: string
          foto_url: string | null
          id: string
          logradouro: string | null
          nome: string
          numero: string | null
          rg: string | null
          salario_fixo: number | null
          tipo_chave_pix: string | null
          uf: string | null
          updated_at: string | null
          valor_diaria_por_pedido: number | null
          whatsapp: string
        }
        Insert: {
          ativo?: boolean | null
          bairro?: string | null
          cargo?: string | null
          cep?: string | null
          chave_pix?: string | null
          cidade?: string | null
          cnh_categoria: string
          cnh_ear?: boolean | null
          cnh_foto_url?: string | null
          cnh_numero: string
          cnh_primeira_habilitacao?: string | null
          cnh_validade: string
          complemento?: string | null
          cpf: string
          created_at?: string | null
          data_admissao?: string | null
          data_desligamento?: string | null
          data_nascimento?: string | null
          email?: string | null
          empresa_id: string
          foto_url?: string | null
          id?: string
          logradouro?: string | null
          nome: string
          numero?: string | null
          rg?: string | null
          salario_fixo?: number | null
          tipo_chave_pix?: string | null
          uf?: string | null
          updated_at?: string | null
          valor_diaria_por_pedido?: number | null
          whatsapp: string
        }
        Update: {
          ativo?: boolean | null
          bairro?: string | null
          cargo?: string | null
          cep?: string | null
          chave_pix?: string | null
          cidade?: string | null
          cnh_categoria?: string
          cnh_ear?: boolean | null
          cnh_foto_url?: string | null
          cnh_numero?: string
          cnh_primeira_habilitacao?: string | null
          cnh_validade?: string
          complemento?: string | null
          cpf?: string
          created_at?: string | null
          data_admissao?: string | null
          data_desligamento?: string | null
          data_nascimento?: string | null
          email?: string | null
          empresa_id?: string
          foto_url?: string | null
          id?: string
          logradouro?: string | null
          nome?: string
          numero?: string | null
          rg?: string | null
          salario_fixo?: number | null
          tipo_chave_pix?: string | null
          uf?: string | null
          updated_at?: string | null
          valor_diaria_por_pedido?: number | null
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "motoristas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      pedido_motoristas: {
        Row: {
          ativo: boolean
          created_at: string | null
          data_entrada: string
          data_saida: string | null
          empresa_id: string
          id: string
          km_entrada: number | null
          km_saida: number | null
          motivo_troca: string | null
          motorista_id: string
          pedido_id: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string | null
          data_entrada?: string
          data_saida?: string | null
          empresa_id: string
          id?: string
          km_entrada?: number | null
          km_saida?: number | null
          motivo_troca?: string | null
          motorista_id: string
          pedido_id: string
        }
        Update: {
          ativo?: boolean
          created_at?: string | null
          data_entrada?: string
          data_saida?: string | null
          empresa_id?: string
          id?: string
          km_entrada?: number | null
          km_saida?: number | null
          motivo_troca?: string | null
          motorista_id?: string
          pedido_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pedido_motoristas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_motoristas_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_motoristas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_motoristas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "pedidos_com_resultado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedido_motoristas_pedido_id_fkey"
            columns: ["pedido_id"]
            isOneToOne: false
            referencedRelation: "status_operacional_veiculos"
            referencedColumns: ["pedido_id"]
          },
        ]
      }
      pedidos: {
        Row: {
          created_at: string
          data_fim_prevista: string | null
          data_fim_real: string | null
          data_inicio_prevista: string | null
          data_inicio_real: string | null
          data_pagamento: string | null
          empresa_id: string
          forma_pagamento: string | null
          id: string
          km_final: number | null
          km_inicial: number | null
          motorista_id: string | null
          observacoes: string | null
          observacoes_financeiras: string | null
          pago: boolean | null
          status: string
          updated_at: string
          valor_pedido: number | null
          veiculo_id: string | null
        }
        Insert: {
          created_at?: string
          data_fim_prevista?: string | null
          data_fim_real?: string | null
          data_inicio_prevista?: string | null
          data_inicio_real?: string | null
          data_pagamento?: string | null
          empresa_id: string
          forma_pagamento?: string | null
          id?: string
          km_final?: number | null
          km_inicial?: number | null
          motorista_id?: string | null
          observacoes?: string | null
          observacoes_financeiras?: string | null
          pago?: boolean | null
          status?: string
          updated_at?: string
          valor_pedido?: number | null
          veiculo_id?: string | null
        }
        Update: {
          created_at?: string
          data_fim_prevista?: string | null
          data_fim_real?: string | null
          data_inicio_prevista?: string | null
          data_inicio_real?: string | null
          data_pagamento?: string | null
          empresa_id?: string
          forma_pagamento?: string | null
          id?: string
          km_final?: number | null
          km_inicial?: number | null
          motorista_id?: string | null
          observacoes?: string | null
          observacoes_financeiras?: string | null
          pago?: boolean | null
          status?: string
          updated_at?: string
          valor_pedido?: number | null
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "kpi_mensal_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "pedidos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "pedidos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "status_operacional_veiculos"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "pedidos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos_resultado_periodo"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
       perfis: {
        Row: {
          ativo: boolean | null
          cpf: string | null
          created_at: string | null
          foto_url: string | null
          id: string
          login: string | null
          motorista_id: string | null
          nome: string
          telefone: string | null
          updated_at: string | null
          whatsapp_bot: string | null
        }
        Insert: {
          ativo?: boolean | null
          cpf?: string | null
          created_at?: string | null
          foto_url?: string | null
          id: string
          login?: string | null
          motorista_id?: string | null
          nome: string
          telefone?: string | null
          updated_at?: string | null
          whatsapp_bot?: string | null
        }
        Update: {
          ativo?: boolean | null
          cpf?: string | null
          created_at?: string | null
          foto_url?: string | null
          id?: string
          login?: string | null
          motorista_id?: string | null
          nome?: string
          telefone?: string | null
          updated_at?: string | null
          whatsapp_bot?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "perfis_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: true
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      plano_manutencao_veiculo: {
        Row: {
          ativo: boolean | null
          created_at: string | null
          empresa_id: string
          id: string
          intervalo_km: number | null
          intervalo_meses: number | null
          observacoes: string | null
          tipo_id: string
          updated_at: string | null
          veiculo_id: string
        }
        Insert: {
          ativo?: boolean | null
          created_at?: string | null
          empresa_id: string
          id?: string
          intervalo_km?: number | null
          intervalo_meses?: number | null
          observacoes?: string | null
          tipo_id: string
          updated_at?: string | null
          veiculo_id: string
        }
        Update: {
          ativo?: boolean | null
          created_at?: string | null
          empresa_id?: string
          id?: string
          intervalo_km?: number | null
          intervalo_meses?: number | null
          observacoes?: string | null
          tipo_id?: string
          updated_at?: string | null
          veiculo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plano_manutencao_veiculo_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_manutencao_veiculo_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["tipo_id"]
          },
          {
            foreignKeyName: "plano_manutencao_veiculo_tipo_id_fkey"
            columns: ["tipo_id"]
            isOneToOne: false
            referencedRelation: "tipos_manutencao"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_manutencao_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "kpi_mensal_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "plano_manutencao_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "plano_manutencao_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "status_operacional_veiculos"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "plano_manutencao_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_manutencao_veiculo_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos_resultado_periodo"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      recorrencias_financeiras: {
        Row: {
          ativo: boolean
          categoria: string
          created_at: string
          data_fim: string | null
          data_inicio: string
          descricao: string
          dia_vencimento: number
          empresa_id: string
          id: string
          motorista_id: string | null
          observacoes: string | null
          tipo: string
          updated_at: string
          valor: number
        }
        Insert: {
          ativo?: boolean
          categoria: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          descricao: string
          dia_vencimento: number
          empresa_id: string
          id?: string
          motorista_id?: string | null
          observacoes?: string | null
          tipo: string
          updated_at?: string
          valor: number
        }
        Update: {
          ativo?: boolean
          categoria?: string
          created_at?: string
          data_fim?: string | null
          data_inicio?: string
          descricao?: string
          dia_vencimento?: number
          empresa_id?: string
          id?: string
          motorista_id?: string | null
          observacoes?: string | null
          tipo?: string
          updated_at?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "recorrencias_financeiras_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recorrencias_financeiras_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      sessoes_whatsapp: {
        Row: {
          contexto: Json | null
          empresa_id: string | null
          estado: string
          id: string
          motorista_id: string | null
          ultimo_contato: string
          whatsapp: string
        }
        Insert: {
          contexto?: Json | null
          empresa_id?: string | null
          estado?: string
          id?: string
          motorista_id?: string | null
          ultimo_contato?: string
          whatsapp: string
        }
        Update: {
          contexto?: Json | null
          empresa_id?: string | null
          estado?: string
          id?: string
          motorista_id?: string | null
          ultimo_contato?: string
          whatsapp?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessoes_whatsapp_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessoes_whatsapp_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      tipos_manutencao: {
        Row: {
          ativo: boolean | null
          categoria: string
          codigo: string
          created_at: string | null
          criticidade: string
          custo_estimado_max: number | null
          custo_estimado_min: number | null
          descricao: string | null
          empresa_id: string | null
          id: string
          intervalo_km: number | null
          intervalo_meses: number | null
          nome: string
          updated_at: string | null
        }
        Insert: {
          ativo?: boolean | null
          categoria: string
          codigo: string
          created_at?: string | null
          criticidade?: string
          custo_estimado_max?: number | null
          custo_estimado_min?: number | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          intervalo_km?: number | null
          intervalo_meses?: number | null
          nome: string
          updated_at?: string | null
        }
        Update: {
          ativo?: boolean | null
          categoria?: string
          codigo?: string
          created_at?: string | null
          criticidade?: string
          custo_estimado_max?: number | null
          custo_estimado_min?: number | null
          descricao?: string | null
          empresa_id?: string | null
          id?: string
          intervalo_km?: number | null
          intervalo_meses?: number | null
          nome?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tipos_manutencao_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      usuario_empresas: {
        Row: {
          created_at: string | null
          empresa_id: string
          id: string
          is_padrao: boolean | null
          role: string
          usuario_id: string
        }
        Insert: {
          created_at?: string | null
          empresa_id: string
          id?: string
          is_padrao?: boolean | null
          role?: string
          usuario_id: string
        }
        Update: {
          created_at?: string | null
          empresa_id?: string
          id?: string
          is_padrao?: boolean | null
          role?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usuario_empresas_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "usuario_empresas_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "perfis"
            referencedColumns: ["id"]
          },
        ]
      }
      veiculos: {
        Row: {
          ano: number
          apelido: string | null
          apolice_numero: string | null
          ativo: boolean | null
          capacidade_carga_kg: number | null
          capacidade_tanque: number | null
          categoria: string | null
          chassi: string
          combustivel: string
          cor: string | null
          created_at: string | null
          data_aquisicao: string | null
          data_proxima_revisao: string | null
          eixos: number | null
          empresa_id: string
          foto_url: string | null
          id: string
          ipva_vencimento: string | null
          km_atual: number | null
          km_proxima_revisao: number | null
          km_proxima_troca_oleo: number | null
          licenciamento_vencimento: string | null
          marca: string
          modelo: string
          pbt_kg: number | null
          placa: string
          renavam: string
          seguradora: string | null
          seguro_vencimento: string | null
          tipo: string
          updated_at: string | null
          valor_aquisicao: number | null
        }
        Insert: {
          ano: number
          apelido?: string | null
          apolice_numero?: string | null
          ativo?: boolean | null
          capacidade_carga_kg?: number | null
          capacidade_tanque?: number | null
          categoria?: string | null
          chassi: string
          combustivel: string
          cor?: string | null
          created_at?: string | null
          data_aquisicao?: string | null
          data_proxima_revisao?: string | null
          eixos?: number | null
          empresa_id: string
          foto_url?: string | null
          id?: string
          ipva_vencimento?: string | null
          km_atual?: number | null
          km_proxima_revisao?: number | null
          km_proxima_troca_oleo?: number | null
          licenciamento_vencimento?: string | null
          marca: string
          modelo: string
          pbt_kg?: number | null
          placa: string
          renavam: string
          seguradora?: string | null
          seguro_vencimento?: string | null
          tipo: string
          updated_at?: string | null
          valor_aquisicao?: number | null
        }
        Update: {
          ano?: number
          apelido?: string | null
          apolice_numero?: string | null
          ativo?: boolean | null
          capacidade_carga_kg?: number | null
          capacidade_tanque?: number | null
          categoria?: string | null
          chassi?: string
          combustivel?: string
          cor?: string | null
          created_at?: string | null
          data_aquisicao?: string | null
          data_proxima_revisao?: string | null
          eixos?: number | null
          empresa_id?: string
          foto_url?: string | null
          id?: string
          ipva_vencimento?: string | null
          km_atual?: number | null
          km_proxima_revisao?: number | null
          km_proxima_troca_oleo?: number | null
          licenciamento_vencimento?: string | null
          marca?: string
          modelo?: string
          pbt_kg?: number | null
          placa?: string
          renavam?: string
          seguradora?: string | null
          seguro_vencimento?: string | null
          tipo?: string
          updated_at?: string | null
          valor_aquisicao?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "veiculos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      kpi_mensal_empresa: {
        Row: {
          custo_combustivel: number | null
          custo_despesas: number | null
          empresa_id: string | null
          mes_referencia: string | null
          qtd_pedidos: number | null
          receita_total: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_mensal_motorista: {
        Row: {
          empresa_id: string | null
          km_rodado: number | null
          mes_referencia: string | null
          motorista_id: string | null
          qtd_pedidos: number | null
          qtd_pedidos_concluidos: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_mensal_veiculo: {
        Row: {
          custo_combustivel: number | null
          custo_despesas: number | null
          empresa_id: string | null
          mes_referencia: string | null
          modelo: string | null
          placa: string | null
          qtd_pedidos: number | null
          receita_pedidos: number | null
          veiculo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "veiculos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      pedidos_com_resultado: {
        Row: {
          created_at: string | null
          data_fim_prevista: string | null
          data_fim_real: string | null
          data_inicio_prevista: string | null
          data_inicio_real: string | null
          data_pagamento: string | null
          empresa_id: string | null
          forma_pagamento: string | null
          id: string | null
          km_final: number | null
          km_inicial: number | null
          km_total: number | null
          motorista_id: string | null
          pago: boolean | null
          qtd_entregas: number | null
          receita: number | null
          status: string | null
          updated_at: string | null
          veiculo_id: string | null
        }
        Insert: {
          created_at?: string | null
          data_fim_prevista?: string | null
          data_fim_real?: string | null
          data_inicio_prevista?: string | null
          data_inicio_real?: string | null
          data_pagamento?: string | null
          empresa_id?: string | null
          forma_pagamento?: string | null
          id?: string | null
          km_final?: number | null
          km_inicial?: number | null
          km_total?: never
          motorista_id?: string | null
          pago?: boolean | null
          qtd_entregas?: never
          receita?: number | null
          status?: string | null
          updated_at?: string | null
          veiculo_id?: string | null
        }
        Update: {
          created_at?: string | null
          data_fim_prevista?: string | null
          data_fim_real?: string | null
          data_inicio_prevista?: string | null
          data_inicio_real?: string | null
          data_pagamento?: string | null
          empresa_id?: string | null
          forma_pagamento?: string | null
          id?: string | null
          km_final?: number | null
          km_inicial?: number | null
          km_total?: never
          motorista_id?: string | null
          pago?: boolean | null
          qtd_entregas?: never
          receita?: number | null
          status?: string | null
          updated_at?: string | null
          veiculo_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_motorista_id_fkey"
            columns: ["motorista_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "kpi_mensal_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "pedidos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "proxima_manutencao_veiculo"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "pedidos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "status_operacional_veiculos"
            referencedColumns: ["veiculo_id"]
          },
          {
            foreignKeyName: "pedidos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pedidos_veiculo_id_fkey"
            columns: ["veiculo_id"]
            isOneToOne: false
            referencedRelation: "veiculos_resultado_periodo"
            referencedColumns: ["veiculo_id"]
          },
        ]
      }
      proxima_manutencao_veiculo: {
        Row: {
          categoria: string | null
          criticidade: string | null
          data_proxima: string | null
          data_ultima: string | null
          empresa_id: string | null
          intervalo_km: number | null
          intervalo_meses: number | null
          km_atual: number | null
          km_faltando: number | null
          km_proxima: number | null
          km_ultima: number | null
          placa: string | null
          status: string | null
          tipo_id: string | null
          tipo_nome: string | null
          veiculo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "veiculos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      status_operacional_veiculos: {
        Row: {
          ativo: boolean | null
          empresa_id: string | null
          modelo: string | null
          motorista_atual_id: string | null
          pedido_id: string | null
          placa: string | null
          status_pedido: string | null
          veiculo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pedidos_motorista_id_fkey"
            columns: ["motorista_atual_id"]
            isOneToOne: false
            referencedRelation: "motoristas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "veiculos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
      veiculos_resultado_periodo: {
        Row: {
          custo_combustivel: number | null
          custo_despesas: number | null
          empresa_id: string | null
          mes_referencia: string | null
          modelo: string | null
          placa: string | null
          qtd_pedidos: number | null
          receita_pedidos: number | null
          veiculo_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "veiculos_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      get_user_empresas: { Args: never; Returns: string[] }
      get_user_motorista_id: { Args: never; Returns: string }
      get_user_role: { Args: { p_empresa_id: string }; Returns: string }
      is_master_of_empresa: { Args: { emp_id: string }; Returns: boolean }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

